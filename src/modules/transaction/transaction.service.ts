import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { CommandBus } from '@nestjs/cqrs';
import { v4 as uuidv4 } from 'uuid';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
} from './transaction.entity';
import { Account, AccountType } from '../account/account.entity';
import { AccountService } from '../account/account.service';
import { CurrencyService } from '../currency/currency.service';
import { AuditService } from '../audit/audit.service';
import {
  InsufficientBalanceException,
  CurrencyMismatchException,
  DuplicateTransactionException,
  TransactionNotFoundException,
  InvalidOperationException,
  RefundException,
} from '../../common/exceptions/billing.exception';
import {
  OperationContext,
  TransactionResult,
  TransferResult,
} from '../../common/types';
import { TopupDto } from './dto/topup.dto';
import { WithdrawalDto } from './dto/withdrawal.dto';
import { TransferDto } from './dto/transfer.dto';
import { RefundDto } from './dto/refund.dto';
import Decimal from 'decimal.js';

// CQRS Commands
import { TopupCommand } from './commands/topup.command';
import { WithdrawalCommand } from './commands/withdrawal.command';
import { TransferCommand } from './commands/transfer.command';
import { PaymentCommand } from './commands/payment.command';
import { RefundCommand } from './commands/refund.command';

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly accountService: AccountService,
    private readonly currencyService: CurrencyService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
    private readonly commandBus: CommandBus,
  ) {}

  /**
   * Top-up (CQRS): External Account (source) → User Account (destination)
   * 
   * Adds funds to an account from an external source. Uses CQRS/Event Sourcing
   * for full auditability and event replay capability.
   * 
   * Flow:
   * 1. Create TopupCommand
   * 2. Command Handler creates events
   * 3. Saga processes events and updates balances
   * 4. Event Handlers update read models
   */
  async topup(
    dto: TopupDto,
    context: OperationContext,
  ): Promise<TransactionResult> {
    // Check idempotency first (before CQRS)
    const existing = await this.transactionRepository.findOne({
      where: { idempotencyKey: dto.idempotencyKey },
    });

    if (existing) {
      throw new DuplicateTransactionException(dto.idempotencyKey, existing.id);
    }

    // Generate transaction ID
    const transactionId = uuidv4();

    // Execute CQRS command
    const command = new TopupCommand(
      transactionId,
      dto.destinationAccountId,
      dto.amount,
      dto.currency,
      dto.sourceAccountId,
      dto.idempotencyKey,
      context.correlationId,
      context.actorId,
    );

    await this.commandBus.execute(command);

    // Wait for transaction to be persisted (event sourcing is async)
    const transaction = await this.waitForTransaction(transactionId, 5000);

    return {
      transactionId: transaction.id,
      idempotencyKey: transaction.idempotencyKey,
      type: transaction.type,
      sourceAccountId: transaction.sourceAccountId,
      destinationAccountId: transaction.destinationAccountId,
      amount: transaction.amount,
      currency: transaction.currency,
      sourceBalanceBefore: '0', // Not tracked in entity model
      sourceBalanceAfter: '0', // Not tracked in entity model
      destinationBalanceBefore: '0', // Not tracked in entity model
      destinationBalanceAfter: '0', // Not tracked in entity model
      status: transaction.status,
      reference: transaction.reference,
      metadata: transaction.metadata,
      createdAt: transaction.createdAt,
      completedAt: transaction.completedAt,
    };
  }

  /**
   * Wait for transaction to be persisted (polls database)
   */
  private async waitForTransaction(transactionId: string, maxWait: number = 5000): Promise<Transaction> {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const transaction = await this.transactionRepository.findOne({
        where: { id: transactionId },
      });
      if (transaction) {
        return transaction;
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error(`Transaction not persisted after ${maxWait}ms: ${transactionId}`);
  }

  /**
   * Withdrawal (CQRS): User Account (source) → External Account (destination)
   * 
   * Withdraws funds from user account to external destination. Uses CQRS/Event Sourcing
   * for full auditability and event replay capability.
   */
  async withdraw(
    dto: WithdrawalDto,
    context: OperationContext,
  ): Promise<TransactionResult> {
    // Check idempotency first
    const existing = await this.transactionRepository.findOne({
      where: { idempotencyKey: dto.idempotencyKey },
    });

    if (existing) {
      throw new DuplicateTransactionException(dto.idempotencyKey, existing.id);
    }

    // Generate transaction ID
    const transactionId = uuidv4();

    // Execute CQRS command
    const command = new WithdrawalCommand(
      transactionId,
      dto.sourceAccountId,      // accountId (user account to withdraw from)
      dto.amount,                // amount
      dto.currency,             // currency
      dto.destinationAccountId, // destinationAccountId (external account)
      dto.idempotencyKey,
      context.correlationId,
      context.actorId,
    );

    await this.commandBus.execute(command);

    // Wait for transaction to be persisted
    const transaction = await this.waitForTransaction(transactionId, 5000);

    return {
      transactionId: transaction.id,
      idempotencyKey: transaction.idempotencyKey,
      type: transaction.type,
      sourceAccountId: transaction.sourceAccountId,
      destinationAccountId: transaction.destinationAccountId,
      amount: transaction.amount,
      currency: transaction.currency,
      sourceBalanceBefore: '0',
      sourceBalanceAfter: '0',
      destinationBalanceBefore: '0',
      destinationBalanceAfter: '0',
      status: transaction.status,
      reference: transaction.reference,
      metadata: transaction.metadata,
      createdAt: transaction.createdAt,
      completedAt: transaction.completedAt,
    };
  }

  /**
   * Transfer (CQRS): Account A (source) → Account B (destination)
   * 
   * Transfers funds between two accounts. Uses CQRS/Event Sourcing with saga coordination.
   */
  async transfer(
    dto: TransferDto,
    context: OperationContext,
  ): Promise<TransferResult> {
    // Validate self-transfer
    if (dto.sourceAccountId === dto.destinationAccountId) {
      throw new InvalidOperationException('SELF_TRANSFER_NOT_ALLOWED');
    }

    // Check idempotency first
    const existing = await this.transactionRepository.findOne({
      where: { idempotencyKey: dto.idempotencyKey },
    });

    if (existing) {
      throw new DuplicateTransactionException(dto.idempotencyKey, existing.id);
    }

    // Generate transaction ID
    const transactionId = uuidv4();

    // Execute CQRS command
    const command = new TransferCommand(
      transactionId,
      dto.sourceAccountId,
      dto.destinationAccountId,
      dto.amount,
      dto.currency,
      dto.idempotencyKey,
      context.correlationId,
      context.actorId,
    );

    await this.commandBus.execute(command);

    // Wait for transaction to be persisted
    const transaction = await this.waitForTransaction(transactionId, 5000);

    // Map to TransferResult format
    return {
      debitTransactionId: transaction.id,
      creditTransactionId: transaction.id, // Single transaction model
      sourceAccountId: transaction.sourceAccountId,
      destinationAccountId: transaction.destinationAccountId,
      amount: transaction.amount,
      currency: transaction.currency,
      status: transaction.status,
      reference: transaction.reference || '',
      createdAt: transaction.createdAt,
    };
  }

  /**
   * Refund (CQRS): Reverses a previous transaction
   * 
   * Uses CQRS/Event Sourcing with saga coordination for automatic compensation.
   */
  async refund(
    dto: RefundDto,
    context: OperationContext,
  ): Promise<TransactionResult> {
    // Check idempotency first
    const existing = await this.transactionRepository.findOne({
      where: { idempotencyKey: dto.idempotencyKey },
    });

    if (existing) {
      throw new DuplicateTransactionException(dto.idempotencyKey, existing.id);
    }

    // Load original transaction
    const originalTransaction = await this.transactionRepository.findOne({
      where: { id: dto.originalTransactionId },
    });

    if (!originalTransaction) {
      throw new TransactionNotFoundException(dto.originalTransactionId);
    }

    // Validate original transaction
    if (originalTransaction.status === TransactionStatus.REFUNDED) {
      throw new RefundException('Transaction already refunded');
    }
    if (originalTransaction.status !== TransactionStatus.COMPLETED) {
      throw new RefundException('Can only refund completed transactions');
    }
    if (!originalTransaction.amount) {
      throw new RefundException(`Original transaction ${originalTransaction.id} has no amount`);
    }

    // Determine refund amount
    const originalAmount = new Decimal(originalTransaction.amount);
    let refundAmount: Decimal;
    
    if (dto.amount !== undefined && dto.amount !== null && dto.amount !== '') {
      refundAmount = new Decimal(dto.amount);
    } else {
      refundAmount = originalAmount;
    }

    // Validate refund amount
    if (refundAmount.greaterThan(originalAmount)) {
      throw new RefundException('Refund amount cannot exceed original amount');
    }

    // Generate transaction ID
    const transactionId = uuidv4();

    // Execute CQRS command
    const command = new RefundCommand(
      transactionId,
      dto.originalTransactionId,
      refundAmount.toString(),
      originalTransaction.currency,
      dto.idempotencyKey,
      {
        reason: dto.reason,
        refundType: refundAmount.equals(originalAmount) ? 'full' : 'partial',
        ...dto.metadata,
      },
      context.correlationId,
      context.actorId,
    );

    await this.commandBus.execute(command);

    // Wait for transaction to be persisted
    const transaction = await this.waitForTransaction(transactionId, 5000);

    return {
      transactionId: transaction.id,
      idempotencyKey: transaction.idempotencyKey,
      type: transaction.type,
      sourceAccountId: transaction.sourceAccountId,
      destinationAccountId: transaction.destinationAccountId,
      amount: transaction.amount,
      currency: transaction.currency,
      sourceBalanceBefore: '0',
      sourceBalanceAfter: '0',
      destinationBalanceBefore: '0',
      destinationBalanceAfter: '0',
      status: transaction.status,
      reference: transaction.reference,
      metadata: transaction.metadata,
      createdAt: transaction.createdAt,
      completedAt: transaction.completedAt,
    };
  }

  /**
   * Get transaction by ID
   */
  async findById(id: string): Promise<Transaction> {
    const transaction = await this.transactionRepository.findOne({
      where: { id },
      relations: ['sourceAccount', 'destinationAccount', 'parentTransaction'],
    });

    if (!transaction) {
      throw new TransactionNotFoundException(id);
    }

    return transaction;
  }

  /**
   * List transactions with optional filters
   */
  async findAll(filters: {
    accountId?: string;
    type?: TransactionType;
    status?: TransactionStatus;
    limit?: number;
    offset?: number;
  }): Promise<Transaction[]> {
    const query = this.transactionRepository.createQueryBuilder('transaction');

    if (filters.accountId) {
      query.where(
        '(transaction.source_account_id = :accountId OR transaction.destination_account_id = :accountId)',
        { accountId: filters.accountId },
      );
    }

    if (filters.type) {
      query.andWhere('transaction.type = :type', { type: filters.type });
    }

    if (filters.status) {
      query.andWhere('transaction.status = :status', { status: filters.status });
    }

    query.orderBy('transaction.created_at', 'DESC');

    if (filters.limit) {
      query.limit(filters.limit);
    }

    if (filters.offset) {
      query.offset(filters.offset);
    }

    return await query.getMany();
  }

  // ==================== Helper Methods ====================

  /**
   * Check idempotency to prevent duplicate transactions
   */
  private async checkIdempotency(
    idempotencyKey: string,
    manager: EntityManager,
  ): Promise<void> {
    const existingTransaction = await manager.findOne(Transaction, {
      where: { idempotencyKey },
    });

    if (existingTransaction) {
      throw new DuplicateTransactionException(idempotencyKey, existingTransaction.id);
    }
  }

  /**
   * Validate amount is positive
   */
  private validateAmount(amount: string): void {
    const decimalAmount = new Decimal(amount);
    if (decimalAmount.lessThanOrEqualTo(0)) {
      throw new InvalidOperationException('INVALID_AMOUNT');
    }
  }

  /**
   * Check maximum balance limit
   */
  private checkMaxBalance(account: Account, additionalAmount: Decimal): void {
    if (account.maxBalance) {
      const currentBalance = new Decimal(account.balance);
      const newBalance = currentBalance.plus(additionalAmount);
      const maxBalance = new Decimal(account.maxBalance);

      if (newBalance.greaterThan(maxBalance)) {
        throw new InvalidOperationException(
          `MAX_BALANCE_EXCEEDED: Account ${account.id} would exceed maximum balance of ${maxBalance}`,
        );
      }
    }
  }

  /**
   * Check minimum balance requirement
   */
  private checkMinBalance(account: Account, newBalance: Decimal): void {
    if (account.minBalance) {
      const minBalance = new Decimal(account.minBalance);

      if (newBalance.lessThan(minBalance)) {
        throw new InvalidOperationException(
          `MIN_BALANCE_REQUIRED: Account ${account.id} requires minimum balance of ${minBalance}`,
        );
      }
    }
  }

  /**
   * Lock accounts in deterministic order to prevent deadlocks
   */
  private async lockAccountsInOrder(
    accountId1: string,
    accountId2: string,
    manager: EntityManager,
  ): Promise<[Account, Account]> {
    const [firstId, secondId] = [accountId1, accountId2].sort();
    
    const firstAccount = await this.accountService.findAndLock(firstId, manager);
    const secondAccount = await this.accountService.findAndLock(secondId, manager);

    // Return in original order
    return accountId1 === firstId
      ? [firstAccount, secondAccount]
      : [secondAccount, firstAccount];
  }

  /**
   * Map Transaction entity to TransactionResult
   */
  private mapToTransactionResult(transaction: Transaction): TransactionResult {
    return {
      transactionId: transaction.id,
      idempotencyKey: transaction.idempotencyKey,
      type: transaction.type,
      sourceAccountId: transaction.sourceAccountId,
      destinationAccountId: transaction.destinationAccountId,
      amount: transaction.amount,
      currency: transaction.currency,
      sourceBalanceBefore: transaction.sourceBalanceBefore,
      sourceBalanceAfter: transaction.sourceBalanceAfter,
      destinationBalanceBefore: transaction.destinationBalanceBefore,
      destinationBalanceAfter: transaction.destinationBalanceAfter,
      status: transaction.status,
      reference: transaction.reference,
      metadata: transaction.metadata,
      createdAt: transaction.createdAt,
      completedAt: transaction.completedAt,
    };
  }

  /**
   * Map Transaction entity to TransferResult
   */
  private mapToTransferResult(transaction: Transaction): TransferResult {
    return {
      debitTransactionId: transaction.id,
      creditTransactionId: transaction.id, // In new model, it's a single transaction
      sourceAccountId: transaction.sourceAccountId,
      destinationAccountId: transaction.destinationAccountId,
      amount: transaction.amount,
      currency: transaction.currency,
      status: transaction.status,
      reference: transaction.reference,
      createdAt: transaction.createdAt,
      completedAt: transaction.completedAt,
    };
  }
}


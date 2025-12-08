import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { CommandBus } from '@nestjs/cqrs';
import { v4 as uuidv4 } from 'uuid';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
} from './transaction.entity';
import { Account } from '../account/account.entity';
import { AccountService } from '../account/account.service';
import {
  toAccountId,
  TransactionId,
  IdempotencyKey,
} from '../../common/types/branded.types';
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
import { RefundCommand } from './commands/refund.command';

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly accountService: AccountService,
    // Reserved for future direct use (validation/auditing currently in CQRS handlers)
    _currencyService: CurrencyService,
    _auditService: AuditService,
    _dataSource: DataSource,
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
    const command = new TopupCommand({
      transactionId,
      accountId: dto.destinationAccountId,
      amount: dto.amount,
      currency: dto.currency,
      sourceAccountId: dto.sourceAccountId,
      idempotencyKey: dto.idempotencyKey,
      correlationId: context.correlationId,
      actorId: context.actorId,
    });

    await this.commandBus.execute(command);

    // Return immediately - transaction will be processed asynchronously by saga
    // Client should poll GET /transactions/:id to check status
    return {
      transactionId: transactionId,
      idempotencyKey: dto.idempotencyKey,
      type: TransactionType.TOPUP,
      sourceAccountId: dto.sourceAccountId,
      destinationAccountId: dto.destinationAccountId,
      amount: dto.amount,
      currency: dto.currency,
      sourceBalanceBefore: '0',
      sourceBalanceAfter: '0',
      destinationBalanceBefore: '0',
      destinationBalanceAfter: '0',
      status: TransactionStatus.PENDING,
      reference: undefined,
      metadata: {},
      createdAt: new Date(),
      completedAt: undefined,
    };
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

    // Upfront validation: Check source account exists and is valid
    const sourceAccount = await this.accountService.findById(
      toAccountId(dto.sourceAccountId),
    );

    // Validate account is active
    this.accountService.validateAccountActive(sourceAccount);

    // Validate destination account exists (if provided)
    if (dto.destinationAccountId) {
      await this.accountService.findById(toAccountId(dto.destinationAccountId));
    }

    // Validate currency match
    if (sourceAccount.currency !== dto.currency) {
      throw new CurrencyMismatchException(sourceAccount.currency, dto.currency);
    }

    // Validate sufficient balance
    const balance = new Decimal(sourceAccount.balance);
    const withdrawalAmount = new Decimal(dto.amount);
    if (balance.lessThan(withdrawalAmount)) {
      throw new InsufficientBalanceException(
        dto.sourceAccountId,
        balance.toString(),
        withdrawalAmount.toString(),
      );
    }

    // Generate transaction ID
    const transactionId = uuidv4();

    // Execute CQRS command
    const command = new WithdrawalCommand({
      transactionId,
      accountId: dto.sourceAccountId,
      amount: dto.amount,
      currency: dto.currency,
      destinationAccountId: dto.destinationAccountId,
      idempotencyKey: dto.idempotencyKey,
      correlationId: context.correlationId,
      actorId: context.actorId,
    });

    await this.commandBus.execute(command);

    // Return immediately - transaction will be processed asynchronously by saga
    // Client should poll GET /transactions/:id to check status
    return {
      transactionId: transactionId,
      idempotencyKey: dto.idempotencyKey,
      type: TransactionType.WITHDRAWAL,
      sourceAccountId: dto.sourceAccountId,
      destinationAccountId: dto.destinationAccountId,
      amount: dto.amount,
      currency: dto.currency,
      sourceBalanceBefore: '0',
      sourceBalanceAfter: '0',
      destinationBalanceBefore: '0',
      destinationBalanceAfter: '0',
      status: TransactionStatus.PENDING,
      reference: undefined,
      metadata: {},
      createdAt: new Date(),
      completedAt: undefined,
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

    // Upfront validation: Check accounts exist and are valid
    const sourceAccount = await this.accountService.findById(
      toAccountId(dto.sourceAccountId),
    );
    const destinationAccount = await this.accountService.findById(
      toAccountId(dto.destinationAccountId),
    );

    // Validate accounts are active
    this.accountService.validateAccountActive(sourceAccount);
    this.accountService.validateAccountActive(destinationAccount);

    // Validate currency match
    if (sourceAccount.currency !== dto.currency) {
      throw new CurrencyMismatchException(sourceAccount.currency, dto.currency);
    }
    if (destinationAccount.currency !== dto.currency) {
      throw new CurrencyMismatchException(
        destinationAccount.currency,
        dto.currency,
      );
    }

    // Validate sufficient balance
    const sourceBalance = new Decimal(sourceAccount.balance);
    const transferAmount = new Decimal(dto.amount);
    if (sourceBalance.lessThan(transferAmount)) {
      throw new InsufficientBalanceException(
        dto.sourceAccountId,
        sourceBalance.toString(),
        transferAmount.toString(),
      );
    }

    // Generate transaction ID
    const transactionId = uuidv4();

    // Execute CQRS command
    const command = new TransferCommand({
      transactionId,
      sourceAccountId: dto.sourceAccountId,
      destinationAccountId: dto.destinationAccountId,
      amount: dto.amount,
      currency: dto.currency,
      idempotencyKey: dto.idempotencyKey,
      correlationId: context.correlationId,
      actorId: context.actorId,
    });

    await this.commandBus.execute(command);

    // Return immediately - transaction will be processed asynchronously by saga
    // Client should poll GET /transactions/:id to check status
    return {
      debitTransactionId: transactionId,
      creditTransactionId: transactionId,
      sourceAccountId: dto.sourceAccountId,
      destinationAccountId: dto.destinationAccountId,
      amount: dto.amount,
      currency: dto.currency,
      status: TransactionStatus.PENDING,
      reference: '',
      createdAt: new Date(),
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
      throw new RefundException(
        `Original transaction ${originalTransaction.id} has no amount`,
      );
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
    const command = new RefundCommand({
      refundId: transactionId,
      originalPaymentId: dto.originalTransactionId,
      refundAmount: refundAmount.toString(),
      currency: originalTransaction.currency,
      idempotencyKey: dto.idempotencyKey,
      refundMetadata: {
        reason: dto.reason,
        refundType: refundAmount.equals(originalAmount) ? 'full' : 'partial',
        ...dto.metadata,
      },
      correlationId: context.correlationId,
      actorId: context.actorId,
    });

    await this.commandBus.execute(command);

    // Return immediately - transaction will be processed asynchronously by saga
    // Client should poll GET /transactions/:id to check status
    return {
      transactionId: transactionId,
      idempotencyKey: dto.idempotencyKey,
      type: TransactionType.REFUND,
      sourceAccountId: originalTransaction.destinationAccountId, // Reverse direction
      destinationAccountId: originalTransaction.sourceAccountId,
      amount: refundAmount.toString(),
      currency: originalTransaction.currency,
      sourceBalanceBefore: '0',
      sourceBalanceAfter: '0',
      destinationBalanceBefore: '0',
      destinationBalanceAfter: '0',
      status: TransactionStatus.PENDING,
      reference: undefined,
      metadata: {},
      createdAt: new Date(),
      completedAt: undefined,
    };
  }

  /**
   * Get transaction by ID
   */
  async findById(id: TransactionId): Promise<Transaction> {
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
   * Find account by ID (helper for controller validation)
   */
  async findAccountById(accountId: string): Promise<Account> {
    return await this.accountService.findById(toAccountId(accountId));
  }

  /**
   * Find transaction by idempotency key (helper for controller)
   */
  async findByIdempotencyKey(
    idempotencyKey: IdempotencyKey,
  ): Promise<Transaction | null> {
    return await this.transactionRepository.findOne({
      where: { idempotencyKey },
    });
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
      query.andWhere('transaction.status = :status', {
        status: filters.status,
      });
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

  // Note: All business logic has moved to CQRS aggregates and handlers
  // This service is now a thin coordinator that dispatches commands
}

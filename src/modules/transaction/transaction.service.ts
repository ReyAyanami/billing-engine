import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
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

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly accountService: AccountService,
    private readonly currencyService: CurrencyService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Top-up: External Account (source) → User Account (destination)
   * Money flows FROM external source TO user account
   */
  async topup(
    dto: TopupDto,
    context: OperationContext,
  ): Promise<TransactionResult> {
    return await this.dataSource.transaction(async (manager) => {
      // Check for duplicate transaction
      await this.checkIdempotency(dto.idempotencyKey, manager);

      // Find and lock both accounts
      const sourceAccount = await this.accountService.findAndLock(
        dto.sourceAccountId,
        manager,
      );
      const destAccount = await this.accountService.findAndLock(
        dto.destinationAccountId,
        manager,
      );

      // Validate accounts are active
      this.accountService.validateAccountActive(sourceAccount);
      this.accountService.validateAccountActive(destAccount);

      // Validate currency
      await this.currencyService.validateCurrency(dto.currency);

      // Validate currency match
      if (sourceAccount.currency !== dto.currency || destAccount.currency !== dto.currency) {
        throw new CurrencyMismatchException(destAccount.currency, dto.currency);
      }

      // Validate amount
      this.validateAmount(dto.amount);
      const amount = new Decimal(dto.amount);

      // Check max balance limit on destination (if set)
      if (destAccount.maxBalance) {
        this.checkMaxBalance(destAccount, amount);
      }

      // Calculate balances
      const sourceBalanceBefore = new Decimal(sourceAccount.balance);
      const sourceBalanceAfter = sourceBalanceBefore.minus(amount);
      const destBalanceBefore = new Decimal(destAccount.balance);
      const destBalanceAfter = destBalanceBefore.plus(amount);

      // Note: External accounts can go negative (they represent external systems)

      // Create transaction
      const transaction = manager.create(Transaction, {
        idempotencyKey: dto.idempotencyKey,
        type: TransactionType.TOPUP,
        sourceAccountId: sourceAccount.id,
        destinationAccountId: destAccount.id,
        amount: amount.toString(),
        currency: dto.currency,
        sourceBalanceBefore: sourceBalanceBefore.toString(),
        sourceBalanceAfter: sourceBalanceAfter.toString(),
        destinationBalanceBefore: destBalanceBefore.toString(),
        destinationBalanceAfter: destBalanceAfter.toString(),
        status: TransactionStatus.PENDING,
        reference: dto.reference,
        metadata: dto.metadata,
      });

      const savedTransaction = await manager.save(Transaction, transaction);

      // Update both account balances
      await this.accountService.updateBalance(
        sourceAccount,
        sourceBalanceAfter.toString(),
        manager,
      );
      await this.accountService.updateBalance(
        destAccount,
        destBalanceAfter.toString(),
        manager,
      );

      // Mark transaction as completed
      savedTransaction.status = TransactionStatus.COMPLETED;
      savedTransaction.completedAt = new Date();
      await manager.save(Transaction, savedTransaction);

      // Audit log
      await this.auditService.log(
        'Transaction',
        savedTransaction.id,
        'TOPUP',
        {
          sourceAccountId: sourceAccount.id,
          destinationAccountId: destAccount.id,
          amount: amount.toString(),
        },
        context,
      );

      return this.mapToTransactionResult(savedTransaction);
    });
  }

  /**
   * Withdrawal: User Account (source) → External Account (destination)
   * Money flows FROM user account TO external destination
   */
  async withdraw(
    dto: WithdrawalDto,
    context: OperationContext,
  ): Promise<TransactionResult> {
    return await this.dataSource.transaction(async (manager) => {
      // Check for duplicate transaction
      await this.checkIdempotency(dto.idempotencyKey, manager);

      // Find and lock both accounts
      const sourceAccount = await this.accountService.findAndLock(
        dto.sourceAccountId,
        manager,
      );
      const destAccount = await this.accountService.findAndLock(
        dto.destinationAccountId,
        manager,
      );

      // Validate accounts are active
      this.accountService.validateAccountActive(sourceAccount);
      this.accountService.validateAccountActive(destAccount);

      // Validate currency
      await this.currencyService.validateCurrency(dto.currency);

      // Validate currency match
      if (sourceAccount.currency !== dto.currency || destAccount.currency !== dto.currency) {
        throw new CurrencyMismatchException(sourceAccount.currency, dto.currency);
      }

      // Validate amount
      this.validateAmount(dto.amount);
      const amount = new Decimal(dto.amount);

      // Calculate balances
      const sourceBalanceBefore = new Decimal(sourceAccount.balance);
      const sourceBalanceAfter = sourceBalanceBefore.minus(amount);
      const destBalanceBefore = new Decimal(destAccount.balance);
      const destBalanceAfter = destBalanceBefore.plus(amount);

      // Check sufficient balance in source account
      if (sourceBalanceAfter.lessThan(0)) {
        throw new InsufficientBalanceException(sourceAccount.id, sourceBalanceBefore.toString(), amount.toString());
      }

      // Check min balance requirement (if set)
      this.checkMinBalance(sourceAccount, sourceBalanceAfter);

      // Create transaction
      const transaction = manager.create(Transaction, {
        idempotencyKey: dto.idempotencyKey,
        type: TransactionType.WITHDRAWAL,
        sourceAccountId: sourceAccount.id,
        destinationAccountId: destAccount.id,
        amount: amount.toString(),
        currency: dto.currency,
        sourceBalanceBefore: sourceBalanceBefore.toString(),
        sourceBalanceAfter: sourceBalanceAfter.toString(),
        destinationBalanceBefore: destBalanceBefore.toString(),
        destinationBalanceAfter: destBalanceAfter.toString(),
        status: TransactionStatus.PENDING,
        reference: dto.reference,
        metadata: dto.metadata,
      });

      const savedTransaction = await manager.save(Transaction, transaction);

      // Update both account balances
      await this.accountService.updateBalance(
        sourceAccount,
        sourceBalanceAfter.toString(),
        manager,
      );
      await this.accountService.updateBalance(
        destAccount,
        destBalanceAfter.toString(),
        manager,
      );

      // Mark transaction as completed
      savedTransaction.status = TransactionStatus.COMPLETED;
      savedTransaction.completedAt = new Date();
      await manager.save(Transaction, savedTransaction);

      // Audit log
      await this.auditService.log(
        'Transaction',
        savedTransaction.id,
        'WITHDRAWAL',
        {
          sourceAccountId: sourceAccount.id,
          destinationAccountId: destAccount.id,
          amount: amount.toString(),
        },
        context,
      );

      return this.mapToTransactionResult(savedTransaction);
    });
  }

  /**
   * Transfer: Account A (source) → Account B (destination)
   * Money flows between two accounts
   */
  async transfer(
    dto: TransferDto,
    context: OperationContext,
  ): Promise<TransferResult> {
    return await this.dataSource.transaction(async (manager) => {
      // Check for duplicate transaction
      await this.checkIdempotency(dto.idempotencyKey, manager);

      // Validate not transferring to self
      if (dto.sourceAccountId === dto.destinationAccountId) {
        throw new InvalidOperationException('SELF_TRANSFER_NOT_ALLOWED');
      }

      // Find and lock both accounts (order by ID to prevent deadlocks)
      const [sourceAccount, destAccount] = await this.lockAccountsInOrder(
        dto.sourceAccountId,
        dto.destinationAccountId,
        manager,
      );

      // Validate accounts are active
      this.accountService.validateAccountActive(sourceAccount);
      this.accountService.validateAccountActive(destAccount);

      // Validate currency
      await this.currencyService.validateCurrency(dto.currency);

      // Validate currency match
      if (sourceAccount.currency !== dto.currency || destAccount.currency !== dto.currency) {
        throw new CurrencyMismatchException(sourceAccount.currency, dto.currency);
      }

      // Validate amount
      this.validateAmount(dto.amount);
      const amount = new Decimal(dto.amount);

      // Calculate balances
      const sourceBalanceBefore = new Decimal(sourceAccount.balance);
      const sourceBalanceAfter = sourceBalanceBefore.minus(amount);
      const destBalanceBefore = new Decimal(destAccount.balance);
      const destBalanceAfter = destBalanceBefore.plus(amount);

      // Check sufficient balance
      if (sourceBalanceAfter.lessThan(0)) {
        throw new InsufficientBalanceException(sourceAccount.id, sourceBalanceBefore.toString(), amount.toString());
      }

      // Check min/max balance limits
      this.checkMinBalance(sourceAccount, sourceBalanceAfter);
      this.checkMaxBalance(destAccount, amount);

      // Create transaction
      const transaction = manager.create(Transaction, {
        idempotencyKey: dto.idempotencyKey,
        type: TransactionType.TRANSFER_DEBIT,
        sourceAccountId: sourceAccount.id,
        destinationAccountId: destAccount.id,
        amount: amount.toString(),
        currency: dto.currency,
        sourceBalanceBefore: sourceBalanceBefore.toString(),
        sourceBalanceAfter: sourceBalanceAfter.toString(),
        destinationBalanceBefore: destBalanceBefore.toString(),
        destinationBalanceAfter: destBalanceAfter.toString(),
        status: TransactionStatus.PENDING,
        reference: dto.reference,
        metadata: dto.metadata,
      });

      const savedTransaction = await manager.save(Transaction, transaction);

      // Update both account balances
      await this.accountService.updateBalance(
        sourceAccount,
        sourceBalanceAfter.toString(),
        manager,
      );
      await this.accountService.updateBalance(
        destAccount,
        destBalanceAfter.toString(),
        manager,
      );

      // Mark transaction as completed
      savedTransaction.status = TransactionStatus.COMPLETED;
      savedTransaction.completedAt = new Date();
      await manager.save(Transaction, savedTransaction);

      // Audit log
      await this.auditService.log(
        'Transaction',
        savedTransaction.id,
        'TRANSFER',
        {
          sourceAccountId: sourceAccount.id,
          destinationAccountId: destAccount.id,
          amount: amount.toString(),
        },
        context,
      );

      return this.mapToTransferResult(savedTransaction);
    });
  }

  /**
   * Refund a transaction (reverses the original transaction)
   */
  async refund(
    dto: RefundDto,
    context: OperationContext,
  ): Promise<TransactionResult> {
    return await this.dataSource.transaction(async (manager) => {
      // Check for duplicate transaction
      await this.checkIdempotency(dto.idempotencyKey, manager);

      // Find original transaction
      const originalTransaction = await manager
        .getRepository(Transaction)
        .createQueryBuilder('transaction')
        .where('transaction.id = :id', { id: dto.originalTransactionId })
        .getOne();

      if (!originalTransaction) {
        throw new TransactionNotFoundException(dto.originalTransactionId);
      }

      // Validate that transaction can be refunded
      if (originalTransaction.status === TransactionStatus.REFUNDED) {
        throw new RefundException('Transaction already refunded');
      }

      if (originalTransaction.status !== TransactionStatus.COMPLETED) {
        throw new RefundException('Can only refund completed transactions');
      }

      // Validate original transaction has required fields
      if (!originalTransaction.amount) {
        throw new RefundException(`Original transaction ${originalTransaction.id} has no amount`);
      }
      if (!originalTransaction.sourceAccountId) {
        throw new RefundException(`Original transaction ${originalTransaction.id} has no sourceAccountId`);
      }
      if (!originalTransaction.destinationAccountId) {
        throw new RefundException(`Original transaction ${originalTransaction.id} has no destinationAccountId`);
      }

      // Determine refund amount (convert to Decimal)
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

      // For refund, we reverse: original destination → original source
      const sourceAccountId = originalTransaction.destinationAccountId;
      const destAccountId = originalTransaction.sourceAccountId;

      // Find and lock both accounts
      const sourceAccount = await this.accountService.findAndLock(
        sourceAccountId,
        manager,
      );
      const destAccount = await this.accountService.findAndLock(
        destAccountId,
        manager,
      );

      // Validate accounts are active
      this.accountService.validateAccountActive(sourceAccount);
      this.accountService.validateAccountActive(destAccount);

      // Validate accounts have balance field
      if (sourceAccount.balance === undefined || sourceAccount.balance === null) {
        throw new RefundException(`Source account ${sourceAccount.id} has no balance`);
      }
      if (destAccount.balance === undefined || destAccount.balance === null) {
        throw new RefundException(`Destination account ${destAccount.id} has no balance`);
      }

      // Calculate balances
      const sourceBalanceBefore = new Decimal(sourceAccount.balance);
      const sourceBalanceAfter = sourceBalanceBefore.minus(refundAmount);
      const destBalanceBefore = new Decimal(destAccount.balance);
      const destBalanceAfter = destBalanceBefore.plus(refundAmount);

      // Check sufficient balance for refund (only for user accounts, external can go negative)
      if (sourceAccount.accountType === AccountType.USER && sourceBalanceAfter.lessThan(0)) {
        throw new InsufficientBalanceException(sourceAccount.id, sourceBalanceBefore.toString(), refundAmount.toString());
      }

      // Create refund transaction
      const refundTransaction = manager.create(Transaction, {
        idempotencyKey: dto.idempotencyKey,
        type: TransactionType.REFUND,
        sourceAccountId: sourceAccount.id,
        destinationAccountId: destAccount.id,
        amount: refundAmount.toString(),
        currency: originalTransaction.currency,
        sourceBalanceBefore: sourceBalanceBefore.toString(),
        sourceBalanceAfter: sourceBalanceAfter.toString(),
        destinationBalanceBefore: destBalanceBefore.toString(),
        destinationBalanceAfter: destBalanceAfter.toString(),
        status: TransactionStatus.PENDING,
        reference: dto.reason || `Refund for ${originalTransaction.id}`,
        parentTransactionId: originalTransaction.id,
        metadata: {
          ...dto.metadata,
          originalTransactionId: originalTransaction.id,
          refundReason: dto.reason,
        },
      });

      const savedRefundTransaction = await manager.save(Transaction, refundTransaction);

      // Update both account balances
      await this.accountService.updateBalance(
        sourceAccount,
        sourceBalanceAfter.toString(),
        manager,
      );
      await this.accountService.updateBalance(
        destAccount,
        destBalanceAfter.toString(),
        manager,
      );

      // Mark refund transaction as completed
      savedRefundTransaction.status = TransactionStatus.COMPLETED;
      savedRefundTransaction.completedAt = new Date();
      await manager.save(Transaction, savedRefundTransaction);

      // Update original transaction status
      originalTransaction.status = TransactionStatus.REFUNDED;
      await manager.save(Transaction, originalTransaction);

      // Audit log
      await this.auditService.log(
        'Transaction',
        savedRefundTransaction.id,
        'REFUND',
        {
          originalTransactionId: originalTransaction.id,
          amount: refundAmount.toString(),
        },
        context,
      );

      return this.mapToTransactionResult(savedRefundTransaction);
    });
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


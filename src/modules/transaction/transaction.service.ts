import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
} from './transaction.entity';
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
   * Top-up (credit) an account
   */
  async topup(
    dto: TopupDto,
    context: OperationContext,
  ): Promise<TransactionResult> {
    return await this.dataSource.transaction(async (manager) => {
      // Check for duplicate transaction
      await this.checkIdempotency(dto.idempotencyKey, manager);

      // Find and lock account
      const account = await this.accountService.findAndLock(
        dto.accountId,
        manager,
      );

      // Validate account is active
      this.accountService.validateAccountActive(account);

      // Validate currency
      await this.currencyService.validateCurrency(dto.currency);

      // Validate currency match
      if (account.currency !== dto.currency) {
        throw new CurrencyMismatchException(account.currency, dto.currency);
      }

      // Validate amount
      this.validateAmount(dto.amount);

      // Calculate new balance
      const balanceBefore = new Decimal(account.balance);
      const amount = new Decimal(dto.amount);
      const balanceAfter = balanceBefore.plus(amount);

      // Create transaction
      const transaction = manager.create(Transaction, {
        idempotencyKey: dto.idempotencyKey,
        type: TransactionType.TOPUP,
        accountId: account.id,
        amount: amount.toString(),
        currency: dto.currency,
        balanceBefore: balanceBefore.toString(),
        balanceAfter: balanceAfter.toString(),
        status: TransactionStatus.PENDING,
        reference: dto.reference,
        metadata: dto.metadata,
      });

      const savedTransaction = await manager.save(Transaction, transaction);

      // Update account balance
      await this.accountService.updateBalance(
        account,
        balanceAfter.toString(),
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
          accountId: account.id,
          amount: amount.toString(),
          balanceBefore: balanceBefore.toString(),
          balanceAfter: balanceAfter.toString(),
        },
        context,
      );

      return this.mapToTransactionResult(savedTransaction);
    });
  }

  /**
   * Withdraw (debit) from an account
   */
  async withdraw(
    dto: WithdrawalDto,
    context: OperationContext,
  ): Promise<TransactionResult> {
    return await this.dataSource.transaction(async (manager) => {
      // Check for duplicate transaction
      await this.checkIdempotency(dto.idempotencyKey, manager);

      // Find and lock account
      const account = await this.accountService.findAndLock(
        dto.accountId,
        manager,
      );

      // Validate account is active
      this.accountService.validateAccountActive(account);

      // Validate currency
      await this.currencyService.validateCurrency(dto.currency);

      // Validate currency match
      if (account.currency !== dto.currency) {
        throw new CurrencyMismatchException(account.currency, dto.currency);
      }

      // Validate amount
      this.validateAmount(dto.amount);

      // Calculate new balance and check sufficiency
      const balanceBefore = new Decimal(account.balance);
      const amount = new Decimal(dto.amount);

      if (balanceBefore.lessThan(amount)) {
        throw new InsufficientBalanceException(
          account.id,
          amount.toString(),
          balanceBefore.toString(),
        );
      }

      const balanceAfter = balanceBefore.minus(amount);

      // Create transaction
      const transaction = manager.create(Transaction, {
        idempotencyKey: dto.idempotencyKey,
        type: TransactionType.WITHDRAWAL,
        accountId: account.id,
        amount: amount.toString(),
        currency: dto.currency,
        balanceBefore: balanceBefore.toString(),
        balanceAfter: balanceAfter.toString(),
        status: TransactionStatus.PENDING,
        reference: dto.reference,
        metadata: dto.metadata,
      });

      const savedTransaction = await manager.save(Transaction, transaction);

      // Update account balance
      await this.accountService.updateBalance(
        account,
        balanceAfter.toString(),
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
          accountId: account.id,
          amount: amount.toString(),
          balanceBefore: balanceBefore.toString(),
          balanceAfter: balanceAfter.toString(),
        },
        context,
      );

      return this.mapToTransactionResult(savedTransaction);
    });
  }

  /**
   * Transfer between two accounts
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
        throw new InvalidOperationException('Cannot transfer to the same account');
      }

      // Find and lock both accounts (in consistent order to prevent deadlocks)
      const [sourceId, destId] = [dto.sourceAccountId, dto.destinationAccountId].sort();
      const account1 = await this.accountService.findAndLock(sourceId, manager);
      const account2 = await this.accountService.findAndLock(destId, manager);

      const sourceAccount = sourceId === dto.sourceAccountId ? account1 : account2;
      const destAccount = destId === dto.destinationAccountId ? account1 : account2;

      // Validate both accounts are active
      this.accountService.validateAccountActive(sourceAccount);
      this.accountService.validateAccountActive(destAccount);

      // Validate currency
      await this.currencyService.validateCurrency(dto.currency);

      // Validate currency match for both accounts
      if (sourceAccount.currency !== dto.currency) {
        throw new CurrencyMismatchException(sourceAccount.currency, dto.currency);
      }
      if (destAccount.currency !== dto.currency) {
        throw new CurrencyMismatchException(destAccount.currency, dto.currency);
      }

      // Validate amount
      this.validateAmount(dto.amount);

      // Calculate new balances
      const sourceBalanceBefore = new Decimal(sourceAccount.balance);
      const destBalanceBefore = new Decimal(destAccount.balance);
      const amount = new Decimal(dto.amount);

      if (sourceBalanceBefore.lessThan(amount)) {
        throw new InsufficientBalanceException(
          sourceAccount.id,
          amount.toString(),
          sourceBalanceBefore.toString(),
        );
      }

      const sourceBalanceAfter = sourceBalanceBefore.minus(amount);
      const destBalanceAfter = destBalanceBefore.plus(amount);

      // Create debit transaction
      const debitTransaction = manager.create(Transaction, {
        idempotencyKey: dto.idempotencyKey,
        type: TransactionType.TRANSFER_DEBIT,
        accountId: sourceAccount.id,
        counterpartyAccountId: destAccount.id,
        amount: amount.toString(),
        currency: dto.currency,
        balanceBefore: sourceBalanceBefore.toString(),
        balanceAfter: sourceBalanceAfter.toString(),
        status: TransactionStatus.PENDING,
        reference: dto.reference,
        metadata: { ...dto.metadata, transfer_type: 'debit' },
      });

      const savedDebitTransaction = await manager.save(Transaction, debitTransaction);

      // Create credit transaction (generate new UUID for idempotency)
      const { v4: uuidv4 } = require('uuid');
      const creditIdempotencyKey = uuidv4();
      const creditTransaction = manager.create(Transaction, {
        idempotencyKey: creditIdempotencyKey,
        type: TransactionType.TRANSFER_CREDIT,
        accountId: destAccount.id,
        counterpartyAccountId: sourceAccount.id,
        amount: amount.toString(),
        currency: dto.currency,
        balanceBefore: destBalanceBefore.toString(),
        balanceAfter: destBalanceAfter.toString(),
        status: TransactionStatus.PENDING,
        reference: dto.reference,
        metadata: {
          ...dto.metadata,
          transfer_type: 'credit',
          related_transaction_id: savedDebitTransaction.id,
        },
      });

      const savedCreditTransaction = await manager.save(Transaction, creditTransaction);

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

      // Mark both transactions as completed
      savedDebitTransaction.status = TransactionStatus.COMPLETED;
      savedDebitTransaction.completedAt = new Date();
      savedCreditTransaction.status = TransactionStatus.COMPLETED;
      savedCreditTransaction.completedAt = new Date();

      await manager.save(Transaction, [savedDebitTransaction, savedCreditTransaction]);

      // Audit log
      await this.auditService.log(
        'Transaction',
        savedDebitTransaction.id,
        'TRANSFER',
        {
          sourceAccountId: sourceAccount.id,
          destinationAccountId: destAccount.id,
          amount: amount.toString(),
          debitTransactionId: savedDebitTransaction.id,
          creditTransactionId: savedCreditTransaction.id,
        },
        context,
      );

      return {
        debitTransactionId: savedDebitTransaction.id,
        creditTransactionId: savedCreditTransaction.id,
        sourceAccountId: sourceAccount.id,
        destinationAccountId: destAccount.id,
        amount: amount.toString(),
        currency: dto.currency,
        sourceBalanceAfter: sourceBalanceAfter.toString(),
        destinationBalanceAfter: destBalanceAfter.toString(),
        status: TransactionStatus.COMPLETED,
        createdAt: savedDebitTransaction.createdAt,
      };
    });
  }

  /**
   * Refund a transaction
   */
  async refund(
    dto: RefundDto,
    context: OperationContext,
  ): Promise<TransactionResult> {
    return await this.dataSource.transaction(async (manager) => {
      // Check for duplicate transaction
      await this.checkIdempotency(dto.idempotencyKey, manager);

      // Find original transaction
      const originalTransaction = await manager.findOne(Transaction, {
        where: { id: dto.originalTransactionId },
      });

      if (!originalTransaction) {
        throw new TransactionNotFoundException(dto.originalTransactionId);
      }

      // Validate transaction has required fields
      if (!originalTransaction.amount) {
        throw new RefundException(
          'Original transaction has invalid data',
          { transactionId: dto.originalTransactionId },
        );
      }

      // Validate transaction can be refunded
      this.validateRefundable(originalTransaction);

      // Determine refund amount
      const refundAmount = dto.amount && dto.amount.trim() !== ''
        ? new Decimal(dto.amount)
        : new Decimal(originalTransaction.amount);

      // Validate refund amount
      if (refundAmount.greaterThan(new Decimal(originalTransaction.amount))) {
        throw new RefundException(
          'Refund amount cannot exceed original transaction amount',
          {
            originalAmount: originalTransaction.amount,
            refundAmount: refundAmount.toString(),
          },
        );
      }

      // Find and lock account
      const account = await this.accountService.findAndLock(
        originalTransaction.accountId,
        manager,
      );

      // Validate account is active
      this.accountService.validateAccountActive(account);

      // Calculate new balance (reverse the original transaction)
      const balanceBefore = new Decimal(account.balance);
      let balanceAfter: Decimal;

      // Determine if this is a credit or debit refund
      const isDebitRefund = [
        TransactionType.WITHDRAWAL,
        TransactionType.TRANSFER_DEBIT,
        TransactionType.PAYMENT,
      ].includes(originalTransaction.type);

      if (isDebitRefund) {
        // Refund a debit = credit the account
        balanceAfter = balanceBefore.plus(refundAmount);
      } else {
        // Refund a credit = debit the account
        if (balanceBefore.lessThan(refundAmount)) {
          throw new InsufficientBalanceException(
            account.id,
            refundAmount.toString(),
            balanceBefore.toString(),
          );
        }
        balanceAfter = balanceBefore.minus(refundAmount);
      }

      // Create refund transaction
      const refundTransaction = manager.create(Transaction, {
        idempotencyKey: dto.idempotencyKey,
        type: TransactionType.REFUND,
        accountId: account.id,
        amount: refundAmount.toString(),
        currency: originalTransaction.currency,
        balanceBefore: balanceBefore.toString(),
        balanceAfter: balanceAfter.toString(),
        status: TransactionStatus.PENDING,
        reference: dto.reason || `Refund for transaction ${originalTransaction.id}`,
        metadata: {
          ...dto.metadata,
          original_transaction_id: originalTransaction.id,
          original_transaction_type: originalTransaction.type,
        },
        parentTransactionId: originalTransaction.id,
      });

      const savedRefundTransaction = await manager.save(Transaction, refundTransaction);

      // Update account balance
      await this.accountService.updateBalance(
        account,
        balanceAfter.toString(),
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
          accountId: account.id,
          originalTransactionId: originalTransaction.id,
          refundAmount: refundAmount.toString(),
          balanceBefore: balanceBefore.toString(),
          balanceAfter: balanceAfter.toString(),
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
      relations: ['account', 'counterpartyAccount', 'parentTransaction'],
    });

    if (!transaction) {
      throw new TransactionNotFoundException(id);
    }

    return transaction;
  }

  /**
   * Get transactions for an account
   */
  async findByAccount(
    accountId: string,
    limit = 50,
    offset = 0,
  ): Promise<Transaction[]> {
    return await this.transactionRepository.find({
      where: { accountId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Check for duplicate transaction (idempotency)
   */
  private async checkIdempotency(
    idempotencyKey: string,
    manager: any,
  ): Promise<void> {
    const existing = await manager.findOne(Transaction, {
      where: { idempotencyKey },
    });

    if (existing) {
      throw new DuplicateTransactionException(idempotencyKey, existing.id);
    }
  }

  /**
   * Validate amount is positive
   */
  private validateAmount(amount: string): void {
    const decimal = new Decimal(amount);
    if (decimal.lessThanOrEqualTo(0)) {
      throw new InvalidOperationException('Amount must be positive', { amount });
    }
  }

  /**
   * Validate transaction can be refunded
   */
  private validateRefundable(transaction: Transaction): void {
    if (transaction.status !== TransactionStatus.COMPLETED) {
      throw new RefundException(
        'Only completed transactions can be refunded',
        { transactionId: transaction.id, status: transaction.status },
      );
    }

    if (transaction.type === TransactionType.REFUND) {
      throw new RefundException('Cannot refund a refund transaction', {
        transactionId: transaction.id,
      });
    }

    if (transaction.type === TransactionType.CANCELLATION) {
      throw new RefundException('Cannot refund a cancellation transaction', {
        transactionId: transaction.id,
      });
    }
  }

  /**
   * Map transaction entity to result DTO
   */
  private mapToTransactionResult(transaction: Transaction): TransactionResult {
    return {
      transactionId: transaction.id,
      accountId: transaction.accountId,
      amount: transaction.amount,
      currency: transaction.currency,
      balanceAfter: transaction.balanceAfter,
      status: transaction.status,
      createdAt: transaction.createdAt,
    };
  }
}


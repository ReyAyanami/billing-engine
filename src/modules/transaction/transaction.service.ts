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

// Pipeline imports
import { TransactionPipeline } from './pipeline/transaction-pipeline';
import { TransactionContext } from './pipeline/transaction-context';
import {
  CheckIdempotencyStep,
  LoadAndLockAccountsStep,
  ValidateAccountsStep,
  CalculateBalancesStep,
  CreateTransactionStep,
  UpdateBalancesStep,
  CompleteTransactionStep,
  AuditLogStep,
} from './pipeline';

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly accountService: AccountService,
    private readonly currencyService: CurrencyService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
    // Pipeline dependencies
    private readonly pipeline: TransactionPipeline,
    private readonly checkIdempotencyStep: CheckIdempotencyStep,
    private readonly loadAndLockAccountsStep: LoadAndLockAccountsStep,
    private readonly validateAccountsStep: ValidateAccountsStep,
    private readonly calculateBalancesStep: CalculateBalancesStep,
    private readonly createTransactionStep: CreateTransactionStep,
    private readonly updateBalancesStep: UpdateBalancesStep,
    private readonly completeTransactionStep: CompleteTransactionStep,
    private readonly auditLogStep: AuditLogStep,
  ) {}

  /**
   * Top-up (Pipeline-based): External Account (source) → User Account (destination)
   * 
   * Adds funds to an account from an external source. Uses pipeline pattern
   * with composable, reusable steps for efficient transaction processing.
   * 
   * Pipeline Steps:
   * 1. Check idempotency
   * 2. Load and lock accounts
   * 3. Validate accounts & currency
   * 4. Calculate balances
   * 5. Create transaction record
   * 6. Update balances
   * 7. Complete transaction
   * 8. Audit log
   */
  async topup(
    dto: TopupDto,
    context: OperationContext,
  ): Promise<TransactionResult> {
    return this.pipeline.execute(
      new TransactionContext({
        idempotencyKey: dto.idempotencyKey,
        type: TransactionType.TOPUP,
        sourceAccountId: dto.sourceAccountId,
        destinationAccountId: dto.destinationAccountId,
        amount: dto.amount,
        currency: dto.currency,
        reference: dto.reference,
        metadata: dto.metadata,
        operationContext: context,
      }),
      [
        this.checkIdempotencyStep,
        this.loadAndLockAccountsStep,
        this.validateAccountsStep,
        this.calculateBalancesStep,
        this.createTransactionStep,
        this.updateBalancesStep,
        this.completeTransactionStep,
        this.auditLogStep,
      ],
    );
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
   * Withdrawal V2 (Pipeline-based): User Account (source) → External Account (destination)
   * 
   * Uses the same pipeline steps as topup, demonstrating reusability.
   * 
   * @experimental Running in parallel with existing withdraw() for comparison
   */
  async withdrawV2(
    dto: WithdrawalDto,
    context: OperationContext,
  ): Promise<TransactionResult> {
    return this.pipeline.execute(
      new TransactionContext({
        idempotencyKey: dto.idempotencyKey,
        type: TransactionType.WITHDRAWAL,
        sourceAccountId: dto.sourceAccountId,
        destinationAccountId: dto.destinationAccountId,
        amount: dto.amount,
        currency: dto.currency,
        reference: dto.reference,
        metadata: dto.metadata,
        operationContext: context,
      }),
      [
        this.checkIdempotencyStep,
        this.loadAndLockAccountsStep,
        this.validateAccountsStep,
        this.calculateBalancesStep,      // Includes balance check for user accounts
        this.createTransactionStep,
        this.updateBalancesStep,
        this.completeTransactionStep,
        this.auditLogStep,
      ],
    );
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
   * Transfer V2 (Pipeline-based): Account A (source) → Account B (destination)
   * 
   * Transfer uses the same pipeline steps, demonstrating the power of reusability.
   * The only difference from topup/withdrawal is the transaction type and validation.
   * 
   * @experimental Running in parallel with existing transfer() for comparison
   */
  async transferV2(
    dto: TransferDto,
    context: OperationContext,
  ): Promise<TransferResult> {
    // Validate self-transfer before pipeline
    if (dto.sourceAccountId === dto.destinationAccountId) {
      throw new InvalidOperationException('SELF_TRANSFER_NOT_ALLOWED');
    }

    const result = await this.pipeline.execute(
      new TransactionContext({
        idempotencyKey: dto.idempotencyKey,
        type: TransactionType.TRANSFER_DEBIT, // Using single transaction model
        sourceAccountId: dto.sourceAccountId,
        destinationAccountId: dto.destinationAccountId,
        amount: dto.amount,
        currency: dto.currency,
        reference: dto.reference,
        metadata: dto.metadata,
        operationContext: context,
      }),
      [
        this.checkIdempotencyStep,
        this.loadAndLockAccountsStep,
        this.validateAccountsStep,
        this.calculateBalancesStep,
        this.createTransactionStep,
        this.updateBalancesStep,
        this.completeTransactionStep,
        this.auditLogStep,
      ],
    );

    // Map to TransferResult format
    return {
      debitTransactionId: result.transactionId,
      creditTransactionId: result.transactionId, // Single transaction model
      sourceAccountId: result.sourceAccountId,
      destinationAccountId: result.destinationAccountId,
      amount: result.amount,
      currency: result.currency,
      status: result.status,
      reference: result.reference,
      createdAt: result.createdAt,
    };
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
   * Refund V2 (Pipeline-based): Reverses a previous transaction
   * 
   * Refund has pre-pipeline logic to load original transaction and determine
   * the refund parameters, then uses standard pipeline for execution.
   * 
   * @experimental Running in parallel with existing refund() for comparison
   */
  async refundV2(
    dto: RefundDto,
    context: OperationContext,
  ): Promise<TransactionResult> {
    // Pre-pipeline: Load original transaction and prepare refund context
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

    // Execute refund using pipeline (with reversed source/destination)
    const refundResult = await this.pipeline.execute(
      new TransactionContext({
        idempotencyKey: dto.idempotencyKey,
        type: TransactionType.REFUND,
        sourceAccountId: originalTransaction.destinationAccountId,  // Reversed
        destinationAccountId: originalTransaction.sourceAccountId,  // Reversed
        amount: refundAmount.toString(),
        currency: originalTransaction.currency,
        reference: dto.reason || `Refund for ${originalTransaction.id}`,
        metadata: {
          ...dto.metadata,
          originalTransactionId: originalTransaction.id,
          refundReason: dto.reason,
        },
        parentTransactionId: originalTransaction.id,
        operationContext: context,
      }),
      [
        this.checkIdempotencyStep,
        this.loadAndLockAccountsStep,
        this.validateAccountsStep,
        this.calculateBalancesStep,
        this.createTransactionStep,
        this.updateBalancesStep,
        this.completeTransactionStep,
        this.auditLogStep,
      ],
    );

    // Post-pipeline: Mark original transaction as refunded
    await this.dataSource.transaction(async (manager) => {
      originalTransaction.status = TransactionStatus.REFUNDED;
      await manager.save(Transaction, originalTransaction);
    });

    return refundResult;
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


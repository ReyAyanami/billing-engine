import { Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { v4 as uuidv4 } from 'uuid';
import { TransactionType, TransactionStatus } from './transaction.types';
import { TransactionProjection } from './projections/transaction-projection.entity';
import { TransactionProjectionService } from './projections/transaction-projection.service';
import { AccountService } from '../account/account.service';
import { AccountProjection } from '../account/projections/account-projection.entity';
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
    private readonly transactionProjectionService: TransactionProjectionService,
    private readonly accountService: AccountService,
    // Reserved for future direct use (validation/auditing currently in CQRS handlers)
    _currencyService: CurrencyService,
    _auditService: AuditService,
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
    const existing =
      await this.transactionProjectionService.findByIdempotencyKey(
        dto.idempotencyKey,
      );

    if (existing) {
      throw new DuplicateTransactionException(dto.idempotencyKey, existing.id);
    }

    const transactionId = uuidv4();

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
    const existing =
      await this.transactionProjectionService.findByIdempotencyKey(
        dto.idempotencyKey,
      );

    if (existing) {
      throw new DuplicateTransactionException(dto.idempotencyKey, existing.id);
    }

    const sourceAccount = await this.accountService.findById(
      toAccountId(dto.sourceAccountId),
    );

    this.accountService.validateAccountActive(sourceAccount);

    if (dto.destinationAccountId) {
      await this.accountService.findById(toAccountId(dto.destinationAccountId));
    }

    if (sourceAccount.currency !== dto.currency) {
      throw new CurrencyMismatchException(sourceAccount.currency, dto.currency);
    }

    const balance = new Decimal(sourceAccount.balance);
    const withdrawalAmount = new Decimal(dto.amount);
    if (balance.lessThan(withdrawalAmount)) {
      throw new InsufficientBalanceException(
        dto.sourceAccountId,
        balance.toString(),
        withdrawalAmount.toString(),
      );
    }

    const transactionId = uuidv4();

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
    if (dto.sourceAccountId === dto.destinationAccountId) {
      throw new InvalidOperationException('SELF_TRANSFER_NOT_ALLOWED');
    }

    const existing =
      await this.transactionProjectionService.findByIdempotencyKey(
        dto.idempotencyKey,
      );

    if (existing) {
      throw new DuplicateTransactionException(dto.idempotencyKey, existing.id);
    }

    const sourceAccount = await this.accountService.findById(
      toAccountId(dto.sourceAccountId),
    );
    const destinationAccount = await this.accountService.findById(
      toAccountId(dto.destinationAccountId),
    );

    this.accountService.validateAccountActive(sourceAccount);
    this.accountService.validateAccountActive(destinationAccount);

    if (sourceAccount.currency !== dto.currency) {
      throw new CurrencyMismatchException(sourceAccount.currency, dto.currency);
    }
    if (destinationAccount.currency !== dto.currency) {
      throw new CurrencyMismatchException(
        destinationAccount.currency,
        dto.currency,
      );
    }

    const sourceBalance = new Decimal(sourceAccount.balance);
    const transferAmount = new Decimal(dto.amount);
    if (sourceBalance.lessThan(transferAmount)) {
      throw new InsufficientBalanceException(
        dto.sourceAccountId,
        sourceBalance.toString(),
        transferAmount.toString(),
      );
    }

    const transactionId = uuidv4();

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
    const existing =
      await this.transactionProjectionService.findByIdempotencyKey(
        dto.idempotencyKey,
      );

    if (existing) {
      throw new DuplicateTransactionException(dto.idempotencyKey, existing.id);
    }

    const originalTransaction =
      await this.transactionProjectionService.findById(
        dto.originalTransactionId as TransactionId,
      );

    if (!originalTransaction) {
      throw new TransactionNotFoundException(dto.originalTransactionId);
    }

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

    const originalAmount = new Decimal(originalTransaction.amount);
    let refundAmount: Decimal;

    if (dto.amount !== undefined && dto.amount !== null && dto.amount !== '') {
      refundAmount = new Decimal(dto.amount);
    } else {
      refundAmount = originalAmount;
    }

    if (refundAmount.greaterThan(originalAmount)) {
      throw new RefundException('Refund amount cannot exceed original amount');
    }

    const transactionId = uuidv4();

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
    return {
      transactionId: transactionId,
      idempotencyKey: dto.idempotencyKey,
      type: TransactionType.REFUND,
      sourceAccountId: originalTransaction.destinationAccountId || '',
      destinationAccountId: originalTransaction.sourceAccountId || '',
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
   * Get transaction by ID (from projection/read model)
   */
  async findById(id: TransactionId): Promise<TransactionProjection> {
    const transaction = await this.transactionProjectionService.findById(id);

    if (!transaction) {
      throw new TransactionNotFoundException(id);
    }

    return transaction;
  }

  /**
   * Find transaction by idempotency key (helper for controller)
   */
  async findByIdempotencyKey(
    idempotencyKey: IdempotencyKey,
  ): Promise<TransactionProjection | null> {
    return await this.transactionProjectionService.findByIdempotencyKey(
      idempotencyKey,
    );
  }

  /**
   * List transactions with optional filters (from projection/read model)
   */
  async findAll(filters: {
    accountId?: string;
    type?: TransactionType;
    status?: TransactionStatus;
    limit?: number;
    offset?: number;
  }): Promise<TransactionProjection[]> {
    if (filters.accountId) {
      return this.transactionProjectionService.findByAccount(
        toAccountId(filters.accountId),
      );
    }

    return this.transactionProjectionService.findWithFilters(filters);
  }

  /**
   * Find account by ID (helper for validation)
   */
  async findAccountById(accountId: string): Promise<AccountProjection | null> {
    return await this.accountService.findById(toAccountId(accountId));
  }
}

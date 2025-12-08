import { AggregateRoot } from '../../../cqrs/base/aggregate-root';
import { TopupRequestedEvent } from '../events/topup-requested.event';
import { TopupCompletedEvent } from '../events/topup-completed.event';
import { WithdrawalRequestedEvent } from '../events/withdrawal-requested.event';
import { WithdrawalCompletedEvent } from '../events/withdrawal-completed.event';
import { TransferRequestedEvent } from '../events/transfer-requested.event';
import { TransferCompletedEvent } from '../events/transfer-completed.event';
import { PaymentRequestedEvent } from '../events/payment-requested.event';
import { PaymentCompletedEvent } from '../events/payment-completed.event';
import { RefundRequestedEvent } from '../events/refund-requested.event';
import { RefundCompletedEvent } from '../events/refund-completed.event';
import { TransactionFailedEvent } from '../events/transaction-failed.event';
import { TransactionCompensatedEvent } from '../events/transaction-compensated.event';
import { assertNever } from '../../../common/utils/exhaustive-check';

/**
 * Transaction status enum
 */
export enum TransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  COMPENSATED = 'compensated', // Transaction was rolled back
}

/**
 * Transaction type enum
 */
export enum TransactionType {
  TOPUP = 'topup',
  WITHDRAWAL = 'withdrawal',
  TRANSFER = 'transfer',
  PAYMENT = 'payment',
  REFUND = 'refund',
}

/**
 * Transaction Aggregate - Event-Sourced Version
 *
 * Manages the lifecycle of financial transactions.
 * Follows a state machine: PENDING → COMPLETED/FAILED
 */
export class TransactionAggregate extends AggregateRoot {
  // Aggregate state (derived from events)
  private transactionType!: TransactionType;
  private status!: TransactionStatus;
  private amount!: string;
  private currency!: string;
  private accountId?: string; // For topup/withdrawal
  private sourceAccountId?: string;
  private destinationAccountId?: string;
  private idempotencyKey!: string;
  private failureReason?: string;
  private failureCode?: string;
  private requestedAt!: Date;
  private completedAt?: Date;
  private failedAt?: Date;

  // Balance tracking (for completed transactions)
  private newBalance?: string;
  private sourceNewBalance?: string;
  private destinationNewBalance?: string;

  // TODO: Add compensation tracking for saga rollbacks in future

  protected getAggregateType(): string {
    return 'Transaction';
  }

  /**
   * Requests a topup transaction
   */
  requestTopup(params: {
    transactionId: string;
    accountId: string;
    amount: string;
    currency: string;
    sourceAccountId: string;
    idempotencyKey: string;
    correlationId: string;
    causationId?: string;
    metadata?: Record<string, string | number | boolean | undefined>;
  }): void {
    // Validate: Transaction must not already exist
    if (this.aggregateId) {
      throw new Error('Transaction already exists');
    }

    // Validate: Required fields
    if (!params.accountId || !params.amount || !params.sourceAccountId) {
      throw new Error('Account ID, amount, and source account are required');
    }

    // Create and apply the event
    const event = new TopupRequestedEvent(
      params.accountId,
      params.amount,
      params.currency,
      params.sourceAccountId,
      params.idempotencyKey,
      {
        aggregateId: params.transactionId,
        aggregateVersion: 1,
        correlationId: params.correlationId,
        causationId: params.causationId,
        metadata: params.metadata,
      },
    );

    this.apply(event);
  }

  /**
   * Event handler for TopupRequestedEvent
   */
  onTopupRequested(event: TopupRequestedEvent): void {
    this.aggregateId = event.aggregateId;
    this.transactionType = TransactionType.TOPUP;
    this.status = TransactionStatus.PENDING;
    this.accountId = event.accountId;
    this.amount = event.amount;
    this.currency = event.currency;
    this.sourceAccountId = event.sourceAccountId;
    this.idempotencyKey = event.idempotencyKey;
    this.requestedAt = event.timestamp;
  }

  /**
   * Completes a topup transaction
   */
  completeTopup(params: {
    newBalance: string;
    correlationId: string;
    causationId?: string;
    metadata?: Record<string, string | number | boolean | undefined>;
  }): void {
    // Validate: Transaction must exist and be pending
    this.validateCanComplete();

    const event = new TopupCompletedEvent(
      this.accountId!,
      this.amount,
      params.newBalance,
      new Date(),
      {
        aggregateId: this.aggregateId,
        aggregateVersion: this.version + 1,
        correlationId: params.correlationId,
        causationId: params.causationId,
        metadata: params.metadata,
      },
    );

    this.apply(event);
  }

  /**
   * Event handler for TopupCompletedEvent
   */
  onTopupCompleted(event: TopupCompletedEvent): void {
    this.status = TransactionStatus.COMPLETED;
    this.newBalance = event.newBalance;
    this.completedAt = event.completedAt;
  }

  /**
   * Requests a withdrawal transaction
   */
  requestWithdrawal(params: {
    transactionId: string;
    accountId: string;
    amount: string;
    currency: string;
    destinationAccountId: string;
    idempotencyKey: string;
    correlationId: string;
    causationId?: string;
    metadata?: Record<string, string | number | boolean | undefined>;
  }): void {
    if (this.aggregateId) {
      throw new Error('Transaction already exists');
    }

    if (!params.accountId || !params.amount || !params.destinationAccountId) {
      throw new Error(
        'Account ID, amount, and destination account are required',
      );
    }

    const event = new WithdrawalRequestedEvent(
      params.accountId,
      params.amount,
      params.currency,
      params.destinationAccountId,
      params.idempotencyKey,
      {
        aggregateId: params.transactionId,
        aggregateVersion: 1,
        correlationId: params.correlationId,
        causationId: params.causationId,
        metadata: params.metadata,
      },
    );

    this.apply(event);
  }

  /**
   * Event handler for WithdrawalRequestedEvent
   */
  onWithdrawalRequested(event: WithdrawalRequestedEvent): void {
    this.aggregateId = event.aggregateId;
    this.transactionType = TransactionType.WITHDRAWAL;
    this.status = TransactionStatus.PENDING;
    this.accountId = event.accountId;
    this.amount = event.amount;
    this.currency = event.currency;
    this.destinationAccountId = event.destinationAccountId;
    this.idempotencyKey = event.idempotencyKey;
    this.requestedAt = event.timestamp;
  }

  /**
   * Completes a withdrawal transaction
   */
  completeWithdrawal(params: {
    newBalance: string;
    correlationId: string;
    causationId?: string;
    metadata?: Record<string, string | number | boolean | undefined>;
  }): void {
    this.validateCanComplete();

    const event = new WithdrawalCompletedEvent(
      this.accountId!,
      this.amount,
      params.newBalance,
      new Date(),
      {
        aggregateId: this.aggregateId,
        aggregateVersion: this.version + 1,
        correlationId: params.correlationId,
        causationId: params.causationId,
        metadata: params.metadata,
      },
    );

    this.apply(event);
  }

  /**
   * Event handler for WithdrawalCompletedEvent
   */
  onWithdrawalCompleted(event: WithdrawalCompletedEvent): void {
    this.status = TransactionStatus.COMPLETED;
    this.newBalance = event.newBalance;
    this.completedAt = event.completedAt;
  }

  /**
   * Requests a transfer transaction
   */
  requestTransfer(params: {
    transactionId: string;
    sourceAccountId: string;
    destinationAccountId: string;
    amount: string;
    currency: string;
    idempotencyKey: string;
    correlationId: string;
    causationId?: string;
    metadata?: Record<string, string | number | boolean | undefined>;
  }): void {
    if (this.aggregateId) {
      throw new Error('Transaction already exists');
    }

    if (
      !params.sourceAccountId ||
      !params.destinationAccountId ||
      !params.amount
    ) {
      throw new Error(
        'Source account, destination account, and amount are required',
      );
    }

    if (params.sourceAccountId === params.destinationAccountId) {
      throw new Error('Cannot transfer to the same account');
    }

    const event = new TransferRequestedEvent(
      params.sourceAccountId,
      params.destinationAccountId,
      params.amount,
      params.currency,
      params.idempotencyKey,
      {
        aggregateId: params.transactionId,
        aggregateVersion: 1,
        correlationId: params.correlationId,
        causationId: params.causationId,
        metadata: params.metadata,
      },
    );

    this.apply(event);
  }

  /**
   * Event handler for TransferRequestedEvent
   */
  onTransferRequested(event: TransferRequestedEvent): void {
    this.aggregateId = event.aggregateId;
    this.transactionType = TransactionType.TRANSFER;
    this.status = TransactionStatus.PENDING;
    this.sourceAccountId = event.sourceAccountId;
    this.destinationAccountId = event.destinationAccountId;
    this.amount = event.amount;
    this.currency = event.currency;
    this.idempotencyKey = event.idempotencyKey;
    this.requestedAt = event.timestamp;
  }

  /**
   * Completes a transfer transaction
   */
  completeTransfer(params: {
    sourceNewBalance: string;
    destinationNewBalance: string;
    correlationId: string;
    causationId?: string;
    metadata?: Record<string, string | number | boolean | undefined>;
  }): void {
    this.validateCanComplete();

    const event = new TransferCompletedEvent(
      this.sourceAccountId!,
      this.destinationAccountId!,
      this.amount,
      params.sourceNewBalance,
      params.destinationNewBalance,
      new Date(),
      {
        aggregateId: this.aggregateId,
        aggregateVersion: this.version + 1,
        correlationId: params.correlationId,
        causationId: params.causationId,
        metadata: params.metadata,
      },
    );

    this.apply(event);
  }

  /**
   * Event handler for TransferCompletedEvent
   */
  onTransferCompleted(event: TransferCompletedEvent): void {
    this.status = TransactionStatus.COMPLETED;
    this.sourceNewBalance = event.sourceNewBalance;
    this.destinationNewBalance = event.destinationNewBalance;
    this.completedAt = event.completedAt;
  }

  /**
   * Requests a payment transaction
   */
  requestPayment(params: {
    transactionId: string;
    customerAccountId: string;
    merchantAccountId: string;
    amount: string;
    currency: string;
    idempotencyKey: string;
    paymentMetadata?: {
      orderId?: string;
      invoiceId?: string;
      description?: string;
      merchantReference?: string;
      [key: string]: any;
    };
    correlationId: string;
    causationId?: string;
    metadata?: Record<string, string | number | boolean | undefined>;
  }): void {
    if (this.aggregateId) {
      throw new Error('Transaction already exists');
    }

    if (
      !params.customerAccountId ||
      !params.merchantAccountId ||
      !params.amount
    ) {
      throw new Error(
        'Customer account, merchant account, and amount are required',
      );
    }

    if (params.customerAccountId === params.merchantAccountId) {
      throw new Error('Customer and merchant accounts must be different');
    }

    const event = new PaymentRequestedEvent(
      params.customerAccountId,
      params.merchantAccountId,
      params.amount,
      params.currency,
      params.idempotencyKey,
      {
        aggregateId: params.transactionId,
        aggregateVersion: 1,
        correlationId: params.correlationId,
        causationId: params.causationId,
        metadata: params.metadata,
      },
      params.paymentMetadata,
    );

    this.apply(event);
  }

  /**
   * Event handler for PaymentRequestedEvent
   */
  onPaymentRequested(event: any): void {
    this.aggregateId = event.aggregateId;
    this.transactionType = TransactionType.PAYMENT;
    this.status = TransactionStatus.PENDING;
    this.sourceAccountId = event.customerAccountId;
    this.destinationAccountId = event.merchantAccountId;
    this.amount = event.amount;
    this.currency = event.currency;
    this.idempotencyKey = event.idempotencyKey;
    this.requestedAt = event.timestamp;
  }

  /**
   * Completes a payment transaction
   */
  completePayment(params: {
    customerNewBalance: string;
    merchantNewBalance: string;
    correlationId: string;
    causationId?: string;
    metadata?: Record<string, string | number | boolean | undefined>;
  }): void {
    this.validateCanComplete();

    const event = new PaymentCompletedEvent(
      this.aggregateId,
      params.customerNewBalance,
      params.merchantNewBalance,
      new Date(),
      {
        aggregateId: this.aggregateId,
        aggregateVersion: this.version + 1,
        correlationId: params.correlationId,
        causationId: params.causationId,
        metadata: params.metadata,
      },
    );

    this.apply(event);
  }

  /**
   * Event handler for PaymentCompletedEvent
   */
  onPaymentCompleted(event: any): void {
    this.status = TransactionStatus.COMPLETED;
    this.sourceNewBalance = event.customerNewBalance;
    this.destinationNewBalance = event.merchantNewBalance;
    this.completedAt = event.completedAt;
  }

  /**
   * Requests a refund transaction
   */
  requestRefund(params: {
    refundId: string;
    originalPaymentId: string;
    merchantAccountId: string;
    customerAccountId: string;
    refundAmount: string;
    currency: string;
    idempotencyKey: string;
    refundMetadata?: {
      reason?: string;
      refundType?: 'full' | 'partial';
      notes?: string;
      [key: string]: any;
    };
    correlationId: string;
    causationId?: string;
    metadata?: Record<string, string | number | boolean | undefined>;
  }): void {
    if (this.aggregateId) {
      throw new Error('Transaction already exists');
    }

    if (
      !params.merchantAccountId ||
      !params.customerAccountId ||
      !params.refundAmount
    ) {
      throw new Error(
        'Merchant account, customer account, and refund amount are required',
      );
    }

    if (params.merchantAccountId === params.customerAccountId) {
      throw new Error('Merchant and customer accounts must be different');
    }

    const event = new RefundRequestedEvent(
      params.originalPaymentId,
      params.merchantAccountId,
      params.customerAccountId,
      params.refundAmount,
      params.currency,
      params.idempotencyKey,
      {
        aggregateId: params.refundId,
        aggregateVersion: 1,
        correlationId: params.correlationId,
        causationId: params.causationId,
        metadata: params.metadata,
      },
      params.refundMetadata,
    );

    this.apply(event);
  }

  /**
   * Event handler for RefundRequestedEvent
   */
  onRefundRequested(event: any): void {
    this.aggregateId = event.aggregateId;
    this.transactionType = TransactionType.REFUND;
    this.status = TransactionStatus.PENDING;
    this.sourceAccountId = event.merchantAccountId;
    this.destinationAccountId = event.customerAccountId;
    this.amount = event.refundAmount;
    this.currency = event.currency;
    this.idempotencyKey = event.idempotencyKey;
    this.requestedAt = event.timestamp;
  }

  /**
   * Completes a refund transaction
   */
  completeRefund(params: {
    merchantNewBalance: string;
    customerNewBalance: string;
    correlationId: string;
    causationId?: string;
    metadata?: Record<string, string | number | boolean | undefined>;
  }): void {
    this.validateCanComplete();

    const event = new RefundCompletedEvent(
      this.aggregateId,
      params.merchantNewBalance,
      params.customerNewBalance,
      new Date(),
      {
        aggregateId: this.aggregateId,
        aggregateVersion: this.version + 1,
        correlationId: params.correlationId,
        causationId: params.causationId,
        metadata: params.metadata,
      },
    );

    this.apply(event);
  }

  /**
   * Event handler for RefundCompletedEvent
   */
  onRefundCompleted(event: any): void {
    this.status = TransactionStatus.COMPLETED;
    this.sourceNewBalance = event.merchantNewBalance;
    this.destinationNewBalance = event.customerNewBalance;
    this.completedAt = event.completedAt;
  }

  /**
   * Fails the transaction
   */
  fail(params: {
    reason: string;
    errorCode: string;
    correlationId: string;
    causationId?: string;
    metadata?: Record<string, string | number | boolean | undefined>;
  }): void {
    // Validate: Transaction must exist and be pending
    if (!this.aggregateId) {
      throw new Error('Transaction does not exist');
    }

    if (this.status !== TransactionStatus.PENDING) {
      throw new Error(`Cannot fail transaction with status: ${this.status}`);
    }

    const event = new TransactionFailedEvent(
      params.reason,
      params.errorCode,
      new Date(),
      {
        aggregateId: this.aggregateId,
        aggregateVersion: this.version + 1,
        correlationId: params.correlationId,
        causationId: params.causationId,
        metadata: params.metadata,
      },
    );

    this.apply(event);
  }

  /**
   * Event handler for TransactionFailedEvent
   */
  onTransactionFailed(event: TransactionFailedEvent): void {
    this.status = TransactionStatus.FAILED;
    this.failureReason = event.reason;
    this.failureCode = event.errorCode;
    this.failedAt = event.failedAt;
  }

  /**
   * Compensates (rolls back) a transaction
   * Used when a saga fails partway through and needs to undo changes
   */
  compensate(params: {
    reason: string;
    compensationActions: Array<{
      accountId: string;
      action: 'CREDIT' | 'DEBIT';
      amount: string;
      reason: string;
    }>;
    correlationId: string;
    causationId?: string;
    metadata?: Record<string, string | number | boolean | undefined>;
  }): void {
    // Validate: Transaction must exist
    if (!this.aggregateId) {
      throw new Error('Transaction does not exist');
    }

    // Validate: Transaction must be PENDING or FAILED (not COMPLETED or already COMPENSATED)
    if (this.status === TransactionStatus.COMPLETED) {
      throw new Error('Cannot compensate a completed transaction');
    }

    if (this.status === TransactionStatus.COMPENSATED) {
      throw new Error('Transaction is already compensated');
    }

    const event = new TransactionCompensatedEvent(
      this.aggregateId,
      params.reason,
      params.compensationActions,
      {
        aggregateId: this.aggregateId,
        aggregateVersion: this.version + 1,
        correlationId: params.correlationId,
        causationId: params.causationId,
        metadata: params.metadata,
      },
    );

    this.apply(event);
  }

  /**
   * Event handler for TransactionCompensatedEvent
   */
  onTransactionCompensated(event: TransactionCompensatedEvent): void {
    this.status = TransactionStatus.COMPENSATED;
    // TODO: Store compensation details when implementing saga rollbacks
    // Reason and actions available in event.reason and event.compensationActions
    void event; // Suppress unused warning
  }

  /**
   * Validates that transaction can be completed
   * Uses exhaustive checking to ensure all status values are considered
   */
  private validateCanComplete(): void {
    if (!this.aggregateId) {
      throw new Error('Transaction does not exist');
    }

    // Check if current status allows completion
    if (!this.canTransitionToCompleted(this.status)) {
      throw new Error(
        `Cannot complete transaction with status: ${this.status}`,
      );
    }
  }

  /**
   * Checks if a transaction can transition to COMPLETED status.
   * Uses exhaustive checking to ensure all TransactionStatus values are handled.
   */
  private canTransitionToCompleted(status: TransactionStatus): boolean {
    switch (status) {
      case TransactionStatus.PENDING:
        return true; // Can complete from pending

      case TransactionStatus.COMPLETED:
        return false; // Already completed

      case TransactionStatus.FAILED:
        return false; // Cannot complete a failed transaction

      case TransactionStatus.COMPENSATED:
        return false; // Cannot complete a compensated transaction

      default:
        // Compile-time exhaustiveness check
        // If a new TransactionStatus is added, this will cause a type error
        return assertNever(status);
    }
  }

  /**
   * Getters for aggregate state (read-only)
   */
  getTransactionType(): TransactionType {
    return this.transactionType;
  }

  getStatus(): TransactionStatus {
    return this.status;
  }

  getAmount(): string {
    return this.amount;
  }

  getCurrency(): string {
    return this.currency;
  }

  getIdempotencyKey(): string {
    return this.idempotencyKey;
  }

  getAccountId(): string | undefined {
    return this.accountId;
  }

  getSourceAccountId(): string | undefined {
    return this.sourceAccountId;
  }

  getDestinationAccountId(): string | undefined {
    return this.destinationAccountId;
  }

  getNewBalance(): string | undefined {
    return this.newBalance;
  }

  getRequestedAt(): Date {
    return this.requestedAt;
  }

  getCompletedAt(): Date | undefined {
    return this.completedAt;
  }

  getFailedAt(): Date | undefined {
    return this.failedAt;
  }

  getFailureReason(): string | undefined {
    return this.failureReason;
  }

  /**
   * Gets a human-readable label for the transaction type.
   * Uses exhaustive checking to ensure all TransactionType values are handled.
   */
  getTransactionTypeLabel(): string {
    switch (this.transactionType) {
      case TransactionType.TOPUP:
        return 'Top-up';

      case TransactionType.WITHDRAWAL:
        return 'Withdrawal';

      case TransactionType.TRANSFER:
        return 'Transfer';

      case TransactionType.PAYMENT:
        return 'Payment';

      case TransactionType.REFUND:
        return 'Refund';

      default:
        // Compile-time exhaustiveness check
        // If a new TransactionType is added, this will cause a type error
        return assertNever(this.transactionType);
    }
  }

  /**
   * Returns a snapshot of the current state
   */
  toSnapshot(): Record<string, any> {
    return {
      aggregateId: this.aggregateId,
      version: this.version,
      transactionType: this.transactionType,
      status: this.status,
      amount: this.amount,
      currency: this.currency,
      accountId: this.accountId,
      sourceAccountId: this.sourceAccountId,
      destinationAccountId: this.destinationAccountId,
      idempotencyKey: this.idempotencyKey,
      newBalance: this.newBalance,
      sourceNewBalance: this.sourceNewBalance,
      destinationNewBalance: this.destinationNewBalance,
      failureReason: this.failureReason,
      failureCode: this.failureCode,
      requestedAt: this.requestedAt,
      completedAt: this.completedAt,
      failedAt: this.failedAt,
    };
  }
}

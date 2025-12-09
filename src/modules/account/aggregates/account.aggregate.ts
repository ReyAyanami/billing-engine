import { AggregateRoot } from '../../../cqrs/base/aggregate-root';
import { JsonObject } from '../../../common/types/json.types';
import { AccountCreatedEvent } from '../events/account-created.event';
import { BalanceChangedEvent } from '../events/balance-changed.event';
import { AccountStatusChangedEvent } from '../events/account-status-changed.event';
import { AccountLimitsChangedEvent } from '../events/account-limits-changed.event';
import { AccountType, AccountStatus } from '../account.entity';
import Decimal from 'decimal.js';
import { assertNever } from '../../../common/utils/exhaustive-check';

/**
 * Account Aggregate - Event-Sourced Version
 *
 * This aggregate encapsulates all business logic for accounts.
 * It maintains state by applying domain events and ensures business rules are enforced.
 */
export class AccountAggregate extends AggregateRoot {
  // Aggregate state (derived from events)
  private ownerId!: string;
  private ownerType!: string;
  private accountType!: AccountType;
  private currency!: string;
  private status!: AccountStatus;
  private balance: Decimal = new Decimal(0);
  private maxBalance?: Decimal;
  private minBalance?: Decimal;
  private createdAt!: Date;
  private updatedAt!: Date;

  protected getAggregateType(): string {
    return 'Account';
  }

  /**
   * Creates a new account (command method)
   * This emits an AccountCreatedEvent
   */
  create(params: {
    accountId: string;
    ownerId: string;
    ownerType: string;
    accountType: AccountType;
    currency: string;
    maxBalance?: string;
    minBalance?: string;
    correlationId: string;
    causationId?: string;
    metadata?: Record<string, string | number | boolean | undefined>;
  }): void {
    // Validate: Account must not already exist
    if (this.aggregateId) {
      throw new Error('Account already exists');
    }

    // Validate: Required fields
    if (!params.accountId || !params.ownerId || !params.currency) {
      throw new Error('Account ID, owner ID, and currency are required');
    }

    // Create and apply the event
    const event = new AccountCreatedEvent(
      params.ownerId,
      params.ownerType,
      params.accountType,
      params.currency,
      AccountStatus.ACTIVE,
      '0.00', // Initial balance
      {
        aggregateId: params.accountId,
        aggregateVersion: 1,
        correlationId: params.correlationId,
        causationId: params.causationId,
        metadata: params.metadata,
      },
      params.maxBalance,
      params.minBalance,
    );

    this.apply(event);
  }

  /**
   * Event handler for AccountCreatedEvent
   * Updates aggregate state when account is created
   */
  onAccountCreated(event: AccountCreatedEvent): void {
    this.aggregateId = event.aggregateId;
    this.ownerId = event.ownerId;
    this.ownerType = event.ownerType;
    this.accountType = event.accountType;
    this.currency = event.currency;
    this.status = event.status;
    this.balance = new Decimal(0);
    this.maxBalance = event.maxBalance
      ? new Decimal(event.maxBalance)
      : undefined;
    this.minBalance = event.minBalance
      ? new Decimal(event.minBalance)
      : undefined;
    this.createdAt = event.timestamp;
    this.updatedAt = event.timestamp;
  }

  /**
   * Getters for aggregate state (read-only)
   */
  getOwnerId(): string {
    return this.ownerId;
  }

  getOwnerType(): string {
    return this.ownerType;
  }

  getAccountType(): AccountType {
    return this.accountType;
  }

  getCurrency(): string {
    return this.currency;
  }

  getStatus(): AccountStatus {
    return this.status;
  }

  getBalance(): Decimal {
    return this.balance;
  }

  getMaxBalance(): Decimal | undefined {
    return this.maxBalance;
  }

  getMinBalance(): Decimal | undefined {
    return this.minBalance;
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }

  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  /**
   * Changes the account balance (command method)
   * This emits a BalanceChangedEvent
   */
  changeBalance(params: {
    changeAmount: string;
    changeType: 'CREDIT' | 'DEBIT';
    reason: string;
    transactionId?: string;
    correlationId: string;
    causationId?: string;
    metadata?: Record<string, string | number | boolean | undefined>;
  }): void {
    // Validate: Account must exist
    if (!this.aggregateId) {
      throw new Error('Account does not exist');
    }

    // Validate: Account must be active
    if (this.status !== AccountStatus.ACTIVE) {
      throw new Error(
        `Cannot change balance on account with status: ${this.status}`,
      );
    }

    // Calculate new balance
    const changeAmount = new Decimal(params.changeAmount);
    const previousBalance = this.balance;
    const newBalance =
      params.changeType === 'CREDIT'
        ? previousBalance.plus(changeAmount)
        : previousBalance.minus(changeAmount);

    // Validate: Check limits
    if (this.maxBalance && newBalance.greaterThan(this.maxBalance)) {
      throw new Error(
        `New balance ${newBalance.toString()} would exceed max balance ${this.maxBalance.toString()}`,
      );
    }

    // For accounts with minBalance set, check against that
    // For accounts without minBalance set, prevent negative balances by default
    const effectiveMinBalance = this.minBalance || new Decimal(0);
    if (newBalance.lessThan(effectiveMinBalance)) {
      throw new Error(
        `Insufficient balance: current ${previousBalance.toString()}, attempting to ${params.changeType} ${changeAmount.toString()}, would result in ${newBalance.toString()}`,
      );
    }

    // Calculate signed amount for convenience (positive for CREDIT, negative for DEBIT)
    let signedAmount: string;
    switch (params.changeType) {
      case 'CREDIT':
        signedAmount = changeAmount.toString();
        break;
      case 'DEBIT':
        signedAmount = changeAmount.neg().toString();
        break;
      default:
        throw new Error(`Unknown changeType: ${params.changeType}`);
    }

    // Create and apply the event
    const event = new BalanceChangedEvent(
      previousBalance.toString(),
      newBalance.toString(),
      changeAmount.toString(),
      params.changeType,
      signedAmount,
      params.reason,
      {
        aggregateId: this.aggregateId,
        aggregateVersion: this.version + 1,
        correlationId: params.correlationId,
        causationId: params.causationId,
        metadata: params.metadata,
      },
      params.transactionId,
    );

    this.apply(event);
  }

  /**
   * Event handler for BalanceChangedEvent
   * Updates aggregate state when balance changes
   */
  onBalanceChanged(event: BalanceChangedEvent): void {
    this.balance = new Decimal(event.newBalance);
    this.updatedAt = event.timestamp;
  }

  /**
   * Changes the account status (command method)
   * This emits an AccountStatusChangedEvent
   */
  changeStatus(params: {
    newStatus: AccountStatus;
    reason: string;
    correlationId: string;
    causationId?: string;
    metadata?: Record<string, string | number | boolean | undefined>;
  }): void {
    // Validate: Account must exist
    if (!this.aggregateId) {
      throw new Error('Account does not exist');
    }

    // Validate: Status must be different
    if (this.status === params.newStatus) {
      throw new Error(`Account already has status: ${params.newStatus}`);
    }

    // Validate: Status transitions (business rules)
    this.validateStatusTransition(this.status, params.newStatus);

    // Create and apply the event
    const event = new AccountStatusChangedEvent(
      this.status,
      params.newStatus,
      params.reason,
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
   * Event handler for AccountStatusChangedEvent
   * Updates aggregate state when status changes
   */
  onAccountStatusChanged(event: AccountStatusChangedEvent): void {
    this.status = event.newStatus;
    this.updatedAt = event.timestamp;
  }

  /**
   * Changes the account balance limits (command method)
   * This emits an AccountLimitsChangedEvent
   */
  changeLimits(params: {
    newMaxBalance?: string;
    newMinBalance?: string;
    reason?: string;
    correlationId: string;
    causationId?: string;
    metadata?: Record<string, string | number | boolean | undefined>;
  }): void {
    // Validate: Account must exist
    if (!this.aggregateId) {
      throw new Error('Account does not exist');
    }

    // Validate: At least one limit must be provided
    if (!params.newMaxBalance && !params.newMinBalance) {
      throw new Error('Must provide at least one new limit');
    }

    // Validate: New limits must be valid
    if (params.newMaxBalance && params.newMinBalance) {
      const max = new Decimal(params.newMaxBalance);
      const min = new Decimal(params.newMinBalance);
      if (max.lessThanOrEqualTo(min)) {
        throw new Error('Max balance must be greater than min balance');
      }
    }

    // Validate: Current balance must be within new limits
    if (params.newMaxBalance) {
      const max = new Decimal(params.newMaxBalance);
      if (this.balance.greaterThan(max)) {
        throw new Error(
          `Current balance ${this.balance.toString()} exceeds new max ${max.toString()}`,
        );
      }
    }

    if (params.newMinBalance) {
      const min = new Decimal(params.newMinBalance);
      if (this.balance.lessThan(min)) {
        throw new Error(
          `Current balance ${this.balance.toString()} is below new min ${min.toString()}`,
        );
      }
    }

    // Create and apply the event
    const event = new AccountLimitsChangedEvent(
      {
        aggregateId: this.aggregateId,
        aggregateVersion: this.version + 1,
        correlationId: params.correlationId,
        causationId: params.causationId,
        metadata: params.metadata,
      },
      this.maxBalance?.toString(),
      params.newMaxBalance,
      this.minBalance?.toString(),
      params.newMinBalance,
      params.reason,
    );

    this.apply(event);
  }

  /**
   * Event handler for AccountLimitsChangedEvent
   * Updates aggregate state when limits change
   */
  onAccountLimitsChanged(event: AccountLimitsChangedEvent): void {
    if (event.newMaxBalance !== undefined) {
      this.maxBalance = new Decimal(event.newMaxBalance);
    }
    if (event.newMinBalance !== undefined) {
      this.minBalance = new Decimal(event.newMinBalance);
    }
    this.updatedAt = event.timestamp;
  }

  /**
   * Validates status transition using exhaustive checking.
   * Ensures all AccountStatus enum values are handled.
   */
  private validateStatusTransition(
    currentStatus: AccountStatus,
    newStatus: AccountStatus,
  ): void {
    const validTransitions = this.getValidStatusTransitions(currentStatus);

    if (!validTransitions.includes(newStatus)) {
      throw new Error(
        `Invalid status transition from ${currentStatus} to ${newStatus}`,
      );
    }
  }

  /**
   * Returns valid status transitions for a given status.
   * Uses exhaustive checking to ensure all enum values are handled.
   */
  private getValidStatusTransitions(status: AccountStatus): AccountStatus[] {
    switch (status) {
      case AccountStatus.ACTIVE:
        return [AccountStatus.SUSPENDED, AccountStatus.CLOSED];

      case AccountStatus.SUSPENDED:
        return [AccountStatus.ACTIVE, AccountStatus.CLOSED];

      case AccountStatus.CLOSED:
        return []; // Terminal state - no transitions allowed

      default:
        // Compile-time exhaustiveness check
        // If a new AccountStatus is added, this will cause a type error
        return assertNever(status);
    }
  }

  /**
   * Returns a snapshot of the current state
   * Useful for debugging and projections
   */
  toSnapshot(): JsonObject {
    return {
      aggregateId: this.aggregateId,
      version: this.version,
      ownerId: this.ownerId,
      ownerType: this.ownerType,
      accountType: this.accountType,
      currency: this.currency,
      status: this.status,
      balance: this.balance.toString(),
      maxBalance: this.maxBalance?.toString() ?? null,
      minBalance: this.minBalance?.toString() ?? null,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}

import { AggregateRoot } from '../../../cqrs/base/aggregate-root';
import { JsonObject } from '../../../common/types/json.types';
import { AccountCreatedEvent } from '../events/account-created.event';
import { ReplenishmentRequestedEvent } from '../events/replenishment-requested.event';
import { BalanceChangedEvent } from '../events/balance-changed.event';
import { BalanceReservedEvent } from '../events/balance-reserved.event';
import { AccountStatusChangedEvent } from '../events/account-status-changed.event';
import { AccountLimitsChangedEvent } from '../events/account-limits-changed.event';
import { AccountType, AccountStatus } from '../account.types';
import Decimal from 'decimal.js';
import { assertNever } from '../../../common/utils/exhaustive-check';
import { InvariantViolationException } from '../../../common/exceptions/billing.exception';
import { Logger } from '@nestjs/common';

/**
 * Account Aggregate - Event-Sourced Version
 *
 * This aggregate encapsulates all business logic for accounts.
 * It maintains state by applying domain events and ensures business rules are enforced.
 */
export class AccountAggregate extends AggregateRoot {
  private readonly logger = new Logger(AccountAggregate.name);
  // Aggregate state (derived from events)
  private ownerId!: string;
  private ownerType!: string;
  private accountType!: AccountType;
  private currency!: string;
  private homeRegionId!: string;
  private status!: AccountStatus;
  private balance: Decimal = new Decimal(0);
  private reservations: Map<string, Decimal> = new Map();
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
    const event = new AccountCreatedEvent({
      ownerId: params.ownerId,
      ownerType: params.ownerType,
      accountType: params.accountType,
      currency: params.currency,
      status: AccountStatus.ACTIVE,
      balance: '0.00', // Initial balance
      homeRegionId: this.regionId,
      aggregateId: params.accountId,
      aggregateVersion: 1,
      correlationId: params.correlationId,
      causationId: params.causationId,
      metadata: params.metadata,
      maxBalance: params.maxBalance,
      minBalance: params.minBalance,
    });

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
    this.homeRegionId = event.homeRegionId;
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

  getReservation(regionId: string): Decimal {
    return this.reservations.get(regionId) || new Decimal(0);
  }

  getTotalReserved(): Decimal {
    let total = new Decimal(0);
    for (const res of this.reservations.values()) {
      total = total.plus(res);
    }
    return total;
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

  getHomeRegionId(): string {
    return this.homeRegionId;
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

    // Step 1: Validate changeAmount is positive
    const changeAmount = new Decimal(params.changeAmount);
    if (changeAmount.lessThanOrEqualTo(0)) {
      throw new Error(
        `Change amount must be positive, got: ${params.changeAmount}`,
      );
    }

    // Step 2: Calculate signed amount based on changeType
    let signedAmount: Decimal;
    switch (params.changeType) {
      case 'CREDIT':
        signedAmount = changeAmount; // Positive for money in
        break;
      case 'DEBIT':
        signedAmount = changeAmount.neg(); // Negative for money out
        break;
      default:
        throw new Error(`Unknown changeType: ${params.changeType}`);
    }

    // Step 3: Calculate new balance using verified signedAmount
    const previousBalance = this.balance;
    const newBalance = previousBalance.plus(signedAmount);

    // Validate: Check limits
    if (this.maxBalance && newBalance.greaterThan(this.maxBalance)) {
      throw new Error(
        `New balance ${newBalance.toString()} would exceed max balance ${this.maxBalance.toString()}`,
      );
    }

    // Reservation-Based Validation (Option B)
    // For DEBITs, we check if the LOCAL region has enough reservation.
    // For CREDITs, we just update the total balance.
    if (params.changeType === 'DEBIT') {
      const localReservation = this.getReservation(this.regionId);
      if (localReservation.lessThan(changeAmount)) {
        throw new Error(
          `Insufficient local reservation in region ${this.regionId}: ` +
            `available ${localReservation.toString()}, requested ${changeAmount.toString()}`,
        );
      }
    }

    // Still respect aggregate-level invariants (e.g. total balance min/max)
    const effectiveMinBalance = this.minBalance || new Decimal(0);
    if (newBalance.lessThan(effectiveMinBalance)) {
      throw new Error(
        `Insufficient total balance: current ${previousBalance.toString()}, ` +
          `attempting to ${params.changeType} ${changeAmount.toString()}, would result in ${newBalance.toString()}`,
      );
    }

    // Create and apply the event
    const event = new BalanceChangedEvent({
      previousBalance: previousBalance.toString(),
      newBalance: newBalance.toString(),
      changeAmount: changeAmount.toString(),
      changeType: params.changeType,
      signedAmount: signedAmount.toString(),
      reason: params.reason,
      aggregateId: this.aggregateId,
      aggregateVersion: this.version + 1,
      correlationId: params.correlationId,
      causationId: params.causationId,
      metadata: params.metadata,
      transactionId: params.transactionId,
    });

    this.apply(event);

    // After updating balance, check if replenishment is needed
    this.checkReplenishmentThreshold(params.correlationId, event.eventId);
  }

  private checkReplenishmentThreshold(
    correlationId: string,
    causationId: string,
  ): void {
    const localRes = this.getReservation(this.regionId);

    // threshold: if local reservation < 50, and we are not the home region
    if (localRes.lessThan(50) && this.regionId !== this.homeRegionId) {
      this.logger.log(
        `Local reservation low in ${this.regionId} (${localRes.toString()}). Requesting replenishment.`,
      );

      const replenishmentAmount = '100.00';

      const requestEvent = new ReplenishmentRequestedEvent({
        requestedAmount: replenishmentAmount,
        requestingRegionId: this.regionId,
        homeRegionId: this.homeRegionId,
        currentAvailable: localRes.toString(),
        aggregateId: this.aggregateId,
        aggregateVersion: this.version + 1,
        correlationId: correlationId,
        causationId: causationId,
      });
      this.apply(requestEvent);
    }
  }

  onReplenishmentRequested(event: ReplenishmentRequestedEvent): void {
    // This event is a signal for the Home Region to act.
    // Aggregate state doesn't necessarily change until the reservation is allocated.
    this.updatedAt = event.timestamp;
  }

  /**
   * Event handler for BalanceChangedEvent
   * Updates aggregate state when balance changes
   */
  onBalanceChanged(event: BalanceChangedEvent): void {
    const changeAmount = new Decimal(event.changeAmount);
    const regionId = (event as any).regionId || 'unknown';

    // If it's a DEBIT, deduct from the region's reservation
    if (event.changeType === 'DEBIT') {
      const currentRes = this.getReservation(regionId);
      this.reservations.set(regionId, currentRes.minus(changeAmount));
    }

    this.balance = new Decimal(event.newBalance);
    this.updatedAt = event.timestamp;
  }

  /**
   * Allocates reservation to a region (command method)
   */
  reserve(params: {
    amount: string;
    targetRegionId: string;
    correlationId: string;
    causationId?: string;
    metadata?: Record<string, string | number | boolean | undefined>;
  }): void {
    if (!this.aggregateId) throw new Error('Account does not exist');

    const amount = new Decimal(params.amount);
    if (amount.lessThanOrEqualTo(0))
      throw new Error('Reserve amount must be positive');

    const totalReserved = this.getTotalReserved();
    // Available to reserve = Balance - MinBalance - TotalReserved
    const minBalance = this.minBalance || new Decimal(0);
    const availableToReserve = this.balance
      .minus(minBalance)
      .minus(totalReserved);

    if (availableToReserve.lessThan(amount)) {
      throw new Error(
        `Insufficient unreserved balance to allocate ${amount.toString()}. ` +
          `Balance: ${this.balance.toString()}, MinBalance: ${minBalance.toString()}, Total Reserved: ${totalReserved.toString()}`,
      );
    }

    const event = new BalanceReservedEvent({
      amount: params.amount,
      targetRegionId: params.targetRegionId,
      newTotalReserved: totalReserved.plus(amount).toString(),
      aggregateId: this.aggregateId,
      aggregateVersion: this.version + 1,
      correlationId: params.correlationId,
      causationId: params.causationId,
      metadata: params.metadata,
    });

    this.apply(event);
  }

  onBalanceReserved(event: BalanceReservedEvent): void {
    const currentRes = this.getReservation(event.targetRegionId);
    this.reservations.set(
      event.targetRegionId,
      currentRes.plus(new Decimal(event.amount)),
    );
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
    const event = new AccountStatusChangedEvent({
      previousStatus: this.status,
      newStatus: params.newStatus,
      reason: params.reason,
      aggregateId: this.aggregateId,
      aggregateVersion: this.version + 1,
      correlationId: params.correlationId,
      causationId: params.causationId,
      metadata: params.metadata,
    });

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
    const event = new AccountLimitsChangedEvent({
      aggregateId: this.aggregateId,
      aggregateVersion: this.version + 1,
      correlationId: params.correlationId,
      causationId: params.causationId,
      metadata: params.metadata,
      previousMaxBalance: this.maxBalance?.toString(),
      newMaxBalance: params.newMaxBalance,
      previousMinBalance: this.minBalance?.toString(),
      newMinBalance: params.newMinBalance,
      reason: params.reason,
    });

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
   * Validate aggregate invariants.
   * Call this after applying events to ensure data integrity.
   */
  validateInvariants(): void {
    if (this.balance.lessThan(0)) {
      throw new InvariantViolationException(
        `Account ${this.aggregateId} has negative balance: ${this.balance.toString()}`,
      );
    }

    if (this.maxBalance && this.balance.greaterThan(this.maxBalance)) {
      throw new InvariantViolationException(
        `Account ${this.aggregateId} balance ${this.balance.toString()} exceeds max ${this.maxBalance.toString()}`,
      );
    }

    if (this.minBalance && this.balance.lessThan(this.minBalance)) {
      throw new InvariantViolationException(
        `Account ${this.aggregateId} balance ${this.balance.toString()} below min ${this.minBalance.toString()}`,
      );
    }

    if (
      this.maxBalance &&
      this.minBalance &&
      this.minBalance.greaterThan(this.maxBalance)
    ) {
      throw new InvariantViolationException(
        `Account ${this.aggregateId} min balance ${this.minBalance.toString()} exceeds max ${this.maxBalance.toString()}`,
      );
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
      homeRegionId: this.homeRegionId,
      status: this.status,
      balance: this.balance.toString(),
      maxBalance: this.maxBalance?.toString() ?? null,
      minBalance: this.minBalance?.toString() ?? null,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}

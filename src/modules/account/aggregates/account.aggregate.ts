import { AggregateRoot } from '../../../cqrs/base/aggregate-root';
import { AccountCreatedEvent } from '../events/account-created.event';
import { AccountType, AccountStatus } from '../account.entity';
import Decimal from 'decimal.js';

/**
 * Account Aggregate - Event-Sourced Version
 * 
 * This aggregate encapsulates all business logic for accounts.
 * It maintains state by applying domain events and ensures business rules are enforced.
 */
export class AccountAggregate extends AggregateRoot {
  // Aggregate state (derived from events)
  private ownerId: string;
  private ownerType: string;
  private accountType: AccountType;
  private currency: string;
  private status: AccountStatus;
  private balance: Decimal = new Decimal(0);
  private maxBalance?: Decimal;
  private minBalance?: Decimal;
  private createdAt: Date;
  private updatedAt: Date;

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
    metadata?: Record<string, any>;
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
      params.maxBalance,
      params.minBalance,
      {
        aggregateId: params.accountId,
        aggregateVersion: 1,
        correlationId: params.correlationId,
        causationId: params.causationId,
        metadata: params.metadata,
      },
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
    this.maxBalance = event.maxBalance ? new Decimal(event.maxBalance) : undefined;
    this.minBalance = event.minBalance ? new Decimal(event.minBalance) : undefined;
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
   * Returns a snapshot of the current state
   * Useful for debugging and projections
   */
  toSnapshot(): Record<string, any> {
    return {
      aggregateId: this.aggregateId,
      version: this.version,
      ownerId: this.ownerId,
      ownerType: this.ownerType,
      accountType: this.accountType,
      currency: this.currency,
      status: this.status,
      balance: this.balance.toString(),
      maxBalance: this.maxBalance?.toString(),
      minBalance: this.minBalance?.toString(),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}


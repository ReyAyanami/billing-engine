import { DomainEvent } from '../../../cqrs/base/domain-event';
import { EventMetadata } from '../../../common/types/metadata.types';
import { JsonObject } from '../../../common/types/json.types';
import { AccountType, AccountStatus } from '../account.entity';

/**
 * Parameters for AccountCreatedEvent
 */
export interface AccountCreatedEventParams {
  ownerId: string;
  ownerType: string;
  accountType: AccountType;
  currency: string;
  status: AccountStatus;
  balance: string;
  aggregateId: string;
  aggregateVersion: number;
  correlationId: string;
  causationId?: string;
  metadata?: EventMetadata;
  maxBalance?: string;
  minBalance?: string;
}

/**
 * Domain event emitted when a new account is created.
 * This is the first event in an account's lifecycle.
 */
export class AccountCreatedEvent extends DomainEvent {
  public readonly ownerId: string;
  public readonly ownerType: string;
  public readonly accountType: AccountType;
  public readonly currency: string;
  public readonly status: AccountStatus;
  public readonly balance: string;
  public readonly maxBalance?: string;
  public readonly minBalance?: string;

  constructor(params: AccountCreatedEventParams) {
    super({
      aggregateId: params.aggregateId,
      aggregateVersion: params.aggregateVersion,
      correlationId: params.correlationId,
      causationId: params.causationId,
      metadata: params.metadata,
      aggregateType: 'Account',
    });
    this.ownerId = params.ownerId;
    this.ownerType = params.ownerType;
    this.accountType = params.accountType;
    this.currency = params.currency;
    this.status = params.status;
    this.balance = params.balance;
    this.maxBalance = params.maxBalance;
    this.minBalance = params.minBalance;
  }

  override getEventType(): string {
    return 'AccountCreated';
  }

  protected override getEventData(): JsonObject {
    return {
      ownerId: this.ownerId ?? null,
      ownerType: this.ownerType ?? null,
      accountType: this.accountType ?? null,
      currency: this.currency ?? null,
      status: this.status ?? null,
      balance: this.balance ?? null,
      maxBalance: this.maxBalance ?? null,
      minBalance: this.minBalance ?? null,
    };
  }
}

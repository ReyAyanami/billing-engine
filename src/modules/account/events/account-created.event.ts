import { DomainEvent } from '../../../cqrs/base/domain-event';
import { EventMetadata } from '../../../common/types/metadata.types';
import { AccountType, AccountStatus } from '../account.entity';

/**
 * Domain event emitted when a new account is created.
 * This is the first event in an account's lifecycle.
 */
export class AccountCreatedEvent extends DomainEvent {
  public readonly maxBalance?: string;
  public readonly minBalance?: string;

  constructor(
    public readonly ownerId: string,
    public readonly ownerType: string,
    public readonly accountType: AccountType,
    public readonly currency: string,
    public readonly status: AccountStatus,
    public readonly balance: string,
    props: {
      aggregateId: string;
      aggregateVersion: number;
      correlationId: string;
      causationId?: string;
      metadata?: EventMetadata;
    },
    maxBalance?: string,
    minBalance?: string,
  ) {
    super({
      ...props,
      aggregateType: 'Account',
    });
    this.maxBalance = maxBalance;
    this.minBalance = minBalance;
  }

  override getEventType(): string {
    return 'AccountCreated';
  }

  protected override getEventData() {
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

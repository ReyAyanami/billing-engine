import { DomainEvent } from '../../../cqrs/base/domain-event';
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
      metadata?: Record<string, any>;
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

  getEventType(): string {
    return 'AccountCreated';
  }

  protected getEventData(): Record<string, any> {
    return {
      ownerId: this.ownerId,
      ownerType: this.ownerType,
      accountType: this.accountType,
      currency: this.currency,
      status: this.status,
      balance: this.balance,
      maxBalance: this.maxBalance,
      minBalance: this.minBalance,
    };
  }
}

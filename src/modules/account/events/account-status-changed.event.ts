import { DomainEvent } from '../../../cqrs/base/domain-event';
import { AccountStatus } from '../account.entity';

/**
 * Domain event emitted when an account's status changes.
 * Examples: ACTIVE → FROZEN, ACTIVE → CLOSED, FROZEN → ACTIVE
 */
export class AccountStatusChangedEvent extends DomainEvent {
  constructor(
    public readonly previousStatus: AccountStatus,
    public readonly newStatus: AccountStatus,
    public readonly reason: string,
    props: {
      aggregateId: string;
      aggregateVersion: number;
      correlationId: string;
      causationId?: string;
      metadata?: Record<string, any>;
    },
  ) {
    super({
      ...props,
      aggregateType: 'Account',
    });
  }

  getEventType(): string {
    return 'AccountStatusChanged';
  }

  protected getEventData(): Record<string, any> {
    return {
      previousStatus: this.previousStatus,
      newStatus: this.newStatus,
      reason: this.reason,
    };
  }
}


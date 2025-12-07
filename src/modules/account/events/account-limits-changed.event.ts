import { DomainEvent } from '../../../cqrs/base/domain-event';

/**
 * Domain event emitted when an account's balance limits change.
 * This happens when max or min balance constraints are updated.
 */
export class AccountLimitsChangedEvent extends DomainEvent {
  constructor(
    public readonly previousMaxBalance?: string,
    public readonly newMaxBalance?: string,
    public readonly previousMinBalance?: string,
    public readonly newMinBalance?: string,
    public readonly reason?: string,
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
    return 'AccountLimitsChanged';
  }

  protected getEventData(): Record<string, any> {
    return {
      previousMaxBalance: this.previousMaxBalance,
      newMaxBalance: this.newMaxBalance,
      previousMinBalance: this.previousMinBalance,
      newMinBalance: this.newMinBalance,
      reason: this.reason,
    };
  }
}


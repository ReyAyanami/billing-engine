import { DomainEvent } from '../../../cqrs/base/domain-event';

/**
 * Domain event emitted when a withdrawal transaction is completed successfully.
 */
export class WithdrawalCompletedEvent extends DomainEvent {
  constructor(
    public readonly accountId: string,
    public readonly amount: string,
    public readonly newBalance: string,
    public readonly completedAt: Date,
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
      aggregateType: 'Transaction',
    });
  }

  getEventType(): string {
    return 'WithdrawalCompleted';
  }

  protected getEventData(): Record<string, any> {
    return {
      accountId: this.accountId,
      amount: this.amount,
      newBalance: this.newBalance,
      completedAt: this.completedAt.toISOString(),
    };
  }
}

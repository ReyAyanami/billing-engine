import { DomainEvent } from '../../../cqrs/base/domain-event';

/**
 * Domain event emitted when a topup transaction is completed successfully.
 * This means the account balance has been updated.
 */
export class TopupCompletedEvent extends DomainEvent {
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
    return 'TopupCompleted';
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


import { DomainEvent } from '../../../cqrs/base/domain-event';

/**
 * Domain event emitted when a transfer transaction is completed successfully.
 * Both source and destination account balances have been updated.
 */
export class TransferCompletedEvent extends DomainEvent {
  constructor(
    public readonly sourceAccountId: string,
    public readonly destinationAccountId: string,
    public readonly amount: string,
    public readonly sourceNewBalance: string,
    public readonly destinationNewBalance: string,
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
    return 'TransferCompleted';
  }

  protected getEventData(): Record<string, any> {
    return {
      sourceAccountId: this.sourceAccountId,
      destinationAccountId: this.destinationAccountId,
      amount: this.amount,
      sourceNewBalance: this.sourceNewBalance,
      destinationNewBalance: this.destinationNewBalance,
      completedAt: this.completedAt.toISOString(),
    };
  }
}


import { DomainEvent } from '../../../cqrs/base/domain-event';

/**
 * Domain event emitted when a payment transaction is completed.
 * Indicates that both customer debit and merchant credit were successful.
 */
export class PaymentCompletedEvent extends DomainEvent {
  public readonly completedAt: Date;

  constructor(
    public readonly transactionId: string,
    public readonly customerNewBalance: string,
    public readonly merchantNewBalance: string,
    completedAt: Date,
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
    this.completedAt = completedAt;
  }

  getEventType(): string {
    return 'PaymentCompleted';
  }

  protected getEventData(): Record<string, any> {
    return {
      transactionId: this.transactionId,
      customerNewBalance: this.customerNewBalance,
      merchantNewBalance: this.merchantNewBalance,
      completedAt: this.completedAt,
    };
  }
}


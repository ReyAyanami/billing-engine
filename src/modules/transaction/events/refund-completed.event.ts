import { DomainEvent } from '../../../cqrs/base/domain-event';

/**
 * Domain event emitted when a refund transaction is completed.
 * Indicates that both merchant debit and customer credit were successful.
 */
export class RefundCompletedEvent extends DomainEvent {
  public readonly completedAt: Date;

  constructor(
    public readonly refundId: string,
    public readonly merchantNewBalance: string,
    public readonly customerNewBalance: string,
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
    return 'RefundCompleted';
  }

  protected getEventData(): Record<string, any> {
    return {
      refundId: this.refundId,
      merchantNewBalance: this.merchantNewBalance,
      customerNewBalance: this.customerNewBalance,
      completedAt: this.completedAt,
    };
  }
}


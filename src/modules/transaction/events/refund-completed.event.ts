import { DomainEvent } from '../../../cqrs/base/domain-event';
import { EventMetadata } from '../../../common/types/metadata.types';

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
      metadata?: EventMetadata;
    },
  ) {
    super({
      ...props,
      aggregateType: 'Transaction',
    });
    this.completedAt = completedAt;
  }

  override getEventType(): string {
    return 'RefundCompleted';
  }

  protected override getEventData() {
    return {
      refundId: this.refundId ?? null,
      merchantNewBalance: this.merchantNewBalance ?? null,
      customerNewBalance: this.customerNewBalance ?? null,
      completedAt: this.completedAt.toISOString(),
    };
  }
}

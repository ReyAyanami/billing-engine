import { DomainEvent } from '../../../cqrs/base/domain-event';
import { EventMetadata } from '../../../common/types/metadata.types';
import { JsonObject } from '../../../common/types/json.types';

/**
 * Parameters for RefundCompletedEvent
 */
export interface RefundCompletedEventParams {
  refundId: string;
  merchantNewBalance: string;
  customerNewBalance: string;
  completedAt: Date;
  aggregateId: string;
  aggregateVersion: number;
  correlationId: string;
  causationId?: string;
  metadata?: EventMetadata;
}

/**
 * Domain event emitted when a refund transaction is completed.
 * Indicates that both merchant debit and customer credit were successful.
 */
export class RefundCompletedEvent extends DomainEvent {
  public readonly refundId: string;
  public readonly merchantNewBalance: string;
  public readonly customerNewBalance: string;
  public readonly completedAt: Date;

  constructor(params: RefundCompletedEventParams) {
    super({
      aggregateId: params.aggregateId,
      aggregateVersion: params.aggregateVersion,
      correlationId: params.correlationId,
      causationId: params.causationId,
      metadata: params.metadata,
      aggregateType: 'Transaction',
    });
    this.refundId = params.refundId;
    this.merchantNewBalance = params.merchantNewBalance;
    this.customerNewBalance = params.customerNewBalance;
    this.completedAt = params.completedAt;
  }

  override getEventType(): string {
    return 'RefundCompleted';
  }

  protected override getEventData(): JsonObject {
    return {
      refundId: this.refundId ?? null,
      merchantNewBalance: this.merchantNewBalance ?? null,
      customerNewBalance: this.customerNewBalance ?? null,
      completedAt: this.completedAt.toISOString(),
    };
  }
}

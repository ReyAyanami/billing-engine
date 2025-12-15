import { DomainEvent } from '../../../cqrs/base/domain-event';
import { EventMetadata } from '../../../common/types/metadata.types';
import { JsonObject } from '../../../common/types/json.types';

/**
 * Parameters for PaymentCompletedEvent
 */
export interface PaymentCompletedEventParams {
  transactionId: string;
  customerNewBalance: string;
  merchantNewBalance: string;
  completedAt: Date;
  aggregateId: string;
  aggregateVersion: number;
  correlationId: string;
  causationId?: string;
  metadata?: EventMetadata;
}

/**
 * Domain event emitted when a payment transaction is completed.
 * Indicates that both customer debit and merchant credit were successful.
 */
export class PaymentCompletedEvent extends DomainEvent {
  public readonly transactionId: string;
  public readonly customerNewBalance: string;
  public readonly merchantNewBalance: string;
  public readonly completedAt: Date;

  constructor(params: PaymentCompletedEventParams) {
    super({
      aggregateId: params.aggregateId,
      aggregateVersion: params.aggregateVersion,
      correlationId: params.correlationId,
      causationId: params.causationId,
      metadata: params.metadata,
      aggregateType: 'Transaction',
    });
    this.transactionId = params.transactionId;
    this.customerNewBalance = params.customerNewBalance;
    this.merchantNewBalance = params.merchantNewBalance;
    this.completedAt = params.completedAt;
  }

  override getEventType(): string {
    return 'PaymentCompleted';
  }

  protected override getEventData(): JsonObject {
    return {
      transactionId: this.transactionId,
      customerNewBalance: this.customerNewBalance,
      merchantNewBalance: this.merchantNewBalance,
      completedAt: this.completedAt.toISOString(),
    };
  }
}

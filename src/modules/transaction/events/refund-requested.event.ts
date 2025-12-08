import { DomainEvent } from '../../../cqrs/base/domain-event';
import { EventMetadata } from '../../../common/types/metadata.types';
import { JsonObject } from '../../../common/types/json.types';

/**
 * Domain event emitted when a refund transaction is requested.
 * Refund: Merchant returns money to customer for a previous payment.
 *
 * Flow: Merchant Account (DEBIT) → Customer Account (CREDIT)
 */
export class RefundRequestedEvent extends DomainEvent {
  constructor(
    public readonly originalPaymentId: string,
    public readonly merchantAccountId: string,
    public readonly customerAccountId: string,
    public readonly refundAmount: string,
    public readonly currency: string,
    public readonly idempotencyKey: string,
    props: {
      aggregateId: string;
      aggregateVersion: number;
      correlationId: string;
      causationId?: string;
      metadata?: EventMetadata;
    },
    public readonly refundMetadata?: Record<string, string | number | boolean>,
  ) {
    super({
      ...props,
      aggregateType: 'Transaction',
    });
  }

  override getEventType(): string {
    return 'RefundRequested';
  }

  protected override getEventData(): JsonObject {
    return {
      originalPaymentId: this.originalPaymentId ?? null,
      merchantAccountId: this.merchantAccountId ?? null,
      customerAccountId: this.customerAccountId ?? null,
      refundAmount: this.refundAmount ?? null,
      currency: this.currency ?? null,
      idempotencyKey: this.idempotencyKey ?? null,
      refundMetadata: this.refundMetadata ?? null,
    };
  }
}

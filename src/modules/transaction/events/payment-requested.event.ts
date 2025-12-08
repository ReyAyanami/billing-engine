import { DomainEvent } from '../../../cqrs/base/domain-event';
import { EventMetadata } from '../../../common/types/metadata.types';
import { JsonObject } from '../../../common/types/json.types';

/**
 * Domain event emitted when a payment transaction is requested.
 * Payment: Customer pays merchant for goods/services (C2B transaction).
 *
 * Flow: Customer Account (DEBIT) → Merchant Account (CREDIT)
 */
export class PaymentRequestedEvent extends DomainEvent {
  constructor(
    public readonly customerAccountId: string,
    public readonly merchantAccountId: string,
    public readonly amount: string,
    public readonly currency: string,
    public readonly idempotencyKey: string,
    props: {
      aggregateId: string;
      aggregateVersion: number;
      correlationId: string;
      causationId?: string;
      metadata?: EventMetadata;
    },
    public readonly paymentMetadata?: Record<string, string | number | boolean>,
  ) {
    super({
      ...props,
      aggregateType: 'Transaction',
    });
  }

  override getEventType(): string {
    return 'PaymentRequested';
  }

  protected override getEventData(): JsonObject {
    return {
      customerAccountId: this.customerAccountId ?? null,
      merchantAccountId: this.merchantAccountId ?? null,
      amount: this.amount ?? null,
      currency: this.currency ?? null,
      idempotencyKey: this.idempotencyKey ?? null,
      paymentMetadata: this.paymentMetadata ?? null,
    };
  }
}

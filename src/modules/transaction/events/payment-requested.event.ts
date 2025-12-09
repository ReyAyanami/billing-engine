import { DomainEvent } from '../../../cqrs/base/domain-event';
import { EventMetadata } from '../../../common/types/metadata.types';
import { JsonObject } from '../../../common/types/json.types';

/**
 * Parameters for PaymentRequestedEvent
 */
export interface PaymentRequestedEventParams {
  customerAccountId: string;
  merchantAccountId: string;
  amount: string;
  currency: string;
  idempotencyKey: string;
  aggregateId: string;
  aggregateVersion: number;
  correlationId: string;
  causationId?: string;
  metadata?: EventMetadata;
  paymentMetadata?: Record<string, string | number | boolean>;
}

/**
 * Domain event emitted when a payment transaction is requested.
 * Payment: Customer pays merchant for goods/services (C2B transaction).
 *
 * Flow: Customer Account (DEBIT) → Merchant Account (CREDIT)
 */
export class PaymentRequestedEvent extends DomainEvent {
  public readonly customerAccountId: string;
  public readonly merchantAccountId: string;
  public readonly amount: string;
  public readonly currency: string;
  public readonly idempotencyKey: string;
  public readonly paymentMetadata?: Record<string, string | number | boolean>;

  constructor(params: PaymentRequestedEventParams) {
    super({
      aggregateId: params.aggregateId,
      aggregateVersion: params.aggregateVersion,
      correlationId: params.correlationId,
      causationId: params.causationId,
      metadata: params.metadata,
      aggregateType: 'Transaction',
    });
    this.customerAccountId = params.customerAccountId;
    this.merchantAccountId = params.merchantAccountId;
    this.amount = params.amount;
    this.currency = params.currency;
    this.idempotencyKey = params.idempotencyKey;
    this.paymentMetadata = params.paymentMetadata;
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

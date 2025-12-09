import { DomainEvent } from '../../../cqrs/base/domain-event';
import {
  EventMetadata,
  RefundMetadata,
} from '../../../common/types/metadata.types';
import { JsonObject } from '../../../common/types/json.types';

/**
 * Parameters for RefundRequestedEvent
 */
export interface RefundRequestedEventParams {
  originalPaymentId: string;
  merchantAccountId: string;
  customerAccountId: string;
  refundAmount: string;
  currency: string;
  idempotencyKey: string;
  aggregateId: string;
  aggregateVersion: number;
  correlationId: string;
  causationId?: string;
  metadata?: EventMetadata;
  refundMetadata?: RefundMetadata;
}

/**
 * Domain event emitted when a refund transaction is requested.
 * Refund: Merchant returns money to customer for a previous payment.
 *
 * Flow: Merchant Account (DEBIT) → Customer Account (CREDIT)
 */
export class RefundRequestedEvent extends DomainEvent {
  public readonly originalPaymentId: string;
  public readonly merchantAccountId: string;
  public readonly customerAccountId: string;
  public readonly refundAmount: string;
  public readonly currency: string;
  public readonly idempotencyKey: string;
  public readonly refundMetadata?: RefundMetadata;

  constructor(params: RefundRequestedEventParams) {
    super({
      aggregateId: params.aggregateId,
      aggregateVersion: params.aggregateVersion,
      correlationId: params.correlationId,
      causationId: params.causationId,
      metadata: params.metadata,
      aggregateType: 'Transaction',
    });
    this.originalPaymentId = params.originalPaymentId;
    this.merchantAccountId = params.merchantAccountId;
    this.customerAccountId = params.customerAccountId;
    this.refundAmount = params.refundAmount;
    this.currency = params.currency;
    this.idempotencyKey = params.idempotencyKey;
    this.refundMetadata = params.refundMetadata;
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
      refundMetadata: (this.refundMetadata as JsonObject) ?? null,
    };
  }
}

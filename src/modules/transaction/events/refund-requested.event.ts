import { DomainEvent } from '../../../cqrs/base/domain-event';

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
      metadata?: Record<string, any>;
    },
    public readonly refundMetadata?: {
      reason?: string;
      refundType?: 'full' | 'partial';
      notes?: string;
      [key: string]: any;
    },
  ) {
    super({
      ...props,
      aggregateType: 'Transaction',
    });
  }

  getEventType(): string {
    return 'RefundRequested';
  }

  protected getEventData(): Record<string, any> {
    return {
      originalPaymentId: this.originalPaymentId,
      merchantAccountId: this.merchantAccountId,
      customerAccountId: this.customerAccountId,
      refundAmount: this.refundAmount,
      currency: this.currency,
      idempotencyKey: this.idempotencyKey,
      refundMetadata: this.refundMetadata,
    };
  }
}


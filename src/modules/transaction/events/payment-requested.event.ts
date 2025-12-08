import { DomainEvent } from '../../../cqrs/base/domain-event';

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
      metadata?: Record<string, any>;
    },
    public readonly paymentMetadata?: {
      orderId?: string;
      invoiceId?: string;
      description?: string;
      merchantReference?: string;
      [key: string]: any;
    },
  ) {
    super({
      ...props,
      aggregateType: 'Transaction',
    });
  }

  getEventType(): string {
    return 'PaymentRequested';
  }

  protected getEventData(): Record<string, any> {
    return {
      customerAccountId: this.customerAccountId,
      merchantAccountId: this.merchantAccountId,
      amount: this.amount,
      currency: this.currency,
      idempotencyKey: this.idempotencyKey,
      paymentMetadata: this.paymentMetadata,
    };
  }
}

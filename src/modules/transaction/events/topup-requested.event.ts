import { DomainEvent } from '../../../cqrs/base/domain-event';

/**
 * Domain event emitted when a topup transaction is requested.
 * This is the first event in a topup transaction lifecycle.
 */
export class TopupRequestedEvent extends DomainEvent {
  constructor(
    public readonly accountId: string,
    public readonly amount: string,
    public readonly currency: string,
    public readonly sourceAccountId: string, // External account (system/bank)
    public readonly idempotencyKey: string,
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
  }

  getEventType(): string {
    return 'TopupRequested';
  }

  protected getEventData(): Record<string, any> {
    return {
      accountId: this.accountId,
      amount: this.amount,
      currency: this.currency,
      sourceAccountId: this.sourceAccountId,
      idempotencyKey: this.idempotencyKey,
    };
  }
}

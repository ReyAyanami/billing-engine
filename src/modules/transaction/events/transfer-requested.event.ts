import { DomainEvent } from '../../../cqrs/base/domain-event';

/**
 * Domain event emitted when a transfer transaction is requested.
 * Transfer moves funds between two accounts within the system.
 */
export class TransferRequestedEvent extends DomainEvent {
  constructor(
    public readonly sourceAccountId: string,
    public readonly destinationAccountId: string,
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
  ) {
    super({
      ...props,
      aggregateType: 'Transaction',
    });
  }

  getEventType(): string {
    return 'TransferRequested';
  }

  protected getEventData(): Record<string, any> {
    return {
      sourceAccountId: this.sourceAccountId,
      destinationAccountId: this.destinationAccountId,
      amount: this.amount,
      currency: this.currency,
      idempotencyKey: this.idempotencyKey,
    };
  }
}

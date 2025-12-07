import { DomainEvent } from '../../../cqrs/base/domain-event';

/**
 * Domain event emitted when a withdrawal transaction is requested.
 */
export class WithdrawalRequestedEvent extends DomainEvent {
  constructor(
    public readonly accountId: string,
    public readonly amount: string,
    public readonly currency: string,
    public readonly destinationAccountId: string, // External account
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
    return 'WithdrawalRequested';
  }

  protected getEventData(): Record<string, any> {
    return {
      accountId: this.accountId,
      amount: this.amount,
      currency: this.currency,
      destinationAccountId: this.destinationAccountId,
      idempotencyKey: this.idempotencyKey,
    };
  }
}


import { DomainEvent } from '../../../cqrs/base/domain-event';

/**
 * Domain event emitted when a transaction fails.
 * This can happen for various reasons: insufficient funds, validation errors, etc.
 */
export class TransactionFailedEvent extends DomainEvent {
  constructor(
    public readonly reason: string,
    public readonly errorCode: string,
    public readonly failedAt: Date,
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
    return 'TransactionFailed';
  }

  protected getEventData(): Record<string, any> {
    return {
      reason: this.reason,
      errorCode: this.errorCode,
      failedAt: this.failedAt.toISOString(),
    };
  }
}


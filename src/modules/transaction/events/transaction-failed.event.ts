import { DomainEvent } from '../../../cqrs/base/domain-event';
import { EventMetadata } from '../../../common/types/metadata.types';

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
      metadata?: EventMetadata;
    },
  ) {
    super({
      ...props,
      aggregateType: 'Transaction',
    });
  }

  override getEventType(): string {
    return 'TransactionFailed';
  }

  protected override getEventData() {
    return {
      reason: this.reason ?? null,
      errorCode: this.errorCode ?? null,
      failedAt: this.failedAt.toISOString(),
    };
  }
}

import { DomainEvent } from '../../../cqrs/base/domain-event';
import { EventMetadata } from '../../../common/types/metadata.types';

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
      metadata?: EventMetadata;
    },
  ) {
    super({
      ...props,
      aggregateType: 'Transaction',
    });
  }

  override getEventType(): string {
    return 'TopupRequested';
  }

  protected override getEventData() {
    return {
      accountId: this.accountId ?? null,
      amount: this.amount ?? null,
      currency: this.currency ?? null,
      sourceAccountId: this.sourceAccountId ?? null,
      idempotencyKey: this.idempotencyKey ?? null,
    };
  }
}

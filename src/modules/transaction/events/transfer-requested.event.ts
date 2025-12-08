import { DomainEvent } from '../../../cqrs/base/domain-event';
import { EventMetadata } from '../../../common/types/metadata.types';
import { JsonObject } from '../../../common/types/json.types';

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
      metadata?: EventMetadata;
    },
  ) {
    super({
      ...props,
      aggregateType: 'Transaction',
    });
  }

  override getEventType(): string {
    return 'TransferRequested';
  }

  protected override getEventData(): JsonObject {
    return {
      sourceAccountId: this.sourceAccountId ?? null,
      destinationAccountId: this.destinationAccountId ?? null,
      amount: this.amount ?? null,
      currency: this.currency ?? null,
      idempotencyKey: this.idempotencyKey ?? null,
    };
  }
}

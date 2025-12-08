import { DomainEvent } from '../../../cqrs/base/domain-event';
import { EventMetadata } from '../../../common/types/metadata.types';
import { JsonObject } from '../../../common/types/json.types';

/**
 * Domain event emitted when a transfer transaction is completed successfully.
 * Both source and destination account balances have been updated.
 */
export class TransferCompletedEvent extends DomainEvent {
  constructor(
    public readonly sourceAccountId: string,
    public readonly destinationAccountId: string,
    public readonly amount: string,
    public readonly sourceNewBalance: string,
    public readonly destinationNewBalance: string,
    public readonly completedAt: Date,
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
    return 'TransferCompleted';
  }

  protected override getEventData(): JsonObject {
    return {
      sourceAccountId: this.sourceAccountId ?? null,
      destinationAccountId: this.destinationAccountId ?? null,
      amount: this.amount ?? null,
      sourceNewBalance: this.sourceNewBalance ?? null,
      destinationNewBalance: this.destinationNewBalance ?? null,
      completedAt: this.completedAt.toISOString(),
    };
  }
}

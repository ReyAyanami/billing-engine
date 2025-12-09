import { DomainEvent } from '../../../cqrs/base/domain-event';
import { EventMetadata } from '../../../common/types/metadata.types';
import { JsonObject } from '../../../common/types/json.types';

/**
 * Parameters for TransferRequestedEvent
 */
export interface TransferRequestedEventParams {
  sourceAccountId: string;
  destinationAccountId: string;
  amount: string;
  currency: string;
  idempotencyKey: string;
  aggregateId: string;
  aggregateVersion: number;
  correlationId: string;
  causationId?: string;
  metadata?: EventMetadata;
}

/**
 * Domain event emitted when a transfer transaction is requested.
 * Transfer moves funds between two accounts within the system.
 */
export class TransferRequestedEvent extends DomainEvent {
  public readonly sourceAccountId: string;
  public readonly destinationAccountId: string;
  public readonly amount: string;
  public readonly currency: string;
  public readonly idempotencyKey: string;

  constructor(params: TransferRequestedEventParams) {
    super({
      aggregateId: params.aggregateId,
      aggregateVersion: params.aggregateVersion,
      correlationId: params.correlationId,
      causationId: params.causationId,
      metadata: params.metadata,
      aggregateType: 'Transaction',
    });
    this.sourceAccountId = params.sourceAccountId;
    this.destinationAccountId = params.destinationAccountId;
    this.amount = params.amount;
    this.currency = params.currency;
    this.idempotencyKey = params.idempotencyKey;
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

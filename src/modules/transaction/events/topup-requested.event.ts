import { DomainEvent } from '../../../cqrs/base/domain-event';
import { EventMetadata } from '../../../common/types/metadata.types';
import { JsonObject } from '../../../common/types/json.types';

/**
 * Parameters for TopupRequestedEvent
 */
export interface TopupRequestedEventParams {
  accountId: string;
  amount: string;
  currency: string;
  sourceAccountId: string;
  idempotencyKey: string;
  aggregateId: string;
  aggregateVersion: number;
  correlationId: string;
  causationId?: string;
  metadata?: EventMetadata;
}

/**
 * Domain event emitted when a topup transaction is requested.
 * This is the first event in a topup transaction lifecycle.
 */
export class TopupRequestedEvent extends DomainEvent {
  public readonly accountId: string;
  public readonly amount: string;
  public readonly currency: string;
  public readonly sourceAccountId: string;
  public readonly idempotencyKey: string;

  constructor(params: TopupRequestedEventParams) {
    super({
      aggregateId: params.aggregateId,
      aggregateVersion: params.aggregateVersion,
      correlationId: params.correlationId,
      causationId: params.causationId,
      metadata: params.metadata,
      aggregateType: 'Transaction',
    });
    this.accountId = params.accountId;
    this.amount = params.amount;
    this.currency = params.currency;
    this.sourceAccountId = params.sourceAccountId;
    this.idempotencyKey = params.idempotencyKey;
  }

  override getEventType(): string {
    return 'TopupRequested';
  }

  protected override getEventData(): JsonObject {
    return {
      accountId: this.accountId ?? null,
      amount: this.amount ?? null,
      currency: this.currency ?? null,
      sourceAccountId: this.sourceAccountId ?? null,
      idempotencyKey: this.idempotencyKey ?? null,
    };
  }
}

import { DomainEvent } from '../../../cqrs/base/domain-event';
import { EventMetadata } from '../../../common/types/metadata.types';
import { JsonObject } from '../../../common/types/json.types';

/**
 * Parameters for WithdrawalRequestedEvent
 */
export interface WithdrawalRequestedEventParams {
  accountId: string;
  amount: string;
  currency: string;
  destinationAccountId: string;
  idempotencyKey: string;
  aggregateId: string;
  aggregateVersion: number;
  correlationId: string;
  causationId?: string;
  metadata?: EventMetadata;
}

/**
 * Domain event emitted when a withdrawal transaction is requested.
 */
export class WithdrawalRequestedEvent extends DomainEvent {
  public readonly accountId: string;
  public readonly amount: string;
  public readonly currency: string;
  public readonly destinationAccountId: string;
  public readonly idempotencyKey: string;

  constructor(params: WithdrawalRequestedEventParams) {
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
    this.destinationAccountId = params.destinationAccountId;
    this.idempotencyKey = params.idempotencyKey;
  }

  override getEventType(): string {
    return 'WithdrawalRequested';
  }

  protected override getEventData(): JsonObject {
    return {
      accountId: this.accountId ?? null,
      amount: this.amount ?? null,
      currency: this.currency ?? null,
      destinationAccountId: this.destinationAccountId ?? null,
      idempotencyKey: this.idempotencyKey ?? null,
    };
  }
}

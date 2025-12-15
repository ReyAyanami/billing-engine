import { DomainEvent } from '../../../cqrs/base/domain-event';
import { EventMetadata } from '../../../common/types/metadata.types';
import { JsonObject } from '../../../common/types/json.types';

/**
 * Parameters for TransferCompletedEvent
 */
export interface TransferCompletedEventParams {
  sourceAccountId: string;
  destinationAccountId: string;
  amount: string;
  sourceNewBalance: string;
  destinationNewBalance: string;
  completedAt: Date;
  aggregateId: string;
  aggregateVersion: number;
  correlationId: string;
  causationId?: string;
  metadata?: EventMetadata;
}

/**
 * Domain event emitted when a transfer transaction is completed successfully.
 * Both source and destination account balances have been updated.
 */
export class TransferCompletedEvent extends DomainEvent {
  public readonly sourceAccountId: string;
  public readonly destinationAccountId: string;
  public readonly amount: string;
  public readonly sourceNewBalance: string;
  public readonly destinationNewBalance: string;
  public readonly completedAt: Date;

  constructor(params: TransferCompletedEventParams) {
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
    this.sourceNewBalance = params.sourceNewBalance;
    this.destinationNewBalance = params.destinationNewBalance;
    this.completedAt = params.completedAt;
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

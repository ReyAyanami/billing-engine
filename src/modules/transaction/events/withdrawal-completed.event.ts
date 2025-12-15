import { DomainEvent } from '../../../cqrs/base/domain-event';
import { EventMetadata } from '../../../common/types/metadata.types';
import { JsonObject } from '../../../common/types/json.types';

/**
 * Parameters for WithdrawalCompletedEvent
 */
export interface WithdrawalCompletedEventParams {
  accountId: string;
  amount: string;
  newBalance: string;
  completedAt: Date;
  aggregateId: string;
  aggregateVersion: number;
  correlationId: string;
  causationId?: string;
  metadata?: EventMetadata;
}

/**
 * Domain event emitted when a withdrawal transaction is completed successfully.
 */
export class WithdrawalCompletedEvent extends DomainEvent {
  public readonly accountId: string;
  public readonly amount: string;
  public readonly newBalance: string;
  public readonly completedAt: Date;

  constructor(params: WithdrawalCompletedEventParams) {
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
    this.newBalance = params.newBalance;
    this.completedAt = params.completedAt;
  }

  override getEventType(): string {
    return 'WithdrawalCompleted';
  }

  protected override getEventData(): JsonObject {
    return {
      accountId: this.accountId ?? null,
      amount: this.amount ?? null,
      newBalance: this.newBalance ?? null,
      completedAt: this.completedAt.toISOString(),
    };
  }
}

import { DomainEvent } from '../../../cqrs/base/domain-event';
import { EventMetadata } from '../../../common/types/metadata.types';
import { JsonObject } from '../../../common/types/json.types';

/**
 * Parameters for TransactionCompensatedEvent
 */
export interface TransactionCompensatedEventParams {
  transactionId: string;
  reason: string;
  compensationActions: Array<{
    accountId: string;
    action: 'CREDIT' | 'DEBIT';
    amount: string;
    reason: string;
  }>;
  aggregateId: string;
  aggregateVersion: number;
  correlationId: string;
  causationId?: string;
  metadata?: EventMetadata;
}

/**
 * Domain event emitted when a transaction is compensated (rolled back).
 * This happens when a saga fails partway through and needs to undo changes.
 *
 * Example: Transfer debited source but failed to credit destination.
 * Compensation: Credit the source back to original balance.
 */
export class TransactionCompensatedEvent extends DomainEvent {
  public readonly transactionId: string;
  public readonly reason: string;
  public readonly compensationActions: Array<{
    accountId: string;
    action: 'CREDIT' | 'DEBIT';
    amount: string;
    reason: string;
  }>;
  public readonly compensatedAt: Date;

  constructor(params: TransactionCompensatedEventParams) {
    super({
      aggregateId: params.aggregateId,
      aggregateVersion: params.aggregateVersion,
      correlationId: params.correlationId,
      causationId: params.causationId,
      metadata: params.metadata,
      aggregateType: 'Transaction',
    });
    this.transactionId = params.transactionId;
    this.reason = params.reason;
    this.compensationActions = params.compensationActions;
    this.compensatedAt = this.timestamp;
  }

  override getEventType(): string {
    return 'TransactionCompensated';
  }

  protected override getEventData(): JsonObject {
    return {
      transactionId: this.transactionId ?? null,
      reason: this.reason ?? null,
      compensationActions: this.compensationActions ?? null,
      compensatedAt: this.compensatedAt.toISOString(),
    };
  }
}

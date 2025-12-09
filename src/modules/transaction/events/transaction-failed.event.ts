import { DomainEvent } from '../../../cqrs/base/domain-event';
import { EventMetadata } from '../../../common/types/metadata.types';
import { JsonObject } from '../../../common/types/json.types';

/**
 * Parameters for TransactionFailedEvent
 */
export interface TransactionFailedEventParams {
  reason: string;
  errorCode: string;
  failedAt: Date;
  aggregateId: string;
  aggregateVersion: number;
  correlationId: string;
  causationId?: string;
  metadata?: EventMetadata;
}

/**
 * Domain event emitted when a transaction fails.
 * This can happen for various reasons: insufficient funds, validation errors, etc.
 */
export class TransactionFailedEvent extends DomainEvent {
  public readonly reason: string;
  public readonly errorCode: string;
  public readonly failedAt: Date;

  constructor(params: TransactionFailedEventParams) {
    super({
      aggregateId: params.aggregateId,
      aggregateVersion: params.aggregateVersion,
      correlationId: params.correlationId,
      causationId: params.causationId,
      metadata: params.metadata,
      aggregateType: 'Transaction',
    });
    this.reason = params.reason;
    this.errorCode = params.errorCode;
    this.failedAt = params.failedAt;
  }

  override getEventType(): string {
    return 'TransactionFailed';
  }

  protected override getEventData(): JsonObject {
    return {
      reason: this.reason ?? null,
      errorCode: this.errorCode ?? null,
      failedAt: this.failedAt.toISOString(),
    };
  }
}

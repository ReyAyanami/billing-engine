import { DomainEvent } from '../../../cqrs/base/domain-event';
import { EventMetadata } from '../../../common/types/metadata.types';
import { JsonObject } from '../../../common/types/json.types';
import { AccountStatus } from '../account.types';

/**
 * Parameters for AccountStatusChangedEvent
 */
export interface AccountStatusChangedEventParams {
  previousStatus: AccountStatus;
  newStatus: AccountStatus;
  reason: string;
  aggregateId: string;
  aggregateVersion: number;
  correlationId: string;
  causationId?: string;
  metadata?: EventMetadata;
}

/**
 * Domain event emitted when an account's status changes.
 * Examples: ACTIVE → FROZEN, ACTIVE → CLOSED, FROZEN → ACTIVE
 */
export class AccountStatusChangedEvent extends DomainEvent {
  public readonly previousStatus: AccountStatus;
  public readonly newStatus: AccountStatus;
  public readonly reason: string;

  constructor(params: AccountStatusChangedEventParams) {
    super({
      aggregateId: params.aggregateId,
      aggregateVersion: params.aggregateVersion,
      correlationId: params.correlationId,
      causationId: params.causationId,
      metadata: params.metadata,
      aggregateType: 'Account',
    });
    this.previousStatus = params.previousStatus;
    this.newStatus = params.newStatus;
    this.reason = params.reason;
  }

  override getEventType(): string {
    return 'AccountStatusChanged';
  }

  protected override getEventData(): JsonObject {
    return {
      previousStatus: this.previousStatus ?? null,
      newStatus: this.newStatus ?? null,
      reason: this.reason ?? null,
    };
  }
}

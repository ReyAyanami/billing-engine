import { DomainEvent } from '../../../cqrs/base/domain-event';
import { EventMetadata } from '../../../common/types/metadata.types';
import { JsonObject } from '../../../common/types/json.types';

/**
 * Parameters for AccountLimitsChangedEvent
 */
export interface AccountLimitsChangedEventParams {
  aggregateId: string;
  aggregateVersion: number;
  correlationId: string;
  causationId?: string;
  metadata?: EventMetadata;
  previousMaxBalance?: string;
  newMaxBalance?: string;
  previousMinBalance?: string;
  newMinBalance?: string;
  reason?: string;
}

/**
 * Domain event emitted when an account's balance limits change.
 * This happens when max or min balance constraints are updated.
 */
export class AccountLimitsChangedEvent extends DomainEvent {
  public readonly previousMaxBalance?: string;
  public readonly newMaxBalance?: string;
  public readonly previousMinBalance?: string;
  public readonly newMinBalance?: string;
  public readonly reason?: string;

  constructor(params: AccountLimitsChangedEventParams) {
    super({
      aggregateId: params.aggregateId,
      aggregateVersion: params.aggregateVersion,
      correlationId: params.correlationId,
      causationId: params.causationId,
      metadata: params.metadata,
      aggregateType: 'Account',
    });
    this.previousMaxBalance = params.previousMaxBalance;
    this.newMaxBalance = params.newMaxBalance;
    this.previousMinBalance = params.previousMinBalance;
    this.newMinBalance = params.newMinBalance;
    this.reason = params.reason;
  }

  override getEventType(): string {
    return 'AccountLimitsChanged';
  }

  protected override getEventData(): JsonObject {
    return {
      previousMaxBalance: this.previousMaxBalance ?? null,
      newMaxBalance: this.newMaxBalance ?? null,
      previousMinBalance: this.previousMinBalance ?? null,
      newMinBalance: this.newMinBalance ?? null,
      reason: this.reason ?? null,
    };
  }
}

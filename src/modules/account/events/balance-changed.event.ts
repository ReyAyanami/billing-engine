import { DomainEvent } from '../../../cqrs/base/domain-event';
import { EventMetadata } from '../../../common/types/metadata.types';
import { JsonObject } from '../../../common/types/json.types';

/**
 * Parameters for BalanceChangedEvent
 */
export interface BalanceChangedEventParams {
  previousBalance: string;
  newBalance: string;
  changeAmount: string;
  changeType: 'CREDIT' | 'DEBIT';
  signedAmount: string;
  reason: string;
  aggregateId: string;
  aggregateVersion: number;
  correlationId: string;
  causationId?: string;
  metadata?: EventMetadata;
  transactionId?: string;
}

/**
 * Domain event emitted when an account's balance changes.
 * This is emitted for all balance modifications (topup, withdrawal, transfer, etc.)
 */
export class BalanceChangedEvent extends DomainEvent {
  public readonly previousBalance: string;
  public readonly newBalance: string;
  public readonly changeAmount: string;
  public readonly changeType: 'CREDIT' | 'DEBIT';
  public readonly signedAmount: string;
  public readonly reason: string;
  public readonly transactionId?: string;

  constructor(params: BalanceChangedEventParams) {
    super({
      aggregateId: params.aggregateId,
      aggregateVersion: params.aggregateVersion,
      correlationId: params.correlationId,
      causationId: params.causationId,
      metadata: params.metadata,
      aggregateType: 'Account',
    });
    this.previousBalance = params.previousBalance;
    this.newBalance = params.newBalance;
    this.changeAmount = params.changeAmount;
    this.changeType = params.changeType;
    this.signedAmount = params.signedAmount;
    this.reason = params.reason;
    this.transactionId = params.transactionId;
  }

  override getEventType(): string {
    return 'BalanceChanged';
  }

  protected override getEventData(): JsonObject {
    return {
      previousBalance: this.previousBalance ?? null,
      newBalance: this.newBalance ?? null,
      changeAmount: this.changeAmount ?? null,
      changeType: this.changeType ?? null,
      signedAmount: this.signedAmount ?? null,
      reason: this.reason ?? null,
      transactionId: this.transactionId ?? null,
    };
  }
}

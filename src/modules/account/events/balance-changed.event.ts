import { DomainEvent } from '../../../cqrs/base/domain-event';
import { EventMetadata } from '../../../common/types/metadata.types';
import { JsonObject } from '../../../common/types/json.types';

/**
 * Domain event emitted when an account's balance changes.
 * This is emitted for all balance modifications (topup, withdrawal, transfer, etc.)
 */
export class BalanceChangedEvent extends DomainEvent {
  public readonly transactionId?: string;

  constructor(
    public readonly previousBalance: string,
    public readonly newBalance: string,
    public readonly changeAmount: string,
    public readonly changeType: 'CREDIT' | 'DEBIT',
    public readonly reason: string,
    props: {
      aggregateId: string;
      aggregateVersion: number;
      correlationId: string;
      causationId?: string;
      metadata?: EventMetadata;
    },
    transactionId?: string,
  ) {
    super({
      ...props,
      aggregateType: 'Account',
    });
    this.transactionId = transactionId;
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
      reason: this.reason ?? null,
      transactionId: this.transactionId ?? null,
    };
  }
}

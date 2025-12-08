import { DomainEvent } from '../../../cqrs/base/domain-event';
import { EventMetadata } from '../../../common/types/metadata.types';

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

  constructor(
    props: {
      aggregateId: string;
      aggregateVersion: number;
      correlationId: string;
      causationId?: string;
      metadata?: EventMetadata;
    },
    previousMaxBalance?: string,
    newMaxBalance?: string,
    previousMinBalance?: string,
    newMinBalance?: string,
    reason?: string,
  ) {
    super({
      ...props,
      aggregateType: 'Account',
    });
    this.previousMaxBalance = previousMaxBalance;
    this.newMaxBalance = newMaxBalance;
    this.previousMinBalance = previousMinBalance;
    this.newMinBalance = newMinBalance;
    this.reason = reason;
  }

  override getEventType(): string {
    return 'AccountLimitsChanged';
  }

  protected override getEventData() {
    return {
      previousMaxBalance: this.previousMaxBalance ?? null,
      newMaxBalance: this.newMaxBalance ?? null,
      previousMinBalance: this.previousMinBalance ?? null,
      newMinBalance: this.newMinBalance ?? null,
      reason: this.reason ?? null,
    };
  }
}

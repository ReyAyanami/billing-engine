import { DomainEvent } from '../../../cqrs/base/domain-event';
import { EventMetadata } from '../../../common/types/metadata.types';

/**
 * Domain event emitted when a withdrawal transaction is completed successfully.
 */
export class WithdrawalCompletedEvent extends DomainEvent {
  constructor(
    public readonly accountId: string,
    public readonly amount: string,
    public readonly newBalance: string,
    public readonly completedAt: Date,
    props: {
      aggregateId: string;
      aggregateVersion: number;
      correlationId: string;
      causationId?: string;
      metadata?: EventMetadata;
    },
  ) {
    super({
      ...props,
      aggregateType: 'Transaction',
    });
  }

  override getEventType(): string {
    return 'WithdrawalCompleted';
  }

  protected override getEventData() {
    return {
      accountId: this.accountId ?? null,
      amount: this.amount ?? null,
      newBalance: this.newBalance ?? null,
      completedAt: this.completedAt.toISOString(),
    };
  }
}

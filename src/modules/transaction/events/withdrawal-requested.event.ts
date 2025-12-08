import { DomainEvent } from '../../../cqrs/base/domain-event';
import { EventMetadata } from '../../../common/types/metadata.types';

/**
 * Domain event emitted when a withdrawal transaction is requested.
 */
export class WithdrawalRequestedEvent extends DomainEvent {
  constructor(
    public readonly accountId: string,
    public readonly amount: string,
    public readonly currency: string,
    public readonly destinationAccountId: string, // External account
    public readonly idempotencyKey: string,
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
    return 'WithdrawalRequested';
  }

  protected override getEventData() {
    return {
      accountId: this.accountId ?? null,
      amount: this.amount ?? null,
      currency: this.currency ?? null,
      destinationAccountId: this.destinationAccountId ?? null,
      idempotencyKey: this.idempotencyKey ?? null,
    };
  }
}

import { DomainEvent } from '../../../cqrs/base/domain-event';
import { EventMetadata } from '../../../common/types/metadata.types';

/**
 * Domain event emitted when a transaction is compensated (rolled back).
 * This happens when a saga fails partway through and needs to undo changes.
 *
 * Example: Transfer debited source but failed to credit destination.
 * Compensation: Credit the source back to original balance.
 */
export class TransactionCompensatedEvent extends DomainEvent {
  public readonly compensatedAt: Date;

  constructor(
    public readonly transactionId: string,
    public readonly reason: string,
    public readonly compensationActions: Array<{
      accountId: string;
      action: 'CREDIT' | 'DEBIT';
      amount: string;
      reason: string;
    }>,
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
    this.compensatedAt = this.timestamp;
  }

  override getEventType(): string {
    return 'TransactionCompensated';
  }

  protected override getEventData() {
    return {
      transactionId: this.transactionId ?? null,
      reason: this.reason ?? null,
      compensationActions: this.compensationActions ?? null,
      compensatedAt: this.compensatedAt.toISOString(),
    };
  }
}

import { DomainEvent } from '../../../cqrs/base/domain-event';

/**
 * Domain event emitted when an account's balance changes.
 * This is emitted for all balance modifications (topup, withdrawal, transfer, etc.)
 */
export class BalanceChangedEvent extends DomainEvent {
  constructor(
    public readonly previousBalance: string,
    public readonly newBalance: string,
    public readonly changeAmount: string,
    public readonly changeType: 'CREDIT' | 'DEBIT',
    public readonly reason: string,
    public readonly transactionId?: string,
    props: {
      aggregateId: string;
      aggregateVersion: number;
      correlationId: string;
      causationId?: string;
      metadata?: Record<string, any>;
    },
  ) {
    super({
      ...props,
      aggregateType: 'Account',
    });
  }

  getEventType(): string {
    return 'BalanceChanged';
  }

  protected getEventData(): Record<string, any> {
    return {
      previousBalance: this.previousBalance,
      newBalance: this.newBalance,
      changeAmount: this.changeAmount,
      changeType: this.changeType,
      reason: this.reason,
      transactionId: this.transactionId,
    };
  }
}


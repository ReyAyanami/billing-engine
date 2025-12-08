import { DomainEvent } from '../../../cqrs/base/domain-event';
import { EventMetadata } from '../../../common/types/metadata.types';
import { JsonObject } from '../../../common/types/json.types';
import { AccountStatus } from '../account.entity';

/**
 * Domain event emitted when an account's status changes.
 * Examples: ACTIVE → FROZEN, ACTIVE → CLOSED, FROZEN → ACTIVE
 */
export class AccountStatusChangedEvent extends DomainEvent {
  constructor(
    public readonly previousStatus: AccountStatus,
    public readonly newStatus: AccountStatus,
    public readonly reason: string,
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
      aggregateType: 'Account',
    });
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

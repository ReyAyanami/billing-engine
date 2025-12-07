import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { AccountStatusChangedEvent } from '../events/account-status-changed.event';

/**
 * Event handler for AccountStatusChangedEvent.
 * This would update projections, send notifications, trigger compliance checks, etc.
 */
@EventsHandler(AccountStatusChangedEvent)
export class AccountStatusChangedHandler
  implements IEventHandler<AccountStatusChangedEvent>
{
  private readonly logger = new Logger(AccountStatusChangedHandler.name);

  async handle(event: AccountStatusChangedEvent): Promise<void> {
    this.logger.log(
      `📨 Handling AccountStatusChangedEvent for account: ${event.aggregateId}`,
    );
    this.logger.log(`   Previous Status: ${event.previousStatus}`);
    this.logger.log(`   New Status: ${event.newStatus}`);
    this.logger.log(`   Reason: ${event.reason}`);

    // TODO: Update projection here (Week 2)
    // TODO: Send notification if account frozen/closed
    // For now, we'll just log it

    this.logger.log(`✅ AccountStatusChangedEvent processed successfully`);
  }
}


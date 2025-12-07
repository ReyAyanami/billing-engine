import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { AccountLimitsChangedEvent } from '../events/account-limits-changed.event';

/**
 * Event handler for AccountLimitsChangedEvent.
 * This would update projections, audit logs, etc.
 */
@EventsHandler(AccountLimitsChangedEvent)
export class AccountLimitsChangedHandler
  implements IEventHandler<AccountLimitsChangedEvent>
{
  private readonly logger = new Logger(AccountLimitsChangedHandler.name);

  async handle(event: AccountLimitsChangedEvent): Promise<void> {
    this.logger.log(
      `📨 Handling AccountLimitsChangedEvent for account: ${event.aggregateId}`,
    );
    
    if (event.newMaxBalance !== undefined) {
      this.logger.log(
        `   Max Balance: ${event.previousMaxBalance || 'none'} → ${event.newMaxBalance}`,
      );
    }
    
    if (event.newMinBalance !== undefined) {
      this.logger.log(
        `   Min Balance: ${event.previousMinBalance || 'none'} → ${event.newMinBalance}`,
      );
    }
    
    if (event.reason) {
      this.logger.log(`   Reason: ${event.reason}`);
    }

    // TODO: Update projection here (Week 2)
    // For now, we'll just log it

    this.logger.log(`✅ AccountLimitsChangedEvent processed successfully`);
  }
}


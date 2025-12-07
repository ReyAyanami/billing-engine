import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { BalanceChangedEvent } from '../events/balance-changed.event';

/**
 * Event handler for BalanceChangedEvent.
 * This would update projections, trigger notifications, etc.
 */
@EventsHandler(BalanceChangedEvent)
export class BalanceChangedHandler implements IEventHandler<BalanceChangedEvent> {
  private readonly logger = new Logger(BalanceChangedHandler.name);

  async handle(event: BalanceChangedEvent): Promise<void> {
    this.logger.log(`📨 Handling BalanceChangedEvent for account: ${event.aggregateId}`);
    this.logger.log(`   Previous: ${event.previousBalance}`);
    this.logger.log(`   New: ${event.newBalance}`);
    this.logger.log(`   Change: ${event.changeType} ${event.changeAmount}`);
    this.logger.log(`   Reason: ${event.reason}`);
    if (event.transactionId) {
      this.logger.log(`   Transaction: ${event.transactionId}`);
    }

    // TODO: Update projection here (Week 2)
    // For now, we'll just log it

    this.logger.log(`✅ BalanceChangedEvent processed successfully`);
  }
}


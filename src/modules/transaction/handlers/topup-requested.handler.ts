import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { TopupRequestedEvent } from '../events/topup-requested.event';

/**
 * Event handler for TopupRequestedEvent.
 * This will coordinate with account aggregate to update balance (Week 3 Day 4).
 * For now, it logs the event and prepares for account integration.
 */
@EventsHandler(TopupRequestedEvent)
export class TopupRequestedHandler implements IEventHandler<TopupRequestedEvent> {
  private readonly logger = new Logger(TopupRequestedHandler.name);

  async handle(event: TopupRequestedEvent): Promise<void> {
    this.logger.log(`📨 Handling TopupRequestedEvent: ${event.aggregateId}`);
    this.logger.log(`   Account: ${event.accountId}`);
    this.logger.log(`   Amount: ${event.amount} ${event.currency}`);
    this.logger.log(`   Source: ${event.sourceAccountId}`);
    this.logger.log(`   Idempotency Key: ${event.idempotencyKey}`);

    // TODO (Week 3 Day 4): Coordinate with Account aggregate
    // - Use CommandBus to update account balance
    // - Handle success: call transaction.completeTopup()
    // - Handle failure: call transaction.fail()

    this.logger.log(`✅ TopupRequestedEvent processed`);
  }
}


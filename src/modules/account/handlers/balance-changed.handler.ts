import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { BalanceChangedEvent } from '../events/balance-changed.event';
import { AccountProjectionService } from '../projections/account-projection.service';

/**
 * Event handler for BalanceChangedEvent.
 * Updates the read model projection when balance changes.
 */
@EventsHandler(BalanceChangedEvent)
export class BalanceChangedHandler implements IEventHandler<BalanceChangedEvent> {
  private readonly logger = new Logger(BalanceChangedHandler.name);

  constructor(private readonly projectionService: AccountProjectionService) {}

  async handle(event: BalanceChangedEvent): Promise<void> {
    this.logger.log(
      `📨 Handling BalanceChangedEvent for account: ${event.aggregateId}`,
    );
    this.logger.log(`   Previous: ${event.previousBalance}`);
    this.logger.log(`   New: ${event.newBalance}`);
    this.logger.log(`   Change: ${event.changeType} ${event.changeAmount}`);
    this.logger.log(`   Reason: ${event.reason}`);
    if (event.transactionId) {
      this.logger.log(`   Transaction: ${event.transactionId}`);
    }

    try {
      // Update read model projection
      await this.projectionService.handleBalanceChanged(event);

      // TODO: Trigger notifications if balance low/high

      this.logger.log(`✅ BalanceChangedEvent processed successfully`);
    } catch (error) {
      this.logger.error(`❌ Failed to process BalanceChangedEvent`, error);
      throw error;
    }
  }
}

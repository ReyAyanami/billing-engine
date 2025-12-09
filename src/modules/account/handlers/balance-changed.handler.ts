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
      `📨 BalanceChanged: ${event.aggregateId} | ${event.previousBalance} → ${event.newBalance} (${event.signedAmount}) | ${event.reason}`,
    );

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

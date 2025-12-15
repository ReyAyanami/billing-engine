import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { BalanceChangedEvent } from '../events/balance-changed.event';
import { AccountProjectionService } from '../projections/account-projection.service';
import { NotificationService } from '../../notification/notification.service';

/**
 * Event handler for BalanceChangedEvent.
 * Updates the read model projection when balance changes.
 */
@EventsHandler(BalanceChangedEvent)
export class BalanceChangedHandler implements IEventHandler<BalanceChangedEvent> {
  private readonly logger = new Logger(BalanceChangedHandler.name);

  constructor(
    private readonly projectionService: AccountProjectionService,
    private readonly notificationService: NotificationService,
  ) {}

  async handle(event: BalanceChangedEvent): Promise<void> {
    this.logger.log(
      `📨 BalanceChanged: ${event.aggregateId} | ${event.previousBalance} → ${event.newBalance} (${event.signedAmount}) | ${event.reason}`,
    );

    try {
      // Update read model projection
      const projection =
        await this.projectionService.handleBalanceChanged(event);

      // Send balance change notifications (includes low/high balance alerts)
      this.notificationService.notifyBalanceChanged({
        accountId: event.aggregateId,
        ownerId: projection.ownerId,
        ownerType: projection.ownerType,
        previousBalance: event.previousBalance,
        newBalance: event.newBalance,
        changeType: event.changeType,
        changeAmount: event.changeAmount,
        minBalance: projection.minBalance ?? undefined,
        maxBalance: projection.maxBalance ?? undefined,
      });

      this.logger.log(`✅ BalanceChangedEvent processed successfully`);
    } catch (error) {
      this.logger.error(`❌ Failed to process BalanceChangedEvent`, error);
      throw error;
    }
  }
}

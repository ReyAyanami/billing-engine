import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { AccountStatusChangedEvent } from '../events/account-status-changed.event';
import { AccountProjectionService } from '../projections/account-projection.service';
import { NotificationService } from '../../notification/notification.service';

/**
 * Event handler for AccountStatusChangedEvent.
 * Updates the read model projection when account status changes.
 */
@EventsHandler(AccountStatusChangedEvent)
export class AccountStatusChangedHandler implements IEventHandler<AccountStatusChangedEvent> {
  private readonly logger = new Logger(AccountStatusChangedHandler.name);

  constructor(
    private readonly projectionService: AccountProjectionService,
    private readonly notificationService: NotificationService,
  ) {}

  async handle(event: AccountStatusChangedEvent): Promise<void> {
    this.logger.log(
      `📨 Handling AccountStatusChangedEvent for account: ${event.aggregateId}`,
    );
    this.logger.log(`   Previous Status: ${event.previousStatus}`);
    this.logger.log(`   New Status: ${event.newStatus}`);
    this.logger.log(`   Reason: ${event.reason}`);

    try {
      // Update read model projection
      const projection = await this.projectionService.handleAccountStatusChanged(event);

      // Send notifications and trigger compliance checks
      await this.notificationService.notifyAccountStatusChanged({
        accountId: event.aggregateId,
        ownerId: projection.ownerId,
        ownerType: projection.ownerType,
        previousStatus: event.previousStatus,
        newStatus: event.newStatus,
        reason: event.reason,
      });

      this.logger.log(`✅ AccountStatusChangedEvent processed successfully`);
    } catch (error) {
      this.logger.error(
        `❌ Failed to process AccountStatusChangedEvent`,
        error,
      );
      throw error;
    }
  }
}

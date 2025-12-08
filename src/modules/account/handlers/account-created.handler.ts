import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { AccountCreatedEvent } from '../events/account-created.event';
import { AccountProjectionService } from '../projections/account-projection.service';

/**
 * Event handler for AccountCreatedEvent.
 * Updates the read model projection when an account is created.
 */
@EventsHandler(AccountCreatedEvent)
export class AccountCreatedHandler implements IEventHandler<AccountCreatedEvent> {
  private readonly logger = new Logger(AccountCreatedHandler.name);

  constructor(private readonly projectionService: AccountProjectionService) {}

  async handle(event: AccountCreatedEvent): Promise<void> {
    this.logger.log(
      `📨 Handling AccountCreatedEvent for account: ${event.aggregateId}`,
    );
    this.logger.log(`   Owner: ${event.ownerId} (${event.ownerType})`);
    this.logger.log(`   Type: ${event.accountType}`);
    this.logger.log(`   Currency: ${event.currency}`);
    this.logger.log(`   Status: ${event.status}`);
    this.logger.log(`   Version: ${event.aggregateVersion}`);
    this.logger.log(`   Correlation ID: ${event.correlationId}`);

    try {
      // Update read model projection
      await this.projectionService.handleAccountCreated(event);

      // TODO: Send notifications, webhooks, etc.

      this.logger.log(`✅ AccountCreatedEvent processed successfully`);
    } catch (error) {
      this.logger.error(`❌ Failed to process AccountCreatedEvent`, error);
      throw error;
    }
  }
}

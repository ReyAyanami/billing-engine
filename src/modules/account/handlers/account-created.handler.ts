import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { AccountCreatedEvent } from '../events/account-created.event';

/**
 * Event handler for AccountCreatedEvent.
 * This demonstrates async event processing.
 * 
 * In a real system, this would:
 * - Update read model projections
 * - Send notifications
 * - Trigger webhooks
 * - Update analytics
 */
@EventsHandler(AccountCreatedEvent)
export class AccountCreatedHandler implements IEventHandler<AccountCreatedEvent> {
  private readonly logger = new Logger(AccountCreatedHandler.name);

  async handle(event: AccountCreatedEvent): Promise<void> {
    this.logger.log(`📨 Handling AccountCreatedEvent for account: ${event.aggregateId}`);
    this.logger.log(`   Owner: ${event.ownerId} (${event.ownerType})`);
    this.logger.log(`   Type: ${event.accountType}`);
    this.logger.log(`   Currency: ${event.currency}`);
    this.logger.log(`   Status: ${event.status}`);
    this.logger.log(`   Version: ${event.aggregateVersion}`);
    this.logger.log(`   Correlation ID: ${event.correlationId}`);

    // TODO: Update projections here
    // For now, we'll just log it
    // In production, this would update a read model in PostgreSQL

    this.logger.log(`✅ AccountCreatedEvent processed successfully`);
  }
}


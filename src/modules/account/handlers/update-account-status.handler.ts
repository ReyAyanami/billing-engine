import { CommandHandler, ICommandHandler, EventBus } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { UpdateAccountStatusCommand } from '../commands/update-account-status.command';
import { AccountAggregate } from '../aggregates/account.aggregate';
import type { IEventStore } from '../../../cqrs/interfaces/event-store.interface';

/**
 * Handler for UpdateAccountStatusCommand.
 * Loads account aggregate from events, updates status, persists events.
 * 
 * This ensures status changes go through proper event sourcing flow.
 */
@CommandHandler(UpdateAccountStatusCommand)
export class UpdateAccountStatusHandler implements ICommandHandler<UpdateAccountStatusCommand> {
  private readonly logger = new Logger(UpdateAccountStatusHandler.name);

  constructor(
    @Inject('EVENT_STORE') private eventStore: IEventStore,
    private eventBus: EventBus,
  ) {}

  async execute(command: UpdateAccountStatusCommand): Promise<void> {
    this.logger.log(
      `Updating status for account: ${command.accountId} to ${command.newStatus}`,
    );

    try {
      // Load account aggregate from event history
      const events = await this.eventStore.getEvents(
        'Account',
        command.accountId,
      );

      if (events.length === 0) {
        throw new Error(`Account not found: ${command.accountId}`);
      }

      // Reconstruct aggregate from events
      const account = AccountAggregate.fromEvents(events);

      // Execute status change (validates transitions automatically)
      account.changeStatus({
        newStatus: command.newStatus,
        reason: command.reason,
        correlationId: command.correlationId,
        causationId: command.commandId,
        metadata: {
          actorId: command.actorId,
          commandType: command.getCommandType(),
        },
      });

      // Get uncommitted events
      const newEvents = account.getUncommittedEvents();
      this.logger.log(
        `Generated ${newEvents.length} event(s) for account ${command.accountId}`,
      );

      // Save events to event store (Kafka)
      await this.eventStore.append('Account', command.accountId, newEvents);

      // Publish events to event bus (triggers projection updates, notifications, etc.)
      newEvents.forEach((event) => {
        this.eventBus.publish(event);
      });

      // Mark events as committed
      account.commit();

      this.logger.log(
        `✅ Status updated for account: ${command.accountId} (${command.newStatus})`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Failed to update status for account ${command.accountId}`,
        error,
      );
      throw error;
    }
  }
}


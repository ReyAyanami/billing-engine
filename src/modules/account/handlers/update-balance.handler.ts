import { CommandHandler, ICommandHandler, EventBus } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { UpdateBalanceCommand } from '../commands/update-balance.command';
import { AccountAggregate } from '../aggregates/account.aggregate';
import type { IEventStore } from '../../../cqrs/interfaces/event-store.interface';

/**
 * Handler for UpdateBalanceCommand.
 * Loads account aggregate from events, updates balance, persists events.
 */
@CommandHandler(UpdateBalanceCommand)
export class UpdateBalanceHandler implements ICommandHandler<UpdateBalanceCommand> {
  private readonly logger = new Logger(UpdateBalanceHandler.name);

  constructor(
    @Inject('EVENT_STORE') private eventStore: IEventStore,
    private eventBus: EventBus,
  ) {}

  async execute(command: UpdateBalanceCommand): Promise<string> {
    this.logger.log(`Updating balance for account: ${command.accountId}`);

    try {
      // Load account aggregate from event history
      const events = await this.eventStore.getEvents('Account', command.accountId);
      
      if (events.length === 0) {
        throw new Error(`Account not found: ${command.accountId}`);
      }

      // Reconstruct aggregate from events
      const account = AccountAggregate.fromEvents(events);

      // Execute balance change
      account.changeBalance({
        changeAmount: command.changeAmount,
        changeType: command.changeType,
        reason: command.reason,
        transactionId: command.transactionId,
        correlationId: command.correlationId,
        causationId: command.commandId,
        metadata: {
          actorId: command.actorId,
          commandType: command.getCommandType(),
        },
      });

      // Get uncommitted events
      const newEvents = account.getUncommittedEvents();
      this.logger.log(`Generated ${newEvents.length} event(s) for account ${command.accountId}`);

      // Save events to event store (Kafka)
      await this.eventStore.append('Account', command.accountId, newEvents);

      // Publish events to event bus
      newEvents.forEach((event) => {
        this.eventBus.publish(event);
      });

      // Mark events as committed
      account.commit();

      // Return the new balance
      const newBalance = account.getBalance().toString();
      this.logger.log(`✅ Balance updated for account: ${command.accountId} (${newBalance})`);

      return newBalance;
    } catch (error) {
      this.logger.error(`❌ Failed to update balance for account ${command.accountId}`, error);
      throw error;
    }
  }
}


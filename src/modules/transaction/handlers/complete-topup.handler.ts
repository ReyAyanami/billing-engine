import { CommandHandler, ICommandHandler, EventBus } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { CompleteTopupCommand } from '../commands/complete-topup.command';
import { TransactionAggregate } from '../aggregates/transaction.aggregate';
import { IEventStore } from '../../../cqrs/interfaces/event-store.interface';

/**
 * Handler for CompleteTopupCommand.
 * Marks a topup transaction as completed after account update succeeds.
 */
@CommandHandler(CompleteTopupCommand)
export class CompleteTopupHandler implements ICommandHandler<CompleteTopupCommand> {
  private readonly logger = new Logger(CompleteTopupHandler.name);

  constructor(
    @Inject('EVENT_STORE') private eventStore: IEventStore,
    private eventBus: EventBus,
  ) {}

  async execute(command: CompleteTopupCommand): Promise<void> {
    this.logger.log(`Completing topup transaction: ${command.transactionId}`);

    try {
      // Load transaction aggregate from event history
      const events = await this.eventStore.getEvents('Transaction', command.transactionId);
      
      if (events.length === 0) {
        throw new Error(`Transaction not found: ${command.transactionId}`);
      }

      // Reconstruct aggregate
      const transaction = TransactionAggregate.fromEvents(events);

      // Complete the topup
      transaction.completeTopup({
        newBalance: command.newBalance,
        correlationId: command.correlationId,
        causationId: command.commandId,
        metadata: {
          actorId: command.actorId,
        },
      });

      // Get and persist uncommitted events
      const newEvents = transaction.getUncommittedEvents();
      await this.eventStore.append('Transaction', command.transactionId, newEvents);

      // Publish events
      newEvents.forEach((event) => {
        this.eventBus.publish(event);
      });

      transaction.commit();

      this.logger.log(`✅ Topup transaction completed: ${command.transactionId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to complete topup ${command.transactionId}`, error);
      throw error;
    }
  }
}


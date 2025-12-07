import { CommandHandler, ICommandHandler, EventBus } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { FailTransactionCommand } from '../commands/fail-transaction.command';
import { TransactionAggregate } from '../aggregates/transaction.aggregate';
import type { IEventStore } from '../../../cqrs/interfaces/event-store.interface';

/**
 * Handler for FailTransactionCommand.
 * Marks a transaction as failed when processing encounters an error.
 */
@CommandHandler(FailTransactionCommand)
export class FailTransactionHandler implements ICommandHandler<FailTransactionCommand> {
  private readonly logger = new Logger(FailTransactionHandler.name);

  constructor(
    @Inject('EVENT_STORE') private eventStore: IEventStore,
    private eventBus: EventBus,
  ) {}

  async execute(command: FailTransactionCommand): Promise<void> {
    this.logger.log(`Failing transaction: ${command.transactionId}`);

    try {
      // Load transaction aggregate from event history
      const events = await this.eventStore.getEvents('Transaction', command.transactionId);
      
      if (events.length === 0) {
        throw new Error(`Transaction not found: ${command.transactionId}`);
      }

      // Reconstruct aggregate
      const transaction = TransactionAggregate.fromEvents(events);

      // Fail the transaction
      transaction.fail({
        reason: command.reason,
        errorCode: command.errorCode,
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

      this.logger.log(`✅ Transaction failed: ${command.transactionId} (${command.reason})`);
    } catch (error) {
      this.logger.error(`❌ Failed to mark transaction as failed ${command.transactionId}`, error);
      throw error;
    }
  }
}


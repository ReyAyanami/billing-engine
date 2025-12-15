import { CommandHandler, ICommandHandler, EventBus } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { CompleteTransferCommand } from '../commands/complete-transfer.command';
import { TransactionAggregate } from '../aggregates/transaction.aggregate';
import type { IEventStore } from '../../../cqrs/interfaces/event-store.interface';

/**
 * Handler for CompleteTransferCommand.
 * Marks a transfer transaction as completed after both accounts are updated.
 */
@CommandHandler(CompleteTransferCommand)
export class CompleteTransferHandler implements ICommandHandler<CompleteTransferCommand> {
  private readonly logger = new Logger(CompleteTransferHandler.name);

  constructor(
    @Inject('EVENT_STORE') private eventStore: IEventStore,
    private eventBus: EventBus,
  ) {}

  async execute(command: CompleteTransferCommand): Promise<void> {
    this.logger.log(
      `Completing transfer transaction: ${command.transactionId}`,
    );

    try {
      // Load transaction aggregate from event history
      const events = await this.eventStore.getEvents(
        'Transaction',
        command.transactionId,
      );

      if (events.length === 0) {
        throw new Error(`Transaction not found: ${command.transactionId}`);
      }

      // Reconstruct aggregate
      const transaction = TransactionAggregate.fromEvents(events);

      // Complete the transfer
      transaction.completeTransfer({
        sourceNewBalance: command.sourceNewBalance,
        destinationNewBalance: command.destinationNewBalance,
        correlationId: command.correlationId,
        causationId: command.commandId,
        metadata: {
          actorId: command.actorId,
        },
      });

      // Get and persist uncommitted events
      const newEvents = transaction.getUncommittedEvents();
      await this.eventStore.append(
        'Transaction',
        command.transactionId,
        newEvents,
      );

      // Publish events
      newEvents.forEach((event) => {
        this.eventBus.publish(event);
      });

      transaction.commit();

      this.logger.log(
        `✅ Transfer transaction completed: ${command.transactionId}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Failed to complete transfer ${command.transactionId}`,
        error,
      );
      throw error;
    }
  }
}

import { CommandHandler, ICommandHandler, EventBus } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { TransferCommand } from '../commands/transfer.command';
import { TransactionAggregate } from '../aggregates/transaction.aggregate';
import type { IEventStore } from '../../../cqrs/interfaces/event-store.interface';

/**
 * Handler for TransferCommand.
 * Creates a transaction aggregate, requests transfer, and persists events.
 */
@CommandHandler(TransferCommand)
export class TransferHandler implements ICommandHandler<TransferCommand> {
  private readonly logger = new Logger(TransferHandler.name);

  constructor(
    @Inject('EVENT_STORE') private eventStore: IEventStore,
    private eventBus: EventBus,
  ) {}

  async execute(command: TransferCommand): Promise<string> {
    this.logger.log(
      `[TransferHandler] Processing [txId=${command.transactionId}, src=${command.sourceAccountId}, ` +
        `dst=${command.destinationAccountId}, amt=${command.amount}, corr=${command.correlationId}]`,
    );

    try {
      // Create new transaction aggregate
      const transaction = new TransactionAggregate();

      // Execute the transfer request
      transaction.requestTransfer({
        transactionId: command.transactionId,
        sourceAccountId: command.sourceAccountId,
        destinationAccountId: command.destinationAccountId,
        amount: command.amount,
        currency: command.currency,
        idempotencyKey: command.idempotencyKey,
        correlationId: command.correlationId,
        causationId: command.commandId,
        metadata: {
          actorId: command.actorId,
          commandType: command.getCommandType(),
        },
      });

      // Get uncommitted events and persist them
      const events = transaction.getUncommittedEvents();
      await this.eventStore.append(
        'Transaction',
        command.transactionId,
        events,
      );

      // Publish events to the event bus for async processing
      events.forEach((event) => {
        this.eventBus.publish(event);
      });

      // Mark events as committed
      transaction.commit();

      this.logger.log(
        `[TransferHandler] Completed [txId=${command.transactionId}]`,
      );

      return command.transactionId;
    } catch (error) {
      this.logger.error(
        `[TransferHandler] Failed [txId=${command.transactionId}, corr=${command.correlationId}]`,
        error.stack,
      );
      throw error;
    }
  }
}

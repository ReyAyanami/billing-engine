import { CommandHandler, ICommandHandler, EventBus } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { TopupCommand } from '../commands/topup.command';
import { TransactionAggregate } from '../aggregates/transaction.aggregate';
import type { IEventStore } from '../../../cqrs/interfaces/event-store.interface';

/**
 * Handler for TopupCommand.
 * Creates a transaction aggregate, requests topup, and persists events.
 */
@CommandHandler(TopupCommand)
export class TopupHandler implements ICommandHandler<TopupCommand> {
  private readonly logger = new Logger(TopupHandler.name);

  constructor(
    @Inject('EVENT_STORE') private eventStore: IEventStore,
    private eventBus: EventBus,
  ) {}

  async execute(command: TopupCommand): Promise<string> {
    this.logger.log(
      `[TopupHandler] Processing [txId=${command.transactionId}, accountId=${command.accountId}, ` +
        `amt=${command.amount}, corr=${command.correlationId}]`,
    );

    try {
      // Create new transaction aggregate
      const transaction = new TransactionAggregate();

      // Execute the topup request
      transaction.requestTopup({
        transactionId: command.transactionId,
        accountId: command.accountId,
        amount: command.amount,
        currency: command.currency,
        sourceAccountId: command.sourceAccountId,
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
      this.logger.log(
        `[TopupHandler] Appending ${events.length} events to event store`,
      );

      await this.eventStore.append(
        'Transaction',
        command.transactionId,
        events,
      );

      // Publish events to the event bus for async processing
      this.logger.log(
        `[TopupHandler] Publishing ${events.length} events to event bus`,
      );
      events.forEach((event) => {
        this.logger.log(`[TopupHandler] Publishing: ${event.getEventType()}`);
        this.eventBus.publish(event);
      });

      // Mark events as committed
      transaction.commit();

      this.logger.log(
        `[TopupHandler] Completed [txId=${command.transactionId}]`,
      );

      return command.transactionId;
    } catch (error: unknown) {
      this.logger.error(
        `[TopupHandler] Failed [txId=${command.transactionId}, corr=${command.correlationId}]`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}

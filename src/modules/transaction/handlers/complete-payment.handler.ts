import { CommandHandler, ICommandHandler, EventBus } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { CompletePaymentCommand } from '../commands/complete-payment.command';
import { TransactionAggregate } from '../aggregates/transaction.aggregate';
import type { IEventStore } from '../../../cqrs/interfaces/event-store.interface';

/**
 * Handler for CompletePaymentCommand.
 * Marks a payment transaction as completed after both accounts are updated.
 */
@CommandHandler(CompletePaymentCommand)
export class CompletePaymentHandler implements ICommandHandler<CompletePaymentCommand> {
  private readonly logger = new Logger(CompletePaymentHandler.name);

  constructor(
    @Inject('EVENT_STORE') private eventStore: IEventStore,
    private eventBus: EventBus,
  ) {}

  async execute(command: CompletePaymentCommand): Promise<void> {
    this.logger.log(`Completing payment transaction: ${command.transactionId}`);

    try {
      const events = await this.eventStore.getEvents(
        'Transaction',
        command.transactionId,
      );

      if (events.length === 0) {
        throw new Error(`Transaction not found: ${command.transactionId}`);
      }

      const transaction = TransactionAggregate.fromEvents(events);

      transaction.completePayment({
        customerNewBalance: command.customerNewBalance,
        merchantNewBalance: command.merchantNewBalance,
        correlationId: command.correlationId,
        causationId: command.commandId,
        metadata: {
          actorId: command.actorId,
        },
      });

      const newEvents = transaction.getUncommittedEvents();
      await this.eventStore.append(
        'Transaction',
        command.transactionId,
        newEvents,
      );

      newEvents.forEach((event) => {
        this.eventBus.publish(event);
      });

      transaction.commit();

      this.logger.log(
        `✅ Payment transaction completed: ${command.transactionId}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Failed to complete payment ${command.transactionId}`,
        error,
      );
      throw error;
    }
  }
}

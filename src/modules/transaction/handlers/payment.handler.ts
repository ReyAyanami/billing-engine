import { CommandHandler, ICommandHandler, EventBus } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { PaymentCommand } from '../commands/payment.command';
import { TransactionAggregate } from '../aggregates/transaction.aggregate';
import type { IEventStore } from '../../../cqrs/interfaces/event-store.interface';

/**
 * Handler for PaymentCommand.
 * Initiates a payment transaction (customer → merchant).
 */
@CommandHandler(PaymentCommand)
export class PaymentHandler implements ICommandHandler<PaymentCommand> {
  private readonly logger = new Logger(PaymentHandler.name);

  constructor(
    @Inject('EVENT_STORE') private eventStore: IEventStore,
    private eventBus: EventBus,
  ) {}

  async execute(command: PaymentCommand): Promise<string> {
    this.logger.log(
      `[PaymentHandler] Executing PaymentCommand: ${command.transactionId}`,
    );
    this.logger.log(`   Customer: ${command.customerAccountId}`);
    this.logger.log(`   Merchant: ${command.merchantAccountId}`);
    this.logger.log(`   Amount: ${command.amount} ${command.currency}`);

    try {
      // Create new transaction aggregate
      const transaction = new TransactionAggregate();

      // Request the payment
      transaction.requestPayment({
        transactionId: command.transactionId,
        customerAccountId: command.customerAccountId,
        merchantAccountId: command.merchantAccountId,
        amount: command.amount,
        currency: command.currency,
        idempotencyKey: command.idempotencyKey,
        paymentMetadata: command.paymentMetadata as
          | Record<string, string | number | boolean>
          | undefined,
        correlationId: command.correlationId,
        causationId: command.commandId,
        metadata: {
          actorId: command.actorId,
        },
      });

      // Get uncommitted events and persist them
      const events = transaction.getUncommittedEvents();
      await this.eventStore.append(
        'Transaction',
        command.transactionId,
        events,
      );

      // Publish events
      events.forEach((event) => {
        this.eventBus.publish(event);
      });

      transaction.commit();

      this.logger.log(
        `✅ [PaymentHandler] Payment requested: ${command.transactionId}`,
      );
      return command.transactionId;
    } catch (error) {
      this.logger.error(
        `❌ [PaymentHandler] Failed to request payment`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}

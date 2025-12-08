import { CommandHandler, ICommandHandler, EventBus } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { WithdrawalCommand } from '../commands/withdrawal.command';
import { TransactionAggregate } from '../aggregates/transaction.aggregate';
import type { IEventStore } from '../../../cqrs/interfaces/event-store.interface';

/**
 * Handler for WithdrawalCommand.
 * Creates a transaction aggregate, requests withdrawal, and persists events.
 */
@CommandHandler(WithdrawalCommand)
export class WithdrawalHandler implements ICommandHandler<WithdrawalCommand> {
  private readonly logger = new Logger(WithdrawalHandler.name);

  constructor(
    @Inject('EVENT_STORE') private eventStore: IEventStore,
    private eventBus: EventBus,
  ) {}

  async execute(command: WithdrawalCommand): Promise<string> {
    this.logger.log(`Processing withdrawal: ${command.transactionId}`);
    this.logger.log(`  Account: ${command.accountId}, Amount: ${command.amount}, Destination: ${command.destinationAccountId}`);

    try {
      // Create new transaction aggregate
      const transaction = new TransactionAggregate();

      // Execute the withdrawal request
      this.logger.log(`  Creating WithdrawalRequestedEvent...`);
      transaction.requestWithdrawal({
        transactionId: command.transactionId,
        accountId: command.accountId,
        amount: command.amount,
        currency: command.currency,
        destinationAccountId: command.destinationAccountId,
        idempotencyKey: command.idempotencyKey,
        correlationId: command.correlationId,
        causationId: command.commandId,
        metadata: {
          actorId: command.actorId,
          commandType: command.getCommandType(),
        },
      });

      // Get uncommitted events
      const events = transaction.getUncommittedEvents();
      this.logger.log(`Generated ${events.length} event(s) for transaction ${command.transactionId}`);
      events.forEach(e => {
        const eventType = e.getEventType();
        this.logger.log(`  - Event: ${eventType}`);
      });

      // Save events to the event store
      this.logger.log(`  Saving events to event store...`);
      await this.eventStore.append('Transaction', command.transactionId, events);

      // Publish events to the event bus for async processing (saga handlers)
      this.logger.log(`  Publishing ${events.length} event(s) to EventBus...`);
      events.forEach((event) => {
        this.eventBus.publish(event);
      });
      this.logger.log(`  Events published to EventBus`);


      // Mark events as committed
      transaction.commit();

      this.logger.log(`✅ Withdrawal transaction requested: ${command.transactionId}`);

      return command.transactionId;
    } catch (error) {
      this.logger.error(`❌ Failed to process withdrawal ${command.transactionId}`, error);
      throw error;
    }
  }
}


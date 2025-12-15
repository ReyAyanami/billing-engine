import { CommandHandler, ICommandHandler, EventBus } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { CompleteWithdrawalCommand } from '../commands/complete-withdrawal.command';
import { TransactionAggregate } from '../aggregates/transaction.aggregate';
import type { IEventStore } from '../../../cqrs/interfaces/event-store.interface';

/**
 * Handler for CompleteWithdrawalCommand.
 * Marks a withdrawal transaction as completed after account update succeeds.
 */
@CommandHandler(CompleteWithdrawalCommand)
export class CompleteWithdrawalHandler implements ICommandHandler<CompleteWithdrawalCommand> {
  private readonly logger = new Logger(CompleteWithdrawalHandler.name);

  constructor(
    @Inject('EVENT_STORE') private eventStore: IEventStore,
    private eventBus: EventBus,
  ) {}

  async execute(command: CompleteWithdrawalCommand): Promise<void> {
    this.logger.log(
      `Completing withdrawal transaction: ${command.transactionId}`,
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

      // Complete the withdrawal
      transaction.completeWithdrawal({
        newBalance: command.newBalance,
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
        `✅ Withdrawal transaction completed: ${command.transactionId}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Failed to complete withdrawal ${command.transactionId}`,
        error,
      );
      throw error;
    }
  }
}

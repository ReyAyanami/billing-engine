import { CommandHandler, ICommandHandler, EventBus } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { CompleteRefundCommand } from '../commands/complete-refund.command';
import { TransactionAggregate } from '../aggregates/transaction.aggregate';
import type { IEventStore } from '../../../cqrs/interfaces/event-store.interface';

/**
 * Handler for CompleteRefundCommand.
 * Marks a refund transaction as completed after both accounts are updated.
 */
@CommandHandler(CompleteRefundCommand)
export class CompleteRefundHandler implements ICommandHandler<CompleteRefundCommand> {
  private readonly logger = new Logger(CompleteRefundHandler.name);

  constructor(
    @Inject('EVENT_STORE') private eventStore: IEventStore,
    private eventBus: EventBus,
  ) {}

  async execute(command: CompleteRefundCommand): Promise<void> {
    this.logger.log(`Completing refund transaction: ${command.refundId}`);

    try {
      // Load refund aggregate from event history
      const events = await this.eventStore.getEvents('Transaction', command.refundId);
      
      if (events.length === 0) {
        throw new Error(`Refund not found: ${command.refundId}`);
      }

      // Reconstruct aggregate
      const refund = TransactionAggregate.fromEvents(events);

      // Complete the refund
      refund.completeRefund({
        merchantNewBalance: command.merchantNewBalance,
        customerNewBalance: command.customerNewBalance,
        correlationId: command.correlationId,
        causationId: command.commandId,
        metadata: {
          actorId: command.actorId,
        },
      });

      // Get and persist uncommitted events
      const newEvents = refund.getUncommittedEvents();
      await this.eventStore.append('Transaction', command.refundId, newEvents);

      // Publish events
      newEvents.forEach((event) => {
        this.eventBus.publish(event);
      });

      refund.commit();

      this.logger.log(`✅ Refund transaction completed: ${command.refundId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to complete refund ${command.refundId}`, error);
      throw error;
    }
  }
}


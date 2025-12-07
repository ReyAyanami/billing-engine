import { CommandHandler, ICommandHandler, EventBus } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { RefundCommand } from '../commands/refund.command';
import { TransactionAggregate } from '../aggregates/transaction.aggregate';
import type { IEventStore } from '../../../cqrs/interfaces/event-store.interface';

/**
 * Handler for RefundCommand.
 * Initiates a refund transaction (merchant → customer).
 */
@CommandHandler(RefundCommand)
export class RefundHandler implements ICommandHandler<RefundCommand> {
  private readonly logger = new Logger(RefundHandler.name);

  constructor(
    @Inject('EVENT_STORE') private eventStore: IEventStore,
    private eventBus: EventBus,
  ) {}

  async execute(command: RefundCommand): Promise<{ refundId: string; merchantAccountId: string; customerAccountId: string }> {
    this.logger.log(`[RefundHandler] Executing RefundCommand: ${command.refundId}`);
    this.logger.log(`   Original Payment: ${command.originalPaymentId}`);
    this.logger.log(`   Refund Amount: ${command.refundAmount} ${command.currency}`);

    try {
      // First, load the original payment to get merchant and customer account IDs
      const paymentEvents = await this.eventStore.getEvents('Transaction', command.originalPaymentId);
      
      if (paymentEvents.length === 0) {
        throw new Error(`Original payment not found: ${command.originalPaymentId}`);
      }

      // Reconstruct payment aggregate to get account IDs
      const paymentAggregate = TransactionAggregate.fromEvents(paymentEvents);
      
      const merchantAccountId = paymentAggregate.getDestinationAccountId(); // In payment, merchant is destination
      const customerAccountId = paymentAggregate.getSourceAccountId(); // In payment, customer is source

      if (!merchantAccountId || !customerAccountId) {
        throw new Error(`Invalid payment transaction: missing account IDs`);
      }

      // Create new refund transaction aggregate
      const refund = new TransactionAggregate();

      // Request the refund
      refund.requestRefund({
        refundId: command.refundId,
        originalPaymentId: command.originalPaymentId,
        merchantAccountId,
        customerAccountId,
        refundAmount: command.refundAmount,
        currency: command.currency,
        idempotencyKey: command.idempotencyKey,
        refundMetadata: command.refundMetadata,
        correlationId: command.correlationId,
        causationId: command.commandId,
        metadata: {
          actorId: command.actorId,
          originalPaymentAmount: paymentAggregate.getAmount().toString(),
        },
      });

      // Get uncommitted events and persist them
      const events = refund.getUncommittedEvents();
      await this.eventStore.append('Transaction', command.refundId, events);

      // Publish events
      events.forEach((event) => {
        this.eventBus.publish(event);
      });

      refund.commit();

      this.logger.log(`✅ [RefundHandler] Refund requested: ${command.refundId}`);
      
      return {
        refundId: command.refundId,
        merchantAccountId,
        customerAccountId,
      };
    } catch (error) {
      this.logger.error(`❌ [RefundHandler] Failed to request refund`, error);
      throw error;
    }
  }
}


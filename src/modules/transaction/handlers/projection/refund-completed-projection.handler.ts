import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { RefundCompletedEvent } from '../../events/refund-completed.event';
import { TransactionProjectionService } from '../../projections/transaction-projection.service';
import { TransactionStatus } from '../../transaction.entity';

/**
 * Event handler to update transaction projection when refund is completed.
 * Marks the transaction as COMPLETED and records final balances.
 */
@EventsHandler(RefundCompletedEvent)
export class RefundCompletedProjectionHandler
  implements IEventHandler<RefundCompletedEvent>
{
  private readonly logger = new Logger(RefundCompletedProjectionHandler.name);

  constructor(
    private readonly projectionService: TransactionProjectionService,
  ) {}

  async handle(event: RefundCompletedEvent): Promise<void> {
    this.logger.log(
      `📊 [Projection] RefundCompleted: ${event.aggregateId}`,
    );
    this.logger.log(`   Merchant new balance: ${event.merchantNewBalance}`);
    this.logger.log(`   Customer new balance: ${event.customerNewBalance}`);

    try {
      await this.projectionService.updateTransactionCompleted(
        event.aggregateId,
        event.merchantNewBalance, // sourceNewBalance (merchant)
        event.customerNewBalance, // destinationNewBalance (customer)
        event.completedAt,
        event.aggregateVersion,
        event.eventId,
        event.timestamp,
      );

      this.logger.log(
        `✅ [Projection] Refund projection updated to COMPLETED: ${event.aggregateId}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ [Projection] Failed to update refund projection`,
        error,
      );
    }
  }
}


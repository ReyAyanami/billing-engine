import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { RefundCompletedEvent } from '../../events/refund-completed.event';
import { TransactionProjectionService } from '../../projections/transaction-projection.service';

/**
 * Event handler to update transaction projection when refund is completed.
 * Marks the transaction as COMPLETED and records final balances.
 */
@EventsHandler(RefundCompletedEvent)
export class RefundCompletedProjectionHandler implements IEventHandler<RefundCompletedEvent> {
  private readonly logger = new Logger(RefundCompletedProjectionHandler.name);

  constructor(
    private readonly projectionService: TransactionProjectionService,
  ) {}

  async handle(event: RefundCompletedEvent): Promise<void> {
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
    } catch (error: unknown) {
      this.logger.error(
        `[Projection] Failed to update refund projection [txId=${event.aggregateId}]`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

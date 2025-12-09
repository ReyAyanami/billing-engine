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
    // Race condition mitigation: Retry if projection doesn't exist yet
    const maxRetries = 10;
    const retryDelay = 50;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await this.projectionService.updateTransactionCompleted(
          event.aggregateId,
          event.merchantNewBalance,
          event.customerNewBalance,
          event.completedAt,
          event.aggregateVersion,
          event.eventId,
          event.timestamp,
        );
        return;
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('not found') && attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
          continue;
        }
        this.logger.error(
          `[Projection] Failed to update refund projection [txId=${event.aggregateId}]`,
          error instanceof Error ? error.stack : String(error),
        );
        throw error;
      }
    }
  }
}

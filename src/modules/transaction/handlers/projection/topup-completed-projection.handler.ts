import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { TopupCompletedEvent } from '../../events/topup-completed.event';
import { TransactionProjectionService } from '../../projections/transaction-projection.service';

/**
 * Event handler to update transaction projection when topup completes.
 */
@EventsHandler(TopupCompletedEvent)
export class TopupCompletedProjectionHandler implements IEventHandler<TopupCompletedEvent> {
  private readonly logger = new Logger(TopupCompletedProjectionHandler.name);

  constructor(
    private readonly projectionService: TransactionProjectionService,
  ) {}

  async handle(event: TopupCompletedEvent): Promise<void> {
    // Race condition mitigation: Retry if projection doesn't exist yet
    // The TopupRequestedProjectionHandler might still be creating it
    const maxRetries = 10;
    const retryDelay = 50; // ms

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await this.projectionService.updateTransactionCompleted(
          event.aggregateId,
          undefined, // Source balance not applicable for topup
          event.newBalance,
          event.completedAt,
          event.aggregateVersion,
          event.eventId,
          event.timestamp,
        );
        return; // Success!
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        // If projection not found and we have retries left, wait and retry
        if (errorMessage.includes('not found') && attempt < maxRetries - 1) {
          this.logger.warn(
            `[Projection] Projection not ready yet, retrying... [txId=${event.aggregateId}, attempt=${attempt + 1}/${maxRetries}]`,
          );
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
          continue;
        }

        // Final attempt failed or different error
        this.logger.error(
          `[Projection] Failed to update topup projection [txId=${event.aggregateId}]`,
          error instanceof Error ? error.stack : String(error),
        );
        throw error; // Re-throw so we can see the error in tests
      }
    }
  }
}

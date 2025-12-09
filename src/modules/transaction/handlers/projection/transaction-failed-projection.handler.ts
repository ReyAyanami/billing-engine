import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { TransactionFailedEvent } from '../../events/transaction-failed.event';
import { TransactionProjectionService } from '../../projections/transaction-projection.service';

/**
 * Event handler to update transaction projection when transaction fails.
 */
@EventsHandler(TransactionFailedEvent)
export class TransactionFailedProjectionHandler implements IEventHandler<TransactionFailedEvent> {
  private readonly logger = new Logger(TransactionFailedProjectionHandler.name);

  constructor(
    private readonly projectionService: TransactionProjectionService,
  ) {}

  async handle(event: TransactionFailedEvent): Promise<void> {
    // Race condition mitigation: Retry if projection doesn't exist yet
    const maxRetries = 10;
    const retryDelay = 50;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await this.projectionService.updateTransactionFailed(
          event.aggregateId,
          event.reason,
          event.errorCode,
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
          `[Projection] Failed to update transaction projection [txId=${event.aggregateId}]`,
          error instanceof Error ? error.stack : String(error),
        );
        throw error;
      }
    }
  }
}

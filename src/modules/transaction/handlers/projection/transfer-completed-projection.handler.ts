import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { TransferCompletedEvent } from '../../events/transfer-completed.event';
import { TransactionProjectionService } from '../../projections/transaction-projection.service';

/**
 * Event handler to update transaction projection when transfer completes.
 */
@EventsHandler(TransferCompletedEvent)
export class TransferCompletedProjectionHandler implements IEventHandler<TransferCompletedEvent> {
  private readonly logger = new Logger(TransferCompletedProjectionHandler.name);

  constructor(
    private readonly projectionService: TransactionProjectionService,
  ) {}

  async handle(event: TransferCompletedEvent): Promise<void> {
    // Race condition mitigation: Retry if projection doesn't exist yet
    const maxRetries = 10;
    const retryDelay = 50;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await this.projectionService.updateTransactionCompleted(
          event.aggregateId,
          event.sourceNewBalance,
          event.destinationNewBalance,
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
          `[Projection] Failed to update transfer projection [txId=${event.aggregateId}]`,
          error instanceof Error ? error.stack : String(error),
        );
        throw error;
      }
    }
  }
}

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
    } catch (error) {
      this.logger.error(
        `[Projection] Failed to update topup projection [txId=${event.aggregateId}]`,
        error.stack,
      );
    }
  }
}

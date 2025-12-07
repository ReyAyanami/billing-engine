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
    this.logger.log(`📊 [Projection] TransactionFailed: ${event.aggregateId}`);

    try {
      await this.projectionService.updateTransactionFailed(
        event.aggregateId,
        event.reason,
        event.errorCode,
        event.aggregateVersion,
        event.eventId,
        event.timestamp,
      );

      this.logger.log(`✅ [Projection] Transaction projection updated (failed): ${event.aggregateId}`);
    } catch (error) {
      this.logger.error(`❌ [Projection] Failed to update transaction projection`, error);
    }
  }
}


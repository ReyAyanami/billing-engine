import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { TransferCompletedEvent } from '../../events/transfer-completed.event';
import { TransactionProjectionService } from '../../projections/transaction-projection.service';

/**
 * Event handler to update transaction projection when transfer completes.
 */
@EventsHandler(TransferCompletedEvent)
export class TransferCompletedProjectionHandler
  implements IEventHandler<TransferCompletedEvent>
{
  private readonly logger = new Logger(TransferCompletedProjectionHandler.name);

  constructor(
    private readonly projectionService: TransactionProjectionService,
  ) {}

  async handle(event: TransferCompletedEvent): Promise<void> {
    this.logger.log(`📊 [Projection] TransferCompleted: ${event.aggregateId}`);

    try {
      await this.projectionService.updateTransactionCompleted(
        event.aggregateId,
        event.sourceNewBalance, // Source account balance after debit
        event.destinationNewBalance, // Destination account balance after credit
        event.completedAt,
        event.aggregateVersion,
        event.eventId,
        event.timestamp,
      );

      this.logger.log(`✅ [Projection] Transaction projection updated: ${event.aggregateId}`);
    } catch (error) {
      this.logger.error(`❌ [Projection] Failed to update transaction projection`, error);
    }
  }
}


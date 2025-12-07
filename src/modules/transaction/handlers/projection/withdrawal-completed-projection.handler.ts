import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { WithdrawalCompletedEvent } from '../../events/withdrawal-completed.event';
import { TransactionProjectionService } from '../../projections/transaction-projection.service';

/**
 * Event handler to update transaction projection when withdrawal completes.
 */
@EventsHandler(WithdrawalCompletedEvent)
export class WithdrawalCompletedProjectionHandler
  implements IEventHandler<WithdrawalCompletedEvent>
{
  private readonly logger = new Logger(WithdrawalCompletedProjectionHandler.name);

  constructor(
    private readonly projectionService: TransactionProjectionService,
  ) {}

  async handle(event: WithdrawalCompletedEvent): Promise<void> {
    this.logger.log(`📊 [Projection] WithdrawalCompleted: ${event.aggregateId}`);

    try {
      await this.projectionService.updateTransactionCompleted(
        event.aggregateId,
        event.newBalance, // Source balance (account that was debited)
        undefined, // Destination balance not applicable for withdrawal
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


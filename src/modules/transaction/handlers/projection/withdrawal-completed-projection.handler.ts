import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { WithdrawalCompletedEvent } from '../../events/withdrawal-completed.event';
import { TransactionProjectionService } from '../../projections/transaction-projection.service';

/**
 * Event handler to update transaction projection when withdrawal completes.
 */
@EventsHandler(WithdrawalCompletedEvent)
export class WithdrawalCompletedProjectionHandler implements IEventHandler<WithdrawalCompletedEvent> {
  private readonly logger = new Logger(
    WithdrawalCompletedProjectionHandler.name,
  );

  constructor(
    private readonly projectionService: TransactionProjectionService,
  ) {}

  async handle(event: WithdrawalCompletedEvent): Promise<void> {
    try {
      await this.projectionService.updateTransactionCompleted(
        event.aggregateId,
        event.newBalance,
        undefined,
        event.completedAt,
        event.aggregateVersion,
        event.eventId,
        event.timestamp,
      );
    } catch (error: unknown) {
      this.logger.error(
        `[Projection] Failed to update withdrawal projection [txId=${event.aggregateId}]`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}

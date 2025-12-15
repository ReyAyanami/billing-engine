import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { TransactionCompensatedEvent } from '../../events/transaction-compensated.event';
import { TransactionProjectionService } from '../../projections/transaction-projection.service';

/**
 * Event handler to update transaction projection when compensation occurs.
 * Compensation happens when a saga fails partway through and rolls back changes.
 */
@EventsHandler(TransactionCompensatedEvent)
export class TransactionCompensatedProjectionHandler implements IEventHandler<TransactionCompensatedEvent> {
  private readonly logger = new Logger(
    TransactionCompensatedProjectionHandler.name,
  );

  constructor(
    private readonly projectionService: TransactionProjectionService,
  ) {}

  async handle(event: TransactionCompensatedEvent): Promise<void> {
    try {
      await this.projectionService.updateTransactionCompensated(
        event.aggregateId,
        event.reason,
        event.compensationActions,
        event.compensatedAt,
        event.aggregateVersion,
        event.eventId,
        event.timestamp,
      );
    } catch (error: unknown) {
      this.logger.error(
        `[Projection] Failed to update compensated projection [txId=${event.aggregateId}]`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

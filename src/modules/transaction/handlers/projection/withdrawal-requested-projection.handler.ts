import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { WithdrawalRequestedEvent } from '../../events/withdrawal-requested.event';
import { TransactionProjectionService } from '../../projections/transaction-projection.service';
import { TransactionType, TransactionStatus } from '../../transaction.entity';

/**
 * Event handler to update transaction projection when withdrawal is requested.
 * This is separate from the saga coordinator - it only updates the read model.
 */
@EventsHandler(WithdrawalRequestedEvent)
export class WithdrawalRequestedProjectionHandler implements IEventHandler<WithdrawalRequestedEvent> {
  private readonly logger = new Logger(
    WithdrawalRequestedProjectionHandler.name,
  );

  constructor(
    private readonly projectionService: TransactionProjectionService,
  ) {}

  async handle(event: WithdrawalRequestedEvent): Promise<void> {
    try {
      await this.projectionService.createTransactionProjection({
        id: event.aggregateId,
        type: TransactionType.WITHDRAWAL,
        status: TransactionStatus.PENDING,
        amount: event.amount,
        currency: event.currency,
        sourceAccountId: event.accountId,
        destinationAccountId: event.destinationAccountId,
        idempotencyKey: event.idempotencyKey,
        correlationId: event.correlationId,
        requestedAt: event.timestamp,
        aggregateVersion: event.aggregateVersion,
        lastEventId: event.eventId,
        lastEventTimestamp: event.timestamp,
        metadata: event.metadata,
      });
    } catch (error) {
      this.logger.error(
        `[Projection] Failed to create withdrawal projection [txId=${event.aggregateId}, corr=${event.correlationId}]`,
        error.stack,
      );
      // Don't throw - projection failures shouldn't break the saga
    }
  }
}

import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { RefundRequestedEvent } from '../../events/refund-requested.event';
import { TransactionProjectionService } from '../../projections/transaction-projection.service';
import { TransactionStatus, TransactionType } from '../../transaction.entity';

/**
 * Event handler to create transaction projection when refund is requested.
 * Updates the read model for fast queries.
 */
@EventsHandler(RefundRequestedEvent)
export class RefundRequestedProjectionHandler implements IEventHandler<RefundRequestedEvent> {
  private readonly logger = new Logger(RefundRequestedProjectionHandler.name);

  constructor(
    private readonly projectionService: TransactionProjectionService,
  ) {}

  async handle(event: RefundRequestedEvent): Promise<void> {
    try {
      await this.projectionService.createTransactionProjection({
        id: event.aggregateId,
        type: TransactionType.REFUND,
        status: TransactionStatus.PENDING,
        amount: event.refundAmount,
        currency: event.currency,
        sourceAccountId: event.merchantAccountId,
        destinationAccountId: event.customerAccountId,
        idempotencyKey: event.idempotencyKey,
        correlationId: event.correlationId,
        requestedAt: event.timestamp,
        aggregateVersion: event.aggregateVersion,
        lastEventId: event.eventId,
        lastEventTimestamp: event.timestamp,
        metadata: {
          ...event.metadata,
          originalPaymentId: event.originalPaymentId,
          refundMetadata: event.refundMetadata,
        },
      });
    } catch (error: unknown) {
      this.logger.error(
        `[Projection] Failed to create refund projection [txId=${event.aggregateId}, corr=${event.correlationId}]`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

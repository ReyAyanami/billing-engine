import { IEventHandler } from '@nestjs/cqrs';
import { Injectable, Logger } from '@nestjs/common';
import { ProjectionHandler } from '../../../../cqrs/decorators/saga-handler.decorator';
import { TopupRequestedEvent } from '../../events/topup-requested.event';
import { TransactionProjectionService } from '../../projections/transaction-projection.service';
import { TransactionType, TransactionStatus } from '../../transaction.types';

/**
 * Projection handler to update transaction read model when topup is requested.
 *
 * This is separate from the saga coordinator - it only updates the read model.
 * It runs asynchronously and must be idempotent.
 */
@Injectable()
@ProjectionHandler(TopupRequestedEvent)
export class TopupRequestedProjectionHandler implements IEventHandler<TopupRequestedEvent> {
  private readonly logger = new Logger(TopupRequestedProjectionHandler.name);

  constructor(
    private readonly projectionService: TransactionProjectionService,
  ) {}

  async handle(event: TopupRequestedEvent): Promise<void> {
    // Check idempotency: Has this event already been processed?
    const existing = await this.projectionService.findById(
      event.aggregateId as unknown as import('../../../../common/types/branded.types').TransactionId,
    );

    if (existing && existing.lastEventId === event.eventId) {
      this.logger.debug(
        `Skipping duplicate event [txId=${event.aggregateId}, eventId=${event.eventId}]`,
      );
      return; // Already processed
    }

    if (existing && existing.aggregateVersion >= event.aggregateVersion) {
      this.logger.debug(
        `Skipping out-of-order event [txId=${event.aggregateId}, ` +
          `version=${event.aggregateVersion}, current=${existing.aggregateVersion}]`,
      );
      return; // Out of order
    }

    try {
      await this.projectionService.createTransactionProjection({
        id: event.aggregateId,
        type: TransactionType.TOPUP,
        status: TransactionStatus.PENDING,
        currency: event.currency,
        amount: event.amount,
        sourceAccountId: event.sourceAccountId,
        destinationAccountId: event.accountId,
        sourceSignedAmount: `-${event.amount}`, // External account debited
        destinationSignedAmount: `${event.amount}`, // User account credited
        idempotencyKey: event.idempotencyKey,
        correlationId: event.correlationId,
        requestedAt: event.timestamp,
        aggregateVersion: event.aggregateVersion,
        lastEventId: event.eventId,
        lastEventTimestamp: event.timestamp,
        metadata: event.metadata,
      });
    } catch (error: unknown) {
      this.logger.error(
        `[Projection] Failed to create topup projection [txId=${event.aggregateId}, corr=${event.correlationId}]`,
        error instanceof Error ? error.stack : String(error),
      );
      // Re-throw so we can see what's failing
      throw error;
    }
  }
}

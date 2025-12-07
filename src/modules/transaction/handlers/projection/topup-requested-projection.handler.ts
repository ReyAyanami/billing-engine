import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { TopupRequestedEvent } from '../../events/topup-requested.event';
import { TransactionProjectionService } from '../../projections/transaction-projection.service';
import { TransactionType, TransactionStatus } from '../../transaction.entity';

/**
 * Event handler to update transaction projection when topup is requested.
 * This is separate from the saga coordinator - it only updates the read model.
 */
@EventsHandler(TopupRequestedEvent)
export class TopupRequestedProjectionHandler implements IEventHandler<TopupRequestedEvent> {
  private readonly logger = new Logger(TopupRequestedProjectionHandler.name);

  constructor(
    private readonly projectionService: TransactionProjectionService,
  ) {}

  async handle(event: TopupRequestedEvent): Promise<void> {
    this.logger.log(`📊 [Projection] TopupRequested: ${event.aggregateId}`);

    try {
      await this.projectionService.createTransactionProjection({
        id: event.aggregateId,
        type: TransactionType.TOPUP,
        status: TransactionStatus.PENDING,
        amount: event.amount,
        currency: event.currency,
        sourceAccountId: event.sourceAccountId,
        destinationAccountId: event.accountId,
        idempotencyKey: event.idempotencyKey,
        correlationId: event.correlationId,
        requestedAt: event.timestamp,
        aggregateVersion: event.aggregateVersion,
        lastEventId: event.eventId,
        lastEventTimestamp: event.timestamp,
        metadata: event.metadata,
      });

      this.logger.log(`✅ [Projection] Transaction projection created: ${event.aggregateId}`);
    } catch (error) {
      this.logger.error(`❌ [Projection] Failed to create transaction projection`, error);
      // Don't throw - projection failures shouldn't break the saga
    }
  }
}


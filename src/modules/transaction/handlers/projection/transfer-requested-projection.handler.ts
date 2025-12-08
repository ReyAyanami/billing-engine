import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { TransferRequestedEvent } from '../../events/transfer-requested.event';
import { TransactionProjectionService } from '../../projections/transaction-projection.service';
import { TransactionType, TransactionStatus } from '../../transaction.entity';

/**
 * Event handler to update transaction projection when transfer is requested.
 * This is separate from the saga coordinator - it only updates the read model.
 */
@EventsHandler(TransferRequestedEvent)
export class TransferRequestedProjectionHandler implements IEventHandler<TransferRequestedEvent> {
  private readonly logger = new Logger(TransferRequestedProjectionHandler.name);

  constructor(
    private readonly projectionService: TransactionProjectionService,
  ) {}

  async handle(event: TransferRequestedEvent): Promise<void> {
    try {
      await this.projectionService.createTransactionProjection({
        id: event.aggregateId,
        type: TransactionType.TRANSFER_DEBIT, // Using TRANSFER_DEBIT as primary type
        status: TransactionStatus.PENDING,
        amount: event.amount,
        currency: event.currency,
        sourceAccountId: event.sourceAccountId,
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
        `[Projection] Failed to create transfer projection [txId=${event.aggregateId}, corr=${event.correlationId}]`,
        error.stack,
      );
      // Don't throw - projection failures shouldn't break the saga
    }
  }
}

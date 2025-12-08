import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { PaymentCompletedEvent } from '../../events/payment-completed.event';
import { TransactionProjectionService } from '../../projections/transaction-projection.service';

/**
 * Event handler to update transaction projection when payment is completed.
 * Marks the transaction as COMPLETED and records final balances.
 */
@EventsHandler(PaymentCompletedEvent)
export class PaymentCompletedProjectionHandler implements IEventHandler<PaymentCompletedEvent> {
  private readonly logger = new Logger(PaymentCompletedProjectionHandler.name);

  constructor(
    private readonly projectionService: TransactionProjectionService,
  ) {}

  async handle(event: PaymentCompletedEvent): Promise<void> {
    try {
      await this.projectionService.updateTransactionCompleted(
        event.aggregateId,
        event.customerNewBalance, // sourceNewBalance (customer)
        event.merchantNewBalance, // destinationNewBalance (merchant)
        event.completedAt,
        event.aggregateVersion,
        event.eventId,
        event.timestamp,
      );
    } catch (error) {
      this.logger.error(
        `[Projection] Failed to update payment projection [txId=${event.aggregateId}]`,
        error.stack,
      );
    }
  }
}

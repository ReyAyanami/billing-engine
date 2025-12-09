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
    // Race condition mitigation: Retry if projection doesn't exist yet
    const maxRetries = 10;
    const retryDelay = 50;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await this.projectionService.updateTransactionCompleted(
          event.aggregateId,
          event.customerNewBalance,
          event.merchantNewBalance,
          event.completedAt,
          event.aggregateVersion,
          event.eventId,
          event.timestamp,
        );
        return;
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('not found') && attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
          continue;
        }
        this.logger.error(
          `[Projection] Failed to update payment projection [txId=${event.aggregateId}]`,
          error instanceof Error ? error.stack : String(error),
        );
        throw error;
      }
    }
  }
}

import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { PaymentRequestedEvent } from '../../events/payment-requested.event';
import { TransactionProjectionService } from '../../projections/transaction-projection.service';
import { TransactionStatus, TransactionType } from '../../transaction.entity';

/**
 * Event handler to create transaction projection when payment is requested.
 * Updates the read model for fast queries.
 */
@EventsHandler(PaymentRequestedEvent)
export class PaymentRequestedProjectionHandler
  implements IEventHandler<PaymentRequestedEvent>
{
  private readonly logger = new Logger(PaymentRequestedProjectionHandler.name);

  constructor(
    private readonly projectionService: TransactionProjectionService,
  ) {}

  async handle(event: PaymentRequestedEvent): Promise<void> {
    this.logger.log(
      `📊 [Projection] PaymentRequested: ${event.aggregateId}`,
    );
    this.logger.log(`   Customer: ${event.customerAccountId}`);
    this.logger.log(`   Merchant: ${event.merchantAccountId}`);
    this.logger.log(`   Amount: ${event.amount} ${event.currency}`);

    try {
      await this.projectionService.createTransactionProjection({
        id: event.aggregateId,
        type: TransactionType.PAYMENT,
        status: TransactionStatus.PENDING,
        amount: event.amount,
        currency: event.currency,
        sourceAccountId: event.customerAccountId,
        destinationAccountId: event.merchantAccountId,
        idempotencyKey: event.idempotencyKey,
        correlationId: event.correlationId,
        requestedAt: event.timestamp,
        aggregateVersion: event.aggregateVersion,
        lastEventId: event.eventId,
        lastEventTimestamp: event.timestamp,
        metadata: {
          ...event.metadata,
          paymentMetadata: event.paymentMetadata,
        },
      });

      this.logger.log(
        `✅ [Projection] Payment projection created: ${event.aggregateId}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ [Projection] Failed to create payment projection`,
        error,
      );
    }
  }
}


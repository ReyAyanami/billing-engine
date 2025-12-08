import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentCompletedEvent } from '../events/payment-completed.event';
import { Transaction, TransactionStatus } from '../transaction.entity';

@EventsHandler(PaymentCompletedEvent)
export class PaymentCompletedEntityHandler implements IEventHandler<PaymentCompletedEvent> {
  private readonly logger = new Logger(PaymentCompletedEntityHandler.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  async handle(event: PaymentCompletedEvent): Promise<void> {
    this.logger.log(`📝 Completing Transaction entity: ${event.aggregateId}`);

    try {
      // Retry logic: PaymentRequestedEntityHandler might still be creating the record
      const transaction = await this.waitForTransaction(
        event.aggregateId,
        1000,
      );

      if (!transaction) {
        this.logger.error(
          `Transaction not found after retries: ${event.aggregateId}`,
        );
        return;
      }

      transaction.status = TransactionStatus.COMPLETED;
      transaction.completedAt = event.completedAt;
      await this.transactionRepository.save(transaction);

      this.logger.log(`✅ Transaction entity completed: ${event.aggregateId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to complete Transaction entity`, error);
      throw error;
    }
  }

  /**
   * Wait for transaction to be created (with retries)
   * Handles race condition where completion event arrives before creation
   */
  private async waitForTransaction(
    transactionId: string,
    maxWait: number,
  ): Promise<Transaction | null> {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const transaction = await this.transactionRepository.findOne({
        where: { id: transactionId },
      });
      if (transaction) {
        return transaction;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return null;
  }
}

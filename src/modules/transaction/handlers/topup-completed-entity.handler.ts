import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TopupCompletedEvent } from '../events/topup-completed.event';
import { Transaction, TransactionStatus } from '../transaction.entity';

/**
 * Event handler for TopupCompletedEvent.
 * Updates the Transaction entity status to COMPLETED.
 */
@EventsHandler(TopupCompletedEvent)
export class TopupCompletedEntityHandler implements IEventHandler<TopupCompletedEvent> {
  private readonly logger = new Logger(TopupCompletedEntityHandler.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  async handle(event: TopupCompletedEvent): Promise<void> {
    this.logger.log(`📝 Completing Transaction entity: ${event.aggregateId}`);

    try {
      // Retry logic: Handle race condition where completion arrives before creation
      const transaction = await this.waitForTransaction(event.aggregateId, 1000);

      if (!transaction) {
        this.logger.error(`Transaction not found after retries: ${event.aggregateId}`);
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
   */
  private async waitForTransaction(transactionId: string, maxWait: number): Promise<Transaction | null> {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const transaction = await this.transactionRepository.findOne({
        where: { id: transactionId },
      });
      if (transaction) {
        return transaction;
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    return null;
  }
}


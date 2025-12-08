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
      const transaction = await this.transactionRepository.findOne({
        where: { id: event.aggregateId },
      });

      if (!transaction) {
        this.logger.error(`Transaction not found: ${event.aggregateId}`);
        return; // Don't throw - projection might not exist yet
      }

      transaction.status = TransactionStatus.COMPLETED;
      await this.transactionRepository.save(transaction);

      this.logger.log(`✅ Transaction entity completed: ${event.aggregateId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to complete Transaction entity`, error);
      throw error;
    }
  }
}


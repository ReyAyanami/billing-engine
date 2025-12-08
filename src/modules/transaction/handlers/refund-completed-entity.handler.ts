import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RefundCompletedEvent } from '../events/refund-completed.event';
import { Transaction, TransactionStatus } from '../transaction.entity';

@EventsHandler(RefundCompletedEvent)
export class RefundCompletedEntityHandler implements IEventHandler<RefundCompletedEvent> {
  private readonly logger = new Logger(RefundCompletedEntityHandler.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  async handle(event: RefundCompletedEvent): Promise<void> {
    this.logger.log(`📝 Completing Transaction entity: ${event.aggregateId}`);

    try {
      const transaction = await this.transactionRepository.findOne({
        where: { id: event.aggregateId },
      });

      if (!transaction) {
        this.logger.error(`Transaction not found: ${event.aggregateId}`);
        return;
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


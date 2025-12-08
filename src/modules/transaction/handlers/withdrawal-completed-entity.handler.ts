import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WithdrawalCompletedEvent } from '../events/withdrawal-completed.event';
import { Transaction, TransactionStatus } from '../transaction.entity';

@EventsHandler(WithdrawalCompletedEvent)
export class WithdrawalCompletedEntityHandler implements IEventHandler<WithdrawalCompletedEvent> {
  private readonly logger = new Logger(WithdrawalCompletedEntityHandler.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  async handle(event: WithdrawalCompletedEvent): Promise<void> {
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


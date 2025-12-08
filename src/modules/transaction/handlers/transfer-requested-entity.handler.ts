import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransferRequestedEvent } from '../events/transfer-requested.event';
import { Transaction, TransactionType, TransactionStatus } from '../transaction.entity';

@EventsHandler(TransferRequestedEvent)
export class TransferRequestedEntityHandler implements IEventHandler<TransferRequestedEvent> {
  private readonly logger = new Logger(TransferRequestedEntityHandler.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  async handle(event: TransferRequestedEvent): Promise<void> {
    this.logger.log(`📝 Creating Transaction entity: ${event.aggregateId}`);

    try {
      const existing = await this.transactionRepository.findOne({
        where: { id: event.aggregateId },
      });

      if (existing) {
        this.logger.log(`Transaction entity already exists: ${event.aggregateId}`);
        return;
      }

      await this.transactionRepository
        .createQueryBuilder()
        .insert()
        .into(Transaction)
        .values({
          id: event.aggregateId,
          type: TransactionType.TRANSFER_DEBIT,
          status: TransactionStatus.PENDING,
          amount: event.amount,
          currency: event.currency,
          sourceAccountId: event.sourceAccountId,
          destinationAccountId: event.destinationAccountId,
          sourceBalanceBefore: '0',
          sourceBalanceAfter: '0',
          destinationBalanceBefore: '0',
          destinationBalanceAfter: '0',
          idempotencyKey: event.idempotencyKey,
          reference: event.metadata?.reference || 'Transfer',
          metadata: event.metadata || {},
        } as any)
        .execute();

      this.logger.log(`✅ Transaction entity created: ${event.aggregateId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to create Transaction entity`, error);
      throw error;
    }
  }
}


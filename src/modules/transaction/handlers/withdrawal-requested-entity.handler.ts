import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryDeepPartialEntity } from 'typeorm';
import { WithdrawalRequestedEvent } from '../events/withdrawal-requested.event';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
} from '../transaction.entity';

@EventsHandler(WithdrawalRequestedEvent)
export class WithdrawalRequestedEntityHandler implements IEventHandler<WithdrawalRequestedEvent> {
  private readonly logger = new Logger(WithdrawalRequestedEntityHandler.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  async handle(event: WithdrawalRequestedEvent): Promise<void> {
    this.logger.log(`📝 Creating Transaction entity: ${event.aggregateId}`);

    try {
      const existing = await this.transactionRepository.findOne({
        where: { id: event.aggregateId },
      });

      if (existing) {
        this.logger.log(
          `Transaction entity already exists: ${event.aggregateId}`,
        );
        return;
      }

      await this.transactionRepository
        .createQueryBuilder()
        .insert()
        .into(Transaction)
        .values({
          id: event.aggregateId,
          type: TransactionType.WITHDRAWAL,
          status: TransactionStatus.PENDING,
          amount: event.amount,
          currency: event.currency,
          sourceAccountId: event.accountId,
          destinationAccountId: event.destinationAccountId,
          sourceBalanceBefore: '0',
          sourceBalanceAfter: '0',
          destinationBalanceBefore: '0',
          destinationBalanceAfter: '0',
          idempotencyKey: event.idempotencyKey,
          reference: event.metadata?.['reference'] || 'Withdrawal',
          metadata: event.metadata || {},
        } as QueryDeepPartialEntity<Transaction>)
        .execute();

      this.logger.log(`✅ Transaction entity created: ${event.aggregateId}`);
    } catch (error) {
      this.logger.error(
        `❌ Failed to create Transaction entity`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}

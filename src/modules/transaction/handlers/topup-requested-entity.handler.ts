import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryDeepPartialEntity } from 'typeorm';
import { TopupRequestedEvent } from '../events/topup-requested.event';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
} from '../transaction.entity';

/**
 * Event handler for TopupRequestedEvent.
 * Creates the Transaction entity in the transactions table.
 */
@EventsHandler(TopupRequestedEvent)
export class TopupRequestedEntityHandler implements IEventHandler<TopupRequestedEvent> {
  private readonly logger = new Logger(TopupRequestedEntityHandler.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  async handle(event: TopupRequestedEvent): Promise<void> {
    this.logger.log(`📝 Creating Transaction entity: ${event.aggregateId}`);

    try {
      // Check if transaction already exists (idempotency)
      const existing = await this.transactionRepository.findOne({
        where: { id: event.aggregateId },
      });

      if (existing) {
        this.logger.log(
          `Transaction entity already exists: ${event.aggregateId}`,
        );
        return;
      }

      // Insert transaction with explicit ID
      await this.transactionRepository
        .createQueryBuilder()
        .insert()
        .into(Transaction)
        .values({
          id: event.aggregateId,
          type: TransactionType.TOPUP,
          status: TransactionStatus.PENDING,
          amount: event.amount,
          currency: event.currency,
          sourceAccountId: event.sourceAccountId,
          destinationAccountId: event.accountId,
          sourceBalanceBefore: '0',
          sourceBalanceAfter: '0',
          destinationBalanceBefore: '0',
          destinationBalanceAfter: '0',
          idempotencyKey: event.idempotencyKey,
          reference: event.metadata?.reference || 'Topup',
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

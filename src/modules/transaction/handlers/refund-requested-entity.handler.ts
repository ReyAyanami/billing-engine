import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RefundRequestedEvent } from '../events/refund-requested.event';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
} from '../transaction.entity';

@EventsHandler(RefundRequestedEvent)
export class RefundRequestedEntityHandler implements IEventHandler<RefundRequestedEvent> {
  private readonly logger = new Logger(RefundRequestedEntityHandler.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  async handle(event: RefundRequestedEvent): Promise<void> {
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
          type: TransactionType.REFUND,
          status: TransactionStatus.PENDING,
          amount: event.refundAmount,
          currency: event.currency,
          sourceAccountId: event.merchantAccountId,
          destinationAccountId: event.customerAccountId,
          sourceBalanceBefore: '0',
          sourceBalanceAfter: '0',
          destinationBalanceBefore: '0',
          destinationBalanceAfter: '0',
          idempotencyKey: event.idempotencyKey,
          parentTransactionId: event.originalPaymentId,
          reference: event.refundMetadata?.reason || 'Refund',
          metadata: {
            ...event.metadata,
            refundMetadata: event.refundMetadata,
            originalPaymentId: event.originalPaymentId,
          },
        } as any)
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

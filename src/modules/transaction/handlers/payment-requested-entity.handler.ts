import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentRequestedEvent } from '../events/payment-requested.event';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
} from '../transaction.entity';

@EventsHandler(PaymentRequestedEvent)
export class PaymentRequestedEntityHandler implements IEventHandler<PaymentRequestedEvent> {
  private readonly logger = new Logger(PaymentRequestedEntityHandler.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  async handle(event: PaymentRequestedEvent): Promise<void> {
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
          type: TransactionType.PAYMENT,
          status: TransactionStatus.PENDING,
          amount: event.amount,
          currency: event.currency,
          sourceAccountId: event.customerAccountId,
          destinationAccountId: event.merchantAccountId,
          sourceBalanceBefore: '0',
          sourceBalanceAfter: '0',
          destinationBalanceBefore: '0',
          destinationBalanceAfter: '0',
          idempotencyKey: event.idempotencyKey,
          reference: event.metadata?.reference || 'Payment',
          metadata: {
            ...event.metadata,
            paymentMetadata: event.paymentMetadata,
          },
        } as any)
        .execute();

      this.logger.log(`✅ Transaction entity created: ${event.aggregateId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to create Transaction entity`, error);
      throw error;
    }
  }
}

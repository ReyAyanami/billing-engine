import { Injectable } from '@nestjs/common';
import { TransactionStep } from '../transaction-step.interface';
import { TransactionContext } from '../transaction-context';
import { Transaction, TransactionStatus } from '../../transaction.entity';

/**
 * Step: Mark transaction as completed
 */
@Injectable()
export class CompleteTransactionStep extends TransactionStep {
  async execute(context: TransactionContext): Promise<void> {
    const transaction = this.ensure(
      context.transaction,
      'Transaction not created',
    );

    transaction.status = TransactionStatus.COMPLETED;
    transaction.completedAt = new Date();
    
    await context.manager.save(Transaction, transaction);
  }
}


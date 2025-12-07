import { Injectable } from '@nestjs/common';
import { TransactionStep } from '../transaction-step.interface';
import { TransactionContext } from '../transaction-context';
import { Transaction } from '../../transaction.entity';
import { DuplicateTransactionException } from '../../../../common/exceptions/billing.exception';

/**
 * Step: Check for duplicate transactions using idempotency key
 */
@Injectable()
export class CheckIdempotencyStep extends TransactionStep {
  async execute(context: TransactionContext): Promise<void> {
    const existingTransaction = await context.manager
      .getRepository(Transaction)
      .findOne({ where: { idempotencyKey: context.idempotencyKey } });

    if (existingTransaction) {
      throw new DuplicateTransactionException(
        context.idempotencyKey,
        existingTransaction.id,
      );
    }
  }
}


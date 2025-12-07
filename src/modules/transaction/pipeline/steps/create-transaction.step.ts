import { Injectable } from '@nestjs/common';
import { TransactionStep } from '../transaction-step.interface';
import { TransactionContext } from '../transaction-context';
import { Transaction, TransactionStatus } from '../../transaction.entity';

/**
 * Step: Create transaction record
 */
@Injectable()
export class CreateTransactionStep extends TransactionStep {
  async execute(context: TransactionContext): Promise<void> {
    const amountDecimal = this.ensure(
      context.amountDecimal,
      'Amount not calculated',
    );
    const sourceBalanceBefore = this.ensure(
      context.sourceBalanceBefore,
      'Source balance not calculated',
    );
    const sourceBalanceAfter = this.ensure(
      context.sourceBalanceAfter,
      'Source balance not calculated',
    );
    const destinationBalanceBefore = this.ensure(
      context.destinationBalanceBefore,
      'Destination balance not calculated',
    );
    const destinationBalanceAfter = this.ensure(
      context.destinationBalanceAfter,
      'Destination balance not calculated',
    );

    const transaction = context.manager.create(Transaction, {
      idempotencyKey: context.idempotencyKey,
      type: context.type,
      sourceAccountId: context.sourceAccountId,
      destinationAccountId: context.destinationAccountId,
      amount: amountDecimal.toString(),
      currency: context.currency,
      sourceBalanceBefore: sourceBalanceBefore.toString(),
      sourceBalanceAfter: sourceBalanceAfter.toString(),
      destinationBalanceBefore: destinationBalanceBefore.toString(),
      destinationBalanceAfter: destinationBalanceAfter.toString(),
      status: TransactionStatus.PENDING,
      reference: context.reference,
      metadata: context.metadata,
      parentTransactionId: context.parentTransactionId,
    });

    context.transaction = await context.manager.save(Transaction, transaction);
  }
}


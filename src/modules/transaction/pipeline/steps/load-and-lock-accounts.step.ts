import { Injectable } from '@nestjs/common';
import { TransactionStep } from '../transaction-step.interface';
import { TransactionContext } from '../transaction-context';
import { Account } from '../../../account/account.entity';
import { AccountNotFoundException } from '../../../../common/exceptions/billing.exception';

/**
 * Step: Load and lock both source and destination accounts
 */
@Injectable()
export class LoadAndLockAccountsStep extends TransactionStep {
  async execute(context: TransactionContext): Promise<void> {
    // Load and lock source account
    context.sourceAccount = await context.manager
      .getRepository(Account)
      .createQueryBuilder('account')
      .setLock('pessimistic_write')
      .where('account.id = :id', { id: context.sourceAccountId })
      .getOne();

    if (!context.sourceAccount) {
      throw new AccountNotFoundException(context.sourceAccountId);
    }

    // Load and lock destination account
    context.destinationAccount = await context.manager
      .getRepository(Account)
      .createQueryBuilder('account')
      .setLock('pessimistic_write')
      .where('account.id = :id', { id: context.destinationAccountId })
      .getOne();

    if (!context.destinationAccount) {
      throw new AccountNotFoundException(context.destinationAccountId);
    }
  }
}


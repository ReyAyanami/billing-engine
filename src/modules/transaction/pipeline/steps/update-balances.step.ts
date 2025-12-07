import { Injectable } from '@nestjs/common';
import { TransactionStep } from '../transaction-step.interface';
import { TransactionContext } from '../transaction-context';
import { AccountService } from '../../../account/account.service';

/**
 * Step: Update account balances
 */
@Injectable()
export class UpdateBalancesStep extends TransactionStep {
  constructor(private readonly accountService: AccountService) {
    super();
  }

  async execute(context: TransactionContext): Promise<void> {
    const sourceAccount = this.ensure(
      context.sourceAccount,
      'Source account not loaded',
    );
    const destinationAccount = this.ensure(
      context.destinationAccount,
      'Destination account not loaded',
    );
    const sourceBalanceAfter = this.ensure(
      context.sourceBalanceAfter,
      'Source balance not calculated',
    );
    const destinationBalanceAfter = this.ensure(
      context.destinationBalanceAfter,
      'Destination balance not calculated',
    );

    // Update both account balances
    await this.accountService.updateBalance(
      sourceAccount,
      sourceBalanceAfter.toString(),
      context.manager,
    );

    await this.accountService.updateBalance(
      destinationAccount,
      destinationBalanceAfter.toString(),
      context.manager,
    );
  }
}


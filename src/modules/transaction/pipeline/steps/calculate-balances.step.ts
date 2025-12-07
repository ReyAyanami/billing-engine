import { Injectable } from '@nestjs/common';
import { TransactionStep } from '../transaction-step.interface';
import { TransactionContext } from '../transaction-context';
import {
  InvalidOperationException,
  InsufficientBalanceException,
} from '../../../../common/exceptions/billing.exception';
import { AccountType } from '../../../account/account.entity';
import Decimal from 'decimal.js';

/**
 * Step: Calculate balances before and after transaction
 */
@Injectable()
export class CalculateBalancesStep extends TransactionStep {
  async execute(context: TransactionContext): Promise<void> {
    const sourceAccount = this.ensure(
      context.sourceAccount,
      'Source account not loaded',
    );
    const destinationAccount = this.ensure(
      context.destinationAccount,
      'Destination account not loaded',
    );

    // Parse and validate amount
    context.amountDecimal = new Decimal(context.amount);
    if (context.amountDecimal.lessThanOrEqualTo(0)) {
      throw new InvalidOperationException('Amount must be positive');
    }

    // Calculate source balances
    context.sourceBalanceBefore = new Decimal(sourceAccount.balance);
    context.sourceBalanceAfter = context.sourceBalanceBefore.minus(
      context.amountDecimal,
    );

    // Calculate destination balances
    context.destinationBalanceBefore = new Decimal(destinationAccount.balance);
    context.destinationBalanceAfter = context.destinationBalanceBefore.plus(
      context.amountDecimal,
    );

    // Check source balance (only for user accounts unless explicitly skipped)
    if (
      !context.skipSourceBalanceCheck &&
      sourceAccount.accountType === AccountType.USER &&
      context.sourceBalanceAfter.lessThan(0)
    ) {
      throw new InsufficientBalanceException(
        sourceAccount.id,
        context.sourceBalanceBefore.toString(),
        context.amountDecimal.toString(),
      );
    }

    // Check destination balance limits (if set)
    if (
      !context.skipDestinationBalanceCheck &&
      destinationAccount.maxBalance
    ) {
      const maxBalance = new Decimal(destinationAccount.maxBalance);
      if (context.destinationBalanceAfter.greaterThan(maxBalance)) {
        throw new InvalidOperationException(
          `Destination account would exceed maximum balance of ${maxBalance}`,
        );
      }
    }
  }
}


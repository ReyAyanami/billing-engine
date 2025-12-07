import { Injectable } from '@nestjs/common';
import { TransactionStep } from '../transaction-step.interface';
import { TransactionContext } from '../transaction-context';
import { AccountService } from '../../../account/account.service';
import { CurrencyService } from '../../../currency/currency.service';
import { CurrencyMismatchException } from '../../../../common/exceptions/billing.exception';

/**
 * Step: Validate accounts (active status, currency match)
 */
@Injectable()
export class ValidateAccountsStep extends TransactionStep {
  constructor(
    private readonly accountService: AccountService,
    private readonly currencyService: CurrencyService,
  ) {
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

    // Validate accounts are active
    this.accountService.validateAccountActive(sourceAccount);
    this.accountService.validateAccountActive(destinationAccount);

    // Validate currency exists
    await this.currencyService.validateCurrency(context.currency);

    // Validate currency matches
    if (
      sourceAccount.currency !== context.currency ||
      destinationAccount.currency !== context.currency
    ) {
      throw new CurrencyMismatchException(
        `${sourceAccount.currency}/${destinationAccount.currency}`,
        context.currency,
      );
    }
  }
}


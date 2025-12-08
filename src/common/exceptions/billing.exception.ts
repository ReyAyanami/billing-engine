import { HttpException, HttpStatus } from '@nestjs/common';

export class BillingException extends HttpException {
  constructor(
    public readonly code: string,
    message: string,

    public readonly details?: any,
    httpStatus: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super(
      {
        error: {
          code,
          message,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          details,
          timestamp: new Date().toISOString(),
        },
      },
      httpStatus,
    );
  }
}

export class AccountNotFoundException extends BillingException {
  constructor(accountId: string) {
    super(
      'ACCOUNT_NOT_FOUND',
      `Account with ID ${accountId} not found`,
      { accountId },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class InsufficientBalanceException extends BillingException {
  constructor(
    accountId: string,
    availableBalance: string,
    requestedAmount: string,
  ) {
    super(
      'INSUFFICIENT_BALANCE',
      'Account balance is insufficient for this operation',
      { accountId, requestedAmount, availableBalance },
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class InvalidCurrencyException extends BillingException {
  constructor(currency: string) {
    super(
      'INVALID_CURRENCY',
      `Currency ${currency} is not supported or inactive`,
      { currency },
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class InvalidOperationException extends BillingException {
  constructor(message: string, details?: any) {
    super('INVALID_OPERATION', message, details, HttpStatus.BAD_REQUEST);
  }
}

export class DuplicateTransactionException extends BillingException {
  constructor(idempotencyKey: string, existingTransactionId: string) {
    super(
      'DUPLICATE_TRANSACTION',
      'A transaction with this idempotency key already exists',
      { idempotencyKey, existingTransactionId },
      HttpStatus.CONFLICT,
    );
  }
}

export class AccountInactiveException extends BillingException {
  constructor(accountId: string, status: string) {
    super(
      'ACCOUNT_INACTIVE',
      `Account is ${status} and cannot perform transactions`,
      { accountId, status },
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class TransactionNotFoundException extends BillingException {
  constructor(transactionId: string) {
    super(
      'TRANSACTION_NOT_FOUND',
      `Transaction with ID ${transactionId} not found`,
      { transactionId },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class CurrencyMismatchException extends BillingException {
  constructor(accountCurrency: string, transactionCurrency: string) {
    super(
      'CURRENCY_MISMATCH',
      'Transaction currency does not match account currency',
      { accountCurrency, transactionCurrency },
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class RefundException extends BillingException {
  constructor(message: string, details?: any) {
    super('REFUND_ERROR', message, details, HttpStatus.BAD_REQUEST);
  }
}

import { HttpException, HttpStatus } from '@nestjs/common';

export class BillingException extends HttpException {
  constructor(message: string, status: HttpStatus = HttpStatus.BAD_REQUEST) {
    super(message, status);
  }
}

export class AccountNotFoundException extends BillingException {
  constructor(accountId: string) {
    super(`Account not found: ${accountId}`, HttpStatus.NOT_FOUND);
  }
}

export class TransactionNotFoundException extends BillingException {
  constructor(transactionId: string) {
    super(`Transaction not found: ${transactionId}`, HttpStatus.NOT_FOUND);
  }
}

export class InsufficientBalanceException extends BillingException {
  constructor(accountId: string, available: string, required: string) {
    super(
      `Insufficient balance in account ${accountId}. Available: ${available}, Required: ${required}`,
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class CurrencyMismatchException extends BillingException {
  constructor(expected: string, actual: string) {
    super(
      `Currency mismatch. Expected: ${expected}, Got: ${actual}`,
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class InvalidOperationException extends BillingException {
  constructor(message: string) {
    super(message, HttpStatus.BAD_REQUEST);
  }
}

export class DuplicateTransactionException extends BillingException {
  constructor(idempotencyKey: string, existingTransactionId: string) {
    super(
      `Transaction with idempotency key ${idempotencyKey} already exists: ${existingTransactionId}`,
      HttpStatus.CONFLICT,
    );
  }
}

export class AccountInactiveException extends BillingException {
  constructor(accountId: string, status: string) {
    super(
      `Account ${accountId} is not active (current status: ${status})`,
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class RefundException extends BillingException {
  constructor(message: string) {
    super(message, HttpStatus.BAD_REQUEST);
  }
}

export class OptimisticLockException extends BillingException {
  constructor(
    aggregateId: string,
    expectedVersion: number,
    actualVersion: number,
  ) {
    super(
      `Optimistic lock conflict for ${aggregateId}. Expected version: ${expectedVersion}, Actual: ${actualVersion}`,
      HttpStatus.CONFLICT,
    );
  }
}

export class InvariantViolationException extends BillingException {
  constructor(message: string) {
    super(`Invariant violation: ${message}`, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

export class ProjectionOutOfSyncException extends BillingException {
  constructor(aggregateId: string, details: string) {
    super(
      `Projection out of sync for ${aggregateId}: ${details}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

export class InvalidCurrencyException extends BillingException {
  constructor(currency: string) {
    super(`Invalid currency: ${currency}`, HttpStatus.BAD_REQUEST);
  }
}

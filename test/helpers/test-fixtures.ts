/**
 * Test Fixtures with Proper Types
 *
 * Provides type-safe test data builders for creating test fixtures
 * with proper TypeScript types throughout.
 */

import { v4 as uuidv4 } from 'uuid';
import { AccountType } from '../../src/modules/account/account.entity';

/**
 * Account fixture builder
 */
export class AccountFixtureBuilder {
  private data: {
    accountId?: string;
    ownerId: string;
    ownerType: string;
    accountType: AccountType;
    currency: string;
    maxBalance?: string;
    minBalance?: string;
    metadata?: Record<string, string | number | boolean | undefined>;
  };

  constructor() {
    this.data = {
      ownerId: uuidv4(),
      ownerType: 'user',
      accountType: AccountType.USER,
      currency: 'USD',
    };
  }

  withAccountId(accountId: string): this {
    this.data.accountId = accountId;
    return this;
  }

  withOwnerId(ownerId: string): this {
    this.data.ownerId = ownerId;
    return this;
  }

  withOwnerType(ownerType: string): this {
    this.data.ownerType = ownerType;
    return this;
  }

  withAccountType(accountType: AccountType): this {
    this.data.accountType = accountType;
    return this;
  }

  withCurrency(currency: string): this {
    this.data.currency = currency;
    return this;
  }

  withMaxBalance(maxBalance: string): this {
    this.data.maxBalance = maxBalance;
    return this;
  }

  withMinBalance(minBalance: string): this {
    this.data.minBalance = minBalance;
    return this;
  }

  withMetadata(metadata: Record<string, string | number | boolean>): this {
    this.data.metadata = metadata;
    return this;
  }

  build() {
    return {
      ...this.data,
      accountId: this.data.accountId ?? uuidv4(),
    };
  }
}

/**
 * Payment fixture builder
 */
export class PaymentFixtureBuilder {
  private data: {
    customerAccountId: string;
    merchantAccountId: string;
    amount: string;
    currency: string;
    idempotencyKey?: string;
    metadata?: Record<string, string | number | boolean>;
  };

  constructor() {
    this.data = {
      customerAccountId: uuidv4(),
      merchantAccountId: uuidv4(),
      amount: '100.00',
      currency: 'USD',
    };
  }

  withCustomerAccountId(customerAccountId: string): this {
    this.data.customerAccountId = customerAccountId;
    return this;
  }

  withMerchantAccountId(merchantAccountId: string): this {
    this.data.merchantAccountId = merchantAccountId;
    return this;
  }

  withAmount(amount: string): this {
    this.data.amount = amount;
    return this;
  }

  withCurrency(currency: string): this {
    this.data.currency = currency;
    return this;
  }

  withIdempotencyKey(idempotencyKey: string): this {
    this.data.idempotencyKey = idempotencyKey;
    return this;
  }

  withMetadata(metadata: Record<string, string | number | boolean>): this {
    this.data.metadata = metadata;
    return this;
  }

  build() {
    return {
      ...this.data,
      idempotencyKey: this.data.idempotencyKey ?? uuidv4(),
    };
  }
}

/**
 * Refund fixture builder
 */
export class RefundFixtureBuilder {
  private data: {
    originalPaymentId: string;
    merchantAccountId: string;
    customerAccountId: string;
    refundAmount: string;
    currency: string;
    idempotencyKey?: string;
    metadata?: Record<string, string | number | boolean>;
  };

  constructor() {
    this.data = {
      originalPaymentId: uuidv4(),
      merchantAccountId: uuidv4(),
      customerAccountId: uuidv4(),
      refundAmount: '50.00',
      currency: 'USD',
    };
  }

  withOriginalPaymentId(originalPaymentId: string): this {
    this.data.originalPaymentId = originalPaymentId;
    return this;
  }

  withMerchantAccountId(merchantAccountId: string): this {
    this.data.merchantAccountId = merchantAccountId;
    return this;
  }

  withCustomerAccountId(customerAccountId: string): this {
    this.data.customerAccountId = customerAccountId;
    return this;
  }

  withRefundAmount(refundAmount: string): this {
    this.data.refundAmount = refundAmount;
    return this;
  }

  withCurrency(currency: string): this {
    this.data.currency = currency;
    return this;
  }

  withIdempotencyKey(idempotencyKey: string): this {
    this.data.idempotencyKey = idempotencyKey;
    return this;
  }

  withMetadata(metadata: Record<string, string | number | boolean>): this {
    this.data.metadata = metadata;
    return this;
  }

  build() {
    return {
      ...this.data,
      idempotencyKey: this.data.idempotencyKey ?? uuidv4(),
    };
  }
}

/**
 * Transfer fixture builder
 */
export class TransferFixtureBuilder {
  private data: {
    fromAccountId: string;
    toAccountId: string;
    amount: string;
    currency: string;
    idempotencyKey?: string;
    metadata?: Record<string, string | number | boolean>;
  };

  constructor() {
    this.data = {
      fromAccountId: uuidv4(),
      toAccountId: uuidv4(),
      amount: '75.00',
      currency: 'USD',
    };
  }

  withFromAccountId(fromAccountId: string): this {
    this.data.fromAccountId = fromAccountId;
    return this;
  }

  withToAccountId(toAccountId: string): this {
    this.data.toAccountId = toAccountId;
    return this;
  }

  withAmount(amount: string): this {
    this.data.amount = amount;
    return this;
  }

  withCurrency(currency: string): this {
    this.data.currency = currency;
    return this;
  }

  withIdempotencyKey(idempotencyKey: string): this {
    this.data.idempotencyKey = idempotencyKey;
    return this;
  }

  withMetadata(metadata: Record<string, string | number | boolean>): this {
    this.data.metadata = metadata;
    return this;
  }

  build() {
    return {
      ...this.data,
      idempotencyKey: this.data.idempotencyKey ?? uuidv4(),
    };
  }
}

/**
 * Topup fixture builder
 */
export class TopupFixtureBuilder {
  private data: {
    accountId: string;
    amount: string;
    currency: string;
    idempotencyKey?: string;
    metadata?: Record<string, string | number | boolean>;
  };

  constructor() {
    this.data = {
      accountId: uuidv4(),
      amount: '200.00',
      currency: 'USD',
    };
  }

  withAccountId(accountId: string): this {
    this.data.accountId = accountId;
    return this;
  }

  withAmount(amount: string): this {
    this.data.amount = amount;
    return this;
  }

  withCurrency(currency: string): this {
    this.data.currency = currency;
    return this;
  }

  withIdempotencyKey(idempotencyKey: string): this {
    this.data.idempotencyKey = idempotencyKey;
    return this;
  }

  withMetadata(metadata: Record<string, string | number | boolean>): this {
    this.data.metadata = metadata;
    return this;
  }

  build() {
    return {
      ...this.data,
      idempotencyKey: this.data.idempotencyKey ?? uuidv4(),
    };
  }
}

/**
 * Withdrawal fixture builder
 */
export class WithdrawalFixtureBuilder {
  private data: {
    accountId: string;
    amount: string;
    currency: string;
    idempotencyKey?: string;
    metadata?: Record<string, string | number | boolean>;
  };

  constructor() {
    this.data = {
      accountId: uuidv4(),
      amount: '50.00',
      currency: 'USD',
    };
  }

  withAccountId(accountId: string): this {
    this.data.accountId = accountId;
    return this;
  }

  withAmount(amount: string): this {
    this.data.amount = amount;
    return this;
  }

  withCurrency(currency: string): this {
    this.data.currency = currency;
    return this;
  }

  withIdempotencyKey(idempotencyKey: string): this {
    this.data.idempotencyKey = idempotencyKey;
    return this;
  }

  withMetadata(metadata: Record<string, string | number | boolean>): this {
    this.data.metadata = metadata;
    return this;
  }

  build() {
    return {
      ...this.data,
      idempotencyKey: this.data.idempotencyKey ?? uuidv4(),
    };
  }
}

/**
 * Convenience functions for creating fixtures
 */
export const fixtures = {
  account: () => new AccountFixtureBuilder(),
  payment: () => new PaymentFixtureBuilder(),
  refund: () => new RefundFixtureBuilder(),
  transfer: () => new TransferFixtureBuilder(),
  topup: () => new TopupFixtureBuilder(),
  withdrawal: () => new WithdrawalFixtureBuilder(),
};

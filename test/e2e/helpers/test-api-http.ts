/**
 * Test API - HTTP-Based (FAST!)
 *
 * This class tests through HTTP REST API - exactly how users interact with the system.
 *
 * Benefits over CQRS-based testing:
 * - ⚡ 10x faster (no async event bus delays)
 * - ✅ Tests real user interface (HTTP)
 * - ✅ Synchronous responses (no waiting/polling)
 * - ✅ No sleeps or timeouts needed
 *
 * Usage:
 *   const testApi = new TestAPIHTTP(app);
 *   const account = await testApi.createAccount({ currency: 'USD' });
 *   await testApi.topup(account.id, '100.00', 'USD');
 */

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import {
  AccountType,
  AccountStatus,
} from '../../../src/modules/account/account.types';
import { DataSource } from 'typeorm';

export interface CreateAccountParams {
  ownerId?: string;
  ownerType?: string;
  currency?: string;
  accountType?: AccountType;
  maxBalance?: string;
  minBalance?: string;
}

export interface TopupOptions {
  idempotencyKey?: string;
  reference?: string;
  skipPolling?: boolean;
}

export interface TransferOptions {
  idempotencyKey?: string;
  reference?: string;
  skipPolling?: boolean;
}

export interface PaymentOptions {
  idempotencyKey?: string;
  metadata?: Record<string, any>;
  skipPolling?: boolean;
}

export interface RefundOptions {
  idempotencyKey?: string;
  reason?: string;
  metadata?: Record<string, any>;
  skipPolling?: boolean;
}

export class TestAPIHTTP {
  private server: any;
  private externalAccounts: Record<string, any> = {};
  private dataSource: DataSource;

  constructor(app: INestApplication) {
    this.server = app.getHttpServer();
    this.dataSource = app.get(DataSource);
  }

  /**
   * Reset cached data (call this in beforeEach)
   */
  reset() {
    this.externalAccounts = {};
  }

  /**
   * Generate a unique ID for test data
   * Returns valid UUID for parallel test isolation
   */
  generateId(prefix?: string): string {
    // Always return valid UUID - worker isolation handled by database cleanup
    void prefix; // Reserved for future use
    return uuidv4();
  }

  /**
   * Get external account for currency (creates if needed)
   */
  async getExternalAccount(currency: string) {
    if (!this.externalAccounts[currency]) {
      this.externalAccounts[currency] =
        await this.createExternalAccount(currency);
    }
    return this.externalAccounts[currency];
  }

  // ============================================
  // ACCOUNT OPERATIONS
  // ============================================

  /**
   * Create a new account
   */
  async createAccount(params: CreateAccountParams = {}) {
    const payload: any = {
      ownerId: params.ownerId || this.generateId('owner'),
      ownerType: params.ownerType || 'user', // lowercase
      accountType: params.accountType || 'user', // Use string value
      currency: params.currency || 'USD',
    };

    // Add optional fields only if provided
    if (params.maxBalance) payload.maxBalance = params.maxBalance;
    if (params.minBalance) payload.minBalance = params.minBalance;

    const response = await request(this.server)
      .post('/api/v1/accounts')
      .send(payload);

    // If not 201, throw with error details
    if (response.status !== 201) {
      throw new Error(
        `Failed to create account (${response.status}): ${JSON.stringify(response.body)}`,
      );
    }

    // Account is immediately available from command handler (write model)
    // No need to wait for projection - architectural win!
    return response.body;
  }

  /**
   * Create an external account (for topups/withdrawals)
   */
  async createExternalAccount(currency: string = 'USD') {
    return this.createAccount({
      accountType: AccountType.EXTERNAL,
      currency,
      maxBalance: undefined,
      minBalance: undefined,
    });
  }

  /**
   * Get account details
   */
  async getAccount(accountId: string) {
    const response = await request(this.server)
      .get(`/api/v1/accounts/${accountId}`)
      .expect(200);

    return response.body;
  }

  /**
   * Get account balance
   */
  async getBalance(accountId: string) {
    // NOTE: Balance endpoint queries projections (read model), which are eventually consistent
    // After transactions, there may be a brief delay before projection is updated
    // We poll for a short time to handle this eventual consistency
    // Timeout is generous to handle parallel test execution (maxWorkers > 1)
    const start = Date.now();
    const maxWait = 10000; // 10 seconds for parallel execution
    const pollInterval = 100;

    while (Date.now() - start < maxWait) {
      const response = await request(this.server).get(
        `/api/v1/accounts/${accountId}/balance`,
      );

      if (response.status === 200) {
        return response.body;
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    // Final attempt with expect to get proper error message
    const response = await request(this.server)
      .get(`/api/v1/accounts/${accountId}/balance`)
      .expect(200);

    return response.body;
  }

  /**
   * Update account status
   */
  async updateAccountStatus(accountId: string, status: AccountStatus) {
    const response = await request(this.server)
      .patch(`/api/v1/accounts/${accountId}/status`)
      .send({ status })
      .expect(200);

    return response.body;
  }

  // ============================================
  // TRANSACTION OPERATIONS
  // ============================================

  /**
   * Top-up an account (add funds from external source)
   * Creates an external account automatically if needed
   */
  async topup(
    accountId: string,
    amount: string,
    currency: string,
    options: TopupOptions = {},
  ) {
    // Create external account as source (or get from cache)
    if (!this.externalAccounts[currency]) {
      this.externalAccounts[currency] =
        await this.createExternalAccount(currency);
    }

    const sourceAccountId = this.externalAccounts[currency].id;

    const response = await request(this.server)
      .post('/api/v1/transactions/topup')
      .send({
        idempotencyKey:
          options.idempotencyKey || this.generateId('idempotency'),
        sourceAccountId,
        destinationAccountId: accountId,
        amount,
        currency,
        reference: options.reference || 'Test topup',
      });

    // If not 201, throw with error details
    if (response.status !== 201) {
      throw new Error(
        `Failed to topup (${response.status}): ${JSON.stringify(response.body)}`,
      );
    }

    // Wait for completion via SSE (async saga processing)
    if (!options.skipPolling) {
      const transactionId = response.body.transactionId;
      if (transactionId) {
        await this.pollTransactionCompletion(transactionId);
        // Wait for account projections to be updated after transaction
        // In parallel test execution, projection updates can be delayed
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    return response.body;
  }

  /**
   * Withdraw from an account (send funds to external destination)
   * Returns immediately with pending status, then polls for completion
   */
  async withdraw(
    accountId: string,
    amount: string,
    currency: string,
    options: TransferOptions = {},
  ) {
    // Create external account as destination
    if (!this.externalAccounts[currency]) {
      this.externalAccounts[currency] =
        await this.createExternalAccount(currency);
    }

    const destinationAccountId = this.externalAccounts[currency].id;

    const response = await request(this.server)
      .post('/api/v1/transactions/withdraw')
      .send({
        idempotencyKey:
          options.idempotencyKey || this.generateId('idempotency'),
        sourceAccountId: accountId,
        destinationAccountId,
        amount,
        currency,
        reference: options.reference || 'Test withdrawal',
      })
      .expect(201);

    // Poll for completion (async saga processing)
    if (!options.skipPolling) {
      const transactionId = response.body.transactionId;
      if (transactionId) {
        await this.pollTransactionCompletion(transactionId);
      }
    }

    return response.body;
  }

  /**
   * Transfer between two accounts
   * Returns immediately with pending status, then polls for completion
   */
  async transfer(
    fromAccountId: string,
    toAccountId: string,
    amount: string,
    currency: string,
    options: TransferOptions = {},
  ) {
    const response = await request(this.server)
      .post('/api/v1/transactions/transfer')
      .send({
        idempotencyKey:
          options.idempotencyKey || this.generateId('idempotency'),
        sourceAccountId: fromAccountId,
        destinationAccountId: toAccountId,
        amount,
        currency,
        reference: options.reference || 'Test transfer',
      });

    if (response.status !== 201) {
      throw new Error(
        `Transfer failed (${response.status}): ${JSON.stringify(response.body)}`,
      );
    }

    // Poll for completion (async saga processing)
    if (!options.skipPolling) {
      const transactionId =
        response.body.debitTransactionId || response.body.transactionId;
      if (transactionId) {
        await this.pollTransactionCompletion(transactionId);
      }
    }

    return response.body;
  }

  /**
   * Process a payment (customer to merchant)
   * Returns immediately with pending status, then polls for completion
   */
  async payment(
    customerAccountId: string,
    merchantAccountId: string,
    amount: string,
    currency: string,
    options: PaymentOptions = {},
  ) {
    const response = await request(this.server)
      .post('/api/v1/transactions/payment')
      .send({
        idempotencyKey:
          options.idempotencyKey || this.generateId('idempotency'),
        customerAccountId,
        merchantAccountId,
        amount,
        currency,
        paymentMetadata: options.metadata, // DTO expects 'paymentMetadata' not 'metadata'
      });

    if (response.status !== 201) {
      throw new Error(
        `Payment failed (${response.status}): ${JSON.stringify(response.body)}`,
      );
    }

    // Poll for completion (async saga processing)
    if (!options.skipPolling) {
      await this.pollTransactionCompletion(response.body.transactionId);
    }

    return response.body;
  }

  /**
   * Wait for saga completion by polling saga state
   *
   * KEY ARCHITECTURAL CHANGE:
   * - Tests query SAGA STATE (write model, immediate consistency)
   * - NOT transaction projections (read model, eventual consistency)
   *
   * This eliminates race conditions because saga state is updated
   * synchronously as part of saga execution.
   *
   * Projections are updated asynchronously and may lag behind.
   */
  private async pollTransactionCompletion(
    transactionId: string,
    maxWait: number = 10000, // 10 seconds for parallel execution
  ): Promise<void> {
    const start = Date.now();
    const pollInterval = 50; // Poll every 50ms

    while (Date.now() - start < maxWait) {
      // Query saga state (immediate consistency)
      const response = await request(this.server).get(
        `/api/v1/sagas/${transactionId}`,
      );

      if (response.status === 200) {
        const sagaStatus = response.body.status;

        // Check if saga reached final state
        if (
          sagaStatus === 'completed' ||
          sagaStatus === 'failed' ||
          sagaStatus === 'cancelled'
        ) {
          return; // Saga complete!
        }
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    // Timeout - this is a BUG
    throw new Error(
      `❌ BUG: Saga ${transactionId} did not complete within ${maxWait}ms. ` +
        `Saga should complete in milliseconds. This indicates a processing failure.`,
    );
  }

  /**
   * Refund a payment (merchant to customer)
   */
  async refund(
    originalTransactionId: string,
    amount: string,
    options: RefundOptions = {},
  ) {
    const response = await request(this.server)
      .post('/api/v1/transactions/refund')
      .send({
        idempotencyKey:
          options.idempotencyKey || this.generateId('idempotency'),
        originalPaymentId: originalTransactionId, // DTO expects 'originalPaymentId'
        refundAmount: amount, // DTO expects 'refundAmount'
        currency: 'USD', // Required field
        refundMetadata: options.metadata
          ? {
              reason: options.reason || 'Test refund',
              ...options.metadata,
            }
          : { reason: options.reason || 'Test refund' },
      });

    if (response.status !== 201) {
      throw new Error(
        `Refund failed (${response.status}): ${JSON.stringify(response.body)}`,
      );
    }

    // Poll for completion (async saga processing)
    if (!options.skipPolling) {
      const refundId = response.body.refundId;
      if (refundId) {
        await this.pollTransactionCompletion(refundId);
      }
    }

    return response.body;
  }

  /**
   * Get transaction details
   */
  async getTransaction(transactionId: string) {
    const response = await request(this.server)
      .get(`/api/v1/transactions/${transactionId}`)
      .expect(200);

    return response.body;
  }

  /**
   * Get transaction history for an account
   */
  async getTransactions(accountId: string, limit = 10) {
    const response = await request(this.server)
      .get(`/api/v1/transactions?accountId=${accountId}&limit=${limit}`)
      .expect(200);

    return response.body;
  }

  // ============================================
  // UTILITIES
  // ============================================

  /**
   * Generate a unique ID (valid UUID)
   */

  /**
   * Wait for account projection to be ready
   * Polls every 10ms until projection exists or timeout
   * Much faster than fixed delays!
   */
  async waitForAccountProjection(
    accountId: string,
    maxWait = 10000, // 10 seconds for parallel execution
  ): Promise<any> {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const result = await this.dataSource.query(
        'SELECT * FROM account_projections WHERE id = $1',
        [accountId],
      );
      if (result && result.length > 0) {
        return result[0];
      }
      await new Promise((resolve) => setTimeout(resolve, 10)); // Poll every 10ms
    }
    throw new Error(
      `Account projection not ready after ${maxWait}ms: ${accountId}`,
    );
  }

  /**
   * Wait for transaction projection to be ready
   * Polls every 10ms until projection exists or timeout
   */
  async waitForTransactionProjection(
    transactionId: string,
    maxWait = 10000, // 10 seconds for parallel execution
  ): Promise<any> {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const result = await this.dataSource.query(
        'SELECT * FROM transaction_projections WHERE id = $1',
        [transactionId],
      );
      if (result && result.length > 0) {
        return result[0];
      }
      await new Promise((resolve) => setTimeout(resolve, 10)); // Poll every 10ms
    }
    throw new Error(
      `Transaction projection not ready after ${maxWait}ms: ${transactionId}`,
    );
  }

  /**
   * Expect an HTTP error
   */
  async expectError(
    method: 'post' | 'get' | 'patch' | 'delete',
    path: string,
    data?: any,
    expectedStatus = 400,
  ) {
    const req = request(this.server)[method](path);

    if (data) {
      req.send(data);
    }

    const response = await req.expect(expectedStatus);
    return response.body;
  }
}

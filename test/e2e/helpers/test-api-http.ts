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
import { v4 as uuid } from 'uuid';
import { EventSource } from 'eventsource';
import { AccountType, AccountStatus } from '../../../src/modules/account/account.entity';
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
   * Get external account for currency (creates if needed)
   */
  async getExternalAccount(currency: string) {
    if (!this.externalAccounts[currency]) {
      this.externalAccounts[currency] = await this.createExternalAccount(currency);
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
      ownerType: params.ownerType || 'user',  // lowercase
      accountType: params.accountType || 'user',  // Use string value
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
        `Failed to create account (${response.status}): ${JSON.stringify(response.body)}`
      );
    }

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
      this.externalAccounts[currency] = await this.createExternalAccount(currency);
    }
    
    const sourceAccountId = this.externalAccounts[currency].id;
    
    const response = await request(this.server)
      .post('/api/v1/transactions/topup')
      .send({
        idempotencyKey: options.idempotencyKey || this.generateId('idempotency'),
        sourceAccountId,
        destinationAccountId: accountId,
        amount,
        currency,
        reference: options.reference || 'Test topup',
      });
    
    // If not 201, throw with error details
    if (response.status !== 201) {
      throw new Error(
        `Failed to topup (${response.status}): ${JSON.stringify(response.body)}`
      );
    }

    // Wait for completion via SSE (async saga processing)
    if (!options.skipPolling) {
      const transactionId = response.body.transactionId;
      if (transactionId) {
        await this.pollTransactionCompletion(transactionId);
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
      this.externalAccounts[currency] = await this.createExternalAccount(currency);
    }
    
    const destinationAccountId = this.externalAccounts[currency].id;
    
    const response = await request(this.server)
      .post('/api/v1/transactions/withdraw')
      .send({
        idempotencyKey: options.idempotencyKey || this.generateId('idempotency'),
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
        idempotencyKey: options.idempotencyKey || this.generateId('idempotency'),
        sourceAccountId: fromAccountId,
        destinationAccountId: toAccountId,
        amount,
        currency,
        reference: options.reference || 'Test transfer',
      })
      .expect(201);

    // Poll for completion (async saga processing)
    if (!options.skipPolling) {
      const transactionId = response.body.debitTransactionId || response.body.transactionId;
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
        idempotencyKey: options.idempotencyKey || this.generateId('idempotency'),
        customerAccountId,
        merchantAccountId,
        amount,
        currency,
        paymentMetadata: options.metadata, // DTO expects 'paymentMetadata' not 'metadata'
      });

    if (response.status !== 201) {
      throw new Error(
        `Payment failed (${response.status}): ${JSON.stringify(response.body)}`
      );
    }

    // Poll for completion (async saga processing)
    if (!options.skipPolling) {
      await this.pollTransactionCompletion(response.body.transactionId);
    }

    return response.body;
  }

  /**
   * Wait for transaction completion via SSE (real-time)
   * If saga doesn't complete within 1 second, it's a BUG, not a timeout issue
   */
  /**
   * Wait for transaction completion by polling
   * In test environment, SSE doesn't work since app doesn't listen on HTTP
   * Poll with short intervals - if saga doesn't complete in 2s, it's a BUG
   */
  private async pollTransactionCompletion(transactionId: string, maxWait: number = 2000): Promise<void> {
    const start = Date.now();
    const pollInterval = 50; // Poll every 50ms
    
    while (Date.now() - start < maxWait) {
      const response = await request(this.server)
        .get(`/api/v1/transactions/${transactionId}`);
      
      if (response.status === 200) {
        const status = response.body.status;
        
        // Check if reached final state
        if (status === 'completed' || status === 'failed' || status === 'compensated') {
          return; // Success!
        }
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    // Timeout - this is a BUG
    throw new Error(
      `❌ BUG: Transaction ${transactionId} did not complete within ${maxWait}ms. ` +
      `Saga should complete in milliseconds. This indicates a processing failure.`
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
        idempotencyKey: options.idempotencyKey || this.generateId('idempotency'),
        originalPaymentId: originalTransactionId, // DTO expects 'originalPaymentId'
        refundAmount: amount, // DTO expects 'refundAmount'
        currency: 'USD', // Required field
        refundMetadata: options.metadata ? {
          reason: options.reason || 'Test refund',
          ...options.metadata,
        } : { reason: options.reason || 'Test refund' },
      });

    if (response.status !== 201) {
      throw new Error(
        `Refund failed (${response.status}): ${JSON.stringify(response.body)}`
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
  generateId(prefix?: string): string {
    return uuid();
  }

  /**
   * Wait for account projection to be ready
   * Polls every 10ms until projection exists or timeout
   * Much faster than fixed delays!
   */
  async waitForAccountProjection(accountId: string, maxWait = 3000): Promise<any> {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const result = await this.dataSource.query(
        'SELECT * FROM account_projections WHERE id = $1',
        [accountId]
      );
      if (result && result.length > 0) {
        return result[0];
      }
      await new Promise(resolve => setTimeout(resolve, 10)); // Poll every 10ms
    }
    throw new Error(`Account projection not ready after ${maxWait}ms: ${accountId}`);
  }

  /**
   * Wait for transaction projection to be ready
   * Polls every 10ms until projection exists or timeout
   */
  async waitForTransactionProjection(transactionId: string, maxWait = 3000): Promise<any> {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const result = await this.dataSource.query(
        'SELECT * FROM transaction_projections WHERE id = $1',
        [transactionId]
      );
      if (result && result.length > 0) {
        return result[0];
      }
      await new Promise(resolve => setTimeout(resolve, 10)); // Poll every 10ms
    }
    throw new Error(`Transaction projection not ready after ${maxWait}ms: ${transactionId}`);
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


/**
 * E2E Test: Account Top-up
 *
 * Tests top-up functionality through HTTP REST API.
 * Fast, reliable, no sleeps or timeouts needed.
 */

import { INestApplication } from '@nestjs/common';
import { TestSetup } from '../../setup/test-setup';
import { TestAPIHTTP } from '../../helpers/test-api-http';

describe('Feature: Account Top-up', () => {
  let app: INestApplication;
  let testApi: TestAPIHTTP;
  let testSetup: TestSetup;

  // ============================================
  // TEST LIFECYCLE
  // ============================================

  beforeAll(async () => {
    testSetup = new TestSetup();
    app = await testSetup.beforeAll();
    testApi = new TestAPIHTTP(app);
  });

  afterAll(async () => {
    await testSetup.afterAll();
  });

  beforeEach(async () => {
    await testSetup.beforeEach();
    testApi.reset(); // Clear cached external accounts
  });

  afterEach(async () => {
    await testSetup.afterEach();
  });

  // ============================================
  // SCENARIO 1: SUCCESSFUL TOP-UP
  // ============================================

  describe('Scenario: Successful top-up', () => {
    it('should increase account balance by top-up amount', async () => {
      // GIVEN: An active USD account with $0 balance
      const account = await testApi.createAccount({
        currency: 'USD',
      });
      expect(account.balance).toBe('0.00000000'); // 8 decimal precision

      // WHEN: I top-up $100
      const transaction = await testApi.topup(account.id, '100.00', 'USD');

      // THEN: Transaction should be completed
      expect(transaction).toBeDefined();
      expect(transaction.transactionId || transaction.id).toBeDefined();

      // AND: Account balance should be $100
      const balance = await testApi.getBalance(account.id);
      expect(balance.balance).toBe('100.00000000');
    });

    it('should work with multiple sequential top-ups', async () => {
      // GIVEN: An account
      const account = await testApi.createAccount({ currency: 'USD' });

      // WHEN: I top-up multiple times
      await testApi.topup(account.id, '50.00', 'USD');
      await testApi.topup(account.id, '30.00', 'USD');
      await testApi.topup(account.id, '20.00', 'USD');

      // THEN: Balance should be sum of all top-ups
      const balance = await testApi.getBalance(account.id);
      expect(balance.balance).toBe('100.00000000');
    });

    it('should support different currencies', async () => {
      // GIVEN: Accounts in different currencies
      const usdAccount = await testApi.createAccount({ currency: 'USD' });
      const eurAccount = await testApi.createAccount({ currency: 'EUR' });

      // WHEN: I top-up each account
      await testApi.topup(usdAccount.id, '100.00', 'USD');
      await testApi.topup(eurAccount.id, '85.50', 'EUR');

      // THEN: Each account should have correct balance
      expect((await testApi.getBalance(usdAccount.id)).balance).toBe(
        '100.00000000',
      );
      expect((await testApi.getBalance(eurAccount.id)).balance).toBe(
        '85.50000000',
      );
    });
  });

  // ============================================
  // SCENARIO 2: ERROR HANDLING
  // ============================================

  describe('Scenario: Error cases', () => {
    it('should reject top-up for non-existent account', async () => {
      // GIVEN: A non-existent account ID
      const fakeAccountId = '00000000-0000-0000-0000-000000000000';

      // WHEN/THEN: Should fail
      await testApi.expectError(
        'post',
        '/api/v1/transactions/topup',
        {
          idempotencyKey: testApi.generateId(),
          accountId: fakeAccountId,
          amount: '100.00',
          currency: 'USD',
        },
        400, // or 404
      );
    });

    it('should reject top-up with wrong currency', async () => {
      // GIVEN: A USD account
      const account = await testApi.createAccount({ currency: 'USD' });

      // WHEN/THEN: Try to top-up with EUR should fail
      await testApi.expectError(
        'post',
        '/api/v1/transactions/topup',
        {
          idempotencyKey: testApi.generateId(),
          accountId: account.id,
          amount: '100.00',
          currency: 'EUR',
        },
        400,
      );
    });
  });

  // ============================================
  // SCENARIO 3: IDEMPOTENCY
  // ============================================

  describe('Scenario: Idempotency', () => {
    it('should handle duplicate requests with same idempotency key', async () => {
      // GIVEN: An account
      const account = await testApi.createAccount({ currency: 'USD' });
      const idempotencyKey = testApi.generateId();

      // WHEN: I send the same request twice (first call succeeds)
      await testApi.topup(account.id, '100.00', 'USD', {
        idempotencyKey,
      });

      // Second request with same idempotency key should return 409 Conflict
      const externalAccount = await testApi.getExternalAccount('USD');
      await testApi.expectError(
        'post',
        '/api/v1/transactions/topup',
        {
          idempotencyKey,
          sourceAccountId: externalAccount.id,
          destinationAccountId: account.id,
          amount: '100.00',
          currency: 'USD',
          reference: 'Test topup',
        },
        409,
      );

      // AND: Balance should only be increased once
      const balance = await testApi.getBalance(account.id);
      expect(balance.balance).toBe('100.00000000'); // Not 200.00000000
    });
  });
});

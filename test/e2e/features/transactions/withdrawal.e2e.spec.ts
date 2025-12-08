/**
 * E2E Test: Account Withdrawal
 * 
 * Tests withdrawal functionality through HTTP REST API.
 * Fast, reliable, no sleeps or timeouts needed.
 */

import { INestApplication } from '@nestjs/common';
import { TestSetup } from '../../setup/test-setup';
import { TestAPIHTTP } from '../../helpers/test-api-http';

describe('Feature: Account Withdrawal', () => {
  let app: INestApplication;
  let testApi: TestAPIHTTP;

  // ============================================
  // TEST LIFECYCLE
  // ============================================

  beforeAll(async () => {
    app = await TestSetup.beforeAll();
    testApi = new TestAPIHTTP(app);
  });

  afterAll(async () => {
    await TestSetup.afterAll();
  });

  beforeEach(async () => {
    await TestSetup.beforeEach();
    testApi.reset();
  });

  afterEach(async () => {
    await TestSetup.afterEach();
  });

  // ============================================
  // SCENARIO 1: SUCCESSFUL WITHDRAWAL
  // ============================================

  describe('Scenario: Successful withdrawal', () => {
    it('should decrease account balance by withdrawal amount', async () => {
      // GIVEN: An account with $100 balance
      const account = await testApi.createAccount({ currency: 'USD' });
      await testApi.topup(account.id, '100.00', 'USD');
      
      const balanceBefore = await testApi.getBalance(account.id);
      expect(balanceBefore.balance).toBe('100.00000000');

      // WHEN: I withdraw $30
      const transaction = await testApi.withdraw(account.id, '30.00', 'USD');

      // THEN: Transaction should be completed
      expect(transaction).toBeDefined();
      expect(transaction.transactionId || transaction.id).toBeDefined();

      // AND: Account balance should be $70
      const balanceAfter = await testApi.getBalance(account.id);
      expect(balanceAfter.balance).toBe('70.00000000');
    });

    it('should work with multiple sequential withdrawals', async () => {
      // GIVEN: An account with $100
      const account = await testApi.createAccount({ currency: 'USD' });
      await testApi.topup(account.id, '100.00', 'USD');

      // WHEN: I withdraw multiple times
      await testApi.withdraw(account.id, '20.00', 'USD');
      await testApi.withdraw(account.id, '30.00', 'USD');
      await testApi.withdraw(account.id, '10.00', 'USD');

      // THEN: Balance should be $40 ($100 - $60)
      const balance = await testApi.getBalance(account.id);
      expect(balance.balance).toBe('40.00000000');
    });

    it('should support different currencies', async () => {
      // GIVEN: Accounts in different currencies with funds
      const usdAccount = await testApi.createAccount({ currency: 'USD' });
      const eurAccount = await testApi.createAccount({ currency: 'EUR' });
      
      await testApi.topup(usdAccount.id, '100.00', 'USD');
      await testApi.topup(eurAccount.id, '85.50', 'EUR');

      // WHEN: I withdraw from each
      await testApi.withdraw(usdAccount.id, '25.00', 'USD');
      await testApi.withdraw(eurAccount.id, '10.50', 'EUR');

      // THEN: Each account should have correct balance
      expect((await testApi.getBalance(usdAccount.id)).balance).toBe('75.00000000');
      expect((await testApi.getBalance(eurAccount.id)).balance).toBe('75.00000000');
    });

    it('should allow withdrawing entire balance', async () => {
      // GIVEN: An account with $50
      const account = await testApi.createAccount({ currency: 'USD' });
      await testApi.topup(account.id, '50.00', 'USD');

      // WHEN: I withdraw all funds
      await testApi.withdraw(account.id, '50.00', 'USD');

      // THEN: Balance should be $0
      const balance = await testApi.getBalance(account.id);
      expect(balance.balance).toBe('0.00000000');
    });
  });

  // ============================================
  // SCENARIO 2: ERROR HANDLING
  // ============================================

  describe('Scenario: Error cases', () => {
    it('should reject withdrawal from non-existent account', async () => {
      // GIVEN: A non-existent account ID
      const fakeAccountId = '00000000-0000-0000-0000-000000000000';

      // WHEN/THEN: Should fail
      await testApi.expectError(
        'post',
        '/api/v1/transactions/withdraw',
        {
          idempotencyKey: testApi.generateId(),
          sourceAccountId: fakeAccountId,
          destinationAccountId: testApi.generateId(),
          amount: '50.00',
          currency: 'USD',
        },
        400,
      );
    });

    it('should reject withdrawal with wrong currency', async () => {
      // GIVEN: A USD account with funds
      const account = await testApi.createAccount({ currency: 'USD' });
      await testApi.topup(account.id, '100.00', 'USD');

      // WHEN/THEN: Try to withdraw with EUR should fail
      await testApi.expectError(
        'post',
        '/api/v1/transactions/withdraw',
        {
          idempotencyKey: testApi.generateId(),
          sourceAccountId: account.id,
          destinationAccountId: testApi.generateId(),
          amount: '50.00',
          currency: 'EUR',
        },
        400,
      );
    });

    it('should reject withdrawal exceeding balance', async () => {
      // GIVEN: An account with $50
      const account = await testApi.createAccount({ currency: 'USD' });
      await testApi.topup(account.id, '50.00', 'USD');

      // WHEN/THEN: Try to withdraw $100 should fail
      const externalAccount = await testApi.getExternalAccount('USD');
      await testApi.expectError(
        'post',
        '/api/v1/transactions/withdraw',
        {
          idempotencyKey: testApi.generateId(),
          sourceAccountId: account.id,
          destinationAccountId: externalAccount.id,
          amount: '100.00',
          currency: 'USD',
        },
        400,
      );
    });

    it('should reject withdrawal from account with zero balance', async () => {
      // GIVEN: An account with $0
      const account = await testApi.createAccount({ currency: 'USD' });

      // WHEN/THEN: Try to withdraw should fail
      const externalAccount = await testApi.getExternalAccount('USD');
      await testApi.expectError(
        'post',
        '/api/v1/transactions/withdraw',
        {
          idempotencyKey: testApi.generateId(),
          sourceAccountId: account.id,
          destinationAccountId: externalAccount.id,
          amount: '10.00',
          currency: 'USD',
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
      // GIVEN: An account with $100
      const account = await testApi.createAccount({ currency: 'USD' });
      await testApi.topup(account.id, '100.00', 'USD');
      const idempotencyKey = testApi.generateId();

      // WHEN: I send the same withdrawal request twice
      await testApi.withdraw(account.id, '30.00', 'USD', { idempotencyKey });

      // Second request should return 409 Conflict
      const externalAccount = await testApi.getExternalAccount('USD');
      await testApi.expectError(
        'post',
        '/api/v1/transactions/withdraw',
        {
          idempotencyKey,
          sourceAccountId: account.id,
          destinationAccountId: externalAccount.id,
          amount: '30.00',
          currency: 'USD',
          reference: 'Test withdrawal',
        },
        409,
      );

      // AND: Balance should only be decreased once
      const balance = await testApi.getBalance(account.id);
      expect(balance.balance).toBe('70.00000000'); // Not 40.00000000
    });
  });
});


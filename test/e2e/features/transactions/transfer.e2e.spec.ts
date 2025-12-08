/**
 * E2E Test: Account Transfer
 * 
 * Tests transfer functionality through HTTP REST API.
 * Fast, reliable, no sleeps or timeouts needed.
 */

import { INestApplication } from '@nestjs/common';
import { TestSetup } from '../../setup/test-setup';
import { TestAPIHTTP } from '../../helpers/test-api-http';

describe('Feature: Account Transfer', () => {
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
  // SCENARIO 1: SUCCESSFUL TRANSFER
  // ============================================

  describe('Scenario: Successful transfer', () => {
    it('should transfer funds between two accounts', async () => {
      // GIVEN: Two accounts, Alice with $100 and Bob with $0
      const alice = await testApi.createAccount({ currency: 'USD' });
      const bob = await testApi.createAccount({ currency: 'USD' });
      
      await testApi.topup(alice.id, '100.00', 'USD');

      // WHEN: Alice transfers $30 to Bob
      const transaction = await testApi.transfer(
        alice.id,
        bob.id,
        '30.00',
        'USD',
      );

      // THEN: Transaction should be completed
      expect(transaction).toBeDefined();
      expect(transaction.debitTransactionId || transaction.transactionId || transaction.id).toBeDefined();

      // AND: Alice should have $70
      const aliceBalance = await testApi.getBalance(alice.id);
      expect(aliceBalance.balance).toBe('70.00000000');

      // AND: Bob should have $30
      const bobBalance = await testApi.getBalance(bob.id);
      expect(bobBalance.balance).toBe('30.00000000');
    });

    it('should work with multiple sequential transfers', async () => {
      // GIVEN: Three accounts with funds
      const alice = await testApi.createAccount({ currency: 'USD' });
      const bob = await testApi.createAccount({ currency: 'USD' });
      const charlie = await testApi.createAccount({ currency: 'USD' });
      
      await testApi.topup(alice.id, '100.00', 'USD');

      // WHEN: Alice transfers to Bob, Bob transfers to Charlie
      await testApi.transfer(alice.id, bob.id, '50.00', 'USD');
      await testApi.transfer(bob.id, charlie.id, '20.00', 'USD');

      // THEN: Balances should be correct
      expect((await testApi.getBalance(alice.id)).balance).toBe('50.00000000');
      expect((await testApi.getBalance(bob.id)).balance).toBe('30.00000000');
      expect((await testApi.getBalance(charlie.id)).balance).toBe('20.00000000');
    });

    it('should support different currencies', async () => {
      // GIVEN: USD and EUR account pairs
      const aliceUSD = await testApi.createAccount({ currency: 'USD' });
      const bobUSD = await testApi.createAccount({ currency: 'USD' });
      const aliceEUR = await testApi.createAccount({ currency: 'EUR' });
      const bobEUR = await testApi.createAccount({ currency: 'EUR' });
      
      await testApi.topup(aliceUSD.id, '100.00', 'USD');
      await testApi.topup(aliceEUR.id, '85.50', 'EUR');

      // WHEN: Transfer in each currency
      await testApi.transfer(aliceUSD.id, bobUSD.id, '25.00', 'USD');
      await testApi.transfer(aliceEUR.id, bobEUR.id, '10.50', 'EUR');

      // THEN: Each should have correct balances
      expect((await testApi.getBalance(aliceUSD.id)).balance).toBe('75.00000000');
      expect((await testApi.getBalance(bobUSD.id)).balance).toBe('25.00000000');
      expect((await testApi.getBalance(aliceEUR.id)).balance).toBe('75.00000000');
      expect((await testApi.getBalance(bobEUR.id)).balance).toBe('10.50000000');
    });

    it('should allow transferring entire balance', async () => {
      // GIVEN: Alice with $50, Bob with $0
      const alice = await testApi.createAccount({ currency: 'USD' });
      const bob = await testApi.createAccount({ currency: 'USD' });
      
      await testApi.topup(alice.id, '50.00', 'USD');

      // WHEN: Alice transfers all funds to Bob
      await testApi.transfer(alice.id, bob.id, '50.00', 'USD');

      // THEN: Alice should have $0, Bob should have $50
      expect((await testApi.getBalance(alice.id)).balance).toBe('0.00000000');
      expect((await testApi.getBalance(bob.id)).balance).toBe('50.00000000');
    });
  });

  // ============================================
  // SCENARIO 2: ERROR HANDLING
  // ============================================

  describe('Scenario: Error cases', () => {
    it('should reject transfer from non-existent account', async () => {
      // GIVEN: A valid destination account
      const bob = await testApi.createAccount({ currency: 'USD' });
      const fakeAccountId = '00000000-0000-0000-0000-000000000000';

      // WHEN/THEN: Transfer from fake account should fail with 404
      await testApi.expectError(
        'post',
        '/api/v1/transactions/transfer',
        {
          idempotencyKey: testApi.generateId(),
          sourceAccountId: fakeAccountId,
          destinationAccountId: bob.id,
          amount: '50.00',
          currency: 'USD',
        },
        404,
      );
    });

    it('should reject transfer to non-existent account', async () => {
      // GIVEN: A valid source account with funds
      const alice = await testApi.createAccount({ currency: 'USD' });
      await testApi.topup(alice.id, '100.00', 'USD');
      const fakeAccountId = '00000000-0000-0000-0000-000000000000';

      // WHEN/THEN: Transfer to fake account should fail with 404
      await testApi.expectError(
        'post',
        '/api/v1/transactions/transfer',
        {
          idempotencyKey: testApi.generateId(),
          sourceAccountId: alice.id,
          destinationAccountId: fakeAccountId,
          amount: '50.00',
          currency: 'USD',
        },
        404,
      );
    });

    it('should reject transfer with currency mismatch', async () => {
      // GIVEN: USD and EUR accounts
      const aliceUSD = await testApi.createAccount({ currency: 'USD' });
      const bobEUR = await testApi.createAccount({ currency: 'EUR' });
      
      await testApi.topup(aliceUSD.id, '100.00', 'USD');

      // WHEN/THEN: Transfer between different currencies should fail
      await testApi.expectError(
        'post',
        '/api/v1/transactions/transfer',
        {
          idempotencyKey: testApi.generateId(),
          sourceAccountId: aliceUSD.id,
          destinationAccountId: bobEUR.id,
          amount: '50.00',
          currency: 'USD',
        },
        400,
      );
    });

    it('should reject transfer exceeding balance', async () => {
      // GIVEN: Alice with $50
      const alice = await testApi.createAccount({ currency: 'USD' });
      const bob = await testApi.createAccount({ currency: 'USD' });
      
      await testApi.topup(alice.id, '50.00', 'USD');

      // WHEN/THEN: Try to transfer $100 should fail
      await testApi.expectError(
        'post',
        '/api/v1/transactions/transfer',
        {
          idempotencyKey: testApi.generateId(),
          sourceAccountId: alice.id,
          destinationAccountId: bob.id,
          amount: '100.00',
          currency: 'USD',
        },
        400,
      );
    });

    it('should reject transfer from account with zero balance', async () => {
      // GIVEN: Alice with $0
      const alice = await testApi.createAccount({ currency: 'USD' });
      const bob = await testApi.createAccount({ currency: 'USD' });

      // WHEN/THEN: Try to transfer should fail
      await testApi.expectError(
        'post',
        '/api/v1/transactions/transfer',
        {
          idempotencyKey: testApi.generateId(),
          sourceAccountId: alice.id,
          destinationAccountId: bob.id,
          amount: '10.00',
          currency: 'USD',
        },
        400,
      );
    });

    it('should reject transfer to same account', async () => {
      // GIVEN: An account with funds
      const alice = await testApi.createAccount({ currency: 'USD' });
      await testApi.topup(alice.id, '100.00', 'USD');

      // WHEN/THEN: Try to transfer to self should fail
      await testApi.expectError(
        'post',
        '/api/v1/transactions/transfer',
        {
          idempotencyKey: testApi.generateId(),
          sourceAccountId: alice.id,
          destinationAccountId: alice.id,
          amount: '50.00',
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
      // GIVEN: Two accounts, Alice with $100
      const alice = await testApi.createAccount({ currency: 'USD' });
      const bob = await testApi.createAccount({ currency: 'USD' });
      
      await testApi.topup(alice.id, '100.00', 'USD');
      const idempotencyKey = testApi.generateId();

      // WHEN: I send the same transfer request twice
      await testApi.transfer(alice.id, bob.id, '30.00', 'USD', {
        idempotencyKey,
      });

      // Second request should return 409 Conflict
      await testApi.expectError(
        'post',
        '/api/v1/transactions/transfer',
        {
          idempotencyKey,
          sourceAccountId: alice.id,
          destinationAccountId: bob.id,
          amount: '30.00',
          currency: 'USD',
          reference: 'Test transfer',
        },
        409,
      );

      // AND: Balances should only change once
      expect((await testApi.getBalance(alice.id)).balance).toBe('70.00000000');
      expect((await testApi.getBalance(bob.id)).balance).toBe('30.00000000');
    });
  });
});


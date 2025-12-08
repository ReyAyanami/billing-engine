/**
 * E2E Test: Refund
 * 
 * Tests refund functionality (reversing payments) through HTTP REST API.
 * Fast, reliable, no sleeps or timeouts needed.
 */

import { INestApplication } from '@nestjs/common';
import { TestSetup } from '../../setup/test-setup';
import { TestAPIHTTP } from '../../helpers/test-api-http';

describe('Feature: Refund', () => {
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
    testApi.reset();
  });

  afterEach(async () => {
    await testSetup.afterEach();
  });

  // ============================================
  // SCENARIO 1: SUCCESSFUL REFUND
  // ============================================

  describe('Scenario: Successful full refund', () => {
    it('should refund entire payment amount', async () => {
      // GIVEN: Customer paid merchant $50
      const customer = await testApi.createAccount({ currency: 'USD' });
      const merchant = await testApi.createAccount({ currency: 'USD' });
      
      await testApi.topup(customer.id, '100.00', 'USD');
      const payment = await testApi.payment(
        customer.id,
        merchant.id,
        '50.00',
        'USD',
      );
      
      const paymentId = payment.transactionId || payment.id;

      // Verify balances after payment
      expect((await testApi.getBalance(customer.id)).balance).toBe('50.00000000');
      expect((await testApi.getBalance(merchant.id)).balance).toBe('50.00000000');

      // WHEN: Merchant refunds the full amount
      const refund = await testApi.refund(paymentId, '50.00');

      // THEN: Refund should be completed
      expect(refund).toBeDefined();
      expect(refund.refundId || refund.transactionId || refund.id).toBeDefined();

      // AND: Customer should have original amount back
      expect((await testApi.getBalance(customer.id)).balance).toBe('100.00000000');
      
      // AND: Merchant should have $0
      expect((await testApi.getBalance(merchant.id)).balance).toBe('0.00000000');
    });

    it.skip('should handle refund without specifying amount (full refund)', async () => {
      // TODO: Implement optional refund amount (full refund when not specified)
      // GIVEN: A completed payment
      const customer = await testApi.createAccount({ currency: 'USD' });
      const merchant = await testApi.createAccount({ currency: 'USD' });
      
      await testApi.topup(customer.id, '100.00', 'USD');
      const payment = await testApi.payment(
        customer.id,
        merchant.id,
        '75.00',
        'USD',
      );

      // WHEN: Refund without amount (should refund full amount)
      const refund = await testApi.refund(
        payment.transactionId || payment.id,
        undefined,  // No amount = full refund
      );

      // THEN: Full amount should be refunded
      expect(refund).toBeDefined();
      expect((await testApi.getBalance(customer.id)).balance).toBe('100.00000000');
      expect((await testApi.getBalance(merchant.id)).balance).toBe('0.00000000');
    });
  });

  // ============================================
  // SCENARIO 2: PARTIAL REFUND
  // ============================================

  describe('Scenario: Partial refund', () => {
    it('should refund part of payment amount', async () => {
      // GIVEN: Customer paid merchant $100
      const customer = await testApi.createAccount({ currency: 'USD' });
      const merchant = await testApi.createAccount({ currency: 'USD' });
      
      await testApi.topup(customer.id, '200.00', 'USD');
      const payment = await testApi.payment(
        customer.id,
        merchant.id,
        '100.00',
        'USD',
      );

      // WHEN: Merchant refunds $30
      await testApi.refund(payment.transactionId || payment.id, '30.00');

      // THEN: Customer should have $130 ($100 original + $30 refund)
      expect((await testApi.getBalance(customer.id)).balance).toBe('130.00000000');
      
      // AND: Merchant should have $70 ($100 - $30)
      expect((await testApi.getBalance(merchant.id)).balance).toBe('70.00000000');
    });

    it('should allow multiple partial refunds', async () => {
      // GIVEN: Customer paid merchant $100
      const customer = await testApi.createAccount({ currency: 'USD' });
      const merchant = await testApi.createAccount({ currency: 'USD' });
      
      await testApi.topup(customer.id, '200.00', 'USD');
      const payment = await testApi.payment(
        customer.id,
        merchant.id,
        '100.00',
        'USD',
      );
      
      const paymentId = payment.transactionId || payment.id;

      // WHEN: Multiple partial refunds
      await testApi.refund(paymentId, '20.00', { reason: 'First partial refund' });
      await testApi.refund(paymentId, '30.00', { reason: 'Second partial refund' });

      // THEN: Customer should have $150 ($100 + $20 + $30)
      expect((await testApi.getBalance(customer.id)).balance).toBe('150.00000000');
      
      // AND: Merchant should have $50 ($100 - $20 - $30)
      expect((await testApi.getBalance(merchant.id)).balance).toBe('50.00000000');
    });
  });

  // ============================================
  // SCENARIO 3: ERROR HANDLING
  // ============================================

  describe('Scenario: Error cases', () => {
    it('should reject refund for non-existent transaction', async () => {
      // GIVEN: A non-existent transaction ID
      const fakeTransactionId = '00000000-0000-0000-0000-000000000000';

      // WHEN/THEN: Refund should fail
      await testApi.expectError(
        'post',
        '/api/v1/transactions/refund',
        {
          idempotencyKey: testApi.generateId(),
          originalTransactionId: fakeTransactionId,
          amount: '50.00',
        },
        400,
      );
    });

    it('should reject refund exceeding payment amount', async () => {
      // GIVEN: Customer paid merchant $50
      const customer = await testApi.createAccount({ currency: 'USD' });
      const merchant = await testApi.createAccount({ currency: 'USD' });
      
      await testApi.topup(customer.id, '100.00', 'USD');
      const payment = await testApi.payment(
        customer.id,
        merchant.id,
        '50.00',
        'USD',
      );

      // WHEN/THEN: Try to refund $100 should fail
      await testApi.expectError(
        'post',
        '/api/v1/transactions/refund',
        {
          idempotencyKey: testApi.generateId(),
          originalTransactionId: payment.transactionId || payment.id,
          amount: '100.00',
        },
        400,
      );
    });

    it('should reject refund when merchant has insufficient balance', async () => {
      // GIVEN: Customer paid merchant $50, merchant withdrew all funds
      const customer = await testApi.createAccount({ currency: 'USD' });
      const merchant = await testApi.createAccount({ currency: 'USD' });
      
      await testApi.topup(customer.id, '100.00', 'USD');
      const payment = await testApi.payment(
        customer.id,
        merchant.id,
        '50.00',
        'USD',
      );
      
      // Merchant withdraws all funds
      await testApi.withdraw(merchant.id, '50.00', 'USD');

      // WHEN/THEN: Try to refund should fail (merchant has $0)
      await testApi.expectError(
        'post',
        '/api/v1/transactions/refund',
        {
          idempotencyKey: testApi.generateId(),
          originalTransactionId: payment.transactionId || payment.id,
          amount: '50.00',
        },
        400,
      );
    });

    it('should reject refund of already fully refunded payment', async () => {
      // GIVEN: A payment that was fully refunded
      const customer = await testApi.createAccount({ currency: 'USD' });
      const merchant = await testApi.createAccount({ currency: 'USD' });
      
      await testApi.topup(customer.id, '100.00', 'USD');
      const payment = await testApi.payment(
        customer.id,
        merchant.id,
        '50.00',
        'USD',
      );
      
      const paymentId = payment.transactionId || payment.id;
      
      // Full refund
      await testApi.refund(paymentId, '50.00');

      // WHEN/THEN: Try to refund again should fail
      await testApi.expectError(
        'post',
        '/api/v1/transactions/refund',
        {
          idempotencyKey: testApi.generateId(),
          originalTransactionId: paymentId,
          amount: '10.00',
        },
        400,
      );
    });
  });

  // ============================================
  // SCENARIO 4: REFUND WITH METADATA
  // ============================================

  describe('Scenario: Refund with metadata', () => {
    it('should include refund reason and metadata', async () => {
      // GIVEN: A completed payment
      const customer = await testApi.createAccount({ currency: 'USD' });
      const merchant = await testApi.createAccount({ currency: 'USD' });
      
      await testApi.topup(customer.id, '100.00', 'USD');
      const payment = await testApi.payment(
        customer.id,
        merchant.id,
        '50.00',
        'USD',
      );

      // WHEN: Refund with reason and metadata
      const refund = await testApi.refund(
        payment.transactionId || payment.id,
        '50.00',
        {
          reason: 'Customer not satisfied',
          metadata: {
            supportTicket: 'TICKET-12345',
            approvedBy: 'manager@example.com',
          },
        },
      );

      // THEN: Refund should be completed
      expect(refund).toBeDefined();
      
      // AND: Balances should be correct
      expect((await testApi.getBalance(customer.id)).balance).toBe('100.00000000');
      expect((await testApi.getBalance(merchant.id)).balance).toBe('0.00000000');
    });
  });

  // ============================================
  // SCENARIO 5: IDEMPOTENCY
  // ============================================

  describe('Scenario: Idempotency', () => {
    it('should handle duplicate refund requests with same idempotency key', async () => {
      // GIVEN: A completed payment
      const customer = await testApi.createAccount({ currency: 'USD' });
      const merchant = await testApi.createAccount({ currency: 'USD' });
      
      await testApi.topup(customer.id, '100.00', 'USD');
      const payment = await testApi.payment(
        customer.id,
        merchant.id,
        '50.00',
        'USD',
      );
      
      const idempotencyKey = testApi.generateId();

      // WHEN: I send the same refund request twice
      await testApi.refund(payment.transactionId || payment.id, '50.00', {
        idempotencyKey,
      });

      // Second request should return 409 Conflict
      await testApi.expectError(
        'post',
        '/api/v1/transactions/refund',
        {
          idempotencyKey,
          originalPaymentId: payment.transactionId || payment.id,
          refundAmount: '50.00',
          currency: 'USD',
        },
        409,
      );

      // AND: Balances should only change once
      expect((await testApi.getBalance(customer.id)).balance).toBe('100.00000000');
      expect((await testApi.getBalance(merchant.id)).balance).toBe('0.00000000');
    });
  });
});


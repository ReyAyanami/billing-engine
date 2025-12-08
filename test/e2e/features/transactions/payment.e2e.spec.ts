/**
 * E2E Test: Payment
 *
 * Tests payment functionality (Customer to Merchant) through HTTP REST API.
 * Fast, reliable, no sleeps or timeouts needed.
 */

import { INestApplication } from '@nestjs/common';
import { TestSetup } from '../../setup/test-setup';
import { TestAPIHTTP } from '../../helpers/test-api-http';

describe('Feature: Payment', () => {
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
  // SCENARIO 1: SUCCESSFUL PAYMENT
  // ============================================

  describe('Scenario: Successful payment', () => {
    it('should process payment from customer to merchant', async () => {
      // GIVEN: Customer with $100 and merchant with $0
      const customer = await testApi.createAccount({ currency: 'USD' });
      const merchant = await testApi.createAccount({ currency: 'USD' });

      await testApi.topup(customer.id, '100.00', 'USD');

      // WHEN: Customer pays merchant $30
      const transaction = await testApi.payment(
        customer.id,
        merchant.id,
        '30.00',
        'USD',
      );

      // THEN: Transaction should be completed
      expect(transaction).toBeDefined();
      expect(transaction.transactionId || transaction.id).toBeDefined();

      // AND: Customer should have $70
      const customerBalance = await testApi.getBalance(customer.id);
      expect(customerBalance.balance).toBe('70.00000000');

      // AND: Merchant should have $30
      const merchantBalance = await testApi.getBalance(merchant.id);
      expect(merchantBalance.balance).toBe('30.00000000');
    });

    it('should work with multiple sequential payments', async () => {
      // GIVEN: Customer with $100 and merchant with $0
      const customer = await testApi.createAccount({ currency: 'USD' });
      const merchant = await testApi.createAccount({ currency: 'USD' });

      await testApi.topup(customer.id, '100.00', 'USD');

      // WHEN: Customer makes multiple payments
      await testApi.payment(customer.id, merchant.id, '20.00', 'USD');
      await testApi.payment(customer.id, merchant.id, '30.00', 'USD');
      await testApi.payment(customer.id, merchant.id, '10.00', 'USD');

      // THEN: Balances should be correct
      expect((await testApi.getBalance(customer.id)).balance).toBe(
        '40.00000000',
      );
      expect((await testApi.getBalance(merchant.id)).balance).toBe(
        '60.00000000',
      );
    });

    it('should support different currencies', async () => {
      // GIVEN: USD and EUR customer-merchant pairs
      const customerUSD = await testApi.createAccount({ currency: 'USD' });
      const merchantUSD = await testApi.createAccount({ currency: 'USD' });
      const customerEUR = await testApi.createAccount({ currency: 'EUR' });
      const merchantEUR = await testApi.createAccount({ currency: 'EUR' });

      await testApi.topup(customerUSD.id, '100.00', 'USD');
      await testApi.topup(customerEUR.id, '85.50', 'EUR');

      // WHEN: Payments in each currency
      await testApi.payment(customerUSD.id, merchantUSD.id, '25.00', 'USD');
      await testApi.payment(customerEUR.id, merchantEUR.id, '10.50', 'EUR');

      // THEN: Each should have correct balances
      expect((await testApi.getBalance(customerUSD.id)).balance).toBe(
        '75.00000000',
      );
      expect((await testApi.getBalance(merchantUSD.id)).balance).toBe(
        '25.00000000',
      );
      expect((await testApi.getBalance(customerEUR.id)).balance).toBe(
        '75.00000000',
      );
      expect((await testApi.getBalance(merchantEUR.id)).balance).toBe(
        '10.50000000',
      );
    });

    it('should include payment metadata', async () => {
      // GIVEN: Customer and merchant
      const customer = await testApi.createAccount({ currency: 'USD' });
      const merchant = await testApi.createAccount({ currency: 'USD' });

      await testApi.topup(customer.id, '100.00', 'USD');

      // WHEN: Payment with metadata
      const transaction = await testApi.payment(
        customer.id,
        merchant.id,
        '99.99',
        'USD',
        {
          metadata: {
            orderId: 'ORDER-12345',
            description: 'Premium subscription',
          },
        },
      );

      // THEN: Transaction should be created
      expect(transaction).toBeDefined();

      // AND: Balances should be updated
      expect((await testApi.getBalance(customer.id)).balance).toBe(
        '0.01000000',
      );
      expect((await testApi.getBalance(merchant.id)).balance).toBe(
        '99.99000000',
      );
    });
  });

  // ============================================
  // SCENARIO 2: ERROR HANDLING
  // ============================================

  describe('Scenario: Error cases', () => {
    it('should reject payment from non-existent customer', async () => {
      // GIVEN: A valid merchant
      const merchant = await testApi.createAccount({ currency: 'USD' });
      const fakeCustomerId = '00000000-0000-0000-0000-000000000000';

      // WHEN/THEN: Payment from fake customer should fail with 404
      await testApi.expectError(
        'post',
        '/api/v1/transactions/payment',
        {
          idempotencyKey: testApi.generateId(),
          customerAccountId: fakeCustomerId,
          merchantAccountId: merchant.id,
          amount: '50.00',
          currency: 'USD',
        },
        404, // Account not found
      );
    });

    it('should reject payment to non-existent merchant', async () => {
      // GIVEN: A valid customer with funds
      const customer = await testApi.createAccount({ currency: 'USD' });
      await testApi.topup(customer.id, '100.00', 'USD');
      const fakeMerchantId = '00000000-0000-0000-0000-000000000000';

      // WHEN/THEN: Payment to fake merchant should fail with 404
      await testApi.expectError(
        'post',
        '/api/v1/transactions/payment',
        {
          idempotencyKey: testApi.generateId(),
          customerAccountId: customer.id,
          merchantAccountId: fakeMerchantId,
          amount: '50.00',
          currency: 'USD',
        },
        404, // Account not found
      );
    });

    it('should reject payment with currency mismatch', async () => {
      // GIVEN: USD customer and EUR merchant
      const customerUSD = await testApi.createAccount({ currency: 'USD' });
      const merchantEUR = await testApi.createAccount({ currency: 'EUR' });

      await testApi.topup(customerUSD.id, '100.00', 'USD');

      // WHEN/THEN: Payment between different currencies should fail
      await testApi.expectError(
        'post',
        '/api/v1/transactions/payment',
        {
          idempotencyKey: testApi.generateId(),
          customerAccountId: customerUSD.id,
          merchantAccountId: merchantEUR.id,
          amount: '50.00',
          currency: 'USD',
        },
        400,
      );
    });

    it('should reject payment exceeding customer balance', async () => {
      // GIVEN: Customer with $50
      const customer = await testApi.createAccount({ currency: 'USD' });
      const merchant = await testApi.createAccount({ currency: 'USD' });

      await testApi.topup(customer.id, '50.00', 'USD');

      // WHEN/THEN: Try to pay $100 should fail
      await testApi.expectError(
        'post',
        '/api/v1/transactions/payment',
        {
          idempotencyKey: testApi.generateId(),
          customerAccountId: customer.id,
          merchantAccountId: merchant.id,
          amount: '100.00',
          currency: 'USD',
        },
        400,
      );
    });

    it('should reject payment from account with zero balance', async () => {
      // GIVEN: Customer with $0
      const customer = await testApi.createAccount({ currency: 'USD' });
      const merchant = await testApi.createAccount({ currency: 'USD' });

      // WHEN/THEN: Try to pay should fail
      await testApi.expectError(
        'post',
        '/api/v1/transactions/payment',
        {
          idempotencyKey: testApi.generateId(),
          customerAccountId: customer.id,
          merchantAccountId: merchant.id,
          amount: '10.00',
          currency: 'USD',
        },
        400,
      );
    });

    it('should reject payment to same account', async () => {
      // GIVEN: An account with funds
      const account = await testApi.createAccount({ currency: 'USD' });
      await testApi.topup(account.id, '100.00', 'USD');

      // WHEN/THEN: Try to pay self should fail
      await testApi.expectError(
        'post',
        '/api/v1/transactions/payment',
        {
          idempotencyKey: testApi.generateId(),
          customerAccountId: account.id,
          merchantAccountId: account.id,
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
      // GIVEN: Customer with $100 and merchant
      const customer = await testApi.createAccount({ currency: 'USD' });
      const merchant = await testApi.createAccount({ currency: 'USD' });

      await testApi.topup(customer.id, '100.00', 'USD');
      const idempotencyKey = testApi.generateId();

      // WHEN: I send the same payment request twice
      await testApi.payment(customer.id, merchant.id, '30.00', 'USD', {
        idempotencyKey,
      });

      // Second request should return 409 Conflict
      await testApi.expectError(
        'post',
        '/api/v1/transactions/payment',
        {
          idempotencyKey,
          customerAccountId: customer.id,
          merchantAccountId: merchant.id,
          amount: '30.00',
          currency: 'USD',
        },
        409,
      );

      // AND: Balances should only change once
      expect((await testApi.getBalance(customer.id)).balance).toBe(
        '70.00000000',
      );
      expect((await testApi.getBalance(merchant.id)).balance).toBe(
        '30.00000000',
      );
    });
  });
});

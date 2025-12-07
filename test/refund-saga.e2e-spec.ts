import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { v4 as uuidv4 } from 'uuid';
import { CommandBus } from '@nestjs/cqrs';
import { CreateAccountCommand } from '../src/modules/account/commands/create-account.command';
import { PaymentCommand } from '../src/modules/transaction/commands/payment.command';
import { RefundCommand } from '../src/modules/transaction/commands/refund.command';
import { AccountProjectionService } from '../src/modules/account/projections/account-projection.service';
import { TransactionProjectionService } from '../src/modules/transaction/projections/transaction-projection.service';
import { AccountType } from '../src/modules/account/account.entity';
import { TransactionStatus, TransactionType } from '../src/modules/transaction/transaction.entity';
import Decimal from 'decimal.js';

/**
 * E2E Test Suite for Refund Saga
 * 
 * This test verifies the complete refund saga flow:
 * 1. Create customer and merchant accounts
 * 2. Process a payment (customer → merchant)
 * 3. Process a refund (merchant → customer)
 * 4. Verify balances are updated correctly
 * 5. Verify refund links to original payment
 * 6. Verify metadata is preserved
 * 7. Verify projections are updated
 */
describe('Refund Saga E2E', () => {
  let app: INestApplication;
  let commandBus: CommandBus;
  let accountProjectionService: AccountProjectionService;
  let transactionProjectionService: TransactionProjectionService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    commandBus = app.get<CommandBus>(CommandBus);
    accountProjectionService = app.get<AccountProjectionService>(AccountProjectionService);
    transactionProjectionService = app.get<TransactionProjectionService>(TransactionProjectionService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Complete Refund Flow', () => {
    it('should process payment and then refund successfully', async () => {
      const correlationId = uuidv4();
      
      // Step 1: Create customer account with funds
      const customerAccountId = uuidv4();
      const createCustomerCommand = new CreateAccountCommand(
        customerAccountId,
        'customer-user-1',
        'USER',
        AccountType.USER,
        'USD',
        correlationId,
        'test-e2e',
      );
      
      await commandBus.execute(createCustomerCommand);
      
      // Wait for projection to be created
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      // Step 2: Create merchant account
      const merchantAccountId = uuidv4();
      const createMerchantCommand = new CreateAccountCommand(
        merchantAccountId,
        'merchant-1',
        'BUSINESS',
        AccountType.USER,
        'USD',
        correlationId,
        'test-e2e',
      );
      
      await commandBus.execute(createMerchantCommand);
      
      // Wait for projection
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      // Step 3: Create EXTERNAL account for funding customer
      const externalAccountId = uuidv4();
      const createExternalCommand = new CreateAccountCommand(
        externalAccountId,
        'external-funding',
        'SYSTEM',
        AccountType.EXTERNAL,
        'USD',
        correlationId,
        'test-e2e',
      );
      
      await commandBus.execute(createExternalCommand);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      // Step 4: Fund customer account with a topup (using old service method for simplicity)
      // In a real scenario, we'd use TopupCommand, but for this test we'll manually update balance
      // Actually, let's just create the payment with a funded customer account by using the UpdateBalanceCommand
      const { UpdateBalanceCommand } = require('../src/modules/account/commands/update-balance.command');
      const fundCommand = new UpdateBalanceCommand(
        customerAccountId,
        '1000.00',
        'CREDIT',
        'Initial funding for test',
        undefined,
        correlationId,
        'test-e2e',
      );
      
      await commandBus.execute(fundCommand);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      // Verify customer has funds
      let customerAccount = await accountProjectionService.findById(customerAccountId);
      expect(customerAccount).toBeDefined();
      expect(new Decimal(customerAccount!.balance).toNumber()).toBe(1000);
      
      // Step 5: Process a payment (customer → merchant)
      const paymentId = uuidv4();
      const paymentAmount = '250.00';
      const paymentCommand = new PaymentCommand(
        paymentId,
        customerAccountId,
        merchantAccountId,
        paymentAmount,
        'USD',
        uuidv4(), // idempotencyKey
        {
          orderId: 'ORDER-12345',
          invoiceId: 'INV-67890',
          description: 'Premium subscription',
        },
        correlationId,
        'test-e2e',
      );
      
      await commandBus.execute(paymentCommand);
      
      // Wait for saga to complete
      await new Promise((resolve) => setTimeout(resolve, 3000));
      
      // Verify payment completed
      const paymentProjection = await transactionProjectionService.findById(paymentId);
      expect(paymentProjection).toBeDefined();
      expect(paymentProjection!.type).toBe(TransactionType.PAYMENT);
      expect(paymentProjection!.status).toBe(TransactionStatus.COMPLETED);
      expect(paymentProjection!.amount).toBe(paymentAmount);
      expect(paymentProjection!.sourceAccountId).toBe(customerAccountId);
      expect(paymentProjection!.destinationAccountId).toBe(merchantAccountId);
      
      // Verify payment metadata
      expect(paymentProjection!.metadata).toBeDefined();
      expect(paymentProjection!.metadata!['orderId']).toBe('ORDER-12345');
      expect(paymentProjection!.metadata!['invoiceId']).toBe('INV-67890');
      
      // Verify balances after payment
      customerAccount = await accountProjectionService.findById(customerAccountId);
      const merchantAccount = await accountProjectionService.findById(merchantAccountId);
      
      expect(new Decimal(customerAccount!.balance).toNumber()).toBe(750); // 1000 - 250
      expect(new Decimal(merchantAccount!.balance).toNumber()).toBe(250); // 0 + 250
      
      // Step 6: Process a refund (merchant → customer)
      const refundId = uuidv4();
      const refundAmount = '100.00'; // Partial refund
      const refundCommand = new RefundCommand(
        refundId,
        paymentId, // Link to original payment
        refundAmount,
        'USD',
        uuidv4(), // idempotencyKey
        {
          reason: 'Customer returned product',
          refundType: 'partial',
          notes: 'Partial refund for damaged item',
        },
        correlationId,
        'test-e2e',
      );
      
      await commandBus.execute(refundCommand);
      
      // Wait for saga to complete
      await new Promise((resolve) => setTimeout(resolve, 3000));
      
      // Step 7: Verify refund completed
      const refundProjection = await transactionProjectionService.findById(refundId);
      expect(refundProjection).toBeDefined();
      expect(refundProjection!.type).toBe(TransactionType.REFUND);
      expect(refundProjection!.status).toBe(TransactionStatus.COMPLETED);
      expect(refundProjection!.amount).toBe(refundAmount);
      expect(refundProjection!.sourceAccountId).toBe(merchantAccountId); // Merchant is source
      expect(refundProjection!.destinationAccountId).toBe(customerAccountId); // Customer is destination
      
      // Verify refund links to original payment
      expect(refundProjection!.metadata).toBeDefined();
      expect(refundProjection!.metadata!['originalPaymentId']).toBe(paymentId);
      
      // Verify refund metadata
      expect(refundProjection!.metadata!['refundMetadata']).toBeDefined();
      expect(refundProjection!.metadata!['refundMetadata']['reason']).toBe('Customer returned product');
      expect(refundProjection!.metadata!['refundMetadata']['refundType']).toBe('partial');
      
      // Step 8: Verify final balances
      const finalCustomerAccount = await accountProjectionService.findById(customerAccountId);
      const finalMerchantAccount = await accountProjectionService.findById(merchantAccountId);
      
      expect(new Decimal(finalCustomerAccount!.balance).toNumber()).toBe(850); // 750 + 100
      expect(new Decimal(finalMerchantAccount!.balance).toNumber()).toBe(150); // 250 - 100
      
      // Step 9: Verify balance flow
      // Initial: Customer 1000, Merchant 0
      // After Payment: Customer 750, Merchant 250
      // After Refund: Customer 850, Merchant 150
      // ✅ Correct!
      
      console.log('✅ Refund saga completed successfully!');
      console.log(`   Payment: ${paymentAmount} (${customerAccountId} → ${merchantAccountId})`);
      console.log(`   Refund: ${refundAmount} (${merchantAccountId} → ${customerAccountId})`);
      console.log(`   Final Balances: Customer ${finalCustomerAccount!.balance}, Merchant ${finalMerchantAccount!.balance}`);
    }, 30000); // 30 second timeout for complete flow
    
    it('should handle full refund correctly', async () => {
      const correlationId = uuidv4();
      
      // Create accounts
      const customerAccountId = uuidv4();
      const merchantAccountId = uuidv4();
      const externalAccountId = uuidv4();
      
      await commandBus.execute(new CreateAccountCommand(
        customerAccountId,
        'customer-user-2',
        'USER',
        AccountType.USER,
        'USD',
        correlationId,
        'test-e2e',
      ));
      
      await commandBus.execute(new CreateAccountCommand(
        merchantAccountId,
        'merchant-2',
        'BUSINESS',
        AccountType.USER,
        'USD',
        correlationId,
        'test-e2e',
      ));
      
      await commandBus.execute(new CreateAccountCommand(
        externalAccountId,
        'external-funding-2',
        'SYSTEM',
        AccountType.EXTERNAL,
        'USD',
        correlationId,
        'test-e2e',
      ));
      
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      // Fund customer
      const { UpdateBalanceCommand } = require('../src/modules/account/commands/update-balance.command');
      await commandBus.execute(new UpdateBalanceCommand(
        customerAccountId,
        '500.00',
        'CREDIT',
        'Initial funding for full refund test',
        undefined,
        correlationId,
        'test-e2e',
      ));
      
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      // Process payment
      const paymentId = uuidv4();
      const paymentAmount = '500.00';
      await commandBus.execute(new PaymentCommand(
        paymentId,
        customerAccountId,
        merchantAccountId,
        paymentAmount,
        'USD',
        uuidv4(),
        {
          orderId: 'ORDER-FULL-REFUND',
          description: 'Order to be fully refunded',
        },
        correlationId,
        'test-e2e',
      ));
      
      await new Promise((resolve) => setTimeout(resolve, 3000));
      
      // Verify payment
      let customerAccount = await accountProjectionService.findById(customerAccountId);
      let merchantAccount = await accountProjectionService.findById(merchantAccountId);
      
      expect(new Decimal(customerAccount!.balance).toNumber()).toBe(0); // 500 - 500
      expect(new Decimal(merchantAccount!.balance).toNumber()).toBe(500); // 0 + 500
      
      // Process full refund
      const refundId = uuidv4();
      await commandBus.execute(new RefundCommand(
        refundId,
        paymentId,
        paymentAmount, // Full amount
        'USD',
        uuidv4(),
        {
          reason: 'Order cancelled',
          refundType: 'full',
          notes: 'Customer requested full refund',
        },
        correlationId,
        'test-e2e',
      ));
      
      await new Promise((resolve) => setTimeout(resolve, 3000));
      
      // Verify full refund
      const refundProjection = await transactionProjectionService.findById(refundId);
      expect(refundProjection).toBeDefined();
      expect(refundProjection!.status).toBe(TransactionStatus.COMPLETED);
      expect(refundProjection!.amount).toBe(paymentAmount);
      
      // Verify balances restored
      customerAccount = await accountProjectionService.findById(customerAccountId);
      merchantAccount = await accountProjectionService.findById(merchantAccountId);
      
      expect(new Decimal(customerAccount!.balance).toNumber()).toBe(500); // 0 + 500 (fully restored)
      expect(new Decimal(merchantAccount!.balance).toNumber()).toBe(0); // 500 - 500 (fully refunded)
      
      console.log('✅ Full refund processed successfully!');
      console.log(`   Customer balance restored: ${customerAccount!.balance}`);
      console.log(`   Merchant balance cleared: ${merchantAccount!.balance}`);
    }, 30000);
  });
});


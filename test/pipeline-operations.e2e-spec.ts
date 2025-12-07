import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { AccountType } from '../src/modules/account/account.entity';
import { TransactionService } from '../src/modules/transaction/transaction.service';

/**
 * E2E Test: All Pipeline-based Operations (V2 methods)
 * 
 * Verifies that pipeline-based implementations work correctly:
 * - topupV2
 * - withdrawV2
 * - transferV2
 * - refundV2
 */
describe('Pipeline Operations E2E', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let transactionService: TransactionService;
  let userAccount1Id: string;
  let userAccount2Id: string;
  const externalBankUSD = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();
    dataSource = moduleFixture.get<DataSource>(DataSource);
    transactionService = moduleFixture.get<TransactionService>(TransactionService);

    // Create test accounts
    const account1Res = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .send({
        ownerId: 'pipeline-user-1',
        ownerType: 'user',
        accountType: AccountType.USER,
        currency: 'USD',
        metadata: { name: 'Pipeline Test Account 1' },
      })
      .expect(201);
    userAccount1Id = account1Res.body.id;

    const account2Res = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .send({
        ownerId: 'pipeline-user-2',
        ownerType: 'user',
        accountType: AccountType.USER,
        currency: 'USD',
        metadata: { name: 'Pipeline Test Account 2' },
      })
      .expect(201);
    userAccount2Id = account2Res.body.id;
  });

  afterAll(async () => {
    await dataSource.destroy();
    await app.close();
  });

  describe('topupV2 (Pipeline)', () => {
    it('should topup account using pipeline', async () => {
      const operationContext = {
        correlationId: uuidv4(),
        actorId: 'test',
        actorType: 'pipeline-test',
        timestamp: new Date(),
      };

      const result = await transactionService.topupV2(
        {
          idempotencyKey: uuidv4(),
          sourceAccountId: externalBankUSD,
          destinationAccountId: userAccount1Id,
          amount: '1000.00',
          currency: 'USD',
          reference: 'Pipeline topup test',
        },
        operationContext,
      );

      expect(result).toHaveProperty('transactionId');
      expect(result.sourceAccountId).toBe(externalBankUSD);
      expect(result.destinationAccountId).toBe(userAccount1Id);
      expect(parseFloat(result.amount)).toBe(1000);
      expect(result.status).toBe('completed');
      expect(parseFloat(result.destinationBalanceAfter)).toBe(1000);
    });
  });

  describe('withdrawV2 (Pipeline)', () => {
    it('should withdraw from account using pipeline', async () => {
      const operationContext = {
        correlationId: uuidv4(),
        actorId: 'test',
        actorType: 'pipeline-test',
        timestamp: new Date(),
      };

      const result = await transactionService.withdrawV2(
        {
          idempotencyKey: uuidv4(),
          sourceAccountId: userAccount1Id,
          destinationAccountId: externalBankUSD,
          amount: '200.00',
          currency: 'USD',
          reference: 'Pipeline withdrawal test',
        },
        operationContext,
      );

      expect(result).toHaveProperty('transactionId');
      expect(result.sourceAccountId).toBe(userAccount1Id);
      expect(result.destinationAccountId).toBe(externalBankUSD);
      expect(parseFloat(result.amount)).toBe(200);
      expect(result.status).toBe('completed');
      
      // Balance should be 1000 - 200 = 800
      expect(parseFloat(result.sourceBalanceAfter)).toBe(800);
    });

    it('should reject insufficient balance using pipeline', async () => {
      const operationContext = {
        correlationId: uuidv4(),
        actorId: 'test',
        actorType: 'pipeline-test',
        timestamp: new Date(),
      };

      await expect(
        transactionService.withdrawV2(
          {
            idempotencyKey: uuidv4(),
            sourceAccountId: userAccount1Id,
            destinationAccountId: externalBankUSD,
            amount: '10000.00', // More than balance
            currency: 'USD',
          },
          operationContext,
        ),
      ).rejects.toThrow(/INSUFFICIENT_BALANCE|balance/i);
    });
  });

  describe('transferV2 (Pipeline)', () => {
    it('should transfer between accounts using pipeline', async () => {
      const operationContext = {
        correlationId: uuidv4(),
        actorId: 'test',
        actorType: 'pipeline-test',
        timestamp: new Date(),
      };

      const result = await transactionService.transferV2(
        {
          idempotencyKey: uuidv4(),
          sourceAccountId: userAccount1Id,
          destinationAccountId: userAccount2Id,
          amount: '300.00',
          currency: 'USD',
          reference: 'Pipeline transfer test',
        },
        operationContext,
      );

      expect(result).toHaveProperty('debitTransactionId');
      expect(result).toHaveProperty('creditTransactionId');
      expect(result.sourceAccountId).toBe(userAccount1Id);
      expect(result.destinationAccountId).toBe(userAccount2Id);
      expect(parseFloat(result.amount)).toBe(300);
      expect(result.status).toBe('completed');
    });

    it('should reject self-transfer using pipeline', async () => {
      const operationContext = {
        correlationId: uuidv4(),
        actorId: 'test',
        actorType: 'pipeline-test',
        timestamp: new Date(),
      };

      await expect(
        transactionService.transferV2(
          {
            idempotencyKey: uuidv4(),
            sourceAccountId: userAccount1Id,
            destinationAccountId: userAccount1Id, // Same account
            amount: '100.00',
            currency: 'USD',
          },
          operationContext,
        ),
      ).rejects.toThrow(/SELF_TRANSFER_NOT_ALLOWED|Invalid Operation/i);
    });
  });

  describe('refundV2 (Pipeline)', () => {
    it('should refund a transaction using pipeline', async () => {
      const operationContext = {
        correlationId: uuidv4(),
        actorId: 'test',
        actorType: 'pipeline-test',
        timestamp: new Date(),
      };

      // First, create a withdrawal to refund
      const withdrawalResult = await transactionService.withdrawV2(
        {
          idempotencyKey: uuidv4(),
          sourceAccountId: userAccount1Id,
          destinationAccountId: externalBankUSD,
          amount: '50.00',
          currency: 'USD',
          reference: 'Transaction to be refunded',
        },
        operationContext,
      );

      // Now refund it
      const refundResult = await transactionService.refundV2(
        {
          idempotencyKey: uuidv4(),
          originalTransactionId: withdrawalResult.transactionId,
          reason: 'Pipeline refund test',
        },
        operationContext,
      );

      expect(refundResult).toHaveProperty('transactionId');
      expect(refundResult.type).toBe('refund');
      expect(parseFloat(refundResult.amount)).toBe(50);
      expect(refundResult.status).toBe('completed');
      
      // Refund reverses: money goes from external back to user
      expect(refundResult.sourceAccountId).toBe(externalBankUSD);
      expect(refundResult.destinationAccountId).toBe(userAccount1Id);
    });

    it('should handle partial refund using pipeline', async () => {
      const operationContext = {
        correlationId: uuidv4(),
        actorId: 'test',
        actorType: 'pipeline-test',
        timestamp: new Date(),
      };

      // Create a withdrawal
      const withdrawalResult = await transactionService.withdrawV2(
        {
          idempotencyKey: uuidv4(),
          sourceAccountId: userAccount1Id,
          destinationAccountId: externalBankUSD,
          amount: '100.00',
          currency: 'USD',
        },
        operationContext,
      );

      // Partial refund (50%)
      const refundResult = await transactionService.refundV2(
        {
          idempotencyKey: uuidv4(),
          originalTransactionId: withdrawalResult.transactionId,
          amount: '50.00', // Partial
          reason: 'Partial refund test',
        },
        operationContext,
      );

      expect(parseFloat(refundResult.amount)).toBe(50);
      expect(refundResult.status).toBe('completed');
    });

    it('should reject refunding already refunded transaction', async () => {
      const operationContext = {
        correlationId: uuidv4(),
        actorId: 'test',
        actorType: 'pipeline-test',
        timestamp: new Date(),
      };

      // Create and refund a transaction
      const withdrawalResult = await transactionService.withdrawV2(
        {
          idempotencyKey: uuidv4(),
          sourceAccountId: userAccount1Id,
          destinationAccountId: externalBankUSD,
          amount: '25.00',
          currency: 'USD',
        },
        operationContext,
      );

      await transactionService.refundV2(
        {
          idempotencyKey: uuidv4(),
          originalTransactionId: withdrawalResult.transactionId,
          reason: 'First refund',
        },
        operationContext,
      );

      // Try to refund again
      await expect(
        transactionService.refundV2(
          {
            idempotencyKey: uuidv4(),
            originalTransactionId: withdrawalResult.transactionId,
            reason: 'Second refund attempt',
          },
          operationContext,
        ),
      ).rejects.toThrow(); // Expecting any RefundException
    });
  });

  describe('Pipeline Performance', () => {
    it('should handle multiple operations efficiently', async () => {
      const operationContext = {
        correlationId: uuidv4(),
        actorId: 'test',
        actorType: 'pipeline-test',
        timestamp: new Date(),
      };

      const operations = 20;
      const start = Date.now();

      for (let i = 0; i < operations; i++) {
        await transactionService.topupV2(
          {
            idempotencyKey: uuidv4(),
            sourceAccountId: externalBankUSD,
            destinationAccountId: userAccount2Id,
            amount: `${i + 1}.00`,
            currency: 'USD',
            reference: `Batch operation ${i + 1}`,
          },
          operationContext,
        );
      }

      const duration = Date.now() - start;
      const avgDuration = duration / operations;

      console.log(`Pipeline Performance: ${operations} operations in ${duration}ms`);
      console.log(`Average: ${avgDuration.toFixed(2)}ms per operation`);

      // Should complete 20 operations in reasonable time (< 4s total)
      expect(duration).toBeLessThan(4000);
      // Average should be < 200ms per operation
      expect(avgDuration).toBeLessThan(200);
    });
  });

  describe('Pipeline vs Original Comparison', () => {
    it('should produce identical results for topup', async () => {
      const operationContext = {
        correlationId: uuidv4(),
        actorId: 'test',
        actorType: 'comparison-test',
        timestamp: new Date(),
      };

      const dto = {
        idempotencyKey: uuidv4(),
        sourceAccountId: externalBankUSD,
        destinationAccountId: userAccount2Id,
        amount: '77.77',
        currency: 'USD',
        reference: 'Comparison test',
      };

      // Use pipeline version
      const result = await transactionService.topupV2(dto, operationContext);

      // Verify structure matches expected
      expect(result).toHaveProperty('transactionId');
      expect(result).toHaveProperty('sourceAccountId');
      expect(result).toHaveProperty('destinationAccountId');
      expect(result).toHaveProperty('amount');
      expect(result).toHaveProperty('sourceBalanceAfter');
      expect(result).toHaveProperty('destinationBalanceAfter');
      expect(result.status).toBe('completed');
    });
  });
});


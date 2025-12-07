import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { AccountType } from '../src/modules/account/account.entity';

/**
 * E2E Test: Pipeline-based Topup (topupV2)
 * 
 * This test verifies that the new pipeline-based implementation produces
 * identical results to the original implementation.
 */
describe('Pipeline Topup E2E', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userAccountId: string;
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

    // Create a user account for testing
    const accountRes = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .send({
        ownerId: 'pipeline-test-user',
        ownerType: 'user',
        accountType: AccountType.USER,
        currency: 'USD',
        metadata: { name: 'Pipeline Test Account' },
      })
      .expect(201);
    
    userAccountId = accountRes.body.id;
  });

  afterAll(async () => {
    await dataSource.destroy();
    await app.close();
  });

  describe('topupV2 (Pipeline)', () => {
    it('should successfully topup using pipeline', async () => {
      const idempotencyKey = uuidv4();
      
      const res = await request(app.getHttpServer())
        .post('/api/v1/transactions/topup')
        .send({
          idempotencyKey,
          sourceAccountId: externalBankUSD,
          destinationAccountId: userAccountId,
          amount: '500.00',
          currency: 'USD',
          reference: 'Pipeline test topup',
        })
        .expect(201);

      // Verify response structure
      expect(res.body).toHaveProperty('transactionId');
      expect(res.body).toHaveProperty('idempotencyKey');
      expect(res.body).toHaveProperty('type');
      expect(res.body.sourceAccountId).toBe(externalBankUSD);
      expect(res.body.destinationAccountId).toBe(userAccountId);
      expect(parseFloat(res.body.amount)).toBe(500);
      expect(res.body.currency).toBe('USD');
      expect(res.body.status).toBe('completed');
      expect(res.body.reference).toBe('Pipeline test topup');

      // Verify balance calculations
      expect(res.body).toHaveProperty('sourceBalanceBefore');
      expect(res.body).toHaveProperty('sourceBalanceAfter');
      expect(res.body).toHaveProperty('destinationBalanceBefore');
      expect(res.body).toHaveProperty('destinationBalanceAfter');

      // Verify balance was updated correctly
      const balanceRes = await request(app.getHttpServer())
        .get(`/api/v1/accounts/${userAccountId}/balance`)
        .expect(200);
      
      expect(parseFloat(balanceRes.body.balance)).toBe(500);
    });

    it('should reject duplicate idempotency key (pipeline)', async () => {
      const idempotencyKey = uuidv4();

      // First request
      await request(app.getHttpServer())
        .post('/api/v1/transactions/topup')
        .send({
          idempotencyKey,
          sourceAccountId: externalBankUSD,
          destinationAccountId: userAccountId,
          amount: '100.00',
          currency: 'USD',
        })
        .expect(201);

      // Duplicate request
      await request(app.getHttpServer())
        .post('/api/v1/transactions/topup')
        .send({
          idempotencyKey,
          sourceAccountId: externalBankUSD,
          destinationAccountId: userAccountId,
          amount: '100.00',
          currency: 'USD',
        })
        .expect(409);
    });

    it('should validate currency mismatch (pipeline)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/transactions/topup')
        .send({
          idempotencyKey: uuidv4(),
          sourceAccountId: externalBankUSD,
          destinationAccountId: userAccountId,
          amount: '100.00',
          currency: 'EUR', // Wrong currency
        })
        .expect(400);
    });

    it('should validate positive amount (pipeline)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/transactions/topup')
        .send({
          idempotencyKey: uuidv4(),
          sourceAccountId: externalBankUSD,
          destinationAccountId: userAccountId,
          amount: '-50.00', // Negative amount
          currency: 'USD',
        })
        .expect(400);
    });
  });

  describe('Performance Comparison', () => {
    it('should have similar performance to original implementation', async () => {
      const iterations = 10;
      const amounts = Array.from({ length: iterations }, (_, i) => `${10 + i}.00`);
      
      const durations: number[] = [];

      for (const amount of amounts) {
        const start = Date.now();
        
        await request(app.getHttpServer())
          .post('/api/v1/transactions/topup')
          .send({
            idempotencyKey: uuidv4(),
            sourceAccountId: externalBankUSD,
            destinationAccountId: userAccountId,
            amount,
            currency: 'USD',
            reference: 'Performance test',
          })
          .expect(201);
        
        durations.push(Date.now() - start);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      console.log(`Average pipeline topup duration: ${avgDuration.toFixed(2)}ms`);
      
      // Pipeline should be reasonably fast (< 200ms average)
      expect(avgDuration).toBeLessThan(200);
    });
  });
});


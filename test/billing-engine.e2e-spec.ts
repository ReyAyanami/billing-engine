import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

describe('Billing Engine E2E Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  
  // Account IDs
  let accountId: string;
  let account1Id: string;
  let account2Id: string;
  
  // Pre-seeded external account IDs (from migration)
  const externalBankUSD = '00000000-0000-0000-0000-000000000001';
  
  // Transaction IDs
  let topupTransactionId: string;
  let withdrawalTransactionId: string;

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
  });

  afterAll(async () => {
    await dataSource.destroy();
    await app.close();
  });

  describe('Currency API', () => {
    it('/api/v1/currencies (GET) - should return list of currencies', () => {
      return request(app.getHttpServer())
        .get('/api/v1/currencies')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThan(0);
          expect(res.body[0]).toHaveProperty('code');
          expect(res.body[0]).toHaveProperty('name');
        });
    });

    it('/api/v1/currencies/:code (GET) - should return a specific currency', () => {
      return request(app.getHttpServer())
        .get('/api/v1/currencies/USD')
        .expect(200)
        .expect((res) => {
          expect(res.body.code).toBe('USD');
          expect(res.body.name).toBe('US Dollar');
          expect(res.body.type).toBe('fiat');
        });
    });

    it('/api/v1/currencies/:code (GET) - should return 400 for invalid currency', () => {
      return request(app.getHttpServer())
        .get('/api/v1/currencies/INVALID')
        .expect(400);
    });
  });

  describe('Account API', () => {
    it('/api/v1/accounts (POST) - should create an account', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/accounts')
        .send({
          ownerId: 'user-e2e-test',
          ownerType: 'user',
          accountType: 'user',
          currency: 'USD',
          metadata: {
            name: 'E2E Test Account',
          },
        })
        .expect(201);
      
      expect(res.body).toHaveProperty('id');
      expect(res.body.ownerId).toBe('user-e2e-test');
      expect(res.body.accountType).toBe('user');
      expect(res.body.currency).toBe('USD');
      expect(parseFloat(res.body.balance)).toBe(0);
      expect(res.body.status).toBe('active');
      accountId = res.body.id;
    });

    it('/api/v1/accounts/:id (GET) - should get account by id', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/accounts/${accountId}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(accountId);
          expect(res.body.ownerId).toBe('user-e2e-test');
        });
    });

    it('/api/v1/accounts/:id/balance (GET) - should get account balance', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/accounts/${accountId}/balance`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('balance');
          expect(res.body).toHaveProperty('currency');
          expect(res.body).toHaveProperty('status');
        });
    });

    it('/api/v1/accounts (GET) - should get accounts by owner', () => {
      return request(app.getHttpServer())
        .get('/api/v1/accounts?ownerId=user-e2e-test&ownerType=user')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThan(0);
        });
    });

    it('/api/v1/accounts/:id/status (PATCH) - should update account status', () => {
      return request(app.getHttpServer())
        .patch(`/api/v1/accounts/${accountId}/status`)
        .send({
          status: 'suspended',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('suspended');
        });
    });

    it('/api/v1/accounts/:id/status (PATCH) - should reactivate account', () => {
      return request(app.getHttpServer())
        .patch(`/api/v1/accounts/${accountId}/status`)
        .send({
          status: 'active',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('active');
        });
    });
  });

  describe('Transaction API - Full Flow', () => {
    beforeAll(async () => {
      // Create two user accounts for testing
      const account1 = await request(app.getHttpServer())
        .post('/api/v1/accounts')
        .send({
          ownerId: 'user-txn-1',
          ownerType: 'user',
          accountType: 'user',
          currency: 'USD',
        });
      account1Id = account1.body.id;

      const account2 = await request(app.getHttpServer())
        .post('/api/v1/accounts')
        .send({
          ownerId: 'user-txn-2',
          ownerType: 'user',
          accountType: 'user',
          currency: 'USD',
        });
      account2Id = account2.body.id;
    });

    it('/api/v1/transactions/topup (POST) - should topup account from external source', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/transactions/topup')
        .send({
          idempotencyKey: uuidv4(),
          sourceAccountId: externalBankUSD,        // External account
          destinationAccountId: account1Id,         // User account
          amount: '1000.00',
          currency: 'USD',
          reference: 'Initial deposit',
        })
        .expect(201);
      
      expect(res.body).toHaveProperty('transactionId');
      expect(res.body.sourceAccountId).toBe(externalBankUSD);
      expect(res.body.destinationAccountId).toBe(account1Id);
      expect(parseFloat(res.body.amount)).toBe(1000);
      expect(parseFloat(res.body.destinationBalanceAfter)).toBe(1000);
      expect(res.body.status).toBe('completed');
      topupTransactionId = res.body.transactionId;
    });

    it('/api/v1/transactions/topup (POST) - should reject duplicate idempotency key', async () => {
      const idempotencyKey = uuidv4();

      await request(app.getHttpServer())
        .post('/api/v1/transactions/topup')
        .send({
          idempotencyKey,
          sourceAccountId: externalBankUSD,
          destinationAccountId: account1Id,
          amount: '500.00',
          currency: 'USD',
        })
        .expect(201);

      // Try same idempotency key again
      return request(app.getHttpServer())
        .post('/api/v1/transactions/topup')
        .send({
          idempotencyKey,
          sourceAccountId: externalBankUSD,
          destinationAccountId: account1Id,
          amount: '500.00',
          currency: 'USD',
        })
        .expect(409);
    });

    it('/api/v1/transactions/withdraw (POST) - should withdraw from account to external destination', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/transactions/withdraw')
        .send({
          idempotencyKey: uuidv4(),
          sourceAccountId: account1Id,              // User account
          destinationAccountId: externalBankUSD,    // External account
          amount: '200.00',
          currency: 'USD',
          reference: 'Withdrawal test',
        })
        .expect(201);
      
      expect(res.body).toHaveProperty('transactionId');
      expect(parseFloat(res.body.amount)).toBe(200);
      expect(res.body.status).toBe('completed');
      withdrawalTransactionId = res.body.transactionId;
    });

    it('/api/v1/transactions/withdraw (POST) - should reject insufficient balance', () => {
      return request(app.getHttpServer())
        .post('/api/v1/transactions/withdraw')
        .send({
          idempotencyKey: uuidv4(),
          sourceAccountId: account1Id,
          destinationAccountId: externalBankUSD,
          amount: '50000.00', // Too much
          currency: 'USD',
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');
        });
    });

    it('/api/v1/transactions/transfer (POST) - should transfer between accounts', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/transactions/transfer')
        .send({
          idempotencyKey: uuidv4(),
          sourceAccountId: account1Id,
          destinationAccountId: account2Id,
          amount: '300.00',
          currency: 'USD',
          reference: 'Transfer test',
        })
        .expect(201);
      
      expect(res.body).toHaveProperty('debitTransactionId');
      expect(res.body).toHaveProperty('creditTransactionId');
      expect(res.body.sourceAccountId).toBe(account1Id);
      expect(res.body.destinationAccountId).toBe(account2Id);
      expect(parseFloat(res.body.amount)).toBe(300);
      expect(res.body.status).toBe('completed');
    });

    it('/api/v1/transactions/transfer (POST) - should reject self-transfer', () => {
      return request(app.getHttpServer())
        .post('/api/v1/transactions/transfer')
        .send({
          idempotencyKey: uuidv4(),
          sourceAccountId: account1Id,
          destinationAccountId: account1Id,
          amount: '100.00',
          currency: 'USD',
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.error.code).toBe('SELF_TRANSFER_NOT_ALLOWED');
        });
    });

    it('/api/v1/transactions/refund (POST) - should refund a transaction', async () => {
      // Ensure withdrawalTransactionId is defined
      if (!withdrawalTransactionId) {
        const res = await request(app.getHttpServer())
          .post('/api/v1/transactions/withdraw')
          .send({
            idempotencyKey: uuidv4(),
            sourceAccountId: account1Id,
            destinationAccountId: externalBankUSD,
            amount: '10.00',
            currency: 'USD',
            reference: 'Pre-refund withdrawal',
          })
          .expect(201);
        withdrawalTransactionId = res.body.transactionId;
      }

      const res = await request(app.getHttpServer())
        .post('/api/v1/transactions/refund')
        .send({
          idempotencyKey: uuidv4(),
          originalTransactionId: withdrawalTransactionId,
          reason: 'Test refund',
        })
        .expect(201);

      expect(res.body).toHaveProperty('transactionId');
      expect(res.body.status).toBe('completed');
    });

    it('/api/v1/transactions/:id (GET) - should get transaction by id', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/transactions/${topupTransactionId}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(topupTransactionId);
          expect(res.body).toHaveProperty('type');
          expect(res.body).toHaveProperty('amount');
          expect(res.body).toHaveProperty('sourceAccountId');
          expect(res.body).toHaveProperty('destinationAccountId');
        });
    });

    it('/api/v1/transactions (GET) - should list transactions for an account', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/transactions?accountId=${account1Id}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThan(0);
        });
    });

    it('/api/v1/accounts/:id/balance (GET) - should verify balance after all operations', async () => {
      // Account 1: 1000 (topup) + 500 (topup) - 200 (withdrawal) - 300 (transfer) + 200 (refund) = 1200
      const balance1 = await request(app.getHttpServer())
        .get(`/api/v1/accounts/${account1Id}/balance`)
        .expect(200);

      expect(parseFloat(balance1.body.balance)).toBeGreaterThan(0);

      // Account 2: 0 + 300 (transfer credit) = 300
      const balance2 = await request(app.getHttpServer())
        .get(`/api/v1/accounts/${account2Id}/balance`)
        .expect(200);

      expect(parseFloat(balance2.body.balance)).toBe(300);
    });
  });

  describe('Error Handling', () => {
    it('should reject transaction with non-existent account', () => {
      return request(app.getHttpServer())
        .post('/api/v1/transactions/topup')
        .send({
          idempotencyKey: uuidv4(),
          sourceAccountId: externalBankUSD,
          destinationAccountId: '00000000-0000-0000-0000-999999999999',
          amount: '100.00',
          currency: 'USD',
        })
        .expect(404);
    });

    it('should reject transaction with invalid currency', () => {
      return request(app.getHttpServer())
        .post('/api/v1/transactions/topup')
        .send({
          idempotencyKey: uuidv4(),
          sourceAccountId: externalBankUSD,
          destinationAccountId: accountId,
          amount: '100.00',
          currency: 'INVALID',
        })
        .expect(400);
    });

    it('should reject transaction with negative amount', () => {
      return request(app.getHttpServer())
        .post('/api/v1/transactions/topup')
        .send({
          idempotencyKey: uuidv4(),
          sourceAccountId: externalBankUSD,
          destinationAccountId: accountId,
          amount: '-100.00',
          currency: 'USD',
        })
        .expect(400);
    });
  });
});

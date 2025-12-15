# Testing Guide

## Overview

The billing engine uses Jest for unit and E2E testing. This guide covers testing strategies, patterns, and best practices.

---

## Running Tests

```bash
# Run all tests
npm test

# Run in parallel (faster)
npm run test:parallel

# Run with coverage
npm run test:cov

# Run E2E tests only
npm run test:e2e

# Watch mode (re-run on changes)
npm run test:watch
```

---

## Test Structure

```
test/
├── unit/                    # Unit tests
│   ├── account.service.spec.ts
│   └── guardrails.spec.ts
│
├── e2e/                     # End-to-end tests
│   ├── features/
│   │   ├── account-management.e2e-spec.ts
│   │   ├── topup.e2e-spec.ts
│   │   ├── withdrawal.e2e-spec.ts
│   │   ├── transfer.e2e-spec.ts
│   │   └── refund.e2e-spec.ts
│   ├── helpers/
│   └── setup/
│
└── helpers/                 # Test utilities
    ├── event-polling.helper.ts
    ├── in-memory-event-store.ts
    ├── test-fixtures.ts
    └── test-id-generator.ts
```

---

## Unit Testing

### Testing Services

```typescript
describe('AccountService', () => {
  let service: AccountService;
  let commandBus: CommandBus;
  
  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AccountService,
        {
          provide: CommandBus,
          useValue: { execute: jest.fn() }
        }
      ]
    }).compile();
    
    service = module.get<AccountService>(AccountService);
    commandBus = module.get<CommandBus>(CommandBus);
  });
  
  it('should create account', async () => {
    const dto = {
      ownerId: 'user_123',
      ownerType: 'user',
      currency: 'USD',
      type: AccountType.USER
    };
    
    const result = await service.create(dto, context);
    
    expect(result.ownerId).toBe('user_123');
    expect(result.balance).toBe('0');
    expect(commandBus.execute).toHaveBeenCalled();
  });
});
```

### Testing Aggregates

```typescript
describe('AccountAggregate', () => {
  it('should enforce minimum balance', () => {
    const aggregate = new AccountAggregate();
    
    aggregate.create({
      accountId: 'test-id',
      ownerId: 'user',
      ownerType: 'user',
      accountType: AccountType.USER,
      currency: 'USD',
      minBalance: '10.00',
      correlationId: 'corr-id'
    });
    
    expect(() => {
      aggregate.changeBalance({
        changeAmount: '100.00',
        changeType: 'DEBIT',
        reason: 'Test',
        correlationId: 'corr-id'
      });
    }).toThrow('Insufficient balance');
  });
});
```

---

## E2E Testing

### Setup

```typescript
describe('Transfer E2E', () => {
  let app: INestApplication;
  
  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppTestModule],  // Test-specific module
    }).compile();
    
    app = moduleFixture.createNestApplication();
    await app.init();
  });
  
  afterAll(async () => {
    await app.close();
  });
  
  // Tests...
});
```

### Complete Flow Test

```typescript
it('should process transfer between accounts', async () => {
  // 1. Create accounts
  const alice = await request(app.getHttpServer())
    .post('/api/v1/accounts')
    .send({
      ownerId: 'alice',
      ownerType: 'user',
      currency: 'USD',
      type: 'USER'
    })
    .expect(201);
  
  const bob = await request(app.getHttpServer())
    .post('/api/v1/accounts')
    .send({
      ownerId: 'bob',
      ownerType: 'user',
      currency: 'USD',
      type: 'USER'
    })
    .expect(201);
  
  // 2. Top-up Alice's account
  const topup = await request(app.getHttpServer())
    .post('/api/v1/transactions/topup')
    .send({
      idempotencyKey: uuidv4(),
      destinationAccountId: alice.body.id,
      sourceAccountId: 'external-001',
      amount: '100.00',
      currency: 'USD'
    })
    .expect(201);
  
  // 3. Wait for completion
  await waitForTransactionComplete(app, topup.body.transactionId);
  
  // 4. Transfer from Alice to Bob
  const transfer = await request(app.getHttpServer())
    .post('/api/v1/transactions/transfer')
    .send({
      idempotencyKey: uuidv4(),
      sourceAccountId: alice.body.id,
      destinationAccountId: bob.body.id,
      amount: '50.00',
      currency: 'USD'
    })
    .expect(201);
  
  // 5. Wait for completion
  await waitForTransactionComplete(app, transfer.body.sourceTransactionId);
  
  // 6. Verify balances
  const aliceBalance = await request(app.getHttpServer())
    .get(`/api/v1/accounts/${alice.body.id}/balance`)
    .expect(200);
  
  const bobBalance = await request(app.getHttpServer())
    .get(`/api/v1/accounts/${bob.body.id}/balance`)
    .expect(200);
  
  expect(aliceBalance.body.balance).toBe('50.00');
  expect(bobBalance.body.balance).toBe('50.00');
});
```

---

## Test Helpers

### Event Polling

```typescript
export async function waitForTransactionComplete(
  app: INestApplication,
  transactionId: string,
  timeout = 10000
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/transactions/${transactionId}`);
    
    if (response.body.status === 'completed') {
      return;
    }
    
    if (response.body.status === 'failed') {
      throw new Error(`Transaction failed: ${response.body.failureReason}`);
    }
    
    await sleep(100);
  }
  
  throw new Error('Timeout waiting for transaction');
}
```

### Test Fixtures

```typescript
export class TestFixtures {
  static async createAccount(
    app: INestApplication,
    params: Partial<CreateAccountDto>
  ): Promise<Account> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .send({
        ownerId: params.ownerId || `user_${Math.random()}`,
        ownerType: params.ownerType || 'user',
        currency: params.currency || 'USD',
        type: params.type || 'USER',
        ...params
      })
      .expect(201);
    
    return response.body;
  }
  
  static async topupAccount(
    app: INestApplication,
    accountId: string,
    amount: string
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/transactions/topup')
      .send({
        idempotencyKey: uuidv4(),
        destinationAccountId: accountId,
        sourceAccountId: 'external-test',
        amount,
        currency: 'USD'
      })
      .expect(201);
    
    await waitForTransactionComplete(app, response.body.transactionId);
    return response.body.transactionId;
  }
}
```

---

## Testing Patterns

### 1. Idempotency Testing

```typescript
it('should prevent duplicate transactions', async () => {
  const idempotencyKey = uuidv4();
  
  // First request
  const first = await topup({ idempotencyKey, ...params });
  expect(first.status).toBe(201);
  
  // Second request with same key
  const second = await topup({ idempotencyKey, ...params });
  expect(second.status).toBe(409);  // Conflict
});
```

### 2. Balance Validation

```typescript
it('should reject withdrawal with insufficient balance', async () => {
  const account = await createAccount({ balance: '10.00' });
  
  const response = await withdraw({
    sourceAccountId: account.id,
    amount: '50.00'
  });
  
  expect(response.status).toBe(400);
  expect(response.body.message).toContain('Insufficient balance');
});
```

### 3. Saga Compensation

```typescript
it('should compensate failed transfer', async () => {
  const source = await createAccount({ balance: '100.00' });
  const dest = await createAccount({ maxBalance: '10.00' });
  
  // Transfer exceeds destination max balance
  const transfer = await request(app)
    .post('/api/v1/transactions/transfer')
    .send({
      sourceAccountId: source.id,
      destinationAccountId: dest.id,
      amount: '50.00'  // Would make dest balance $50 > $10 max
    });
  
  await waitForTransactionComplete(app, transfer.body.sourceTransactionId);
  
  const tx = await getTransaction(transfer.body.sourceTransactionId);
  expect(tx.status).toBe('compensated');
  
  // Source balance should be unchanged (compensated)
  const sourceAfter = await getAccount(source.id);
  expect(sourceAfter.balance).toBe('100.00');
});
```

---

## Best Practices

### 1. Use Test Data Builders

```typescript
class AccountBuilder {
  private params: Partial<CreateAccountDto> = {};
  
  withOwner(ownerId: string): this {
    this.params.ownerId = ownerId;
    return this;
  }
  
  withBalance(balance: string): this {
    this.params.balance = balance;
    return this;
  }
  
  async build(app: INestApplication): Promise<Account> {
    return await TestFixtures.createAccount(app, this.params);
  }
}

// Usage
const account = await new AccountBuilder()
  .withOwner('alice')
  .withBalance('100.00')
  .build(app);
```

### 2. Clean Up After Tests

```typescript
afterEach(async () => {
  // Clean up test data
  await cleanupTestData();
});
```

### 3. Use Descriptive Test Names

```typescript
// ✓ GOOD
it('should transfer funds atomically between two accounts', async () => {});

// ✗ BAD
it('test transfer', async () => {});
```

---

## Coverage

View coverage report:

```bash
npm run test:cov

# Opens coverage/index.html
open coverage/index.html
```

**Target Coverage**: 80%+ for critical paths

---

## Related Documentation

- [Local Development](./local-setup.md) - Development setup
- [API Reference](../api/) - API endpoints
- [Operations](../operations/) - Transaction flows


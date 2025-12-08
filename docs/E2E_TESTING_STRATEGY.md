# E2E Testing Strategy - Fresh Approach

## 📋 Executive Summary

This document outlines a **complete redesign** of our E2E testing strategy for the billing engine. Instead of fixing existing complex tests, we're building a new test suite from the ground up with clear principles, modern tools, and maintainable patterns.

---

## 🎯 Part 1: Requirements Analysis

### 1.1 Completeness

**What must be tested:**
- ✅ All 5 transaction types (topup, withdrawal, transfer, payment, refund)
- ✅ Account lifecycle (create, status changes, balance queries)
- ✅ Error scenarios (insufficient balance, invalid accounts, currency mismatches)
- ✅ Double-entry bookkeeping correctness
- ✅ Idempotency guarantees
- ✅ Multi-account scenarios (transfers, payments)
- ✅ Edge cases (zero balances, maximum limits, concurrent operations)

**What we DON'T need to test in E2E:**
- ❌ Internal implementation details (saga steps, event store internals)
- ❌ Unit-level logic (already covered by unit tests)
- ❌ Infrastructure failures (Kafka down, DB failures - that's chaos engineering)
- ❌ Performance benchmarks (that's load testing)

**Coverage Target:** 100% of user-facing functionality, 0% of internal implementation

---

### 1.2 Maintainability

**Problems with current tests:**
1. **Too many concerns**: Tests verify sagas, projections, events, and business logic all at once
2. **Complex setup**: InMemoryEventStore, event polling, projection waiting
3. **Async complexity**: Manual timeouts, polling loops, race conditions
4. **Tight coupling**: Tests break when internal architecture changes
5. **Hard to debug**: Console logs everywhere, unclear failure points

**Requirements for new tests:**
- ✅ Single responsibility per test
- ✅ Clear, readable test structure (Given-When-Then)
- ✅ Minimal setup complexity
- ✅ Independent tests (no shared state)
- ✅ Fast feedback on failures
- ✅ Easy to add new tests
- ✅ Self-documenting code

---

### 1.3 Simplicity

**Core Principle:** E2E tests should test like a user/client would use the system

**What a user cares about:**
```typescript
// User perspective (SIMPLE):
1. I create an account → I get an account ID
2. I topup $100 → My balance is $100
3. I transfer $50 → Source has $50, Destination has $50
4. I check balance → I get current balance
```

**What a user does NOT care about:**
```typescript
// Internal details (COMPLEX):
1. How many events were published
2. What saga steps executed
3. How projections are updated
4. What Kafka partitions were used
```

**Simplicity Requirements:**
- ✅ Test through public interfaces only (HTTP API or Service methods)
- ✅ Black-box testing (input → output, no internal state inspection)
- ✅ Synchronous-style tests (hide async complexity)
- ✅ Minimal test helpers
- ✅ Standard Jest patterns

---

### 1.4 Speed

**Current test speed issues:**
- Waiting 2-5 seconds for projections
- Polling loops with retries
- Full Kafka setup for every test
- Sequential execution due to shared state

**Speed requirements:**
- ✅ Individual test: < 5 seconds
- ✅ Full suite: < 2 minutes
- ✅ Parallel execution safe
- ✅ Fast CI/CD feedback

**Speed strategies:**
- Use in-memory event bus (no Kafka for most tests)
- Proper test isolation (parallel execution)
- Minimal database setup
- Smart waiting (not polling)

---

## 🏗️ Part 2: Technical Solution

### 2.1 Testing Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     E2E Test Suite                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Layer 1: HTTP API Tests (User Perspective)                     │
│  ├─ Test REST endpoints directly                                │
│  ├─ Use supertest for HTTP calls                                │
│  └─ Verify responses and side effects                           │
│                                                                   │
│  Layer 2: Service Tests (Programmatic API)                      │
│  ├─ Test through CommandBus/QueryBus                           │
│  ├─ Verify business logic outcomes                              │
│  └─ Faster than HTTP (no network overhead)                      │
│                                                                   │
│  Layer 3: Infrastructure Tests (Optional)                       │
│  ├─ Test Kafka integration specifically                         │
│  ├─ Test database performance                                   │
│  └─ Separate from business logic tests                          │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

**Key Decision: Two test suites**

1. **Fast Suite** (90% of tests): No Kafka, in-memory events, service-level
2. **Integration Suite** (10% of tests): Full stack with Kafka, one test per feature

---

### 2.2 Test Structure Pattern

**Use BDD-style Given-When-Then:**

```typescript
describe('Feature: Account Top-up', () => {
  
  describe('Scenario: Successful top-up', () => {
    it('should increase account balance', async () => {
      // GIVEN: An active account with $0 balance
      const account = await createAccount({ balance: '0', currency: 'USD' });
      
      // WHEN: I top-up $100
      const result = await topup(account.id, '100.00', 'USD');
      
      // THEN: Balance should be $100
      expect(result.balanceAfter).toBe('100.00');
      
      // AND: I can verify the balance
      const balance = await getBalance(account.id);
      expect(balance.balance).toBe('100.00');
    });
  });
  
  describe('Scenario: Invalid currency', () => {
    it('should reject top-up with wrong currency', async () => {
      // GIVEN: A USD account
      const account = await createAccount({ currency: 'USD' });
      
      // WHEN: I try to top-up with EUR
      const action = () => topup(account.id, '100.00', 'EUR');
      
      // THEN: Should fail with currency mismatch error
      await expect(action()).rejects.toThrow('CURRENCY_MISMATCH');
    });
  });
});
```

---

### 2.3 Test Helpers Design

**Problem with current helpers:** Too complex (EventPollingHelper, InMemoryEventStore)

**New approach: Simple, focused helpers**

```typescript
// test/helpers/test-api.ts
export class TestAPI {
  
  // Account operations
  async createAccount(params: CreateAccountParams): Promise<Account> {
    // Direct service call, wait for completion
  }
  
  async getBalance(accountId: string): Promise<Balance> {
    // Direct query, no polling needed
  }
  
  // Transaction operations
  async topup(accountId: string, amount: string, currency: string): Promise<Transaction> {
    // Execute and wait for completion
  }
  
  async transfer(from: string, to: string, amount: string): Promise<Transaction> {
    // Execute and wait for completion
  }
  
  // Utilities
  async waitForBalance(accountId: string, expectedBalance: string, timeout = 5000) {
    // Smart waiting with clear timeout
  }
  
  generateTestId(prefix: string): string {
    // Unique IDs for test isolation
  }
}
```

**Benefits:**
- One simple API for all test operations
- Hides async complexity
- Easy to mock/stub
- Clear documentation through types

---

### 2.4 Test Isolation Strategy

**Current problem:** Tests share database state, can't run in parallel

**Solution: Database isolation per test**

```typescript
// Option 1: Transaction rollback (FAST)
beforeEach(async () => {
  await testDb.startTransaction(); // Each test in a transaction
});

afterEach(async () => {
  await testDb.rollback(); // Rollback after test
});

// Option 2: Separate schema per test (SLOWER but complete isolation)
beforeEach(async () => {
  const schemaName = `test_${generateId()}`;
  await testDb.createSchema(schemaName);
  await testDb.useSchema(schemaName);
});

afterEach(async () => {
  await testDb.dropSchema(schemaName);
});

// Option 3: TestContainers (CLEANEST)
beforeAll(async () => {
  container = await new PostgreSqlContainer().start();
  // Each test suite gets fresh database
});
```

**Recommendation:** Start with Option 1 (transaction rollback), move to TestContainers later

---

### 2.5 Technology Stack

```typescript
{
  // Testing framework
  "jest": "^29.0.0",                    // Industry standard
  "ts-jest": "^29.0.0",                 // TypeScript support
  
  // HTTP testing
  "supertest": "^6.3.0",                // REST API testing
  
  // Database
  "@testcontainers/postgresql": "^10.0.0",  // Optional: Isolated DB per suite
  
  // Utilities
  "faker": "^8.0.0",                    // Test data generation
  "jest-extended": "^4.0.0",           // Extra matchers
  
  // NO LONGER NEEDED:
  // - Custom event polling
  // - In-memory event store
  // - Complex wait helpers
}
```

---

## 🧪 Part 3: POC Implementation

### 3.1 POC Scope

**We'll implement ONE complete feature end-to-end:**
- Feature: Account Top-up
- 5 test scenarios:
  1. ✅ Successful top-up
  2. ✅ Invalid account (account not found)
  3. ✅ Wrong currency
  4. ✅ Inactive account
  5. ✅ Idempotency (duplicate request)

**Success criteria:**
- All 5 tests pass
- Tests run in < 10 seconds total
- Tests can run in parallel
- Code is clear and maintainable
- Easy to replicate pattern for other features

---

### 3.2 POC File Structure

```
test/
├── e2e-new/                          # New test suite
│   ├── setup/
│   │   ├── test-setup.ts            # Global test setup
│   │   ├── test-database.ts         # Database helpers
│   │   └── test-app.ts              # App initialization
│   │
│   ├── helpers/
│   │   ├── test-api.ts              # Main test API
│   │   ├── factories.ts             # Test data factories
│   │   └── assertions.ts            # Custom assertions
│   │
│   ├── features/
│   │   ├── accounts/
│   │   │   ├── create-account.e2e.spec.ts
│   │   │   └── account-balance.e2e.spec.ts
│   │   │
│   │   └── transactions/
│   │       ├── topup.e2e.spec.ts           # POC starts here
│   │       ├── withdrawal.e2e.spec.ts
│   │       ├── transfer.e2e.spec.ts
│   │       ├── payment.e2e.spec.ts
│   │       └── refund.e2e.spec.ts
│   │
│   └── integration/                  # Optional: Full stack tests
│       └── kafka-events.e2e.spec.ts
│
└── jest-e2e-new.json                 # New Jest config
```

---

### 3.3 POC Code Samples

#### Test Setup (test-setup.ts)

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppTestModule } from './test-app-module';
import { DataSource } from 'typeorm';

export class TestSetup {
  private static app: INestApplication;
  private static dataSource: DataSource;
  
  static async beforeAll() {
    const moduleRef = await Test.createTestingModule({
      imports: [AppTestModule],
    }).compile();
    
    this.app = moduleRef.createNestApplication();
    await this.app.init();
    
    this.dataSource = this.app.get(DataSource);
    
    return this.app;
  }
  
  static async afterAll() {
    await this.app.close();
  }
  
  static async beforeEach() {
    // Start transaction for test isolation
    await this.dataSource.query('BEGIN');
  }
  
  static async afterEach() {
    // Rollback transaction
    await this.dataSource.query('ROLLBACK');
  }
  
  static getApp() {
    return this.app;
  }
}
```

#### Test API (test-api.ts)

```typescript
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CreateAccountCommand } from '@/modules/account/commands/create-account.command';
import { TopupCommand } from '@/modules/transaction/commands/topup.command';
import { GetAccountQuery } from '@/modules/account/queries/get-account.query';
import { v4 as uuid } from 'uuid';

export class TestAPI {
  constructor(
    private commandBus: CommandBus,
    private queryBus: QueryBus,
  ) {}
  
  // ============================================
  // ACCOUNTS
  // ============================================
  
  async createAccount(params: {
    ownerId?: string;
    currency?: string;
    accountType?: AccountType;
    maxBalance?: string;
    minBalance?: string;
  } = {}) {
    const command = new CreateAccountCommand(
      uuid(),
      params.ownerId || `test-owner-${uuid()}`,
      'User',
      params.accountType || AccountType.USER,
      params.currency || 'USD',
      params.maxBalance || '10000.00',
      params.minBalance || '0.00',
      uuid(), // correlation ID
    );
    
    await this.commandBus.execute(command);
    
    // Wait for command to complete (sync or async)
    return this.getAccount(command.accountId);
  }
  
  async getAccount(accountId: string) {
    return this.queryBus.execute(new GetAccountQuery(accountId));
  }
  
  async getBalance(accountId: string) {
    const account = await this.getAccount(accountId);
    return {
      balance: account.balance,
      currency: account.currency,
      status: account.status,
    };
  }
  
  // ============================================
  // TRANSACTIONS
  // ============================================
  
  async topup(
    accountId: string,
    amount: string,
    currency: string,
    options: { idempotencyKey?: string } = {},
  ) {
    const sourceAccount = await this.createExternalAccount(currency);
    
    const command = new TopupCommand(
      uuid(), // transaction ID
      accountId,
      amount,
      currency,
      sourceAccount.id,
      options.idempotencyKey || uuid(),
      uuid(), // correlation ID
    );
    
    await this.commandBus.execute(command);
    
    // Wait for completion
    return this.waitForTransaction(command.transactionId);
  }
  
  async transfer(
    fromAccountId: string,
    toAccountId: string,
    amount: string,
    currency: string,
  ) {
    // Similar pattern
  }
  
  // ============================================
  // UTILITIES
  // ============================================
  
  private async createExternalAccount(currency: string) {
    return this.createAccount({
      accountType: AccountType.EXTERNAL,
      currency,
    });
  }
  
  private async waitForTransaction(transactionId: string, timeout = 5000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const tx = await this.queryBus.execute(
          new GetTransactionQuery(transactionId),
        );
        
        if (tx.status === TransactionStatus.COMPLETED) {
          return tx;
        }
        
        if (tx.status === TransactionStatus.FAILED) {
          throw new Error(`Transaction failed: ${tx.failureReason}`);
        }
        
        // Still pending, wait a bit
        await this.sleep(100);
      } catch (error) {
        // Transaction not found yet, wait
        await this.sleep(100);
      }
    }
    
    throw new Error(`Transaction ${transactionId} did not complete within ${timeout}ms`);
  }
  
  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

#### POC Test (topup.e2e.spec.ts)

```typescript
import { TestSetup } from '../../setup/test-setup';
import { TestAPI } from '../../helpers/test-api';

describe('Feature: Account Top-up', () => {
  let testApi: TestAPI;
  
  beforeAll(async () => {
    const app = await TestSetup.beforeAll();
    testApi = new TestAPI(
      app.get(CommandBus),
      app.get(QueryBus),
    );
  });
  
  afterAll(() => TestSetup.afterAll());
  
  beforeEach(() => TestSetup.beforeEach());
  afterEach(() => TestSetup.afterEach());
  
  // ============================================
  // Scenario 1: Successful Top-up
  // ============================================
  
  describe('Scenario: Successful top-up', () => {
    it('should increase account balance by top-up amount', async () => {
      // GIVEN: An active USD account with $0 balance
      const account = await testApi.createAccount({
        currency: 'USD',
      });
      expect(account.balance).toBe('0.00');
      
      // WHEN: I top-up $100
      const transaction = await testApi.topup(account.id, '100.00', 'USD');
      
      // THEN: Transaction should be completed
      expect(transaction.status).toBe(TransactionStatus.COMPLETED);
      expect(transaction.amount).toBe('100.00');
      
      // AND: Account balance should be $100
      const balance = await testApi.getBalance(account.id);
      expect(balance.balance).toBe('100.00');
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
      expect(balance.balance).toBe('100.00');
    });
  });
  
  // ============================================
  // Scenario 2: Invalid Account
  // ============================================
  
  describe('Scenario: Invalid account', () => {
    it('should reject top-up for non-existent account', async () => {
      // GIVEN: A non-existent account ID
      const fakeAccountId = 'test-00000000-0000-0000-0000-000000000000';
      
      // WHEN: I try to top-up
      const action = () => testApi.topup(fakeAccountId, '100.00', 'USD');
      
      // THEN: Should fail with account not found error
      await expect(action()).rejects.toThrow(/account.*not found/i);
    });
  });
  
  // ============================================
  // Scenario 3: Wrong Currency
  // ============================================
  
  describe('Scenario: Currency mismatch', () => {
    it('should reject top-up with different currency', async () => {
      // GIVEN: A USD account
      const account = await testApi.createAccount({ currency: 'USD' });
      
      // WHEN: I try to top-up with EUR
      const action = () => testApi.topup(account.id, '100.00', 'EUR');
      
      // THEN: Should fail with currency mismatch error
      await expect(action()).rejects.toThrow(/currency.*mismatch/i);
    });
  });
  
  // ============================================
  // Scenario 4: Inactive Account
  // ============================================
  
  describe('Scenario: Inactive account', () => {
    it('should reject top-up for suspended account', async () => {
      // GIVEN: A suspended account
      const account = await testApi.createAccount({ currency: 'USD' });
      await testApi.updateAccountStatus(account.id, 'SUSPENDED');
      
      // WHEN: I try to top-up
      const action = () => testApi.topup(account.id, '100.00', 'USD');
      
      // THEN: Should fail with account inactive error
      await expect(action()).rejects.toThrow(/account.*inactive|suspended/i);
    });
  });
  
  // ============================================
  // Scenario 5: Idempotency
  // ============================================
  
  describe('Scenario: Duplicate requests', () => {
    it('should handle duplicate top-up requests idempotently', async () => {
      // GIVEN: An account
      const account = await testApi.createAccount({ currency: 'USD' });
      const idempotencyKey = 'test-idempotency-key-123';
      
      // WHEN: I send the same top-up request twice
      const tx1 = await testApi.topup(account.id, '100.00', 'USD', {
        idempotencyKey,
      });
      
      const tx2 = await testApi.topup(account.id, '100.00', 'USD', {
        idempotencyKey,
      });
      
      // THEN: Should return same transaction (not create duplicate)
      expect(tx1.id).toBe(tx2.id);
      
      // AND: Balance should only be increased once
      const balance = await testApi.getBalance(account.id);
      expect(balance.balance).toBe('100.00'); // Not 200.00
    });
  });
});
```

---

## 📊 Part 4: Implementation Plan

### Phase 1: POC (Week 1)

**Day 1-2: Setup**
- [ ] Create new test structure (`test/e2e-new/`)
- [ ] Implement `TestSetup` class
- [ ] Implement `TestAPI` class
- [ ] Setup Jest configuration

**Day 3-4: POC Feature**
- [ ] Implement top-up test (5 scenarios)
- [ ] Verify tests pass
- [ ] Verify tests run fast (< 10s)
- [ ] Verify tests can run in parallel

**Day 5: Review & Adjust**
- [ ] Code review
- [ ] Performance tuning
- [ ] Documentation
- [ ] Get team feedback

### Phase 2: Full Implementation (Week 2-3)

**Week 2: Core Features**
- [ ] Account creation tests (3 scenarios)
- [ ] Withdrawal tests (4 scenarios)
- [ ] Transfer tests (5 scenarios)

**Week 3: Complex Features**
- [ ] Payment tests (5 scenarios)
- [ ] Refund tests (6 scenarios)
- [ ] Edge cases (concurrent operations, limits)

### Phase 3: Migration (Week 4)

**Day 1-2: Verification**
- [ ] Run both old and new tests
- [ ] Compare coverage
- [ ] Fix any gaps

**Day 3: Switch**
- [ ] Make new tests default
- [ ] Move old tests to `test/e2e-old/`
- [ ] Update CI/CD

**Day 4-5: Cleanup**
- [ ] Delete old test helpers
- [ ] Delete unused dependencies
- [ ] Update documentation
- [ ] Remove old tests

---

## 📈 Success Metrics

### Before (Old Tests)
- ❌ Test execution time: 5-10 minutes
- ❌ Flaky tests: 20% failure rate
- ❌ Hard to debug: Console logs everywhere
- ❌ Hard to add new tests: Complex setup
- ❌ Parallel execution: Not possible

### After (New Tests)
- ✅ Test execution time: < 2 minutes
- ✅ Flaky tests: < 1% failure rate
- ✅ Easy to debug: Clear failures
- ✅ Easy to add new tests: Copy-paste pattern
- ✅ Parallel execution: Fully supported

---

## 🎓 Principles & Best Practices

### 1. Test Like a User
```typescript
// ❌ BAD: Testing implementation details
expect(eventStore.getEvents('Account', id)).toHaveLength(3);
expect(saga.step1Completed).toBe(true);

// ✅ GOOD: Testing observable behavior
expect(balance).toBe('100.00');
expect(transaction.status).toBe('COMPLETED');
```

### 2. One Assertion Per Concept
```typescript
// ❌ BAD: Multiple unrelated assertions
it('should work', async () => {
  // Tests 5 different things
});

// ✅ GOOD: Clear, focused tests
it('should increase balance after top-up', async () => {
  // Tests one thing clearly
});
```

### 3. Clear Test Names
```typescript
// ❌ BAD: Vague names
it('test 1', () => {});
it('works correctly', () => {});

// ✅ GOOD: Descriptive names
it('should reject top-up with wrong currency', () => {});
it('should handle concurrent transfers without race conditions', () => {});
```

### 4. Independent Tests
```typescript
// ❌ BAD: Tests depend on each other
let sharedAccount;
it('test 1', () => { sharedAccount = ...; });
it('test 2', () => { use(sharedAccount); });

// ✅ GOOD: Each test is independent
it('test 1', () => {
  const account = await createAccount();
  // ...
});
it('test 2', () => {
  const account = await createAccount();
  // ...
});
```

### 5. Minimal Setup
```typescript
// ❌ BAD: Complex per-test setup
beforeEach(() => {
  // 50 lines of setup
});

// ✅ GOOD: Simple, reusable helpers
beforeEach(() => {
  TestSetup.beforeEach();
});
```

---

## 🚀 Getting Started

### For POC Development

```bash
# 1. Create POC branch
git checkout -b feature/e2e-testing-poc

# 2. Create test structure
mkdir -p test/e2e-new/{setup,helpers,features/transactions}

# 3. Implement POC files
# - test-setup.ts
# - test-api.ts
# - topup.e2e.spec.ts

# 4. Run POC tests
npm run test:e2e:new

# 5. Verify success
# - All 5 tests pass
# - Run time < 10 seconds
# - Can run in parallel
```

### For Full Implementation

After POC approval:
1. Follow Phase 2 plan (implement remaining features)
2. Run old and new tests in parallel
3. Compare coverage
4. Switch to new tests
5. Delete old tests

---

## ❓ FAQ

**Q: Why not fix the existing tests?**
A: The existing tests are tightly coupled to implementation details (sagas, events, projections). Fixing them would require similar amount of work as writing new ones, and we'd still have the same maintainability issues.

**Q: Can we reuse any existing test code?**
A: Yes! Test data, account setup patterns, and some assertions can be reused. But the core test structure and helpers will be new.

**Q: What about Kafka testing?**
A: Most tests won't need Kafka (use in-memory event bus). We'll have a small separate suite for Kafka-specific tests (< 10% of tests).

**Q: How do we handle async saga completion?**
A: The `TestAPI` will hide this complexity with smart waiting (check status, poll with timeout). Tests will look synchronous.

**Q: Will tests still verify double-entry bookkeeping?**
A: Yes! But by checking balances on both accounts, not by inspecting internal transactions or events.

**Q: What if a test fails?**
A: Clear error messages, no need to dig through console logs. Jest will show exactly what assertion failed and why.

---

## 📚 References

- [Testing Best Practices](https://testingjavascript.com/)
- [BDD with Jest](https://jestjs.io/docs/api#describename-fn)
- [Testing NestJS](https://docs.nestjs.com/fundamentals/testing)
- [TestContainers](https://www.testcontainers.org/)

---

**Status:** 📋 **PROPOSAL - Pending Approval**  
**Next Step:** Implement POC (Phase 1, Day 1-2)  
**ETA:** 1 week for POC, 3 weeks for full implementation



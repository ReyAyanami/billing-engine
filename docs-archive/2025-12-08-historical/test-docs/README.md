# E2E Tests - New Architecture

## 🎯 Overview

This directory contains the **new E2E test suite** built from scratch with modern best practices.

### Why New Tests?

The old tests were:
- ❌ Complex (event stores, polling, projections)
- ❌ Slow (5-10 minutes)
- ❌ Flaky (timing issues)
- ❌ Hard to maintain (tight coupling to implementation)

The new tests are:
- ✅ Simple (test like a user)
- ✅ Fast (< 2 minutes)
- ✅ Reliable (proper isolation)
- ✅ Maintainable (clear patterns)

## 📁 Structure

```
e2e-new/
├── setup/
│   └── test-setup.ts          # Global setup & teardown
│
├── helpers/
│   └── test-api.ts            # Simplified test API
│
├── features/
│   ├── accounts/              # Account tests
│   │   ├── create-account.e2e.spec.ts
│   │   └── account-balance.e2e.spec.ts
│   │
│   └── transactions/          # Transaction tests
│       ├── topup.e2e.spec.ts       (POC - start here!)
│       ├── withdrawal.e2e.spec.ts
│       ├── transfer.e2e.spec.ts
│       ├── payment.e2e.spec.ts
│       └── refund.e2e.spec.ts
│
└── README.md                  # This file
```

## 🚀 Quick Start

### Run POC Test

```bash
# Run just the topup test (POC)
npm run test:e2e:new -- topup

# Run all new tests
npm run test:e2e:new

# Run with coverage
npm run test:e2e:new -- --coverage
```

### Write a New Test

```typescript
import { TestSetup } from '../../setup/test-setup';
import { TestAPI } from '../../helpers/test-api';

describe('Feature: My Feature', () => {
  let testApi: TestAPI;

  beforeAll(async () => {
    const app = await TestSetup.beforeAll();
    testApi = new TestAPI(app);
  });

  afterAll(() => TestSetup.afterAll());
  beforeEach(() => TestSetup.beforeEach());
  afterEach(() => TestSetup.afterEach());

  it('should do something', async () => {
    // GIVEN: Initial state
    const account = await testApi.createAccount({ currency: 'USD' });

    // WHEN: Action
    await testApi.topup(account.id, '100.00', 'USD');

    // THEN: Expected outcome
    const balance = await testApi.getBalance(account.id);
    expect(balance.balance).toBe('100.00');
  });
});
```

## 🏗️ Architecture

### Test Layers

```
┌─────────────────────────────────────────┐
│  Test File (topup.e2e.spec.ts)         │
│  - Given/When/Then scenarios            │
│  - Business logic verification          │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│  TestAPI (test-api.ts)                  │
│  - Simplified interface                 │
│  - Hides async complexity               │
│  - Smart waiting                        │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│  CQRS (CommandBus/QueryBus)             │
│  - Commands & Queries                   │
│  - Event handling                       │
│  - Saga coordination                    │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│  Database (PostgreSQL)                  │
│  - Transaction isolation                │
│  - Rollback per test                    │
└─────────────────────────────────────────┘
```

### Key Components

#### 1. TestSetup (`setup/test-setup.ts`)

Handles application lifecycle:
- `beforeAll()`: Start app, connect to DB
- `afterAll()`: Close app
- `beforeEach()`: Start transaction (isolation)
- `afterEach()`: Rollback transaction

#### 2. TestAPI (`helpers/test-api.ts`)

Provides simple API for tests:
- Account operations: `createAccount()`, `getBalance()`
- Transactions: `topup()`, `transfer()`, `payment()`, `refund()`
- Utilities: `generateId()`, smart waiting

#### 3. Test Files (`features/**/*.e2e.spec.ts`)

Business logic tests:
- Given-When-Then structure
- Black-box testing
- User perspective

## 🎨 Testing Patterns

### Pattern 1: Simple Happy Path

```typescript
it('should work correctly', async () => {
  // GIVEN
  const account = await testApi.createAccount({ currency: 'USD' });
  
  // WHEN
  await testApi.topup(account.id, '100.00', 'USD');
  
  // THEN
  const balance = await testApi.getBalance(account.id);
  expect(balance.balance).toBe('100.00');
});
```

### Pattern 2: Error Case

```typescript
it('should reject invalid input', async () => {
  // GIVEN
  const account = await testApi.createAccount({ currency: 'USD' });
  
  // WHEN/THEN
  await expect(
    testApi.topup(account.id, '100.00', 'EUR')
  ).rejects.toThrow();
});
```

### Pattern 3: Multi-Step Flow

```typescript
it('should handle complex scenario', async () => {
  // GIVEN
  const sender = await testApi.createAccount({ currency: 'USD' });
  const receiver = await testApi.createAccount({ currency: 'USD' });
  await testApi.topup(sender.id, '100.00', 'USD');
  
  // WHEN
  await testApi.transfer(sender.id, receiver.id, '50.00', 'USD');
  
  // THEN
  expect((await testApi.getBalance(sender.id)).balance).toBe('50.00');
  expect((await testApi.getBalance(receiver.id)).balance).toBe('50.00');
});
```

## ✅ Best Practices

### DO ✅

- Test business logic outcomes
- Use Given-When-Then structure
- Make tests independent
- Use descriptive test names
- Test error scenarios
- Verify balance changes
- Test idempotency

### DON'T ❌

- Test implementation details (sagas, events)
- Share state between tests
- Use hardcoded IDs
- Skip error cases
- Write vague test names
- Test multiple concepts in one test
- Duplicate test logic

## 🔧 Utilities

### TestAPI Methods

**Accounts:**
- `createAccount(params)` - Create account with defaults
- `createExternalAccount(currency)` - For topup/withdrawal
- `getAccount(accountId)` - Get full account details
- `getBalance(accountId)` - Get balance only
- `updateAccountStatus(accountId, status)` - Change status

**Transactions:**
- `topup(accountId, amount, currency, options)` - Add funds
- `withdraw(accountId, amount, currency, options)` - Remove funds
- `transfer(fromId, toId, amount, currency, options)` - Move funds
- `payment(customerId, merchantId, amount, currency, options)` - Process payment
- `refund(originalTxId, amount, options)` - Refund payment
- `getTransaction(transactionId)` - Get transaction details

**Utilities:**
- `generateId(prefix)` - Generate unique test IDs

## 📊 Performance

### Current Performance (POC)

- **Individual test:** < 5 seconds
- **Full topup suite:** < 30 seconds (8 scenarios)
- **Expected full suite:** < 2 minutes

### Optimization Tips

1. **Use transaction rollback** (already implemented)
2. **Run tests in parallel** (configure with `maxWorkers`)
3. **Minimize database queries** (TestAPI handles this)
4. **Use smart waiting** (not fixed timeouts)

## 🐛 Debugging

### Test Fails

1. Check error message (should be clear)
2. Verify account exists
3. Check balance before/after
4. Look at transaction status
5. Use `console.log` sparingly

### Test Hangs

1. Check timeout configuration (default 30s)
2. Verify saga is completing
3. Check for deadlocks
4. Look at projection updates

### Database Issues

1. Ensure PostgreSQL is running
2. Check connection settings
3. Verify migrations are applied
4. Try manual cleanup: `TestSetup.cleanDatabaseManually()`

## 📈 Migration Plan

### Phase 1: POC ✅
- [x] Create new structure
- [x] Implement TestSetup
- [x] Implement TestAPI
- [x] Write topup tests

### Phase 2: Core Features
- [ ] Account creation tests
- [ ] Withdrawal tests
- [ ] Transfer tests

### Phase 3: Advanced Features
- [ ] Payment tests
- [ ] Refund tests
- [ ] Edge cases

### Phase 4: Migration
- [ ] Run both test suites in parallel
- [ ] Compare coverage
- [ ] Switch to new tests
- [ ] Delete old tests

## 🎓 Learn More

- [Strategy Document](../../docs/E2E_TESTING_STRATEGY.md) - Full rationale
- [Old Tests](../e2e/) - For comparison
- [NestJS Testing](https://docs.nestjs.com/fundamentals/testing) - Official docs

## 💡 Tips

1. **Start simple**: Copy the topup test pattern
2. **Test outcomes**: Not implementation
3. **Use TestAPI**: Don't bypass it
4. **Keep it readable**: Future you will thank you
5. **Test errors**: They're important too

---

**Status:** 🚧 **POC Complete** - Ready for expansion  
**Next:** Implement remaining transaction types  
**Questions?** Check the strategy doc or ask the team


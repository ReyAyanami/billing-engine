# New E2E Testing Approach - Direct Service/HTTP Testing

## 🎯 Problem Identified

The current approach uses CQRS CommandBus/QueryBus which introduces async event processing delays:
- Creating account: 2-5 seconds (should be 50ms)
- Processing transaction: 3-10 seconds (should be 100ms)
- Tests taking 5+ minutes (should be < 1 minute)

**Root cause**: NestJS EventBus processes events asynchronously (process.nextTick), causing unavoidable delays even with InMemoryEventStore.

---

## ✅ Better Approach: Test at Service/HTTP Level

Instead of:
```typescript
// ❌ SLOW: Goes through CQRS → EventBus → Async handlers
await commandBus.execute(new TopupCommand(...));
await waitForTransaction(); // Needs 3 second sleep
```

Do this:
```typescript
// ✅ FAST: Direct service call
const result = await transactionService.topup({...});
// Result is immediate, no waiting needed!
```

---

## 🚀 Implementation Plan

### Option A: Service-Level Tests (Fastest)
Test through services directly:
```typescript
class TestAPI {
  constructor(
    private transactionService: TransactionService,
    private accountService: AccountService,
  ) {}

  async createAccount(params) {
    return await this.accountService.create(params, context);
  }

  async topup(accountId, amount, currency) {
    return await this.transactionService.topup({
      accountId,
      amount,
      currency,
      idempotencyKey: uuid(),
    }, context);
  }
}
```

**Benefits:**
- ⚡ Instant results (no event bus)
- ✅ Tests business logic
- ✅ Fast (< 1 second per test)

### Option B: HTTP-Level Tests (Most Realistic)
Test through REST API:
```typescript
class TestAPI {
  constructor(private app: INestApplication) {}

  async createAccount(params) {
    const response = await request(this.app.getHttpServer())
      .post('/api/v1/accounts')
      .send(params);
    return response.body;
  }

  async topup(accountId, amount, currency) {
    const response = await request(this.app.getHttpServer())
      .post('/api/v1/transactions/topup')
      .send({ accountId, amount, currency });
    return response.body;
  }
}
```

**Benefits:**
- ⚡ Fast (synchronous HTTP)
- ✅ Tests full stack
- ✅ Most realistic (how users actually use it)

---

## 📊 Comparison

| Approach | Speed | Realism | Complexity |
|----------|-------|---------|------------|
| **Current (CQRS)** | ❌ Slow (5 min) | Medium | High |
| **Service-Level** | ✅ Fast (30s) | Medium | Low |
| **HTTP-Level** | ✅ Fast (45s) | ✅ High | Low |

---

## 🎯 Recommendation

**Use HTTP-Level Testing (Option B)**

Why?
1. Tests how users actually interact with the system
2. Fast (no async event delays)
3. Simple TestAPI implementation
4. Covers full stack (controllers, validation, services)
5. Easy to understand and maintain

---

## 💡 What About Event Sourcing?

**Keep it for production, skip it in most tests!**

- **Production**: Use Kafka + Event Sourcing (important for auditability)
- **E2E Tests**: Test business logic via HTTP (fast, reliable)
- **Integration Tests**: Test Kafka specifically (1-2 tests, separate suite)

This follows the testing pyramid:
- Many fast unit tests
- Some fast E2E tests (HTTP)
- Few slow integration tests (Kafka)

---

## 🔧 Implementation Steps

1. **Update TestAPI** to use HTTP requests instead of CommandBus
2. **Remove sleeps/timeouts** - not needed with sync HTTP
3. **Keep test structure** - Given-When-Then still works
4. **Run tests** - should complete in < 1 minute

Want me to implement this?


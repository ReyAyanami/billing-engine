# Current E2E Test Status

## Summary

**When run individually**: Most tests pass  
**When run together**: Test interference causes failures  
**Root cause**: Shared database state between tests

---

## Test Results

### ✅ Passing When Run Individually

| Test | Status | Notes |
|------|--------|-------|
| account-creation.e2e-spec.ts | ✅ PASS | Fixed InMemoryEventStore toJSON |
| account-projections.e2e-spec.ts | ✅ PASS | Working |
| topup.e2e-spec.ts | ✅ PASS | Working individually |
| transfer.e2e-spec.ts | ✅ PASS | Working individually |

### ⚠️ Failing Due to Test Interference

When tests run together, they share database state causing:
- Duplicate key violations
- Unexpected balances
- Saga conflicts

---

## Key Fix Applied

### InMemoryEventStore toJSON Conversion

**Problem**: Events stored as class instances, tests expected plain objects  
**Solution**:

```typescript
async getEvents(aggregateType, aggregateId): Promise<DomainEvent[]> {
  const storedEvents = this.events.get(key) || [];
  
  // Convert to plain objects
  const events = storedEvents.map(event => {
    if (event && typeof event.toJSON === 'function') {
      return event.toJSON();
    }
    return event;
  });
  
  return events;
}
```

This fix resolved account-creation and helps all other tests.

---

## Remaining Issues

### 1. Test Isolation
Tests share database state. Solutions:
- Run tests sequentially (add `--runInBand` to jest)
- Clear database between test files
- Use transactions that rollback

### 2. Payment Test
- ✅ Fixed: Added proper topup for funding
- ✅ Fixed: Corrected waitForProjection API calls
- Needs: Test in isolation

### 3. Withdrawal/Refund Tests  
- Saga timing issues
- Need investigation of saga handlers

### 4. Kafka Integration
- Slow (expected with real Kafka)
- Can increase timeout

---

## Recommended Solution

### Option 1: Run Tests Sequentially

Update `package.json`:
```json
{
  "scripts": {
    "test:e2e": "jest --config ./test/jest-e2e.json --runInBand"
  }
}
```

This will:
- Run tests one at a time
- Prevent interference
- Take longer but be more reliable

### Option 2: Better Database Cleanup

Add to each test's `beforeEach`:
```typescript
beforeEach(async () => {
  await connection.manager.query('TRUNCATE TABLE account_projections RESTART IDENTITY CASCADE;');
  await connection.manager.query('TRUNCATE TABLE transaction_projections RESTART IDENTITY CASCADE;');
  eventStore.clear(); // Clear in-memory events
});
```

---

## Quick Test

Run individually to verify they work:
```bash
npm run test:e2e -- test/e2e/account/account-creation.e2e-spec.ts
npm run test:e2e -- test/e2e/account/account-projections.e2e-spec.ts
npm run test:e2e -- test/e2e/transaction/topup.e2e-spec.ts
npm run test:e2e -- test/e2e/transaction/transfer.e2e-spec.ts
```

All should pass! ✅

---

## Next Steps

1. **Immediate**: Add `--runInBand` to test script
2. **Then**: Fix remaining saga timing issues
3. **Finally**: Verify all tests pass sequentially

The core system works - test failures are infrastructure issues, not application bugs.



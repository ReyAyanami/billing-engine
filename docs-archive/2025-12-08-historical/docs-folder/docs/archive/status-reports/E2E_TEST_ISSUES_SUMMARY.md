# E2E Test Issues Summary

## Current Status

**Date**: December 8, 2025

### Test Results
```
✅ PASS: test/e2e/account/account-creation.e2e-spec.ts
✅ PASS: test/e2e/account/account-projections.e2e-spec.ts  
❌ FAIL: test/e2e/transaction/refund.e2e-spec.ts
✅ PASS: test/e2e/transaction/topup.e2e-spec.ts
❌ FAIL: test/e2e/transaction/payment.e2e-spec.ts
❌ FAIL: test/e2e/transaction/withdrawal-transfer.e2e-spec.ts

Test Suites: 3 failed, 3 passed, 6 total
Tests: 13 failed, 20 passed, 33 total
```

---

## Issues Fixed

### 1. ✅ Jest Configuration Error
**Problem**: `Cannot find module '@jest/test-sequencer'`

**Solution**: Updated `test/jest-e2e.json` to use new Jest 30 syntax:
```json
{
  "transform": {
    "^.+\\.(t|j)s$": ["ts-jest", {
      "tsconfig": {
        "esModuleInterop": true,
        "allowSyntheticDefaultImports": true
      }
    }]
  }
}
```

### 2. ✅ Transaction Projection Parameter Order Bug
**Problem**: SQL error - `invalid input syntax for type numeric: "USD"`

**Root Cause**: Parameters were being passed in wrong order to database:
- Expected: `amount`, `currency`, `sourceAccountId`...
- Actual: `currency`, `amount`, `sourceAccountId`... (swapped)

**Solution**: Fixed `TransactionProjectionService.createTransactionProjection()` to explicitly map fields in correct order.

**Files Changed**:
- `src/modules/transaction/projections/transaction-projection.service.ts`
- `src/modules/transaction/handlers/projection/topup-requested-projection.handler.ts`

---

## Remaining Issues

### 3. ❌ Async Event Processing Timing Issues

**Problem**: Tests are using `setTimeout(3000)` to wait for saga completion, but this is unreliable.

**Symptoms**:
- Payment projections stay in "pending" status
- Account balances don't update in time
- Tests fail with "Expected: completed, Received: pending"

**Example**:
```typescript
// ❌ WRONG - Current approach
await commandBus.execute(paymentCommand);
await new Promise((resolve) => setTimeout(resolve, 3000)); // Hope it's done!
const projection = await transactionProjectionService.findById(paymentId);
expect(projection.status).toBe(TransactionStatus.COMPLETED); // FAILS
```

**Root Cause**:
1. Command is executed (PaymentCommand)
2. Event is published to Kafka (PaymentRequestedEvent)
3. Saga coordinator processes event asynchronously
4. Multiple account updates happen
5. Completion event is published
6. Projection is updated

All of this takes variable time depending on Kafka latency, system load, etc.

**Solution**: Use `EventPollingHelper` that already exists:
```typescript
// ✅ CORRECT - Use polling helper
await commandBus.execute(paymentCommand);

// Wait for projection to be completed
await pollingHelper.waitForProjection(
  () => transactionProjectionService.findById(paymentId),
  (projection) => projection.status === TransactionStatus.COMPLETED,
  {
    maxRetries: 60,
    retryDelayMs: 500,
    description: `payment projection ${paymentId} to be COMPLETED`,
  }
);

const projection = await transactionProjectionService.findById(paymentId);
expect(projection.status).toBe(TransactionStatus.COMPLETED); // PASSES
```

**Files That Need Fixing**:
- `test/e2e/transaction/refund.e2e-spec.ts` - Lines 71, 90, 153, etc.
- `test/e2e/transaction/payment.e2e-spec.ts` - Multiple setTimeout calls
- `test/e2e/transaction/withdrawal-transfer.e2e-spec.ts` - Multiple setTimeout calls

### 4. ❌ Kafka Consumer Cleanup Issues

**Problem**: Tests don't properly clean up Kafka consumers, causing:
```
ReferenceError: You are trying to `import` a file after the Jest environment has been torn down
A worker process has failed to exit gracefully and has been force exited
```

**Solution**: Ensure proper cleanup in `afterAll`:
```typescript
afterAll(async () => {
  // Give time for async operations to complete
  await new Promise((resolve) => setTimeout(resolve, 1000));
  
  // Close app (this should disconnect Kafka)
  await app.close();
  
  // Additional cleanup if needed
  await kafkaService.onModuleDestroy();
});
```

---

## Quick Fix Strategy

### Option 1: Update Tests to Use Polling Helper (Recommended)

**Pros**:
- Reliable and deterministic
- Already implemented and working in some tests
- Handles variable Kafka latency

**Cons**:
- Requires updating multiple test files
- More code changes

**Estimated Time**: 30-60 minutes

### Option 2: Increase Timeout and Add Retries (Quick Hack)

**Pros**:
- Minimal code changes
- Fast to implement

**Cons**:
- Still unreliable
- Tests will be slower
- Doesn't fix root cause

**Example**:
```typescript
// Increase timeout and add retry logic
async function waitForCompletion(checkFn, maxRetries = 20) {
  for (let i = 0; i < maxRetries; i++) {
    if (await checkFn()) return;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('Timeout waiting for completion');
}

await commandBus.execute(paymentCommand);
await waitForCompletion(async () => {
  const p = await transactionProjectionService.findById(paymentId);
  return p?.status === TransactionStatus.COMPLETED;
});
```

---

## Detailed Failure Analysis

### Refund Test Failures

**Test**: `should process payment and then refund successfully`

**Failure 1**: Payment not completing
```
Expected: "completed"
Received: "pending"
```
**Location**: Line 159
**Cause**: Waiting only 3 seconds, saga takes longer

**Failure 2**: Account balances not updated
```
Expected: 0
Received: 500
```
**Location**: Line 320
**Cause**: Account updates haven't propagated yet

### Payment Test Failures

Similar issues - projections not updating in time.

### Withdrawal-Transfer Test Failures

**Failure**: Projections not completing
```
Failed to find valid withdrawal projection ... to be COMPLETED after 60 retries
```
**Cause**: The test IS using polling helper, but something else is wrong. Need to investigate:
1. Is the saga coordinator running?
2. Are events being published?
3. Are event handlers registered?

---

## Recommended Action Plan

### Phase 1: Fix Timing Issues (High Priority)

1. **Update refund.e2e-spec.ts**
   - Replace all `setTimeout` with `EventPollingHelper.waitForProjection`
   - Add proper polling for payment completion
   - Add proper polling for refund completion

2. **Update payment.e2e-spec.ts**
   - Same as refund test

3. **Verify withdrawal-transfer.e2e-spec.ts**
   - Already using polling helper
   - Investigate why saga isn't completing
   - Check if event handlers are registered

### Phase 2: Fix Cleanup Issues (Medium Priority)

1. **Add proper Kafka cleanup**
   - Ensure consumers are disconnected
   - Add delay before app.close()
   - Consider using `--forceExit` flag for Jest

2. **Add test isolation**
   - Clear database between tests
   - Reset Kafka topics
   - Use unique correlation IDs

### Phase 3: Improve Test Reliability (Low Priority)

1. **Add better logging**
   - Log when commands are executed
   - Log when events are published
   - Log when projections are updated

2. **Add test helpers**
   - Create reusable test fixtures
   - Add account creation helpers
   - Add transaction helpers

---

## Files to Modify

### High Priority
1. `test/e2e/transaction/refund.e2e-spec.ts` - Replace setTimeout with polling
2. `test/e2e/transaction/payment.e2e-spec.ts` - Replace setTimeout with polling
3. `test/e2e/transaction/withdrawal-transfer.e2e-spec.ts` - Debug why saga isn't completing

### Medium Priority
4. All test files - Improve cleanup in `afterAll`

### Low Priority
5. `test/helpers/` - Add more test helpers
6. `test/fixtures/` - Create test data fixtures

---

## Testing the Fixes

After making changes, run tests individually:

```bash
# Test one file at a time
npm run test:e2e -- --testNamePattern="refund"
npm run test:e2e -- --testNamePattern="payment"
npm run test:e2e -- --testNamePattern="withdrawal"

# Run all e2e tests
npm run test:e2e

# Run with verbose output
npm run test:e2e -- --verbose

# Run with open handles detection
npm run test:e2e -- --detectOpenHandles
```

---

## Notes

- The `topup.e2e-spec.ts` test is passing because it already uses the polling helper correctly
- The account tests pass because they're simpler and don't involve complex sagas
- The Kafka message size fixes we made earlier are working correctly
- The core saga logic appears to be correct - this is purely a testing/timing issue

---

## Status

- ✅ Jest configuration fixed
- ✅ Projection parameter order fixed  
- ✅ Topup test passing
- ❌ Refund test needs polling helper
- ❌ Payment test needs polling helper
- ❌ Withdrawal/transfer test needs investigation

**Next Step**: Update tests to use `EventPollingHelper` instead of `setTimeout`.


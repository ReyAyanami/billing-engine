# E2E Test Suite

## Running E2E Tests

### ✅ Recommended (Sequential Execution)
```bash
npm run test:e2e
# or
npx jest test/e2e --runInBand
```

### ⚠️ Not Recommended (Parallel Execution)
```bash
npx jest test/e2e  # Uses maxWorkers: 2 from package.json
```

## Why Sequential Execution?

E2E tests use event sourcing with eventual consistency:
- Commands execute synchronously (write model)
- Projections update asynchronously (read model)
- Tests query projections for assertions

**Problem with Parallel Execution:**
- Multiple test workers share the same database
- Projection event handlers compete for database connections
- Event processing can be delayed significantly
- Tests may timeout waiting for projections

**Solution:**
- Run tests sequentially with `maxWorkers: 1`
- Each test completes before the next starts
- No contention for database resources
- Reliable projection updates

## Architectural Notes

### Immediate Consistency (Write Model)
- ✅ Account creation/updates return aggregate state directly
- ✅ No waiting for projections after account commands
- ✅ Write model serves reads for simple operations

### Eventual Consistency (Read Model)
- ⏳ Transaction operations trigger sagas
- ⏳ Sagas complete synchronously (query via `/api/v1/sagas/:id`)
- ⏳ Projections update asynchronously via event handlers
- ⏳ Balance queries read from projections (eventual consistency)

### Future Improvements
Consider returning transaction state from sagas to eliminate projection waits:
- Saga completion already tracked synchronously
- Could return account balances from saga state
- Would eliminate need for `getBalance()` polling

## Test Helper Timeouts

Current timeouts are configured for parallel execution (though not recommended):
- `pollTransactionCompletion`: 10 seconds
- `getBalance` polling: 10 seconds
- `waitForAccountProjection`: 10 seconds
- `waitForTransactionProjection`: 10 seconds

For sequential execution (`maxWorkers: 1`), much lower timeouts would suffice (< 1 second).


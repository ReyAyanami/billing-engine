# Fault Tolerance Implementation

This document describes the fault tolerance features implemented in the billing engine.

## Overview

The billing engine now includes comprehensive fault tolerance features to ensure data consistency, enable recovery from failures, and provide operational tools for maintaining system integrity.

## Features Implemented

### 1. Projection Rebuilding

**Purpose**: Recover from projection corruption by reconstructing projections from event store.

**Services**:
- `AccountProjectionRebuildService`
- `TransactionProjectionRebuildService`

**Usage**:
```typescript
// Rebuild single account
await accountRebuildService.rebuildAccount(accountId);

// Rebuild all accounts (use with caution!)
await accountRebuildService.rebuildAllAccounts();
```

**API Endpoints**:
- `POST /api/v1/admin/accounts/:id/rebuild`
- `POST /api/v1/admin/accounts/rebuild-all`
- `POST /api/v1/admin/transactions/:id/rebuild`
- `POST /api/v1/admin/transactions/rebuild-all`

### 2. Reconciliation Services

**Purpose**: Verify that projections match event-sourced state, detect inconsistencies.

**Services**:
- `AccountReconciliationService`
- `TransactionReconciliationService`

**Features**:
- Compare projection state with aggregate state rebuilt from events
- Detect balance mismatches
- Detect version conflicts
- Find stuck transactions (pending too long)
- Verify accounting equation

**Usage**:
```typescript
// Reconcile single account
const result = await accountReconciliationService.reconcileAccount(accountId);
if (!result.match) {
  console.log('Issues found:', result.issues);
}

// Reconcile all accounts
const summary = await accountReconciliationService.reconcileAllAccounts();
console.log(`${summary.matches}/${summary.total} accounts match`);

// Find stuck transactions
const stuck = await transactionReconciliationService.findStuckTransactions(5);
```

**API Endpoints**:
- `GET /api/v1/admin/accounts/:id/reconcile`
- `GET /api/v1/admin/accounts/reconcile-all`
- `GET /api/v1/admin/accounts/accounting-equation`
- `GET /api/v1/admin/transactions/:id/reconcile`
- `GET /api/v1/admin/transactions/reconcile-all`
- `GET /api/v1/admin/transactions/stuck`

### 3. Retry Utility

**Purpose**: Automatically retry operations that fail due to transient errors.

**Location**: `src/common/utils/retry.util.ts`

**Features**:
- Exponential backoff with jitter
- Configurable retry attempts and delays
- Detects retryable errors (deadlocks, timeouts, etc.)

**Usage**:
```typescript
import { RetryUtil } from '../../common/utils/retry.util';

const result = await RetryUtil.executeWithRetry(
  async () => await someOperation(),
  'Operation context',
  {
    maxAttempts: 3,
    baseDelayMs: 1000,
    exponentialBackoff: true,
  }
);
```

**Retryable Errors**:
- `DEADLOCK`
- `CONNECTION_LOST`
- `ECONNREFUSED`
- `ETIMEDOUT`
- `OptimisticLockException`

### 4. Exception Handling

**New Exceptions**:
- `OptimisticLockException` - Version conflict during concurrent updates
- `InvariantViolationException` - Aggregate state violates business rules
- `ProjectionOutOfSyncException` - Projection doesn't match events

**Location**: `src/common/exceptions/billing.exception.ts`

### 5. Invariant Validation

**Purpose**: Validate aggregate state after applying events.

**Implementation**: Added `validateInvariants()` method to `AccountAggregate`

**Checks**:
- Balance cannot be negative
- Balance must not exceed max balance
- Balance must not go below min balance
- Max balance must be greater than min balance

**Usage**:
```typescript
const aggregate = AccountAggregate.fromEvents(events);
aggregate.validateInvariants(); // Throws if invariants violated
```

### 6. Admin API

**Purpose**: Expose fault tolerance operations via REST API.

**Module**: `AdminModule`
**Controller**: `AdminController`

**Endpoints**: See sections above for full list.

**Swagger Documentation**: Available at `/api-docs` when server is running.

## Testing

### Unit Tests

Location: `test/unit/fault-tolerance.spec.ts`

**Test Coverage**:
- Invariant validation (negative balance, max balance, valid state)
- Reconciliation (balance mismatch detection, matching state)
- Projection rebuilding (from events, error handling)

**Run Tests**:
```bash
npm test fault-tolerance.spec
```

## Architecture

### Event Sourcing Flow

```
Command → Aggregate → Events → Event Store (Kafka)
                              ↓
                         Event Bus
                              ↓
                      Projection Handlers
                              ↓
                      Projections (PostgreSQL)
```

### Fault Tolerance Flow

```
Projection Corruption Detected
         ↓
   Reconciliation Service
         ↓
   Detects Mismatch
         ↓
   Rebuild Service
         ↓
   Load Events from Event Store
         ↓
   Reconstruct Aggregate
         ↓
   Extract State
         ↓
   Overwrite Projection
         ↓
   Verify with Reconciliation
```

## Operational Guidelines

### When to Use Rebuild

- **Projection corruption detected**: Reconciliation shows mismatches
- **Schema migration**: Projection schema changed
- **Bug fix**: Projection update logic was buggy
- **Manual intervention**: Admin manually modified projection

### When to Use Reconciliation

- **Regular health checks**: Run daily/weekly
- **After incidents**: Verify consistency post-failure
- **Before critical operations**: Ensure data integrity
- **Monitoring**: Detect issues proactively

### Best Practices

1. **Always reconcile before rebuild**: Understand what's wrong first
2. **Rebuild single entities first**: Test on one before rebuilding all
3. **Monitor stuck transactions**: They may indicate saga issues
4. **Log all admin operations**: Audit trail for rebuilds/reconciliations
5. **Run in maintenance window**: Rebuilding all can be resource-intensive

## Performance Considerations

### Projection Rebuilding

- **Single entity**: Fast (~10-100ms depending on event count)
- **All entities**: Slow, O(N) where N = number of entities
- **Recommendation**: Use sparingly, prefer targeted rebuilds

### Reconciliation

- **Single entity**: Fast (~50-200ms)
- **All entities**: Moderate, O(N) comparisons
- **Recommendation**: Can run regularly (daily checks)

### Stuck Transaction Detection

- **Query time**: Fast (~10-50ms)
- **Recommendation**: Run frequently (every minute)

## Future Enhancements

### Possible Additions

1. **Automated Reconciliation**: Scheduled jobs to detect and fix mismatches
2. **Projection Lag Monitoring**: Track how far behind projections are
3. **Event Replay with Filtering**: Rebuild from specific point in time
4. **Saga Recovery**: Auto-retry/compensate stuck sagas
5. **Snapshot Support**: Speed up aggregate reconstruction
6. **Audit Logging**: Track all admin operations
7. **Bulk Operations**: Batch rebuilds with progress tracking
8. **Alerting**: Notify on reconciliation failures

## Related Documentation

- [Event Sourcing Architecture](./architecture/event-sourcing.md)
- [CQRS Pattern](./architecture/cqrs-pattern.md)
- [Idempotency](./concepts/idempotency.md)
- [Audit Trail](./concepts/audit-trail.md)

## Support

For questions or issues related to fault tolerance features:

1. Check reconciliation results for details
2. Review event store for missing/corrupted events
3. Verify projection update handlers
4. Check saga state for stuck transactions
5. Review application logs for errors


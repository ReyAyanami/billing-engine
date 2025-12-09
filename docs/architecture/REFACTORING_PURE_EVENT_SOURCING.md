# Refactoring to Pure Event Sourcing

## Overview

This document describes the architectural refactoring from a **hybrid CQRS/traditional database** approach to **pure event sourcing**.

## Previous Architecture (Hybrid)

```
┌─────────────────────────────────────────────────────────────┐
│                    WRITE SIDE                                │
├─────────────────────────────────────────────────────────────┤
│  Account Entity (accounts table) ❌ REDUNDANT                │
│  ├─ Direct database writes                                   │
│  ├─ Updated by event handlers (duplication!)                 │
│  └─ Inconsistent with event sourcing                         │
│                                                               │
│  AccountAggregate (in-memory, event-sourced)                 │
│  ├─ Used for balance changes                                 │
│  ├─ Reconstructed from Kafka events                          │
│  └─ True source of truth for business logic                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     READ SIDE                                │
├─────────────────────────────────────────────────────────────┤
│  AccountProjection (account_projections table)               │
│  ├─ Updated by event handlers                                │
│  ├─ Used for queries                                         │
│  └─ Duplicate of Account entity! ❌                          │
└─────────────────────────────────────────────────────────────┘
```

### Problems with Hybrid Approach

1. **Data Duplication**: Both `accounts` and `account_projections` tables
2. **Inconsistent Patterns**: Account creation bypassed event sourcing
3. **Maintenance Burden**: Two entity handlers for same events
4. **Architectural Confusion**: Mixed paradigms
5. **No Single Source of Truth**: Events vs. database

## New Architecture (Pure Event Sourcing)

```
┌─────────────────────────────────────────────────────────────┐
│                    WRITE SIDE                                │
├─────────────────────────────────────────────────────────────┤
│  ✅ AccountAggregate ONLY (in-memory)                        │
│     ├─ Rebuilt from events on each command                   │
│     ├─ Business logic enforcement                            │
│     ├─ Emits domain events                                   │
│     └─ Events persisted to Kafka                             │
│                                                               │
│  ✅ Single source of truth: Kafka events                     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     READ SIDE                                │
├─────────────────────────────────────────────────────────────┤
│  ✅ AccountProjection (read-optimized)                       │
│     ├─ Updated by event handlers                             │
│     ├─ Denormalized for specific queries                     │
│     ├─ Eventually consistent                                 │
│     └─ Can have multiple projections for different views     │
└─────────────────────────────────────────────────────────────┘
```

## Changes Made

### 1. Created Account Types File

**File**: `src/modules/account/account.types.ts`

Extracted `AccountStatus` and `AccountType` enums from entity to standalone file.

### 2. Refactored AccountService

**Before** (Hybrid):
```typescript
async create(dto) {
  // Direct database write
  const account = await this.accountRepository.save({...});
  
  // Try to backfill events (can fail!)
  await this.commandBus.execute(command);
  
  return account;
}
```

**After** (Pure Event Sourcing):
```typescript
async create(dto) {
  const accountId = uuidv4();
  
  // Command → Aggregate → Events → Kafka
  const command = new CreateAccountCommand({...});
  await this.commandBus.execute(command);
  
  // Wait for projection (eventual consistency)
  await this.waitForProjection(accountId);
  
  // Return projection (read model)
  return await this.findById(accountId);
}
```

### 3. Updated AccountController

Changed all return types from `Account` to `AccountProjection`.

### 4. Updated AccountModule

**Removed**:
- `Account` entity from TypeORM imports
- `AccountCreatedEntityHandler`
- `BalanceChangedEntityHandler`

**Kept**:
- `AccountProjection` (read model)
- Projection event handlers only

### 5. Deleted Files

- ❌ `src/modules/account/account.entity.ts`
- ❌ `src/modules/account/handlers/account-created-entity.handler.ts`
- ❌ `src/modules/account/handlers/balance-changed-entity.handler.ts`

### 6. Created Migration

**File**: `src/migrations/1735000000000-DropAccountsTableEventSourced.ts`

Drops the `accounts` table and foreign key constraints.

### 7. Updated Transaction Module

Removed `Account` entity imports and relations from `Transaction` entity.

## Benefits

### ✅ Architectural Benefits

1. **Single Source of Truth**: Events in Kafka
2. **True CQRS**: Clean separation of read/write models
3. **Consistency**: All writes go through aggregates
4. **Simplicity**: One write path, one read model
5. **Flexibility**: Easy to add new projections

### ✅ Operational Benefits

1. **Event Replay**: Can rebuild projections from events
2. **Audit Trail**: Complete history in Kafka
3. **Time Travel**: Query state at any point in time
4. **Debugging**: Event log shows exact sequence
5. **Scalability**: Read and write sides scale independently

### ✅ Development Benefits

1. **Clear Patterns**: Consistent approach throughout
2. **Less Code**: No duplicate entity handlers
3. **Maintainability**: Single responsibility per component
4. **Testability**: Aggregates are pure functions

## Trade-offs

### Eventual Consistency

**Challenge**: Projections are updated asynchronously

**Solution**: `waitForProjection()` helper in AccountService

```typescript
private async waitForProjection(accountId: string): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await this.findById(accountId);
      return; // Found it!
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}
```

**Production Alternative**: Use SSE or WebSockets for real-time updates

### Projection Corruption

**Challenge**: If projection is corrupted, how to rebuild?

**Solution**: Replay events from Kafka

```typescript
// Rebuild projection from events
const events = await eventStore.getEvents('Account', accountId);
const aggregate = AccountAggregate.fromEvents(events);

// Update projection with current state
await projectionService.rebuild(accountId, aggregate.toSnapshot());
```

### Query Complexity

**Challenge**: Can only query what's in projections

**Solution**: Create multiple specialized projections

```typescript
// Example: Different projections for different use cases
- AccountProjection (general queries)
- AccountBalanceProjection (optimized for balance checks)
- AccountHistoryProjection (audit trail queries)
```

## Migration Guide

### Running the Migration

```bash
# Run migration
npm run migration:run

# Rollback if needed
npm run migration:revert
```

### Data Migration

**Important**: The migration drops the `accounts` table. If you have existing data:

1. **Backup first**: `pg_dump` your database
2. **Verify projections**: Ensure `account_projections` has all data
3. **Run migration**: `npm run migration:run`
4. **Verify**: Check that projections are complete

### Rollback Plan

If issues arise, you can rollback:

```bash
npm run migration:revert
```

This recreates the `accounts` table structure, but **data will be empty**.

To restore data, you would need to:
1. Restore from backup, OR
2. Rebuild from events in Kafka

## Testing

### Unit Tests

Test aggregates in isolation:

```typescript
describe('AccountAggregate', () => {
  it('should create account via events', () => {
    const aggregate = new AccountAggregate();
    aggregate.create({...});
    
    const events = aggregate.getUncommittedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(AccountCreatedEvent);
  });
});
```

### Integration Tests

Test full flow:

```typescript
describe('Account Creation (E2E)', () => {
  it('should create account and update projection', async () => {
    // Command
    const response = await request(app)
      .post('/api/v1/accounts')
      .send({...});
    
    // Projection should be updated
    const account = await accountService.findById(response.body.id);
    expect(account).toBeDefined();
    expect(account.balance).toBe('0.00');
  });
});
```

## Future Enhancements

### 1. Status Change Command

Currently, `updateStatus()` bypasses event sourcing. Should create:

```typescript
class UpdateAccountStatusCommand extends Command {
  constructor(params: {
    accountId: string;
    newStatus: AccountStatus;
    reason: string;
    correlationId?: string;
    actorId?: string;
  }) { ... }
}
```

### 2. Projection Rebuild Tool

CLI tool to rebuild projections from events:

```bash
npm run projection:rebuild -- --entity=Account --id=<uuid>
npm run projection:rebuild -- --entity=Account --all
```

### 3. Snapshot Support

For aggregates with many events, add snapshots:

```typescript
// Store snapshot every N events
if (aggregate.version % 100 === 0) {
  await snapshotStore.save(aggregate.toSnapshot());
}

// Load from snapshot + recent events
const snapshot = await snapshotStore.load(accountId);
const recentEvents = await eventStore.getEventsSince(accountId, snapshot.version);
const aggregate = AccountAggregate.fromSnapshot(snapshot, recentEvents);
```

## Related Documentation

- [CQRS Pattern](./cqrs-pattern.md)
- [Event Sourcing](./event-sourcing.md)
- [Account Module](../modules/account.md)
- [Locking Concepts](../concepts/locking.md) - Event-based lock-free operations

## Summary

This refactoring moves the billing engine to a **pure event-sourced architecture**, eliminating the hybrid approach and establishing a clear, maintainable pattern for all domain entities.

**Key Principle**: Events are the source of truth. Everything else is derived.


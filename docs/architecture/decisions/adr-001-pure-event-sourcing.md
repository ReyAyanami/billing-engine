# ADR-001: Adopt Pure Event Sourcing Architecture

**Date**: December 2025  
**Status**: ✅ Accepted and Implemented

## Context

The billing engine initially used a **hybrid CQRS/traditional database** approach where:
- Entity tables (`accounts`, `transactions`) served as the write model
- Projection tables (`account_projections`, `transaction_projections`) served as the read model
- Aggregates existed in-memory but weren't the primary source of truth
- Events were published to Kafka for audit trail

This created several problems:
1. **Data Duplication**: Both entity and projection tables stored similar data
2. **Inconsistent Patterns**: Account creation bypassed event sourcing
3. **Maintenance Burden**: Two entity handlers for the same events
4. **Architectural Confusion**: Mixed paradigms (traditional DB + event sourcing)
5. **No Single Source of Truth**: Unclear whether events or database was authoritative

## Decision

We will adopt **pure event sourcing** where:
- **Kafka events are the single source of truth** for all domain state
- **Aggregates** (`AccountAggregate`, `TransactionAggregate`) handle all writes and emit events
- **No entity tables** for aggregates (removed `accounts` and `transactions` tables)
- **Only projection tables** remain in PostgreSQL for optimized reads
- All state is reconstructed from events when needed

**Completed for:**
- ✅ Account entity → AccountProjection
- ✅ Transaction entity → TransactionProjection

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

This is the architecture we decided to implement:

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

### Account Module

#### 1. Created Account Types File

**File**: `src/modules/account/account.types.ts`

Extracted `AccountStatus` and `AccountType` enums from entity to standalone file.

#### 2. Refactored AccountService

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

#### 3. Updated AccountController

Changed all return types from `Account` to `AccountProjection`.

#### 4. Updated AccountModule

**Removed**:
- `Account` entity from TypeORM imports
- `AccountCreatedEntityHandler`
- `BalanceChangedEntityHandler`

**Kept**:
- `AccountProjection` (read model)
- Projection event handlers only

#### 5. Deleted Account Files

- ❌ `src/modules/account/account.entity.ts`
- ❌ `src/modules/account/handlers/account-created-entity.handler.ts`
- ❌ `src/modules/account/handlers/balance-changed-entity.handler.ts`

#### 6. Created Account Migration

**File**: `src/migrations/1735000000000-DropAccountsTableEventSourced.ts`

Drops the `accounts` table and foreign key constraints.

---

### Transaction Module

#### 1. Created Transaction Types File

**File**: `src/modules/transaction/transaction.types.ts`

Extracted `TransactionStatus` and `TransactionType` enums from entity to standalone file.

#### 2. Refactored TransactionService

**Before** (Hybrid):
```typescript
async topup(dto) {
  // Check idempotency via entity repository
  const existing = await this.transactionRepository.findOne({...});
  
  // Execute command
  await this.commandBus.execute(command);
}
```

**After** (Pure Event Sourcing):
```typescript
async topup(dto) {
  // Check idempotency via projection service
  const existing = await this.transactionProjectionService.findByIdempotencyKey(
    dto.idempotencyKey
  );
  
  // Execute command → Events → Projection
  await this.commandBus.execute(command);
}
```

#### 3. Updated TransactionController

Changed all return types from `Transaction` to `TransactionProjection`.

#### 4. Updated TransactionModule

**Removed:**
- `Transaction` entity from TypeORM imports
- 10 entity handlers (topup, withdrawal, transfer, payment, refund - requested & completed)

**Kept:**
- `TransactionProjection` (read model)
- Projection event handlers only
- Saga coordinators

#### 5. Deleted Transaction Files

**Entity:**
- ❌ `src/modules/transaction/transaction.entity.ts`

**Entity Handlers (10 files):**
- ❌ `topup-requested-entity.handler.ts`
- ❌ `topup-completed-entity.handler.ts`
- ❌ `withdrawal-requested-entity.handler.ts`
- ❌ `withdrawal-completed-entity.handler.ts`
- ❌ `transfer-requested-entity.handler.ts`
- ❌ `transfer-completed-entity.handler.ts`
- ❌ `payment-requested-entity.handler.ts`
- ❌ `payment-completed-entity.handler.ts`
- ❌ `refund-requested-entity.handler.ts`
- ❌ `refund-completed-entity.handler.ts`

#### 6. Created Transaction Migration

**File**: `src/migrations/1735000100000-DropTransactionsTableEventSourced.ts`

Drops the `transactions` table.

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

### 1. Status Change Command ✅ **IMPLEMENTED**

~~Previously, `updateStatus()` bypassed event sourcing.~~ Now implemented with proper event sourcing:

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

## Consequences

### Positive

1. **Single Source of Truth**: Kafka events are the authoritative source; no database conflicts
2. **True CQRS**: Clean separation between write (aggregates) and read (projections) models
3. **Eliminated Duplication**: Removed redundant entity tables and handlers
4. **Better Auditability**: Complete event history in Kafka for any point-in-time reconstruction
5. **Simpler Mental Model**: One pattern throughout (event sourcing), not mixed paradigms
6. **Scalability**: Read models can be rebuilt or optimized independently

### Negative

1. **Eventual Consistency**: Small delay between command execution and projection updates
2. **Complexity**: Requires understanding of event sourcing patterns
3. **Migration Effort**: Required database migrations to drop old tables
4. **Kafka Dependency**: System cannot function without Kafka (acceptable trade-off)
5. **Debugging**: Requires event inspection tools rather than simple SQL queries

### Migration Impact

- **Database Migrations**: Added migrations to drop `accounts` and `transactions` tables
- **Test Updates**: Updated test imports to use `.types.ts` files
- **Documentation**: Comprehensive updates to reflect new architecture
- **Breaking Changes**: None for external API consumers (API contracts unchanged)

## Summary

This refactoring moves the billing engine to a **pure event-sourced architecture**, eliminating the hybrid approach and establishing a clear, maintainable pattern for all domain entities.

**Key Principle**: Events are the source of truth. Everything else is derived.


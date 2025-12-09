# Locking and Concurrency Control

## Overview

In a concurrent environment, multiple transactions can attempt to modify the same account simultaneously. Without proper locking, this leads to race conditions, lost updates, and incorrect balances.

This project uses **pessimistic locking** to ensure data consistency.

---

## The Problem: Race Conditions

### Scenario: Concurrent Transfers

Two transfers attempt to debit the same account simultaneously:

```
Time | Thread 1                    | Thread 2
-----|----------------------------|----------------------------
T0   | Read balance: $100         | Read balance: $100
T1   | Calculate: $100 - $30      | Calculate: $100 - $40
T2   | Write balance: $70         | Write balance: $60
T3   |                            |
-----|----------------------------|----------------------------
Result: Balance is $60 (last write wins)
Expected: Balance should be $30 ($100 - $30 - $40)
Lost: $30 transaction was overwritten! 💥
```

**Problem**: Lost update due to read-modify-write race condition.

---

## Solution: Pessimistic Locking

### SELECT FOR UPDATE

Acquire an exclusive lock when reading the account:

```typescript
// Lock the account row until transaction completes
const account = await this.accountRepo.findOne({
  where: { id: accountId },
  lock: { mode: 'pessimistic_write' }
});

// Now we have exclusive access
account.balance = newBalance;
await this.accountRepo.save(account);

// Lock released when transaction commits/rolls back
```

### How It Works

```
Time | Thread 1                          | Thread 2
-----|----------------------------------|----------------------------------
T0   | BEGIN TRANSACTION                | BEGIN TRANSACTION
T1   | SELECT ... FOR UPDATE            |
T2   | Lock acquired                    | SELECT ... FOR UPDATE
T3   | Balance: $100                    | ⏸️ Waiting for lock...
T4   | Update: $100 - $30 = $70         | ⏸️ Waiting...
T5   | COMMIT (lock released)           | ⏸️ Waiting...
T6   |                                  | Lock acquired
T7   |                                  | Balance: $70 (fresh read!)
T8   |                                  | Update: $70 - $40 = $30
T9   |                                  | COMMIT
-----|----------------------------------|----------------------------------
Result: Balance is $30 ✓ Correct!
```

**Key**: Thread 2 waits until Thread 1 completes, then reads the updated balance.

---

## Implementation

### Transfer Handler Example

```typescript
@CommandHandler(TransferCommand)
export class TransferHandler implements ICommandHandler<TransferCommand> {
  async execute(command: TransferCommand): Promise<void> {
    // Use transaction to ensure atomicity
    await this.dataSource.transaction(async (manager) => {
      // 1. Lock BOTH accounts (prevents deadlock with consistent ordering)
      const [sourceAccount, destAccount] = await this.lockAccounts(
        manager,
        command.sourceAccountId,
        command.destinationAccountId
      );
      
      // 2. Validate balances (with fresh, locked data)
      if (sourceAccount.balance < command.amount) {
        throw new InsufficientBalanceException();
      }
      
      // 3. Update balances
      sourceAccount.balance -= command.amount;
      destAccount.balance += command.amount;
      
      // 4. Save (still holding locks)
      await manager.save([sourceAccount, destAccount]);
      
      // 5. Transaction commits, locks released
    });
  }
  
  private async lockAccounts(
    manager: EntityManager,
    id1: string,
    id2: string
  ): Promise<[Account, Account]> {
    // Sort IDs to prevent deadlocks
    const [firstId, secondId] = [id1, id2].sort();
    
    const first = await manager.findOne(Account, {
      where: { id: firstId },
      lock: { mode: 'pessimistic_write' }
    });
    
    const second = await manager.findOne(Account, {
      where: { id: secondId },
      lock: { mode: 'pessimistic_write' }
    });
    
    // Return in original order
    return id1 === firstId ? [first, second] : [second, first];
  }
}
```

---

## Lock Ordering (Deadlock Prevention)

### The Deadlock Problem

Without consistent ordering:

```
Time | Thread 1 (Transfer A→B)    | Thread 2 (Transfer B→A)
-----|---------------------------|---------------------------
T0   | Lock Account A            | Lock Account B
T1   | Try to lock Account B...  | Try to lock Account A...
T2   | ⏸️ Waiting for B          | ⏸️ Waiting for A
T3   | ⏸️ DEADLOCK!              | ⏸️ DEADLOCK!
```

**Both threads wait forever** until database detects and kills one.

### Solution: Consistent Lock Order

Always lock accounts in sorted ID order:

```typescript
// ✓ GOOD: Always lock in sorted order
const [firstId, secondId] = [accountA, accountB].sort();
await lockAccount(firstId);   // Always lock smaller ID first
await lockAccount(secondId);  // Then larger ID

// ✗ BAD: Lock in arbitrary order
await lockAccount(accountA);
await lockAccount(accountB);  // Deadlock risk!
```

**Result**: No deadlocks possible.

```
Time | Thread 1 (Transfer A→B)    | Thread 2 (Transfer B→A)
-----|---------------------------|---------------------------
T0   | Lock A (smaller ID)       | Lock A (smaller ID)
T1   | Lock B (larger ID)        | ⏸️ Waiting for A...
T2   | Process transfer          | ⏸️ Waiting...
T3   | COMMIT (release locks)    | ⏸️ Waiting...
T4   |                           | Lock A acquired
T5   |                           | Lock B
T6   |                           | Process transfer
T7   |                           | COMMIT
```

---

## When Locks Are Held

### Duration

Locks are held for the **entire database transaction**:

```typescript
await dataSource.transaction(async (manager) => {
  // Lock acquired here
  const account = await manager.findOne(Account, {
    lock: { mode: 'pessimistic_write' }
  });
  
  // Lock held during processing
  account.balance += amount;
  await manager.save(account);
  
  // Lock released here (on commit)
});
```

### Transaction Scope

```typescript
// ✓ GOOD: Lock within transaction
await transaction(async (manager) => {
  const account = await manager.findOne(..., { lock: ... });
  // Work with account
});

// ✗ BAD: Lock outside transaction
const account = await repo.findOne(..., { lock: ... });
// Lock released immediately! No protection!
await updateAccount(account);
```

---

## Lock Modes

### pessimistic_write

**Most restrictive**: Exclusive write lock.

```typescript
lock: { mode: 'pessimistic_write' }
```

- Blocks other reads AND writes
- Use for: Account balance updates

### pessimistic_read

**Less restrictive**: Shared read lock.

```typescript
lock: { mode: 'pessimistic_read' }
```

- Allows concurrent reads
- Blocks writes
- Use for: Reports requiring consistency

**This project uses `pessimistic_write` exclusively** for simplicity.

---

## Performance Considerations

### Lock Contention

High contention = poor performance:

```typescript
// Hot account (e.g., merchant receiving many payments)
const merchantAccount = await lockAccount('merchant-popular');
// Many threads waiting for this lock = slow
```

**Solutions** (not implemented in this study project):
- Account sharding (split balance across multiple accounts)
- Optimistic locking (retry on conflict)
- Queue-based processing (serialize access)

### Lock Timeout

Database will timeout if lock held too long:

```typescript
try {
  const account = await findOne(..., { lock: ... });
} catch (error) {
  if (error.code === 'LOCK_TIMEOUT') {
    // Retry or fail gracefully
  }
}
```

**PostgreSQL default**: 50 seconds

---

## Alternative: Optimistic Locking

**Not used in this project**, but worth understanding:

### How It Works

Use version numbers instead of locks:

```typescript
// Read account with version
const account = await findOne({ id });  // version: 5

// Update with version check
const result = await repo.update(
  { id, version: 5 },  // WHERE version = 5
  { balance: newBalance, version: 6 }
);

if (result.affected === 0) {
  // Someone else updated (version changed)
  throw new OptimisticLockException('Retry');
}
```

### Trade-offs

| Aspect | Pessimistic | Optimistic |
|--------|-------------|------------|
| Conflicts | Prevents | Detects & retries |
| Performance | Lower (waiting) | Higher (no waiting) |
| Contention | Handles poorly | Handles better |
| Complexity | Simple | Complex (retry logic) |
| Consistency | Strong | Eventual (after retry) |

**This project uses pessimistic** for:
- Simplicity
- Strong consistency guarantees
- Financial operations (no retries wanted)

---

## Real-World Patterns

### 1. Lock Multiple Resources

```typescript
// Lock all involved accounts in sorted order
const accountIds = [source, dest, feeAccount].sort();
const accounts = await Promise.all(
  accountIds.map(id => lockAccount(manager, id))
);
```

### 2. Lock Hierarchy

```typescript
// Lock parent before children (prevent deadlock)
const wallet = await lockAccount(walletId);
const subAccounts = await lockSubAccounts(walletId);
```

### 3. Lock-Free Reads

```typescript
// Read projections (no lock needed)
const balance = await this.accountProjectionRepo.findOne({ id });

// Eventual consistency is OK for reads
```

---

## Debugging Locking Issues

### Identify Lock Waits

```sql
-- PostgreSQL: Check waiting locks
SELECT 
  blocked.pid,
  blocked.query,
  blocking.pid AS blocking_pid,
  blocking.query AS blocking_query
FROM pg_stat_activity AS blocked
JOIN pg_stat_activity AS blocking 
  ON blocking.pid = ANY(pg_blocking_pids(blocked.pid))
WHERE blocked.wait_event_type = 'Lock';
```

### Detect Deadlocks

PostgreSQL automatically detects and resolves:

```
ERROR: deadlock detected
DETAIL: Process 1234 waits for ShareLock on transaction 5678
        Process 5678 waits for ShareLock on transaction 1234
HINT: See server log for query details
```

**Solution**: Ensure consistent lock ordering.

---

## Best Practices

### 1. Always Lock in Transactions

```typescript
// ✓ GOOD
await transaction(async (manager) => {
  const account = await lockAndUpdate(manager, accountId);
});

// ✗ BAD: Lock outside transaction
const account = await repo.findOne(..., { lock: ... });
```

### 2. Sort Lock Order

```typescript
// ✓ GOOD: Consistent order
const [id1, id2] = [sourceId, destId].sort();

// ✗ BAD: Arbitrary order
```

### 3. Lock Only What You Need

```typescript
// ✓ GOOD: Lock specific account
await lockAccount(accountId);

// ✗ BAD: Lock entire table
await manager.query('LOCK TABLE accounts');
```

### 4. Keep Transactions Short

```typescript
// ✓ GOOD: Quick transaction
await transaction(async (manager) => {
  const account = await lock(manager);
  account.balance += amount;
  await manager.save(account);
});

// ✗ BAD: Long-running transaction
await transaction(async (manager) => {
  const account = await lock(manager);
  await callExternalAPI();  // Slow! Lock held during API call
  await manager.save(account);
});
```

---

## Summary

| Concept | Purpose | Implementation |
|---------|---------|----------------|
| **Pessimistic Locking** | Prevent race conditions | `SELECT FOR UPDATE` |
| **Lock Ordering** | Prevent deadlocks | Sort account IDs |
| **Transaction Scope** | Atomic operations | TypeORM `transaction()` |
| **Lock Duration** | Until commit/rollback | Automatic |

**Key Insight**: Locking trades performance for consistency. In financial systems, consistency is non-negotiable.

---

## Related Documentation

- [CQRS Pattern](../architecture/cqrs-pattern.md) - Command handlers use locking
- [Transfer Operation](../operations/transfer.md) - Multi-account locking example
- [Transaction Module](../modules/transaction.md) - Handler implementation


# Double-Entry Bookkeeping

## Overview

This billing engine implements **double-entry bookkeeping**, a 700-year-old accounting principle that ensures financial accuracy and auditability. Every transaction has two sides: a **debit** and a **credit**.

> 🎓 **Learning Focus**: Double-entry isn't just for accountants—it's a powerful pattern for ensuring financial accuracy in any system that manages money.

---

## What is Double-Entry Bookkeeping?

### Single-Entry (Naive Approach)

```
User's Balance: $100
+ Add $50
= New Balance: $150
```

**Problems**:
- Where did the $50 come from?
- Can't verify system-wide balance is correct
- No audit trail showing money flow
- Easy to lose track of money

### Double-Entry Approach

```
Transaction: Top-up $50
├─ DEBIT:  External Bank Account   -$50
└─ CREDIT: User Account            +$50

System invariant: Total of all balances = $0
```

**Benefits**:
- Money flow is explicit (from where, to where)
- System-wide balance always reconciles
- Complete audit trail
- Errors are immediately detectable

---

## Why Double-Entry for Billing?

### 1. Financial Accuracy

**Invariant**: Sum of all account balances = 0

```sql
SELECT SUM(balance) FROM account_projections;
-- Expected: 0 (or close to 0 with EXTERNAL accounts)
```

**Note**: This queries the projection (read model). For authoritative verification, replay all `BalanceChangedEvent` events from Kafka and sum the `signedAmount` fields.

If this doesn't equal zero, something is wrong!

### 2. Audit Trail

Every transaction shows:
- **Source**: Where money came from
- **Destination**: Where money went to
- **Amount**: How much moved
- **Why**: Reason for transaction

### 3. Fraud Detection

With double-entry:
- Can't create money from nothing (imbalanced transaction)
- Can trace every dollar from origin to current location
- Easy to detect anomalies

### 4. Regulatory Compliance

Financial regulations often require:
- Complete transaction history
- Balance verification
- Audit trail with timestamps
- Immutable records

Double-entry provides all of this naturally.

---

## Account Types

### Three Account Types

```typescript
enum AccountType {
  USER = 'user',        // End-user accounts
  EXTERNAL = 'external',// External systems (banks, payment gateways)
  SYSTEM = 'system'     // Internal system accounts (fees, reserves)
}
```

### USER Accounts

**Purpose**: End-user wallets/accounts

**Characteristics**:
- Balance is tracked
- Has balance limits (min/max)
- Cannot go negative (by default)
- Belongs to a user/customer

**Example**:
```json
{
  "id": "acc-user-123",
  "ownerId": "user_alice",
  "ownerType": "user",
  "type": "USER",
  "currency": "USD",
  "balance": "1000.00",
  "minBalance": "0",
  "maxBalance": "10000.00"
}
```

### EXTERNAL Accounts

**Purpose**: Represent external financial systems

**Characteristics**:
- Balance is NOT tracked (always 0 or ignored)
- Represents infinite source/sink of money
- Used for deposits and withdrawals
- Represents banks, payment gateways, etc.

**Example**:
```json
{
  "id": "acc-ext-bank-001",
  "ownerId": "bank_of_america",
  "ownerType": "bank",
  "type": "EXTERNAL",
  "currency": "USD",
  "balance": "0"  // Not tracked
}
```

**Why EXTERNAL accounts?**
- Money enters system: External → User
- Money leaves system: User → External
- External accounts represent "the outside world"

### SYSTEM Accounts

**Purpose**: Internal accounting (fees, reserves, commissions)

**Characteristics**:
- Balance is tracked
- Owned by the system itself
- Used for revenue, fees, reserves
- Can accumulate positive balances

**Example**:
```json
{
  "id": "acc-sys-fees",
  "ownerId": "system",
  "ownerType": "system",
  "type": "SYSTEM",
  "currency": "USD",
  "balance": "5000.00"  // Accumulated fees
}
```

---

## Transaction Patterns

### Pattern 1: Top-up (Deposit)

**Money Flow**: External → User

```
┌──────────────┐         ┌──────────────┐
│   EXTERNAL   │ ──────→ │     USER     │
│ Bank Account │  $100   │   Account    │
└──────────────┘         └──────────────┘
   Balance: 0*            Balance: $100
   
*EXTERNAL balance not tracked
```

**Double-Entry**:
- **DEBIT**: External account -$100 (ignored)
- **CREDIT**: User account +$100

**Implementation**:
```typescript
async topup(params: TopupParams): Promise<void> {
  // 1. Create transaction record
  const transaction = new Transaction({
    type: 'topup',
    sourceAccountId: externalAccountId,      // EXTERNAL
    destinationAccountId: userAccountId,     // USER
    amount: '100.00',
    currency: 'USD'
  });
  
  // 2. Debit source (External - not tracked)
  // Skip for EXTERNAL accounts
  
  // 3. Credit destination (User)
  await this.accountService.updateBalance(userAccountId, {
    changeAmount: '100.00',
    changeType: 'CREDIT'
  });
}
```

### Pattern 2: Withdrawal

**Money Flow**: User → External

```
┌──────────────┐         ┌──────────────┐
│     USER     │ ──────→ │   EXTERNAL   │
│   Account    │  $50    │ Bank Account │
└──────────────┘         └──────────────┘
  Balance: $50            Balance: 0*
```

**Double-Entry**:
- **DEBIT**: User account -$50
- **CREDIT**: External account +$50 (ignored)

### Pattern 3: Transfer (P2P)

**Money Flow**: User → User

```
┌──────────────┐         ┌──────────────┐
│   Alice      │ ──────→ │    Bob       │
│   Account    │  $25    │   Account    │
└──────────────┘         └──────────────┘
  Balance: $75            Balance: $25
```

**Double-Entry**:
- **DEBIT**: Alice's account -$25
- **CREDIT**: Bob's account +$25

**Atomicity**: Both sides must succeed or both fail!

**Implementation**:
```typescript
async transfer(params: TransferParams): Promise<void> {
  // Start database transaction (ACID)
  await db.transaction(async (tx) => {
    // 1. Lock both accounts (prevent concurrent modification)
    const source = await tx.findOne(sourceAccountId, { 
      lock: 'pessimistic_write' 
    });
    const destination = await tx.findOne(destinationAccountId, { 
      lock: 'pessimistic_write' 
    });
    
    // 2. Debit source
    await tx.updateBalance(source, -amount);
    
    // 3. Credit destination
    await tx.updateBalance(destination, +amount);
    
    // 4. Commit (both succeed) or rollback (both fail)
  });
}
```

### Pattern 4: Payment (Revenue)

**Money Flow**: User → System

```
┌──────────────┐         ┌──────────────┐
│   Customer   │ ──────→ │   Merchant   │
│   Account    │  $10    │   Account    │
└──────────────┘         └──────────────┘
  Balance: $90           Balance: $10
```

**Double-Entry**:
- **DEBIT**: Customer account -$10
- **CREDIT**: Merchant account +$10

**Use Case**: Service fees, subscriptions, purchases

### Pattern 5: Refund (Reversal)

**Money Flow**: System → User (reverse of payment)

```
┌──────────────┐         ┌──────────────┐
│   Merchant   │ ──────→ │   Customer   │
│   Account    │  $10    │   Account    │
└──────────────┘         └──────────────┘
  Balance: $0            Balance: $100
```

**Double-Entry**:
- **DEBIT**: Merchant account -$10
- **CREDIT**: Customer account +$10

**Special Property**: Links to original payment via `parentTransactionId`

---

## Balance Tracking

### Account Balance Calculation

Balance is updated incrementally, not recalculated:

```typescript
// ❌ BAD: Recalculate from all transactions (slow!)
const balance = transactions
  .filter(t => t.accountId === accountId)
  .reduce((sum, t) => sum + t.amount, 0);

// ✅ GOOD: Update incrementally
account.balance += transaction.amount;
```

**Current Balance Storage** (Read Model):
```sql
CREATE TABLE account_projections (
  id UUID PRIMARY KEY,
  balance DECIMAL(20, 8) NOT NULL DEFAULT 0,
  ...
);
```

**Note**: This is a projection (read model) updated by event handlers. The true source of truth is the event stream in Kafka.

### Balance History (Audit Trail)

**Event Sourcing** (Source of Truth):
Every balance change is stored as an immutable event in Kafka:

```typescript
class BalanceChangedEvent {
  aggregateId: string;        // Account ID
  previousBalance: string;
  newBalance: string;
  changeAmount: string;       // Always positive
  changeType: 'CREDIT' | 'DEBIT';
  signedAmount: string;       // Negative for DEBIT, positive for CREDIT
  reason: string;
  transactionId?: string;
  timestamp: Date;
}
```

**Transaction Projections** (Read Model):
Transaction projections store signed amounts for fast queries:

```sql
CREATE TABLE transaction_projections (
  id UUID PRIMARY KEY,
  source_account_id UUID,
  destination_account_id UUID,
  amount DECIMAL(20, 8),
  source_signed_amount DECIMAL(20, 8),      -- Usually negative
  destination_signed_amount DECIMAL(20, 8), -- Usually positive
  source_new_balance DECIMAL(20, 8),
  destination_new_balance DECIMAL(20, 8),
  ...
);
```

**Example** (Topup Transaction):
```json
{
  "transactionId": "tx-001",
  "type": "topup",
  "amount": "100.00",
  "sourceSignedAmount": "-100.00",    // External account debited
  "destinationSignedAmount": "100.00", // User account credited
  "sourceNewBalance": "0",             // External (not tracked)
  "destinationNewBalance": "100.00"    // User balance after
}
```

**Why This Architecture?**
- **Audit**: Complete event history in Kafka for point-in-time reconstruction
- **Debugging**: Trace balance changes by replaying events
- **Reconciliation**: Projections for fast queries, events for authoritative verification

---

## Balance Verification

### System-Wide Balance Check

```sql
-- All balances should sum to zero (approximately)
SELECT 
  currency,
  SUM(CASE WHEN account_type = 'user' THEN balance ELSE 0 END) as user_balance,
  SUM(CASE WHEN account_type = 'system' THEN balance ELSE 0 END) as system_balance,
  SUM(balance) as total_balance
FROM account_projections
GROUP BY currency;
```

**Expected**:
```
| currency | user_balance | system_balance | total_balance |
|----------|--------------|----------------|---------------|
| USD      | 10000.00     | -10000.00      | 0.00          |
| EUR      | 5000.00      | -5000.00       | 0.00          |
```

**Why Total = 0?**
- Money deposited (External → User): User +$100, External not tracked
- System fees (User → System): User -$10, System +$10 (sums to 0)
- Withdrawals (User → External): User -$50, External not tracked

**Note**: This queries the projection. For authoritative verification, use Kafka events.

### Transaction Integrity Check

```sql
-- Verify all transactions' signed amounts sum to zero (double-entry invariant)
SELECT 
  id,
  type,
  amount,
  source_signed_amount,
  destination_signed_amount,
  (COALESCE(source_signed_amount, 0) + COALESCE(destination_signed_amount, 0)) as sum_check,
  CASE 
    WHEN ABS(COALESCE(source_signed_amount, 0) + COALESCE(destination_signed_amount, 0)) < 0.01 
    THEN 'OK' 
    ELSE 'ERROR' 
  END as status
FROM transaction_projections
WHERE status = 'completed';
```

**Expected**: All rows show 'OK' and `sum_check` ≈ 0

**Why?** Every transaction must have: `source_signed_amount + destination_signed_amount = 0`

---

## Locking Strategy

### Problem: Race Conditions

Without locking:
```
Thread A: Read balance ($100) → Debit $50 → Write $50
Thread B: Read balance ($100) → Debit $30 → Write $70

Result: Balance is $70 (lost $10!)
Expected: $20
```

### Solution: Pessimistic Locking

**Note**: In pure event sourcing, locking is applied to **projections** during updates, not to aggregates.

```sql
-- Lock account projection row during transaction
SELECT * FROM account_projections 
WHERE id = 'account-123' 
FOR UPDATE;  -- Exclusive lock
```

**TypeORM Implementation** (for projection updates):
```typescript
const accountProjection = await projectionRepository.findOne({
  where: { id: accountId },
  lock: { mode: 'pessimistic_write' }  // SELECT ... FOR UPDATE
});

// No other transaction can modify this projection until commit
accountProjection.balance = newBalance;
await projectionRepository.save(accountProjection);
```

**Important**: The aggregate itself is event-sourced and doesn't use database locks. Locks are only used when updating projections to prevent race conditions in the read model.

### Lock Ordering (Prevent Deadlocks)

For transfers, always lock accounts in consistent order:

```typescript
async transfer(sourceId: string, destId: string, amount: string) {
  // Lock accounts in alphabetical order to prevent deadlocks
  const [first, second] = [sourceId, destId].sort();
  
  const account1 = await lockAccount(first);
  const account2 = await lockAccount(second);
  
  // Now safe to update both
  if (first === sourceId) {
    await debit(account1, amount);
    await credit(account2, amount);
  } else {
    await credit(account1, amount);
    await debit(account2, amount);
  }
}
```

**Why?**
- Prevents deadlock: Thread A locks A then B, Thread B locks B then A (deadlock!)
- Consistent ordering: Both threads lock in same order (A, then B)

---

## Transaction Flow Example

### Complete Transfer Flow

```typescript
// Client initiates transfer
POST /api/v1/transactions/transfer
{
  "sourceAccountId": "alice",
  "destinationAccountId": "bob",
  "amount": "50.00"
}

// Server processing:

1. **Command Phase** (Write Side)
   - Dispatch `TransferCommand`
   - Load `AccountAggregate` from events (Kafka)
   - Validate business rules on aggregate
   - Emit `TransferRequestedEvent` to Kafka

2. **Saga Coordination**
   - Saga listens to `TransferRequestedEvent`
   - Dispatches `UpdateBalanceCommand` for source account
   - Dispatches `UpdateBalanceCommand` for destination account

3. **Balance Updates** (Event Sourcing)
   - Source aggregate emits `BalanceChangedEvent` (signedAmount: -$50)
   - Destination aggregate emits `BalanceChangedEvent` (signedAmount: +$50)
   - Events persisted to Kafka

4. **Projection Updates** (Read Side with Locking)
   ```sql
   BEGIN;
   SELECT * FROM account_projections WHERE id = 'alice' FOR UPDATE;
   UPDATE account_projections SET balance = balance - 50 WHERE id = 'alice';
   
   SELECT * FROM account_projections WHERE id = 'bob' FOR UPDATE;
   UPDATE account_projections SET balance = balance + 50 WHERE id = 'bob';
   
   INSERT INTO transaction_projections (
     type: 'transfer_debit',
     source_account_id: 'alice',
     destination_account_id: 'bob',
     amount: '50.00',
     source_balance_before: '100.00',
     source_balance_after: '50.00',
     destination_balance_before: '0',
     destination_balance_after: '50.00'
   );

6. Update source balance
   UPDATE accounts SET balance = '50.00' WHERE id = 'alice';

7. Update destination balance
   UPDATE accounts SET balance = '50.00' WHERE id = 'bob';

8. Publish events (to Kafka)
   - TransferRequestedEvent
   - BalanceChangedEvent (Alice)
   - BalanceChangedEvent (Bob)
   - TransferCompletedEvent

9. Commit database transaction
   COMMIT;

10. Release locks

11. Return response to client
    { "transactionId": "tx-123", "status": "pending" }
```

---

## Error Handling & Compensation

### Transaction Failures

What if something fails mid-transaction?

**Database Transaction Rollback**:
```typescript
try {
  await db.transaction(async (tx) => {
    await debitAccount(tx, sourceId, amount);
    await creditAccount(tx, destId, amount);
    // If this throws, entire transaction rolls back
  });
} catch (error) {
  // Both operations rolled back automatically
  // Balances unchanged
}
```

### Saga Compensation

For operations spanning multiple aggregates:

```typescript
// Transfer saga
try {
  // 1. Debit source
  await debitAccount(sourceId, amount);
  
  // 2. Credit destination (fails!)
  await creditAccount(destId, amount); // ❌ Throws error
  
} catch (error) {
  // COMPENSATION: Reverse the debit
  await creditAccount(sourceId, amount);  // Undo step 1
  
  // Mark transaction as compensated
  await markAsCompensated(transactionId);
}
```

---

## Compliance & Auditing

### Regulatory Requirements

Financial regulations typically require:

1. **Complete History**: Every transaction recorded
2. **Immutable Records**: Can't delete or modify transactions
3. **Audit Trail**: Who, what, when, why
4. **Balance Verification**: Prove balances reconcile
5. **Retention**: Keep records for X years

Double-entry provides all of this:

```sql
-- Audit query: Show all transactions affecting account with signed amounts
SELECT 
  t.requested_at as created_at,
  t.type,
  t.amount,
  CASE 
    WHEN t.source_account_id = 'account-123' THEN t.source_signed_amount
    WHEN t.destination_account_id = 'account-123' THEN t.destination_signed_amount
  END as balance_change,
  CASE 
    WHEN t.source_account_id = 'account-123' THEN t.source_new_balance
    WHEN t.destination_account_id = 'account-123' THEN t.destination_new_balance
  END as balance_after,
  t.metadata->>'actorId' as performed_by
FROM transaction_projections t
WHERE t.source_account_id = 'account-123'
   OR t.destination_account_id = 'account-123'
ORDER BY t.requested_at;
```

**Note**: This queries the projection (read model). For authoritative audit trail, query Kafka events (`BalanceChangedEvent`) filtered by `aggregateId`.

### Audit Log

Separate audit log for compliance:

```sql
CREATE TABLE audit_logs (
  entity_type VARCHAR(50),    -- 'Account', 'Transaction'
  entity_id VARCHAR(255),
  operation VARCHAR(50),      -- 'balance_update', 'status_change'
  changes JSONB,              -- Before/after values
  actor_id VARCHAR(255),
  timestamp TIMESTAMP,
  correlation_id UUID
);
```

---

## Common Pitfalls

### Pitfall 1: Forgetting the Other Side

```typescript
// ❌ BAD: Only updating one side
await updateBalance(userAccount, +100);
// Where did the $100 come from?

// ✅ GOOD: Both sides
await debit(externalAccount, 100);   // Source
await credit(userAccount, 100);       // Destination
```

### Pitfall 2: Not Using Locks

```typescript
// ❌ BAD: Race condition possible
const account = await getAccount(id);
account.balance += amount;
await saveAccount(account);

// ✅ GOOD: Pessimistic lock
const account = await getAccount(id, { lock: true });
account.balance += amount;
await saveAccount(account);
```

### Pitfall 3: Floating Point Math

```typescript
// ❌ BAD: Floating point errors
const balance = 0.1 + 0.2;  // 0.30000000000000004

// ✅ GOOD: Use Decimal library
const balance = new Decimal('0.1').plus('0.2');  // 0.3
```

---

## Benefits Summary

### Financial Accuracy
- ✅ System-wide balance always reconciles
- ✅ Easy to detect errors
- ✅ No money created or lost

### Auditability
- ✅ Complete transaction history
- ✅ Money flow is explicit
- ✅ Can trace every dollar

### Compliance
- ✅ Meets regulatory requirements
- ✅ Immutable audit trail
- ✅ Balance verification

### Debugging
- ✅ Easy to understand money flow
- ✅ Can replay transactions
- ✅ Before/after balances stored

---

## Related Documentation

- [System Design](./system-design.md) - Overall architecture
- [Data Model](./data-model.md) - Database schema for double-entry
- [Transaction Module](../modules/transaction.md) - Implementation details

---

**Next**: Explore [Transaction Operations](../operations/transfer.md) →


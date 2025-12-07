# ADR-0005: Foreign Key Constraint Strategy

**Status**: Accepted
**Date**: 2025-12-07
**Tags**: #database #foreign-keys #integrity

# Foreign Key Design Decisions

## Overview

This document explains the foreign key constraints in the billing engine and the rationale behind each decision.

## Foreign Key Constraints

### 1. Account → Currency ✅

**Constraint:**
```sql
CONSTRAINT "FK_accounts_currency" FOREIGN KEY ("currency") 
    REFERENCES "currencies"("code") 
    ON DELETE RESTRICT 
    ON UPDATE CASCADE
```

**Rationale:**
- **Why FK?** Currency is internal to the billing system and must be validated
- **ON DELETE RESTRICT:** Cannot delete a currency that's in use by accounts (data integrity)
- **ON UPDATE CASCADE:** If currency code changes, update all accounts (rare but safe)

**Example:**
```typescript
// This will fail at database level ✅
account.currency = 'INVALID_CODE';

// This is safe ✅
account.currency = 'USD'; // Validated against currencies table
```

### 2. Transaction → Account (account_id) ✅

**Constraint:**
```sql
CONSTRAINT "FK_transactions_account" FOREIGN KEY ("account_id") 
    REFERENCES "accounts"("id") 
    ON DELETE RESTRICT 
    ON UPDATE CASCADE
```

**Rationale:**
- **Why FK?** Transactions must belong to valid accounts
- **ON DELETE RESTRICT:** Cannot delete an account with transactions (audit requirement)
- **ON UPDATE CASCADE:** If account ID changes, update transactions (UUIDs rarely change)

**Protection:**
```typescript
// Prevents orphaned transactions
// Cannot delete account while it has transactions
```

### 3. Transaction → Account (counterparty_account_id) ✅

**Constraint:**
```sql
CONSTRAINT "FK_transactions_counterparty" FOREIGN KEY ("counterparty_account_id") 
    REFERENCES "accounts"("id") 
    ON DELETE RESTRICT 
    ON UPDATE CASCADE
```

**Rationale:**
- **Why FK?** Transfer counterparties must be valid accounts
- **ON DELETE RESTRICT:** Cannot delete account involved in transfers
- **ON UPDATE CASCADE:** Maintain referential integrity

### 4. Transaction → Transaction (parent_transaction_id) ✅

**Constraint:**
```sql
CONSTRAINT "FK_transactions_parent" FOREIGN KEY ("parent_transaction_id") 
    REFERENCES "transactions"("id") 
    ON DELETE RESTRICT 
    ON UPDATE CASCADE
```

**Rationale:**
- **Why FK?** Refunds must reference valid original transactions
- **ON DELETE RESTRICT:** Cannot delete original transaction if refunds exist
- **ON UPDATE CASCADE:** Maintain parent-child relationship

**Example:**
```typescript
// Refund references original transaction
refund.parentTransactionId = originalTransaction.id; // Validated by FK
```

## Fields WITHOUT Foreign Keys

### 1. Account.ownerId / Account.ownerType ❌ No FK

**Why No FK?**
- References **external systems** (user service, organization service, etc.)
- Owner entities exist **outside** the billing database
- Billing engine is designed to be embedded in larger systems
- Provides maximum flexibility for integration

**Design Pattern:**
```typescript
// External reference - intentionally no FK
account.ownerId = 'user_12345';    // References external user service
account.ownerType = 'user';        // Type discriminator
```

**Benefits:**
- ✅ Billing engine is decoupled from user management
- ✅ Can be used with any external system
- ✅ No circular dependencies
- ✅ Follows microservices best practices

### 2. AuditLog.actorId / AuditLog.actorType ❌ No FK

**Why No FK?**
- References **external actors** (users, systems, admins)
- Audit log must be independent
- Actors may be deleted from external systems
- Audit trail must persist even if actor is removed

**Rationale:**
```typescript
// Audit log preserves historical data
auditLog.actorId = 'user_12345';  // User might be deleted later
auditLog.actorType = 'user';      // But audit trail remains
```

### 3. AuditLog.entityId ❌ No FK

**Why No FK?**
- **Polymorphic reference** - can point to different entity types
- Could reference Account, Transaction, Currency, etc.
- PostgreSQL doesn't support polymorphic FKs
- Entity might be deleted (audit log must persist)

**Design:**
```typescript
auditLog.entityType = 'Account';
auditLog.entityId = '123e4567...';  // Could be Account, Transaction, etc.
```

## ON DELETE / ON UPDATE Policies

### RESTRICT (Used for all FKs)

**Why RESTRICT?**
- Financial data is **immutable** by nature
- Prevents accidental data loss
- Enforces explicit handling of dependencies
- Required for audit compliance

**Examples:**
```sql
-- Cannot delete currency in use
DELETE FROM currencies WHERE code = 'USD';  -- FAILS if accounts exist

-- Cannot delete account with transactions
DELETE FROM accounts WHERE id = '...';      -- FAILS if transactions exist

-- Cannot delete original transaction with refunds
DELETE FROM transactions WHERE id = '...';  -- FAILS if refunds exist
```

### CASCADE (For Updates Only)

**Why CASCADE for updates?**
- Maintains referential integrity if IDs change
- Safe for UUIDs (rarely change)
- Propagates changes automatically
- Reduces maintenance burden

**Note:** We use CASCADE only for updates, never for deletes in financial systems.

## Comparison with Other Approaches

### Alternative 1: CASCADE DELETE ❌ Not Recommended

```sql
ON DELETE CASCADE  -- BAD for financial systems
```

**Why Not?**
- Could accidentally delete entire transaction history
- Violates audit requirements
- Data loss risk
- Not recoverable

### Alternative 2: SET NULL ❌ Not Recommended

```sql
ON DELETE SET NULL  -- BAD for financial systems
```

**Why Not?**
- Creates orphaned records
- Breaks audit trail
- Loses referential integrity
- Cannot reconstruct history

### Alternative 3: NO ACTION ⚠️ Similar to RESTRICT

```sql
ON DELETE NO ACTION  -- Similar to RESTRICT
```

**Difference:**
- RESTRICT checks immediately
- NO ACTION checks at end of transaction
- For our use case, RESTRICT is clearer

## Best Practices for Financial Systems

### ✅ DO:
- Use foreign keys for internal references
- Use RESTRICT for deletes
- Use CASCADE for updates (carefully)
- Keep external references as strings
- Document all FK decisions

### ❌ DON'T:
- Use CASCADE DELETE in financial systems
- Add FKs to external system references
- Use SET NULL for critical relationships
- Delete financial records (soft delete instead)

## Future Considerations

### Soft Deletes
If you need to "delete" records, implement soft deletes:

```typescript
@Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
deletedAt: Date | null;
```

Then filter out deleted records in queries while preserving data.

### Archive Strategy
For old data:
- Move to archive tables (not delete)
- Keep FKs intact
- Maintain audit trail

## Summary

| Relationship | FK? | ON DELETE | ON UPDATE | Reason |
|--------------|-----|-----------|-----------|--------|
| Account → Currency | ✅ | RESTRICT | CASCADE | Internal, must validate |
| Transaction → Account | ✅ | RESTRICT | CASCADE | Internal, audit required |
| Transaction → Transaction | ✅ | RESTRICT | CASCADE | Internal, refund chain |
| Account → Owner | ❌ | N/A | N/A | External reference |
| AuditLog → Actor | ❌ | N/A | N/A | External reference |
| AuditLog → Entity | ❌ | N/A | N/A | Polymorphic reference |

**All FK decisions are production-ready and follow financial system best practices.** ✅


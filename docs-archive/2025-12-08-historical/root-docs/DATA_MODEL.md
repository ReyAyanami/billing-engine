# Billing System Data Model

## 1. Entity Relationship Diagram

```
┌─────────────────────┐
│      Currency       │
│─────────────────────│
│ code (PK)           │
│ name                │
│ type                │
│ precision           │
│ is_active           │
│ metadata            │
└──────────┬──────────┘
           │
           │ (1)
           │
           │ (N)
┌──────────▼──────────┐
│      Account        │
│─────────────────────│
│ id (PK)             │
│ owner_id            │
│ owner_type          │
│ currency (FK)       │─────┐
│ balance             │     │
│ status              │     │
│ metadata            │     │
│ version             │     │
│ created_at          │     │
│ updated_at          │     │
└──────────┬──────────┘     │
           │                │
           │ (1)            │
           │                │
           │ (N)            │
┌──────────▼──────────┐     │
│    Transaction      │     │
│─────────────────────│     │
│ id (PK)             │     │
│ idempotency_key     │     │
│ type                │     │
│ account_id (FK)     │     │
│ counterparty_       │     │
│   account_id (FK)   │─────┘
│ amount              │
│ currency            │
│ balance_before      │
│ balance_after       │
│ status              │
│ reference           │
│ metadata            │
│ parent_transaction  │
│   _id (FK - self)   │──┐
│ created_at          │  │
│ completed_at        │  │
└──────────┬──────────┘  │
           │             │
           │ (self-ref)  │
           └─────────────┘
           
┌─────────────────────┐
│     AuditLog        │
│─────────────────────│
│ id (PK)             │
│ entity_type         │
│ entity_id           │
│ operation           │
│ actor_id            │
│ actor_type          │
│ changes             │
│ correlation_id      │
│ timestamp           │
└─────────────────────┘
```

## 2. Entity Definitions

### 2.1 Currency Entity

**Purpose**: Defines supported currencies with their configurations

**Attributes**:
- `code` (string, PK): ISO 4217 code or custom code (e.g., "USD", "BTC", "POINTS")
- `name` (string): Full name of the currency
- `type` (enum): "fiat" or "non-fiat"
- `precision` (integer): Number of decimal places (e.g., 2 for USD, 8 for BTC)
- `is_active` (boolean): Whether the currency is currently available
- `metadata` (JSON): Additional configuration

**Relationships**:
- One-to-Many with Account

**Constraints**:
- Primary key on `code`
- `precision` must be >= 0 and <= 18

**Example Records**:
```json
[
  {
    "code": "USD",
    "name": "US Dollar",
    "type": "fiat",
    "precision": 2,
    "is_active": true,
    "metadata": { "symbol": "$" }
  },
  {
    "code": "BTC",
    "name": "Bitcoin",
    "type": "non-fiat",
    "precision": 8,
    "is_active": true,
    "metadata": { "symbol": "₿" }
  },
  {
    "code": "POINTS",
    "name": "Loyalty Points",
    "type": "non-fiat",
    "precision": 0,
    "is_active": true,
    "metadata": { "symbol": "pts" }
  }
]
```

### 2.2 Account Entity

**Purpose**: Represents a currency holder

**Attributes**:
- `id` (UUID, PK): Unique identifier
- `owner_id` (string): External reference to the owner (user ID, org ID, etc.)
- `owner_type` (string): Type of owner (e.g., "user", "organization", "system")
- `currency` (string, FK): Currency code from Currency table
- `balance` (decimal 20,8): Current account balance
- `status` (enum): "active", "suspended", "closed"
- `metadata` (JSON): Custom attributes
- `version` (integer): Optimistic locking version
- `created_at` (timestamp): Creation timestamp
- `updated_at` (timestamp): Last update timestamp

**Relationships**:
- Many-to-One with Currency
- One-to-Many with Transaction (as account_id)
- One-to-Many with Transaction (as counterparty_account_id)

**Constraints**:
- Primary key on `id`
- Foreign key on `currency` references Currency(code)
- Check constraint: `balance >= 0`
- Index on `(owner_id, owner_type)`
- Index on `status`

**Business Rules**:
- Balance cannot be negative
- Currency cannot be changed after creation
- Only active accounts can perform transactions
- Owner cannot be changed after creation

**Example Record**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "owner_id": "user_12345",
  "owner_type": "user",
  "currency": "USD",
  "balance": "1000.50",
  "status": "active",
  "metadata": {
    "account_name": "Primary Checking",
    "description": "Main account for daily transactions"
  },
  "version": 1,
  "created_at": "2025-12-01T10:00:00Z",
  "updated_at": "2025-12-07T10:00:00Z"
}
```

### 2.3 Transaction Entity

**Purpose**: Records all financial operations

**Attributes**:
- `id` (UUID, PK): Unique identifier
- `idempotency_key` (UUID, unique): Client-provided key for idempotency
- `type` (enum): "topup", "withdrawal", "transfer_debit", "transfer_credit", "payment", "refund", "cancellation"
- `account_id` (UUID, FK): Primary account for this transaction
- `counterparty_account_id` (UUID, FK, nullable): Other account (for transfers)
- `amount` (decimal 20,8): Transaction amount (always positive)
- `currency` (string): Currency code
- `balance_before` (decimal 20,8): Account balance before transaction
- `balance_after` (decimal 20,8): Account balance after transaction
- `status` (enum): "pending", "completed", "failed", "cancelled", "refunded"
- `reference` (string): User-provided reference/description
- `metadata` (JSON): Additional transaction data
- `parent_transaction_id` (UUID, FK, nullable): Reference to original transaction (for refunds)
- `created_at` (timestamp): Creation timestamp
- `completed_at` (timestamp, nullable): Completion timestamp

**Relationships**:
- Many-to-One with Account (account_id)
- Many-to-One with Account (counterparty_account_id)
- Self-referencing (parent_transaction_id for refunds)

**Constraints**:
- Primary key on `id`
- Unique constraint on `idempotency_key`
- Foreign key on `account_id` references Account(id)
- Foreign key on `counterparty_account_id` references Account(id)
- Foreign key on `parent_transaction_id` references Transaction(id)
- Check constraint: `amount > 0`
- Index on `account_id`
- Index on `idempotency_key`
- Index on `status`
- Index on `created_at`

**Business Rules**:
- Amount must be positive
- Currency must match account currency
- Balance calculations: `balance_after = balance_before ± amount`
- Refunds must reference parent transaction
- Cannot modify completed transactions

**Transaction Type Details**:

| Type | Debit/Credit | Counterparty | Parent Ref |
|------|-------------|--------------|------------|
| topup | Credit | No | No |
| withdrawal | Debit | No | No |
| transfer_debit | Debit | Yes | No |
| transfer_credit | Credit | Yes | No |
| payment | Debit | No | No |
| refund | Credit/Debit | No | Yes |
| cancellation | N/A (reversal) | Depends | Yes |

**Example Records**:

```json
// Top-up transaction
{
  "id": "456e7890-e89b-12d3-a456-426614174001",
  "idempotency_key": "abc-123-def-456",
  "type": "topup",
  "account_id": "123e4567-e89b-12d3-a456-426614174000",
  "counterparty_account_id": null,
  "amount": "100.00",
  "currency": "USD",
  "balance_before": "1000.50",
  "balance_after": "1100.50",
  "status": "completed",
  "reference": "Monthly salary deposit",
  "metadata": {
    "source": "bank_transfer",
    "bank_reference": "TXN123456"
  },
  "parent_transaction_id": null,
  "created_at": "2025-12-07T10:00:00Z",
  "completed_at": "2025-12-07T10:00:01Z"
}

// Transfer (debit side)
{
  "id": "789e0123-e89b-12d3-a456-426614174002",
  "idempotency_key": "def-456-ghi-789",
  "type": "transfer_debit",
  "account_id": "123e4567-e89b-12d3-a456-426614174000",
  "counterparty_account_id": "999e9999-e89b-12d3-a456-426614174999",
  "amount": "50.00",
  "currency": "USD",
  "balance_before": "1100.50",
  "balance_after": "1050.50",
  "status": "completed",
  "reference": "Payment to friend",
  "metadata": {
    "related_transaction_id": "789e0123-e89b-12d3-a456-426614174003"
  },
  "parent_transaction_id": null,
  "created_at": "2025-12-07T11:00:00Z",
  "completed_at": "2025-12-07T11:00:01Z"
}

// Refund
{
  "id": "aaa1111-e89b-12d3-a456-426614174004",
  "idempotency_key": "ghi-789-jkl-012",
  "type": "refund",
  "account_id": "123e4567-e89b-12d3-a456-426614174000",
  "counterparty_account_id": null,
  "amount": "50.00",
  "currency": "USD",
  "balance_before": "1050.50",
  "balance_after": "1100.50",
  "status": "completed",
  "reference": "Refund for payment",
  "metadata": {
    "refund_reason": "Customer request"
  },
  "parent_transaction_id": "789e0123-e89b-12d3-a456-426614174002",
  "created_at": "2025-12-07T12:00:00Z",
  "completed_at": "2025-12-07T12:00:01Z"
}
```

### 2.4 AuditLog Entity

**Purpose**: Immutable log of all system operations for compliance and debugging

**Attributes**:
- `id` (UUID, PK): Unique identifier
- `entity_type` (string): Type of entity (e.g., "Account", "Transaction")
- `entity_id` (UUID): ID of the entity being audited
- `operation` (string): Operation performed (e.g., "CREATE", "UPDATE", "DELETE")
- `actor_id` (string): ID of the user/system that performed the operation
- `actor_type` (string): Type of actor (e.g., "user", "system", "admin")
- `changes` (JSON): Before/after state or operation details
- `correlation_id` (UUID): Request correlation ID for tracing
- `timestamp` (timestamp): When the operation occurred

**Relationships**:
- None (independent audit trail)

**Constraints**:
- Primary key on `id`
- Index on `(entity_type, entity_id)`
- Index on `correlation_id`
- Index on `timestamp`
- Index on `operation`

**Business Rules**:
- Records are append-only (never updated or deleted)
- All critical operations must be logged
- Includes both successful and failed operations

**Example Record**:
```json
{
  "id": "bbb2222-e89b-12d3-a456-426614174005",
  "entity_type": "Transaction",
  "entity_id": "456e7890-e89b-12d3-a456-426614174001",
  "operation": "CREATE_TOPUP",
  "actor_id": "user_12345",
  "actor_type": "user",
  "changes": {
    "account_id": "123e4567-e89b-12d3-a456-426614174000",
    "amount": "100.00",
    "balance_before": "1000.50",
    "balance_after": "1100.50"
  },
  "correlation_id": "req-abc-123-def-456",
  "timestamp": "2025-12-07T10:00:00Z"
}
```

## 3. Data Lifecycle

### 3.1 Account Lifecycle

```
     CREATE
        │
        ▼
    ┌──────┐
    │ACTIVE│◄──┐ REACTIVATE
    └───┬──┘   │
        │      │
 SUSPEND│      │
        ▼      │
   ┌─────────┐ │
   │SUSPENDED├─┘
   └────┬────┘
        │
  CLOSE │
        ▼
   ┌──────┐
   │CLOSED│ (Terminal state)
   └──────┘
```

### 3.2 Transaction Lifecycle

```
     CREATE
        │
        ▼
    ┌───────┐
    │PENDING│
    └───┬───┘
        │
        ├──► COMPLETED ──┐
        │                 │
        ├──► FAILED       │
        │                 │
        └──► CANCELLED    │
                          │
                    REFUND│
                          ▼
                     ┌─────────┐
                     │REFUNDED │
                     └─────────┘
```

## 4. Data Integrity Rules

### 4.1 Balance Consistency
```
For any account at any point in time:
  current_balance = initial_balance + Σ(credits) - Σ(debits)
  
Where:
  - credits = topup, transfer_credit, refund (of withdrawal/payment)
  - debits = withdrawal, transfer_debit, payment, refund (of topup)
```

### 4.2 Transaction Atomicity
```
For transfers:
  transaction_debit.amount = transaction_credit.amount
  transaction_debit.status = transaction_credit.status
  Both must complete or both must fail
```

### 4.3 Refund Rules
```
For refund transactions:
  refund.parent_transaction_id = original_transaction.id
  refund.amount <= original_transaction.amount
  refund.account_id = original_transaction.account_id
  original_transaction.status = 'refunded' (after refund)
```

## 5. Indexing Strategy

### 5.1 Performance Indexes

```sql
-- High-frequency queries
CREATE INDEX idx_accounts_owner ON accounts(owner_id, owner_type);
CREATE INDEX idx_accounts_status ON accounts(status) WHERE status = 'active';

-- Transaction queries
CREATE INDEX idx_transactions_account_created ON transactions(account_id, created_at DESC);
CREATE INDEX idx_transactions_idempotency ON transactions(idempotency_key);
CREATE INDEX idx_transactions_status_created ON transactions(status, created_at DESC);

-- Audit queries
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id, timestamp DESC);
CREATE INDEX idx_audit_correlation ON audit_logs(correlation_id);
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp DESC);
```

### 5.2 Covering Indexes

```sql
-- Balance inquiry without table access
CREATE INDEX idx_accounts_balance ON accounts(id) INCLUDE (balance, currency, status);

-- Transaction list without table access
CREATE INDEX idx_transactions_list ON transactions(account_id, created_at DESC) 
  INCLUDE (type, amount, status);
```

## 6. Data Retention and Archival

### 6.1 Retention Policy
- **Accounts**: Retain indefinitely (or per regulatory requirements)
- **Transactions**: Retain for 7 years (financial regulations)
- **Audit Logs**: Retain for 10 years (compliance)

### 6.2 Archival Strategy
- Move transactions older than 2 years to archive table
- Keep indexes on active data only
- Archive table partitioned by year

## 7. Data Migration Scripts

### 7.1 Initial Schema Setup
```sql
-- See ARCHITECTURE.md for complete CREATE TABLE statements
```

### 7.2 Seed Data
```sql
-- Insert default currencies
INSERT INTO currencies (code, name, type, precision, is_active) VALUES
  ('USD', 'US Dollar', 'fiat', 2, true),
  ('EUR', 'Euro', 'fiat', 2, true),
  ('GBP', 'British Pound', 'fiat', 2, true),
  ('BTC', 'Bitcoin', 'non-fiat', 8, true),
  ('ETH', 'Ethereum', 'non-fiat', 8, true),
  ('POINTS', 'Loyalty Points', 'non-fiat', 0, true);
```

## 8. Consistency Checks

### 8.1 Reconciliation Queries

```sql
-- Check balance consistency
SELECT 
  a.id,
  a.balance as recorded_balance,
  COALESCE(
    (SELECT SUM(
      CASE 
        WHEN type IN ('topup', 'transfer_credit') THEN amount
        WHEN type IN ('withdrawal', 'transfer_debit', 'payment') THEN -amount
        WHEN type = 'refund' AND parent_transaction_id IS NOT NULL THEN
          (SELECT CASE 
            WHEN parent.type IN ('topup', 'transfer_credit') THEN -amount
            ELSE amount
          END FROM transactions parent WHERE parent.id = t.parent_transaction_id)
        ELSE 0
      END
    )
    FROM transactions t
    WHERE t.account_id = a.id AND t.status = 'completed'
    ), 0
  ) as calculated_balance
FROM accounts a
HAVING recorded_balance != calculated_balance;

-- Find orphaned transactions
SELECT * FROM transactions 
WHERE counterparty_account_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM transactions t2 
    WHERE t2.counterparty_account_id = transactions.account_id
      AND t2.account_id = transactions.counterparty_account_id
      AND t2.amount = transactions.amount
  );
```

## Summary

This data model provides:
- ✅ **Auditability**: Complete audit trail via AuditLog table
- ✅ **Consistency**: Balance tracking and transaction linking
- ✅ **Flexibility**: JSON metadata for extensibility
- ✅ **Performance**: Strategic indexing for common queries
- ✅ **Integrity**: Foreign keys and check constraints
- ✅ **Traceability**: Correlation IDs and parent transaction references


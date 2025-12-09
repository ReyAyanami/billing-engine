# Data Model

## Overview

The Billing Engine uses PostgreSQL for both **write operations** (current state) and **read operations** (projections). This document describes the database schema, entities, relationships, and design decisions.

> 🎓 **Learning Focus**: This schema balances normalization (for writes) with denormalization (for reads) to support CQRS architecture.

---

## Entity Relationship Diagram

```
┌─────────────┐
│  Currency   │───┐
└─────────────┘   │
                  │
┌─────────────────▼────────┐
│      Account             │
│  (Write Model)           │
├──────────────────────────┤
│ id (PK)                  │
│ ownerId                  │
│ ownerType                │
│ accountType (enum)       │
│ currency (FK)            │
│ balance                  │
│ status (enum)            │
│ minBalance, maxBalance   │
│ version (optimistic lock)│
└─────────┬────────────────┘
          │
          │ 1:N
          │
┌─────────▼────────────┐
│   Transaction        │
│  (Write Model)       │
├──────────────────────┤
│ id (PK)              │
│ idempotencyKey (UK)  │
│ type (enum)          │
│ sourceAccountId (FK) │
│ destinationAccountId │
│ amount               │
│ currency             │
│ status (enum)        │
│ balances (before/aft)│
│ parentTransactionId  │
└──────────────────────┘

┌────────────────────────┐
│  AccountProjection     │
│  (Read Model)          │
├────────────────────────┤
│ id (PK)                │
│ ownerId                │
│ ownerType              │
│ currency               │
│ balance                │
│ status                 │
│ type                   │
└────────────────────────┘

┌────────────────────────┐
│ TransactionProjection  │
│  (Read Model)          │
├────────────────────────┤
│ id (PK)                │
│ type                   │
│ accountId              │
│ amount                 │
│ currency               │
│ status                 │
│ relatedAccountId       │
│ compensationDetails    │
└────────────────────────┘

┌────────────────────────┐
│      AuditLog          │
│  (Compliance)          │
├────────────────────────┤
│ id (PK)                │
│ entityType             │
│ entityId               │
│ operation              │
│ changes (jsonb)        │
│ actorId, actorType     │
│ timestamp              │
└────────────────────────┘
```

---

## Entities

### Currency

**Purpose**: Configuration for supported currencies.

```sql
CREATE TABLE currencies (
  code          VARCHAR(10) PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  type          VARCHAR(20) NOT NULL,  -- 'fiat' or 'non-fiat'
  precision     INT NOT NULL DEFAULT 2,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  metadata      JSONB
);

CREATE INDEX idx_currency_type ON currencies(type);
CREATE INDEX idx_currency_active ON currencies(is_active);
```

**Fields**:
- `code` - ISO 4217 currency code (USD, EUR) or custom (BTC, POINTS)
- `name` - Human-readable name
- `type` - `'fiat'` for traditional currencies, `'non-fiat'` for crypto/points
- `precision` - Decimal places (2 for USD, 8 for BTC, 0 for points)
- `is_active` - Whether currency is currently available
- `metadata` - Additional configuration (symbol, icon, etc.)

**Example Data**:
```sql
INSERT INTO currencies VALUES 
  ('USD', 'US Dollar', 'fiat', 2, true, '{"symbol": "$"}'),
  ('EUR', 'Euro', 'fiat', 2, true, '{"symbol": "€"}'),
  ('BTC', 'Bitcoin', 'non-fiat', 8, true, '{"symbol": "₿"}'),
  ('POINTS', 'Reward Points', 'non-fiat', 0, true, '{}');
```

---

### Account (Write Model)

**Purpose**: Current state of accounts for write operations.

```sql
CREATE TABLE accounts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id        VARCHAR(255) NOT NULL,
  owner_type      VARCHAR(50) NOT NULL,
  account_type    VARCHAR(20) NOT NULL DEFAULT 'user',
  account_subtype VARCHAR(50),
  currency        VARCHAR(10) NOT NULL REFERENCES currencies(code),
  balance         DECIMAL(20, 8) NOT NULL DEFAULT 0,
  max_balance     DECIMAL(20, 8),
  min_balance     DECIMAL(20, 8),
  status          VARCHAR(20) NOT NULL DEFAULT 'active',
  metadata        JSONB,
  version         INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_account_owner ON accounts(owner_id, owner_type);
CREATE INDEX idx_account_status ON accounts(status);
CREATE INDEX idx_account_type ON accounts(account_type);
CREATE INDEX idx_account_created ON accounts(created_at);
```

**Fields**:
- `id` - Unique identifier (UUID)
- `owner_id` - External identifier (user ID, system ID, etc.)
- `owner_type` - Type of owner (`'user'`, `'organization'`, etc.)
- `account_type` - Type: `'user'`, `'system'`, or `'external'`
- `account_subtype` - Optional subtype for categorization
- `currency` - Currency code (FK to currencies)
- `balance` - Current balance (DECIMAL for precision)
- `max_balance` - Maximum allowed balance (optional)
- `min_balance` - Minimum allowed balance (optional, defaults to 0)
- `status` - Account status enum
- `metadata` - Additional data (JSONB)
- `version` - Optimistic locking version

**Account Types**:
```typescript
enum AccountType {
  USER = 'user',        // End-user accounts
  SYSTEM = 'system',    // Internal system accounts (fees, reserves)
  EXTERNAL = 'external' // External services (banks, payment gateways)
}
```

**Account Status**:
```typescript
enum AccountStatus {
  ACTIVE = 'active',       // Normal operation
  SUSPENDED = 'suspended', // Temporarily disabled
  CLOSED = 'closed'        // Permanently closed
}
```

**Status Transitions**:
- `active` → `suspended` ✓
- `active` → `closed` ✓
- `suspended` → `active` ✓
- `suspended` → `closed` ✓
- `closed` → any ✗ (terminal state)

**Why Decimal(20, 8)?**
- 20 digits total, 8 after decimal
- Supports up to 999,999,999,999.99999999
- Precision needed for cryptocurrencies (8 decimal places)
- **Pro**: No floating-point precision errors
- **Con**: Slower than BIGINT (but correctness > speed for money)

---

### Transaction (Write Model)

**Purpose**: Record of financial transactions with audit trail.

```sql
CREATE TABLE transactions (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  idempotency_key             UUID UNIQUE NOT NULL,
  type                        VARCHAR(20) NOT NULL,
  source_account_id           UUID NOT NULL REFERENCES accounts(id),
  destination_account_id      UUID NOT NULL REFERENCES accounts(id),
  amount                      DECIMAL(20, 8) NOT NULL,
  currency                    VARCHAR(10) NOT NULL,
  source_balance_before       DECIMAL(20, 8) NOT NULL,
  source_balance_after        DECIMAL(20, 8) NOT NULL,
  destination_balance_before  DECIMAL(20, 8) NOT NULL,
  destination_balance_after   DECIMAL(20, 8) NOT NULL,
  status                      VARCHAR(20) NOT NULL DEFAULT 'pending',
  reference                   VARCHAR(500),
  metadata                    JSONB,
  parent_transaction_id       UUID REFERENCES transactions(id),
  created_at                  TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at                TIMESTAMP
);

CREATE INDEX idx_tx_source ON transactions(source_account_id, created_at);
CREATE INDEX idx_tx_destination ON transactions(destination_account_id, created_at);
CREATE UNIQUE INDEX idx_tx_idempotency ON transactions(idempotency_key);
CREATE INDEX idx_tx_status ON transactions(status);
CREATE INDEX idx_tx_created ON transactions(created_at);
CREATE INDEX idx_tx_parent ON transactions(parent_transaction_id);
```

**Fields**:
- `id` - Unique transaction identifier
- `idempotency_key` - UUID for duplicate prevention (unique)
- `type` - Transaction type enum
- `source_account_id` - Account debited (FK)
- `destination_account_id` - Account credited (FK)
- `amount` - Transaction amount (always positive)
- `currency` - Currency code
- `source_balance_before/after` - Audit trail for source
- `destination_balance_before/after` - Audit trail for destination
- `status` - Transaction status enum
- `reference` - Human-readable reference
- `metadata` - Additional data (JSONB)
- `parent_transaction_id` - For refunds/compensations (FK)
- `created_at` - When transaction was initiated
- `completed_at` - When transaction completed

**Transaction Types**:
```typescript
enum TransactionType {
  TOPUP = 'topup',                    // External → User
  WITHDRAWAL = 'withdrawal',           // User → External
  TRANSFER_DEBIT = 'transfer_debit',   // User → User (debit side)
  TRANSFER_CREDIT = 'transfer_credit', // User → User (credit side)
  PAYMENT = 'payment',                 // User → System
  REFUND = 'refund',                   // Reversal of payment
  CANCELLATION = 'cancellation'        // Cancellation
}
```

**Transaction Status**:
```typescript
enum TransactionStatus {
  PENDING = 'pending',        // Initiated, processing
  COMPLETED = 'completed',    // Successfully completed
  FAILED = 'failed',          // Failed (no state change)
  CANCELLED = 'cancelled',    // Cancelled by user
  REFUNDED = 'refunded',      // Refunded (original tx)
  COMPENSATED = 'compensated' // Rolled back (saga failure)
}
```

**Why Store Before/After Balances?**
- **Audit Requirement**: Prove what balances were at transaction time
- **Debugging**: Reconstruct state without replaying events
- **Compliance**: Financial regulations often require this
- **Trade-off**: Storage overhead, but worth it for auditability

**Why Idempotency Key?**
- Prevents duplicate transactions
- Client can retry safely
- Unique constraint enforces at database level

---

### AccountProjection (Read Model)

**Purpose**: Denormalized view for fast account queries.

```sql
CREATE TABLE account_projections (
  id          UUID PRIMARY KEY,
  owner_id    VARCHAR(255) NOT NULL,
  owner_type  VARCHAR(50) NOT NULL,
  currency    VARCHAR(10) NOT NULL,
  balance     DECIMAL(28, 8) NOT NULL,
  status      VARCHAR(20) NOT NULL,
  type        VARCHAR(20) NOT NULL,
  created_at  TIMESTAMP NOT NULL,
  updated_at  TIMESTAMP NOT NULL
);

CREATE INDEX idx_account_proj_owner ON account_projections(owner_id, owner_type);
CREATE INDEX idx_account_proj_status ON account_projections(status);
```

**Differences from Account Entity**:
- No foreign keys (denormalized)
- No version column (eventually consistent)
- Simpler structure (only fields needed for queries)
- Updated by event handlers, not directly by commands

**Why Separate Projection?**
- **Pro**: Optimized for specific queries
- **Pro**: No joins needed
- **Pro**: Can have multiple projections for different use cases
- **Con**: Eventual consistency (slight lag)
- **Con**: Storage duplication

---

### TransactionProjection (Read Model)

**Purpose**: Denormalized view for transaction queries.

```sql
CREATE TABLE transaction_projections (
  id                     UUID PRIMARY KEY,
  type                   VARCHAR(50) NOT NULL,
  account_id             UUID NOT NULL,
  amount                 DECIMAL(28, 8) NOT NULL,
  currency               VARCHAR(10) NOT NULL,
  status                 VARCHAR(50) NOT NULL,
  reference              TEXT,
  related_account_id     UUID,
  parent_transaction_id  UUID,
  compensation_details   JSONB,
  created_at             TIMESTAMP NOT NULL,
  completed_at           TIMESTAMP
);

CREATE INDEX idx_tx_proj_account ON transaction_projections(account_id, created_at DESC);
CREATE INDEX idx_tx_proj_status ON transaction_projections(status);
CREATE INDEX idx_tx_proj_parent ON transaction_projections(parent_transaction_id);
```

**Purpose**:
- Fast transaction history queries
- Single account perspective (not double-entry)
- Includes compensation details for saga rollbacks

---

### AuditLog

**Purpose**: Compliance and debugging log of all operations.

```sql
CREATE TABLE audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL,
  entity_id   VARCHAR(255) NOT NULL,
  operation   VARCHAR(50) NOT NULL,
  changes     JSONB NOT NULL,
  actor_id    VARCHAR(255),
  actor_type  VARCHAR(50),
  correlation_id UUID,
  timestamp   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_correlation ON audit_logs(correlation_id);
```

**Fields**:
- `id` - Auto-incrementing ID
- `entity_type` - Type of entity (`'Account'`, `'Transaction'`)
- `entity_id` - ID of affected entity
- `operation` - Operation performed (`'create'`, `'update'`, `'delete'`)
- `changes` - JSON of what changed (before/after)
- `actor_id` - Who performed the action
- `actor_type` - Type of actor (`'user'`, `'system'`, `'api'`)
- `correlation_id` - Links related operations
- `timestamp` - When operation occurred

**Example Entry**:
```json
{
  "id": 1234,
  "entity_type": "Account",
  "entity_id": "550e8400-e29b-41d4-a716-446655440000",
  "operation": "balance_update",
  "changes": {
    "before": { "balance": "100.00" },
    "after": { "balance": "150.00" }
  },
  "actor_id": "user_123",
  "actor_type": "api",
  "correlation_id": "c0rr-e1at-10n-1d",
  "timestamp": "2025-12-09T12:00:00.000Z"
}
```

---

## Event Store (Kafka Topics)

While PostgreSQL stores current state, Kafka stores **all events**.

### Topics

```
billing.account-events
billing.transaction-events
```

### Event Structure

Not stored in PostgreSQL - stored in Kafka as JSON messages:

```json
{
  "key": "aggregate-uuid",
  "value": {
    "eventType": "BalanceChanged",
    "aggregateId": "account-uuid",
    "aggregateType": "Account",
    "aggregateVersion": 5,
    "timestamp": "2025-12-09T12:00:00.000Z",
    "correlationId": "uuid",
    "causationId": "command-uuid",
    "metadata": {
      "actorId": "user_123",
      "actorType": "api"
    },
    "data": {
      "previousBalance": "100.00",
      "newBalance": "150.00",
      "changeAmount": "50.00",
      "changeType": "CREDIT",
      "reason": "Topup",
      "transactionId": "tx-uuid"
    }
  }
}
```

**Partitioning**: By `aggregateId` (ensures ordering per aggregate)

---

## Indexes

### Performance-Critical Indexes

```sql
-- Account lookups by owner (common query)
CREATE INDEX idx_account_owner ON accounts(owner_id, owner_type);

-- Transaction history by account (very common)
CREATE INDEX idx_tx_source ON transactions(source_account_id, created_at DESC);
CREATE INDEX idx_tx_destination ON transactions(destination_account_id, created_at DESC);

-- Idempotency check (on every write)
CREATE UNIQUE INDEX idx_tx_idempotency ON transactions(idempotency_key);

-- Status filtering (admin dashboards)
CREATE INDEX idx_account_status ON accounts(status);
CREATE INDEX idx_tx_status ON transactions(status);
```

### Why These Indexes?

1. **Composite Index (owner_id, owner_type)**: Common filter in "list accounts" queries
2. **DESC on created_at**: Recent transactions first (typical query pattern)
3. **Unique on idempotency_key**: Enforces duplicate prevention at database level
4. **Status indexes**: Admin dashboards filter by status frequently

**Trade-off**: Indexes slow down writes but speed up reads significantly.

---

## Constraints

### Foreign Keys

```sql
-- Currency must exist before account
ALTER TABLE accounts 
  ADD CONSTRAINT fk_account_currency 
  FOREIGN KEY (currency) REFERENCES currencies(code) 
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Both accounts must exist before transaction
ALTER TABLE transactions 
  ADD CONSTRAINT fk_tx_source 
  FOREIGN KEY (source_account_id) REFERENCES accounts(id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE transactions 
  ADD CONSTRAINT fk_tx_destination 
  FOREIGN KEY (destination_account_id) REFERENCES accounts(id)
  ON DELETE RESTRICT ON UPDATE CASCADE;
```

**Why RESTRICT on DELETE?**
- Prevents accidental deletion of accounts with transactions
- Financial data should never be deleted (audit requirement)
- Use `status = 'closed'` instead of deletion

### Check Constraints

```sql
-- Balance must be non-negative for user accounts
ALTER TABLE accounts
  ADD CONSTRAINT chk_user_balance_non_negative
  CHECK (account_type != 'user' OR balance >= 0);

-- Transaction amount must be positive
ALTER TABLE transactions
  ADD CONSTRAINT chk_amount_positive
  CHECK (amount > 0);

-- Source and destination must be different
ALTER TABLE transactions
  ADD CONSTRAINT chk_different_accounts
  CHECK (source_account_id != destination_account_id);
```

---

## Data Integrity

### Double-Entry Balance Verification

Query to verify all balances sum to zero:

```sql
SELECT 
  SUM(balance::NUMERIC) as total_balance,
  currency
FROM accounts
GROUP BY currency;
```

**Expected Result**: All should be 0 (or close to 0 due to EXTERNAL accounts)

**Why?** Double-entry bookkeeping guarantees: Σ(all balances) = 0

### Transaction Consistency Check

```sql
-- Verify all completed transactions updated balances correctly
SELECT 
  t.id,
  t.type,
  t.source_balance_before,
  t.source_balance_after,
  t.destination_balance_before,
  t.destination_balance_after,
  t.amount,
  a_src.balance as current_src_balance,
  a_dst.balance as current_dst_balance
FROM transactions t
JOIN accounts a_src ON t.source_account_id = a_src.id
JOIN accounts a_dst ON t.destination_account_id = a_dst.id
WHERE t.status = 'completed'
  AND (
    t.source_balance_after != (t.source_balance_before - t.amount)
    OR
    t.destination_balance_after != (t.destination_balance_before + t.amount)
  );
```

**Expected Result**: 0 rows (all transactions are consistent)

---

## Migrations

Migrations are managed by TypeORM:

```bash
# Create new migration
npm run migration:generate -- src/migrations/MigrationName

# Run migrations
npm run migration:run

# Revert last migration
npm run migration:revert
```

### Existing Migrations

1. **InitialDoubleEntrySchema** - Base schema (accounts, transactions, currencies)
2. **AddAccountProjections** - Read model for accounts
3. **AddTransactionProjections** - Read model for transactions
4. **AddCompensationFieldsToTransactionProjections** - Saga compensation tracking

---

## Storage Considerations

### Typical Sizes

- **Account**: ~500 bytes per row
- **Transaction**: ~800 bytes per row
- **AuditLog**: ~1 KB per row
- **Events in Kafka**: ~2 KB per message

### Growth Estimates

For 1 million users with 100 transactions each:

- **Accounts**: 1M × 500B = 500 MB
- **Transactions**: 100M × 800B = 80 GB
- **Events**: 100M × 2KB = 200 GB (in Kafka)
- **Projections**: Similar to main tables

**Retention Strategy** (not implemented):
- Soft-delete old transactions (archive)
- Compact Kafka topics after threshold
- Snapshot aggregates to avoid full replay

---

## Related Documentation

- [System Design](./system-design.md) - Overall architecture
- [CQRS Pattern](./cqrs-pattern.md) - Command/Query separation
- [Double-Entry Bookkeeping](./double-entry.md) - Accounting principles

---

**Next**: Learn about [REST API](../api/rest-api.md) →


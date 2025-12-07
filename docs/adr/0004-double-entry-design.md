# ADR-0004: Double-Entry System Design

**Status**: Accepted
**Date**: 2025-12-07
**Tags**: #design #double-entry #architecture

# Double-Entry Bookkeeping Design

## Overview

This billing engine implements a **true double-entry bookkeeping system** where every financial transaction involves two accounts: a source (debit) and a destination (credit). This design ensures complete auditability, accurate financial tracking, and compliance with accounting standards.

## Core Principles

### 1. Every Transaction Has Two Sides

**Traditional Approach (Before):**
```
Topup:      ??? → User Account        (Where does money come from?)
Withdrawal: User Account → ???        (Where does money go?)
```

**Double-Entry Approach (Now):**
```
Topup:      External Account → User Account
Withdrawal: User Account → External Account
Transfer:   User Account A → User Account B
Payment:    User Account → Merchant Account
Refund:     Merchant Account → User Account
```

### 2. Three Types of Accounts

#### User Accounts (`AccountType.USER`)
- Belong to end users
- Can have balance limits (`maxBalance`, `minBalance`)
- Subject to business rules and validation
- Examples: Personal wallet, Business account

#### External Accounts (`AccountType.EXTERNAL`)
- Represent external financial services
- Virtual accounts for tracking money flow
- Can go negative (represent unlimited external sources)
- Examples:
  - `bank` - Bank account integration
  - `payment_gateway` - Payment processor (Stripe, PayPal)
  - `crypto_wallet` - Cryptocurrency wallet
  - `cash` - Cash transactions

#### System Accounts (`AccountType.SYSTEM`)
- Internal system accounts
- No balance limits
- Used for special operations
- Examples:
  - `fee_collection` - Collects transaction fees
  - `reserve` - Reserve fund
  - `escrow` - Escrow for pending transactions

## Schema Design

### Account Entity

```typescript
{
  id: UUID,
  ownerId: string,              // External reference to owner
  ownerType: string,            // Type of owner (user, organization, etc.)
  accountType: AccountType,     // user | system | external
  accountSubtype: string,       // Specific subtype (bank, wallet, etc.)
  currency: string,             // Currency code (FK to currencies)
  balance: Decimal,             // Current balance
  maxBalance?: Decimal,         // Maximum allowed balance
  minBalance?: Decimal,         // Minimum required balance
  status: AccountStatus,        // active | suspended | closed
  version: number,              // Optimistic locking
  ...
}
```

### Transaction Entity

```typescript
{
  id: UUID,
  idempotencyKey: UUID,                    // For duplicate prevention
  type: TransactionType,                    // topup | withdrawal | transfer | refund
  sourceAccountId: UUID,                    // ALWAYS required
  destinationAccountId: UUID,               // ALWAYS required
  amount: Decimal,
  currency: string,
  sourceBalanceBefore: Decimal,            // Source balance before
  sourceBalanceAfter: Decimal,             // Source balance after
  destinationBalanceBefore: Decimal,       // Destination balance before
  destinationBalanceAfter: Decimal,        // Destination balance after
  status: TransactionStatus,
  parentTransactionId?: UUID,              // For refunds/cancellations
  ...
}
```

## Transaction Flow Examples

### 1. Top-Up (Deposit)

**Scenario:** User adds $100 from their bank account

```typescript
POST /api/v1/transactions/topup
{
  "idempotencyKey": "uuid-1",
  "sourceAccountId": "external-bank-account-usd",  // External account
  "destinationAccountId": "user-wallet-123",        // User account
  "amount": "100.00",
  "currency": "USD"
}
```

**Result:**
- External account: `balance -= 100` (can go negative)
- User account: `balance += 100`
- Transaction records both balance changes

### 2. Withdrawal

**Scenario:** User withdraws $50 to their bank

```typescript
POST /api/v1/transactions/withdraw
{
  "idempotencyKey": "uuid-2",
  "sourceAccountId": "user-wallet-123",             // User account
  "destinationAccountId": "external-bank-account-usd", // External account
  "amount": "50.00",
  "currency": "USD"
}
```

**Validations:**
- Check user has sufficient balance
- Check minimum balance requirement (if set)

### 3. Transfer Between Users

**Scenario:** User A sends $25 to User B

```typescript
POST /api/v1/transactions/transfer
{
  "idempotencyKey": "uuid-3",
  "sourceAccountId": "user-wallet-123",     // User A
  "destinationAccountId": "user-wallet-456", // User B
  "amount": "25.00",
  "currency": "USD"
}
```

**Validations:**
- Check source has sufficient balance
- Check destination max balance (if set)
- Prevent self-transfer
- Both users must have same currency

### 4. Refund

**Scenario:** Refund a previous transaction

```typescript
POST /api/v1/transactions/refund
{
  "idempotencyKey": "uuid-4",
  "originalTransactionId": "transaction-123",
  "amount": "25.00",  // Partial or full
  "reason": "Customer requested refund"
}
```

**Logic:**
- Reverses the original transaction
- Source = Original destination
- Destination = Original source
- Marks original transaction as `refunded`

## Benefits

### 1. Complete Auditability
✅ Every transaction shows exact money flow  
✅ Can trace every dollar/token through the system  
✅ Full balance history for both accounts  
✅ Meets financial audit requirements  

### 2. Proper Accounting
✅ Follows double-entry bookkeeping principles  
✅ Balances always reconcile  
✅ Can generate profit & loss statements  
✅ Can generate balance sheets  

### 3. Flexibility
✅ Easy to add new payment providers (new external accounts)  
✅ Support multiple currencies  
✅ Can model complex financial scenarios  
✅ Clear separation of concerns (user vs system vs external)  

### 4. Security & Compliance
✅ Prevents money from appearing/disappearing  
✅ Clear audit trail for regulators  
✅ Balance limits on user accounts  
✅ Prevents self-transfers  

## Implementation Details

### Balance Validation

**User Accounts:**
- Must maintain non-negative balance (unless explicitly allowed)
- Respect `minBalance` if set
- Respect `maxBalance` if set

**External Accounts:**
- Can go negative (represent external sources)
- No balance limits

**System Accounts:**
- Usually no limits
- Can be configured based on business needs

### Concurrency Control

1. **Pessimistic Locking**
   - Accounts locked during transaction
   - Prevents race conditions

2. **Lock Ordering**
   - Accounts locked in deterministic order (by ID)
   - Prevents deadlocks in transfers

3. **Optimistic Locking**
   - Version column on accounts
   - Detects concurrent modifications

### Idempotency

- Every transaction requires unique `idempotencyKey`
- Duplicate keys are rejected
- Allows safe retries on network failures

## Migration from Old Model

### Breaking Changes

**Old API:**
```json
{
  "accountId": "user-123",  // Single account
  "amount": "100.00"
}
```

**New API:**
```json
{
  "sourceAccountId": "external-bank-1",
  "destinationAccountId": "user-123",
  "amount": "100.00"
}
```

### Migration Steps

1. Create external accounts for each currency
2. Update API clients to provide both source and destination
3. Run migration to transform old data (if applicable)
4. Update tests to use new schema

## Best Practices

### 1. Always Use External Accounts

**❌ Bad:**
```typescript
// Money appears from nowhere
account.balance += 100;
```

**✅ Good:**
```typescript
// Money flows from external source
await transactionService.topup({
  sourceAccountId: 'external-bank-usd',
  destinationAccountId: 'user-wallet-123',
  amount: '100.00'
});
```

### 2. Create Specific External Accounts

```typescript
// Create external accounts for each integration
const stripeAccount = await accountService.create({
  ownerId: 'stripe',
  ownerType: 'payment_provider',
  accountType: AccountType.EXTERNAL,
  accountSubtype: 'payment_gateway',
  currency: 'USD'
});

const bankAccount = await accountService.create({
  ownerId: 'bank_integration',
  ownerType: 'bank',
  accountType: AccountType.EXTERNAL,
  accountSubtype: 'bank',
  currency: 'USD'
});
```

### 3. Use System Accounts for Fees

```typescript
// When charging a fee
await transactionService.transfer({
  sourceAccountId: 'user-wallet-123',
  destinationAccountId: 'system-fee-collection',
  amount: '2.50',
  currency: 'USD',
  reference: 'Transaction fee'
});
```

### 4. Set Appropriate Limits

```typescript
// User account with limits
await accountService.create({
  ownerId: 'user-123',
  ownerType: 'user',
  accountType: AccountType.USER,
  currency: 'USD',
  maxBalance: '10000.00',  // Prevent excessive accumulation
  minBalance: '0.00'        // Cannot go negative
});
```

## SQL Examples

### Find All Transactions for an Account

```sql
SELECT * FROM transactions
WHERE source_account_id = 'account-123'
   OR destination_account_id = 'account-123'
ORDER BY created_at DESC;
```

### Calculate Net Flow

```sql
SELECT
  currency,
  SUM(CASE WHEN destination_account_id = 'account-123' THEN amount ELSE 0 END) as inflow,
  SUM(CASE WHEN source_account_id = 'account-123' THEN amount ELSE 0 END) as outflow,
  SUM(CASE
    WHEN destination_account_id = 'account-123' THEN amount
    WHEN source_account_id = 'account-123' THEN -amount
    ELSE 0
  END) as net_flow
FROM transactions
WHERE (source_account_id = 'account-123' OR destination_account_id = 'account-123')
  AND status = 'completed'
GROUP BY currency;
```

### Reconciliation Check

```sql
-- Verify account balance matches transaction history
WITH account_transactions AS (
  SELECT
    SUM(CASE
      WHEN destination_account_id = 'account-123' THEN amount
      WHEN source_account_id = 'account-123' THEN -amount
    END) as calculated_balance
  FROM transactions
  WHERE (source_account_id = 'account-123' OR destination_account_id = 'account-123')
    AND status = 'completed'
)
SELECT
  a.balance as actual_balance,
  at.calculated_balance,
  (a.balance - at.calculated_balance) as discrepancy
FROM accounts a
CROSS JOIN account_transactions at
WHERE a.id = 'account-123';
```

## Conclusion

This double-entry design provides:
- ✅ Production-grade financial tracking
- ✅ Complete audit trails
- ✅ Regulatory compliance
- ✅ Flexibility for future integrations
- ✅ Clear, understandable money flows

Every transaction tells a complete story: where money came from, where it went, and how balances changed on both sides.


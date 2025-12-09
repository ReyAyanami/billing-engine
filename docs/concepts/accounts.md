# Account Concepts

## Overview

Accounts are the core entity in the billing engine. They hold balances, belong to owners, and participate in transactions. Understanding account types and lifecycle is essential for using the system.

---

## Account Types

### USER Accounts

**Purpose**: End-user wallets for customers, merchants, or any user of the system.

**Characteristics**:
- Balance is tracked and enforced
- Has balance limits (min/max)
- Cannot go negative by default
- Participates in transactions
- Can be suspended or closed

**Use Cases**:
- Customer wallets
- Merchant accounts
- Employee accounts
- Any individual or organization needing a balance

**Example**:
```json
{
  "id": "acc-user-alice",
  "ownerId": "alice@example.com",
  "ownerType": "user",
  "type": "USER",
  "currency": "USD",
  "balance": "1000.50",
  "minBalance": "0",
  "maxBalance": "10000.00",
  "status": "active"
}
```

---

### EXTERNAL Accounts

**Purpose**: Represent external financial systems (banks, payment gateways, cash).

**Characteristics**:
- Balance is NOT tracked (ignored, always shown as 0)
- Represents infinite source/sink of money
- Used for deposits (topup) and withdrawals
- Cannot be suspended
- Represents "outside the system"

**Use Cases**:
- Bank accounts
- Payment gateways (Stripe, PayPal)
- Cash register
- Credit cards
- Any external money source

**Example**:
```json
{
  "id": "acc-ext-bank-001",
  "ownerId": "bank_of_america",
  "ownerType": "bank",
  "type": "EXTERNAL",
  "currency": "USD",
  "balance": "0",  // Not tracked
  "status": "active"
}
```

**Why EXTERNAL accounts?**
- Money enters system: EXTERNAL → USER (topup)
- Money leaves system: USER → EXTERNAL (withdrawal)
- Maintains double-entry bookkeeping
- Clear boundary between internal and external funds

---

### SYSTEM Accounts

**Purpose**: Internal platform accounts for fees, reserves, commissions.

**Characteristics**:
- Balance is tracked
- Can accumulate large balances
- Owned by the platform itself
- Used for revenue, fees, reserves
- Typically not directly accessible to users

**Use Cases**:
- Transaction fees
- Service commissions
- Reserve funds
- Refund pool
- Platform revenue

**Example**:
```json
{
  "id": "acc-sys-fees",
  "ownerId": "platform",
  "ownerType": "system",
  "type": "SYSTEM",
  "currency": "USD",
  "balance": "5432.10",  // Accumulated fees
  "status": "active"
}
```

---

## Account Status

### Status Values

```typescript
enum AccountStatus {
  ACTIVE = 'active',       // Normal operations allowed
  SUSPENDED = 'suspended', // Temporarily disabled
  CLOSED = 'closed'        // Permanently closed (terminal)
}
```

### Status Transitions

```
              suspend
    ┌─────────────────────────┐
    │                         │
    │    reactivate           ▼
┌───┴─────┐              ┌──────────┐
│ ACTIVE  │◄─────────────│SUSPENDED │
└────┬────┘              └────┬─────┘
     │                        │
     │ close            close │
     │                        │
     └────────┐     ┌─────────┘
              │     │
              ▼     ▼
         ┌────────────┐
         │   CLOSED   │
         │ (terminal) │
         └────────────┘
```

**Valid Transitions**:
- `active` → `suspended` ✓
- `active` → `closed` ✓
- `suspended` → `active` ✓ (reactivate)
- `suspended` → `closed` ✓
- `closed` → any ✗ (terminal state, cannot reopen)

### Operations by Status

| Operation | ACTIVE | SUSPENDED | CLOSED |
|-----------|--------|-----------|--------|
| Receive funds | ✓ | ✗ | ✗ |
| Send funds | ✓ | ✗ | ✗ |
| Check balance | ✓ | ✓ | ✓ |
| Change status | ✓ | ✓ | ✗ |

---

## Account Lifecycle

### 1. Creation

```typescript
POST /api/v1/accounts
{
  "ownerId": "user_123",
  "ownerType": "user",
  "currency": "USD",
  "type": "USER"
}

// Created with:
// - balance: 0
// - status: active
// - Default limits based on type
```

### 2. Active Usage

```typescript
// Receive funds
await topup(accountId, '100.00');

// Send funds
await withdrawal(accountId, '50.00');

// Transfer
await transfer(fromAccountId, toAccountId, '25.00');

// Check balance
const { balance } = await getBalance(accountId);
```

### 3. Suspension

**Reasons**:
- Fraud investigation
- Regulatory hold
- User request
- Policy violation

```typescript
PATCH /api/v1/accounts/:id/status
{
  "status": "suspended"
}
```

**Effect**: Account cannot send or receive funds.

### 4. Reactivation

```typescript
PATCH /api/v1/accounts/:id/status
{
  "status": "active"
}
```

### 5. Closure

**Permanent**: Cannot be reopened.

**Requirements**:
- Balance must be zero (typically)
- No pending transactions
- User agreement

```typescript
PATCH /api/v1/accounts/:id/status
{
  "status": "closed"
}
```

---

## Balance Limits

### Minimum Balance

**Purpose**: Prevent overdrafts or enforce minimum requirements.

**Default**:
- USER accounts: `0` (no negative balance)
- SYSTEM accounts: none (can go negative)
- EXTERNAL accounts: not applicable

**Custom**:
```json
{
  "minBalance": "-100.00"  // Allow $100 overdraft
}
```

**Use Cases**:
- Credit lines
- Overdraft protection
- Minimum balance requirements

### Maximum Balance

**Purpose**: Regulatory compliance, fraud prevention.

**Default**: None (unlimited)

**Custom**:
```json
{
  "maxBalance": "50000.00"  // Max $50K balance
}
```

**Use Cases**:
- Regulatory limits (e.g., e-money licenses)
- Fraud prevention
- Account tiers (basic vs premium)

### Enforcement

Limits checked during balance updates:

```typescript
// Attempt to credit account
const newBalance = currentBalance + amount;

if (maxBalance && newBalance > maxBalance) {
  throw new Error(`Would exceed max balance of ${maxBalance}`);
}

if (newBalance < minBalance) {
  throw new Error(`Would violate min balance of ${minBalance}`);
}
```

---

## Multi-Currency

### One Currency Per Account

Each account holds **one currency only**:

```typescript
// ✓ GOOD: Separate accounts per currency
const usdAccount = await createAccount({ currency: 'USD' });
const eurAccount = await createAccount({ currency: 'EUR' });

// ✗ BAD: Cannot mix currencies in one account
// (Not supported)
```

### Currency Matching

Transactions require matching currencies:

```typescript
// ✓ GOOD: Both accounts use USD
await transfer({
  sourceAccountId: usdAccount1,  // USD
  destinationAccountId: usdAccount2,  // USD
  amount: '50.00',
  currency: 'USD'
});

// ✗ BAD: Currency mismatch
await transfer({
  sourceAccountId: usdAccount,  // USD
  destinationAccountId: eurAccount,  // EUR
  amount: '50.00',
  currency: 'USD'  // Error: currency mismatch
});
```

**Why?**
- Simpler implementation
- No currency conversion logic needed
- Explicit currency handling
- Users create multiple accounts for multiple currencies

---

## Ownership

### Owner Identification

Accounts are owned by external entities:

```typescript
{
  "ownerId": "user_123",       // External ID
  "ownerType": "user"          // Type of owner
}
```

**ownerId**: Your system's user/organization ID  
**ownerType**: Classification (user, organization, merchant, etc.)

### Multiple Accounts Per Owner

Owners can have multiple accounts:

```typescript
// User has USD and EUR accounts
const accounts = await getAccountsByOwner('user_123', 'user');

// Returns:
[
  { id: 'acc-1', currency: 'USD', balance: '1000.00' },
  { id: 'acc-2', currency: 'EUR', balance: '500.00' }
]
```

### Querying by Owner

```typescript
GET /api/v1/accounts?ownerId=user_123&ownerType=user

// Returns all accounts for this owner
```

---

## Metadata

Store arbitrary data with accounts:

```json
{
  "metadata": {
    "accountName": "Primary Checking",
    "accountNumber": "****1234",
    "kycStatus": "verified",
    "tier": "premium",
    "openedDate": "2025-01-01",
    "customField": "value"
  }
}
```

**Use Cases**:
- Display names
- External account numbers
- KYC/compliance data
- Account features/flags
- Business-specific data

**Note**: Metadata is NOT validated or used by the billing engine—it's for your application logic.

---

## Best Practices

### 1. Separate Accounts Per Currency

```typescript
// ✓ GOOD
const usdAccount = await createAccount({ currency: 'USD' });
const eurAccount = await createAccount({ currency: 'EUR' });

// ✗ BAD: Trying to use one account for multiple currencies
// (Not supported)
```

### 2. Use EXTERNAL for Real Money

```typescript
// ✓ GOOD: Bank is EXTERNAL
const bankAccount = await createAccount({
  type: 'EXTERNAL',
  ownerId: 'bank_001'
});

// User deposits from bank
await topup({
  sourceAccountId: bankAccount.id,      // EXTERNAL
  destinationAccountId: userAccount.id,  // USER
  amount: '100.00'
});
```

### 3. Check Status Before Operations

```typescript
const account = await getAccount(accountId);

if (account.status !== 'active') {
  throw new Error('Account is not active');
}

await processTransaction(account);
```

### 4. Set Appropriate Limits

```typescript
// For regular users
await createAccount({
  type: 'USER',
  minBalance: '0',         // No overdraft
  maxBalance: '10000.00'   // $10K max
});

// For premium users
await createAccount({
  type: 'USER',
  minBalance: '-1000.00',  // $1K overdraft
  maxBalance: '100000.00'  // $100K max
});
```

---

## Related Documentation

- [Account API](../api/accounts.md) - REST endpoints
- [Account Module](../modules/account.md) - Implementation
- [Double-Entry Bookkeeping](../architecture/double-entry.md) - Accounting principles
- [Transactions Concept](./transactions.md) - How transactions work


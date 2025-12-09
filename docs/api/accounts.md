# Account API

## Overview

The Account API provides endpoints for creating and managing financial accounts. Accounts are the core entity that holds balances in a specific currency.

**Base Path**: `/api/v1/accounts`

---

## Account Types

```typescript
enum AccountType {
  USER = 'user',        // End-user accounts (e.g., customer wallets)
  SYSTEM = 'system',    // Internal system accounts (e.g., fees, reserves)
  EXTERNAL = 'external' // External services (e.g., banks, payment gateways)
}
```

**Usage**:
- **USER**: Regular user accounts with balance limits and full tracking
- **SYSTEM**: Internal accounts for fees, commissions, reserves
- **EXTERNAL**: Represents external systems, balance not tracked

---

## Account Status

```typescript
enum AccountStatus {
  ACTIVE = 'active',       // Normal operations allowed
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

---

## Endpoints

### Create Account

Create a new account for holding a specific currency.

```http
POST /api/v1/accounts
```

#### Request Body

```json
{
  "ownerId": "user_123",
  "ownerType": "user",
  "currency": "USD",
  "type": "USER",
  "metadata": {
    "accountName": "Primary Checking"
  },
  "minBalance": "0",
  "maxBalance": "1000000"
}
```

**Fields**:
- `ownerId` (required) - External identifier for account owner
- `ownerType` (required) - Type of owner (e.g., `"user"`, `"organization"`)
- `currency` (required) - Currency code (must exist in currencies table)
- `type` (required) - Account type: `"USER"`, `"SYSTEM"`, or `"EXTERNAL"`
- `metadata` (optional) - Additional data as JSON object
- `minBalance` (optional) - Minimum allowed balance (default: 0 for USER accounts)
- `maxBalance` (optional) - Maximum allowed balance

#### Response: 201 Created

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "ownerId": "user_123",
  "ownerType": "user",
  "currency": "USD",
  "balance": "0",
  "status": "active",
  "type": "USER",
  "createdAt": "2025-12-09T12:00:00.000Z",
  "updatedAt": "2025-12-09T12:00:00.000Z"
}
```

#### Errors

- `400 Bad Request` - Invalid currency or validation failed
- `409 Conflict` - Account already exists (same ownerId + currency)

#### cURL Example

```bash
curl -X POST http://localhost:3000/api/v1/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "ownerId": "user_123",
    "ownerType": "user",
    "currency": "USD",
    "type": "USER"
  }'
```

#### TypeScript Example

```typescript
const response = await fetch('http://localhost:3000/api/v1/accounts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ownerId: 'user_123',
    ownerType: 'user',
    currency: 'USD',
    type: 'USER'
  })
});

const account = await response.json();
console.log('Account created:', account.id);
```

---

### Get Account

Retrieve account details including current balance and status.

```http
GET /api/v1/accounts/:id
```

#### Path Parameters

- `id` (required) - Account UUID

#### Response: 200 OK

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "ownerId": "user_123",
  "ownerType": "user",
  "currency": "USD",
  "balance": "1000.50",
  "status": "active",
  "type": "USER",
  "minBalance": "0",
  "maxBalance": "1000000",
  "metadata": {
    "accountName": "Primary Checking"
  },
  "createdAt": "2025-12-09T12:00:00.000Z",
  "updatedAt": "2025-12-09T12:30:00.000Z"
}
```

#### Errors

- `404 Not Found` - Account doesn't exist

#### cURL Example

```bash
curl http://localhost:3000/api/v1/accounts/550e8400-e29b-41d4-a716-446655440000
```

---

### Get Account Balance

Get just the balance for an account (lighter response than full account).

```http
GET /api/v1/accounts/:id/balance
```

#### Path Parameters

- `id` (required) - Account UUID

#### Response: 200 OK

```json
{
  "balance": "1000.50",
  "currency": "USD",
  "status": "active"
}
```

#### Errors

- `404 Not Found` - Account doesn't exist

#### cURL Example

```bash
curl http://localhost:3000/api/v1/accounts/550e8400-e29b-41d4-a716-446655440000/balance
```

---

### List Accounts by Owner

Retrieve all accounts belonging to a specific owner.

```http
GET /api/v1/accounts?ownerId=<id>&ownerType=<type>
```

#### Query Parameters

- `ownerId` (required) - Owner identifier
- `ownerType` (required) - Owner type

#### Response: 200 OK

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "ownerId": "user_123",
    "ownerType": "user",
    "currency": "USD",
    "balance": "1000.50",
    "status": "active",
    "type": "USER",
    "createdAt": "2025-12-09T12:00:00.000Z"
  },
  {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "ownerId": "user_123",
    "ownerType": "user",
    "currency": "EUR",
    "balance": "500.25",
    "status": "active",
    "type": "USER",
    "createdAt": "2025-12-09T13:00:00.000Z"
  }
]
```

#### cURL Example

```bash
curl "http://localhost:3000/api/v1/accounts?ownerId=user_123&ownerType=user"
```

---

### Update Account Status

Change account status (activate, suspend, or close).

```http
PATCH /api/v1/accounts/:id/status
```

#### Path Parameters

- `id` (required) - Account UUID

#### Request Body

```json
{
  "status": "suspended"
}
```

**Valid Statuses**: `"active"`, `"suspended"`, `"closed"`

#### Response: 200 OK

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "suspended",
  "updatedAt": "2025-12-09T12:45:00.000Z"
}
```

#### Errors

- `400 Bad Request` - Invalid status transition
- `404 Not Found` - Account doesn't exist

#### cURL Example

```bash
curl -X PATCH http://localhost:3000/api/v1/accounts/550e8400-e29b-41d4-a716-446655440000/status \
  -H "Content-Type: application/json" \
  -d '{"status": "suspended"}'
```

---

## Common Use Cases

### Use Case 1: Create Multi-Currency Accounts

Create USD and EUR accounts for the same user:

```typescript
// USD account
const usdAccount = await createAccount({
  ownerId: 'user_123',
  ownerType: 'user',
  currency: 'USD',
  type: 'USER'
});

// EUR account
const eurAccount = await createAccount({
  ownerId: 'user_123',
  ownerType: 'user',
  currency: 'EUR',
  type: 'USER'
});

// User now has separate USD and EUR wallets
```

### Use Case 2: Create External Account for Bank

```typescript
const bankAccount = await createAccount({
  ownerId: 'bank_of_america',
  ownerType: 'bank',
  currency: 'USD',
  type: 'EXTERNAL'  // Balance not tracked for external accounts
});

// Use for top-ups and withdrawals
```

### Use Case 3: Suspend Account

```typescript
// Suspend due to fraud investigation
await updateAccountStatus(accountId, 'suspended');

// Account can no longer send/receive funds

// Later, reactivate
await updateAccountStatus(accountId, 'active');
```

---

## Account Balance Management

### Balance is NOT Updated Directly

⚠️ **Important**: You cannot update account balance directly via the Account API.

**To change balance**, use Transaction API:
- **Increase**: `POST /api/v1/transactions/topup`
- **Decrease**: `POST /api/v1/transactions/withdraw`
- **Transfer**: `POST /api/v1/transactions/transfer`

**Why?** Double-entry bookkeeping requires every balance change to have a corresponding transaction.

---

## Balance Limits

### Min Balance

- Default for USER accounts: `0` (no overdraft)
- Can be set to negative for credit lines
- EXTERNAL accounts: typically no limit

### Max Balance

- Optional limit to prevent abuse
- Useful for regulatory compliance
- Can be set per account

### Example with Limits

```json
{
  "ownerId": "user_123",
  "ownerType": "user",
  "currency": "USD",
  "type": "USER",
  "minBalance": "-500.00",    // Allow $500 overdraft
  "maxBalance": "10000.00"    // Max $10,000 balance
}
```

---

## Metadata

The `metadata` field accepts arbitrary JSON for storing additional data:

```json
{
  "metadata": {
    "accountName": "Business Checking",
    "accountNumber": "****1234",
    "kycStatus": "verified",
    "tier": "premium"
  }
}
```

**Use Cases**:
- Display names
- External account numbers
- KYC/compliance data
- Feature flags

---

## Account Query Patterns

### Get All Accounts for User

```typescript
const accounts = await fetch(
  `/api/v1/accounts?ownerId=${userId}&ownerType=user`
);
```

### Get USD Balance

```typescript
const accounts = await fetch(
  `/api/v1/accounts?ownerId=${userId}&ownerType=user`
);

const usdAccount = accounts.find(a => a.currency === 'USD');
console.log('USD Balance:', usdAccount?.balance);
```

### Check Account is Active

```typescript
const account = await fetch(`/api/v1/accounts/${accountId}`);

if (account.status !== 'active') {
  throw new Error('Account is not active');
}
```

---

## Error Handling

### Example: Handle All Account Errors

```typescript
async function getAccount(id: string) {
  try {
    const response = await fetch(`/api/v1/accounts/${id}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Account not found');
      }
      throw new Error('Failed to fetch account');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Account fetch error:', error);
    throw error;
  }
}
```

---

## Related Documentation

- [REST API Overview](./rest-api.md) - General API conventions
- [Transaction API](./transactions.md) - Modify account balances
- [Currency API](./currencies.md) - Supported currencies
- [Account Module](../modules/account.md) - Internal implementation

---

**Next**: Learn about [Transaction API](./transactions.md) to modify balances →


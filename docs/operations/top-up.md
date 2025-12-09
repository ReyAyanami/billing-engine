# Top-up Operation

## Overview

**Top-up** adds funds to a user account from an external source (e.g., bank deposit, card payment). This is how money enters the billing system.

**Money Flow**: External Account → User Account

---

## Pattern

```
┌──────────────────┐         ┌──────────────────┐
│  EXTERNAL        │ ──────→ │   USER           │
│  Bank/Gateway    │  $100   │   Account        │
└──────────────────┘         └──────────────────┘
  Balance: (ignored)          Balance: $0 → $100
```

**Double-Entry**:
- DEBIT: External account (not tracked)
- CREDIT: User account +$100

---

## Use Cases

1. **Initial Deposit**: User funds their account for the first time
2. **Bank Transfer**: User transfers money from bank to wallet
3. **Card Payment**: User adds funds via credit/debit card
4. **Cash Deposit**: Admin credits user account from cash payment

---

## API Endpoint

```http
POST /api/v1/transactions/topup
```

### Request

```json
{
  "idempotencyKey": "550e8400-e29b-41d4-a716-446655440000",
  "destinationAccountId": "user-account-uuid",
  "sourceAccountId": "external-bank-uuid",
  "amount": "100.00",
  "currency": "USD",
  "reference": "Initial deposit",
  "metadata": {
    "paymentMethod": "bank_transfer",
    "bankReference": "TXN123456"
  }
}
```

### Response (Immediate)

```json
{
  "transactionId": "tx-uuid",
  "accountId": "user-account-uuid",
  "amount": "100.00",
  "currency": "USD",
  "status": "pending",
  "createdAt": "2025-12-09T12:00:00.000Z"
}
```

### Poll for Completion

```bash
GET /api/v1/transactions/tx-uuid

# Response when complete:
{
  "id": "tx-uuid",
  "type": "topup",
  "status": "completed",
  "amount": "100.00",
  "completedAt": "2025-12-09T12:00:00.050Z"
}
```

---

## Business Rules

### Validations

1. **Destination Must Be USER Account**
   - Cannot top-up SYSTEM or EXTERNAL accounts
   - Only end-user accounts can receive deposits

2. **Amount Must Be Positive**
   - Minimum: $0.01 (or currency minimum)
   - No maximum (unless account has max balance)

3. **Currency Must Match**
   - Source and destination must use same currency
   - No automatic conversion

4. **Account Must Be Active**
   - Suspended or closed accounts cannot receive funds

5. **Max Balance Check**
   - If account has maxBalance, new balance cannot exceed it

### Example Validation

```typescript
if (account.type !== 'USER') {
  throw new Error('Can only top-up USER accounts');
}

if (amount <= 0) {
  throw new Error('Amount must be positive');
}

if (account.currency !== currency) {
  throw new Error('Currency mismatch');
}

if (account.status !== 'active') {
  throw new Error('Account is not active');
}

if (account.maxBalance) {
  const newBalance = account.balance + amount;
  if (newBalance > account.maxBalance) {
    throw new Error(`Would exceed max balance of ${account.maxBalance}`);
  }
}
```

---

## Processing Flow

### 1. Command Phase

```typescript
POST /api/v1/transactions/topup
↓
Controller validates DTO
↓
Service creates TopupCommand
↓
CommandBus.execute(TopupCommand)
↓
TopupHandler processes command
↓
Returns { transactionId, status: "pending" }
```

### 2. Event Sourcing Phase

```typescript
TopupHandler:
1. Check idempotency key (prevent duplicates)
2. Create TransactionAggregate
3. aggregate.requestTopup(params)
4. Aggregate emits TopupRequestedEvent
5. Persist events to Kafka
6. Publish events to EventBus
```

### 3. Saga Phase

```typescript
TopupRequestedEvent published
↓
TopupRequestedHandler (Saga) receives event
↓
Execute UpdateBalanceCommand on Account
↓
AccountAggregate emits BalanceChangedEvent
↓
Execute CompleteTopupCommand
↓
TransactionAggregate emits TopupCompletedEvent
```

### 4. Projection Phase

```typescript
BalanceChangedEvent published
↓
BalanceChangedHandler updates AccountProjection
↓
TopupCompletedEvent published
↓
TopupCompletedHandler updates TransactionProjection
↓
Queryable via GET /api/v1/transactions/:id
```

---

## Example Usage

### cURL

```bash
curl -X POST http://localhost:3000/api/v1/transactions/topup \
  -H "Content-Type: application/json" \
  -d '{
    "idempotencyKey": "'$(uuidgen)'",
    "destinationAccountId": "user-account-uuid",
    "sourceAccountId": "external-bank-uuid",
    "amount": "100.00",
    "currency": "USD",
    "reference": "Bank deposit"
  }'
```

### TypeScript

```typescript
async function topupAccount(accountId: string, amount: string) {
  // 1. Submit top-up
  const response = await fetch('/api/v1/transactions/topup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idempotencyKey: uuidv4(),
      destinationAccountId: accountId,
      sourceAccountId: 'external-bank-001',
      amount,
      currency: 'USD'
    })
  });

  const { transactionId } = await response.json();

  // 2. Poll for completion
  let status = 'pending';
  while (status === 'pending') {
    await sleep(100);
    
    const tx = await fetch(`/api/v1/transactions/${transactionId}`);
    const data = await tx.json();
    status = data.status;
  }

  if (status === 'completed') {
    console.log('Top-up successful!');
    return transactionId;
  } else {
    throw new Error(`Top-up failed: ${data.failureReason}`);
  }
}
```

---

## Error Scenarios

### Insufficient Max Balance

```json
{
  "statusCode": 400,
  "message": "New balance 15000.00 would exceed max balance 10000.00",
  "error": "Bad Request"
}
```

### Account Inactive

```json
{
  "statusCode": 400,
  "message": "Account is suspended and cannot receive funds",
  "error": "Bad Request"
}
```

### Currency Mismatch

```json
{
  "statusCode": 400,
  "message": "Currency mismatch: account uses USD, topup uses EUR",
  "error": "Bad Request"
}
```

### Duplicate Transaction

```json
{
  "statusCode": 409,
  "message": "Transaction with idempotency key 'key-123' already exists",
  "error": "Conflict"
}
```

---

## Events Generated

### 1. TopupRequestedEvent

```json
{
  "eventType": "TopupRequested",
  "aggregateId": "tx-uuid",
  "aggregateType": "Transaction",
  "data": {
    "destinationAccountId": "user-account-uuid",
    "sourceAccountId": "external-bank-uuid",
    "amount": "100.00",
    "currency": "USD"
  }
}
```

### 2. BalanceChangedEvent

```json
{
  "eventType": "BalanceChanged",
  "aggregateId": "user-account-uuid",
  "aggregateType": "Account",
  "data": {
    "previousBalance": "0",
    "newBalance": "100.00",
    "changeAmount": "100.00",
    "changeType": "CREDIT",
    "reason": "Topup tx-uuid"
  }
}
```

### 3. TopupCompletedEvent

```json
{
  "eventType": "TopupCompleted",
  "aggregateId": "tx-uuid",
  "aggregateType": "Transaction",
  "data": {
    "newBalance": "100.00"
  }
}
```

---

## Testing

### Unit Test Example

```typescript
describe('Topup Operation', () => {
  it('should add funds to user account', async () => {
    // Arrange
    const account = await createAccount({ 
      type: 'USER', 
      currency: 'USD' 
    });
    
    // Act
    const { transactionId } = await topup({
      destinationAccountId: account.id,
      amount: '100.00',
      currency: 'USD'
    });
    
    await waitForCompletion(transactionId);
    
    // Assert
    const updatedAccount = await getAccount(account.id);
    expect(updatedAccount.balance).toBe('100.00');
  });

  it('should reject topup exceeding max balance', async () => {
    // Arrange
    const account = await createAccount({ 
      type: 'USER',
      currency: 'USD',
      maxBalance: '100.00' 
    });
    
    // Act & Assert
    await expect(topup({
      destinationAccountId: account.id,
      amount: '150.00',
      currency: 'USD'
    })).rejects.toThrow('exceed max balance');
  });
});
```

---

## Best Practices

### 1. Always Use Idempotency Keys

```typescript
// ✅ GOOD: Generate and store key
const key = uuidv4();
localStorage.setItem('pending-topup', key);
await topup({ idempotencyKey: key, ...params });

// ❌ BAD: No idempotency (risky on retry)
await topup(params);
```

### 2. Validate Before Submitting

```typescript
// Validate client-side
if (amount <= 0) {
  showError('Amount must be positive');
  return;
}

if (account.status !== 'active') {
  showError('Account is not active');
  return;
}

await topup(params);
```

### 3. Handle Async Nature

```typescript
// ✅ GOOD: Poll for completion
const { transactionId } = await topup(params);
showPending();
await pollUntilComplete(transactionId);
showSuccess();

// ❌ BAD: Assume immediate completion
await topup(params);
refreshBalance();  // May not be updated yet!
```

---

## Related Documentation

- [Transaction API](../api/transactions.md) - API reference
- [Double-Entry Bookkeeping](../architecture/double-entry.md) - Accounting principles
- [Transfer Operation](./transfer.md) - Related operation

---

**Next**: [Withdrawal Operation](./withdrawal.md) →


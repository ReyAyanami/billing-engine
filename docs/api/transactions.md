# Transaction API

## Overview

The Transaction API provides endpoints for processing financial operations. All operations use **double-entry bookkeeping** with **idempotency** and **eventual consistency**.

**Base Path**: `/api/v1/transactions`

---

## Key Concepts

### Eventual Consistency

All transaction operations are **asynchronous**:

1. POST request returns immediately with `"status": "pending"`
2. Transaction processed via CQRS/Event Sourcing
3. Client polls GET endpoint to check status
4. Status changes to `"completed"` or `"failed"`

**Typical Processing Time**: 50-200ms

### Idempotency

All operations require an `idempotencyKey` (UUID):
- Same key = same transaction (prevents duplicates)
- Returns `409 Conflict` if key already exists
- Safe to retry with same key

---

## Transaction Types

### Operation Types

1. **Top-up**: Add funds from external source (External → User)
2. **Withdrawal**: Remove funds to external destination (User → External)
3. **Transfer**: Move funds between users (User → User)
4. **Payment**: Customer pays merchant (User → System/Merchant)
5. **Refund**: Reverse a payment

---

## Endpoints

### Top-up Account

Add funds to an account from an external source (e.g., bank deposit).

```http
POST /api/v1/transactions/topup
```

#### Request Body

```json
{
  "idempotencyKey": "550e8400-e29b-41d4-a716-446655440000",
  "destinationAccountId": "user-account-uuid",
  "sourceAccountId": "external-bank-uuid",
  "amount": "100.00",
  "currency": "USD",
  "reference": "Initial deposit",
  "metadata": {
    "paymentMethod": "bank_transfer"
  }
}
```

**Fields**:
- `idempotencyKey` (required) - UUID for duplicate prevention
- `destinationAccountId` (required) - Target user account
- `sourceAccountId` (required) - External source account
- `amount` (required) - Amount as string (e.g., `"100.50"`)
- `currency` (required) - Currency code
- `reference` (optional) - Human-readable description
- `metadata` (optional) - Additional data

#### Response: 201 Created

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

#### Polling for Completion

```bash
# Wait 100ms, then check status
curl http://localhost:3000/api/v1/transactions/tx-uuid

# Response when complete:
{
  "id": "tx-uuid",
  "type": "topup",
  "status": "completed",
  "amount": "100.00",
  "completedAt": "2025-12-09T12:00:00.050Z"
}
```

#### Errors

- `400 Bad Request` - Invalid amount or currency mismatch
- `404 Not Found` - Account doesn't exist
- `409 Conflict` - Idempotency key already used

#### cURL Example

```bash
curl -X POST http://localhost:3000/api/v1/transactions/topup \
  -H "Content-Type: application/json" \
  -d '{
    "idempotencyKey": "'$(uuidgen)'",
    "destinationAccountId": "user-account-uuid",
    "sourceAccountId": "external-bank-uuid",
    "amount": "100.00",
    "currency": "USD"
  }'
```

---

### Withdraw from Account

Remove funds from an account to an external destination (e.g., bank withdrawal).

```http
POST /api/v1/transactions/withdraw
```

#### Request Body

```json
{
  "idempotencyKey": "660e8400-e29b-41d4-a716-446655440001",
  "sourceAccountId": "user-account-uuid",
  "destinationAccountId": "external-bank-uuid",
  "amount": "50.00",
  "currency": "USD",
  "reference": "ATM withdrawal"
}
```

#### Response: 201 Created

```json
{
  "transactionId": "tx-uuid",
  "accountId": "user-account-uuid",
  "amount": "50.00",
  "currency": "USD",
  "status": "pending"
}
```

#### Errors

- `400 Bad Request` - Insufficient balance
- `404 Not Found` - Account doesn't exist
- `409 Conflict` - Duplicate transaction

#### cURL Example

```bash
curl -X POST http://localhost:3000/api/v1/transactions/withdraw \
  -H "Content-Type: application/json" \
  -d '{
    "idempotencyKey": "'$(uuidgen)'",
    "sourceAccountId": "user-account-uuid",
    "destinationAccountId": "external-bank-uuid",
    "amount": "50.00",
    "currency": "USD"
  }'
```

---

### Transfer Between Accounts

Transfer funds atomically between two user accounts.

```http
POST /api/v1/transactions/transfer
```

#### Request Body

```json
{
  "idempotencyKey": "770e8400-e29b-41d4-a716-446655440002",
  "sourceAccountId": "alice-account-uuid",
  "destinationAccountId": "bob-account-uuid",
  "amount": "25.00",
  "currency": "USD",
  "reference": "Payment for lunch"
}
```

#### Response: 201 Created

```json
{
  "sourceTransactionId": "tx-debit-uuid",
  "destinationTransactionId": "tx-credit-uuid",
  "status": "pending"
}
```

**Note**: Transfer creates TWO transaction records (debit + credit).

#### Errors

- `400 Bad Request` - Insufficient balance, currency mismatch, or same account
- `404 Not Found` - Account doesn't exist
- `409 Conflict` - Duplicate transaction

#### cURL Example

```bash
curl -X POST http://localhost:3000/api/v1/transactions/transfer \
  -H "Content-Type: application/json" \
  -d '{
    "idempotencyKey": "'$(uuidgen)'",
    "sourceAccountId": "alice-account-uuid",
    "destinationAccountId": "bob-account-uuid",
    "amount": "25.00",
    "currency": "USD",
    "reference": "Splitting dinner bill"
  }'
```

---

### Process Payment

Process a payment from customer to merchant.

```http
POST /api/v1/transactions/payment
```

#### Request Body

```json
{
  "idempotencyKey": "880e8400-e29b-41d4-a716-446655440003",
  "customerAccountId": "customer-account-uuid",
  "merchantAccountId": "merchant-account-uuid",
  "amount": "10.00",
  "currency": "USD",
  "paymentMetadata": {
    "orderId": "order-123",
    "productId": "prod-456"
  }
}
```

#### Response: 201 Created

```json
{
  "transactionId": "payment-tx-uuid",
  "status": "pending"
}
```

#### Errors

- `400 Bad Request` - Insufficient balance
- `404 Not Found` - Customer or merchant account doesn't exist
- `409 Conflict` - Duplicate transaction

#### cURL Example

```bash
curl -X POST http://localhost:3000/api/v1/transactions/payment \
  -H "Content-Type: application/json" \
  -d '{
    "idempotencyKey": "'$(uuidgen)'",
    "customerAccountId": "customer-account-uuid",
    "merchantAccountId": "merchant-account-uuid",
    "amount": "10.00",
    "currency": "USD"
  }'
```

---

### Process Refund

Refund a previous payment (full or partial).

```http
POST /api/v1/transactions/refund
```

#### Request Body

```json
{
  "idempotencyKey": "990e8400-e29b-41d4-a716-446655440004",
  "originalPaymentId": "payment-tx-uuid",
  "refundAmount": "10.00",
  "currency": "USD",
  "refundMetadata": {
    "reason": "Customer request",
    "ticketId": "support-789"
  }
}
```

**Fields**:
- `originalPaymentId` (required) - ID of payment to refund
- `refundAmount` (required) - Amount to refund (can be partial)
- `currency` (required) - Must match original payment
- `refundMetadata` (optional) - Reason and additional data

#### Response: 201 Created

```json
{
  "refundId": "refund-tx-uuid",
  "originalPaymentId": "payment-tx-uuid",
  "status": "pending"
}
```

#### Errors

- `400 Bad Request` - Refund amount exceeds original
- `404 Not Found` - Original payment doesn't exist
- `409 Conflict` - Duplicate refund

#### cURL Example

```bash
curl -X POST http://localhost:3000/api/v1/transactions/refund \
  -H "Content-Type: application/json" \
  -d '{
    "idempotencyKey": "'$(uuidgen)'",
    "originalPaymentId": "payment-tx-uuid",
    "refundAmount": "10.00",
    "currency": "USD"
  }'
```

---

### Get Transaction

Retrieve transaction details and current status.

```http
GET /api/v1/transactions/:id
```

#### Path Parameters

- `id` (required) - Transaction UUID

#### Response: 200 OK

```json
{
  "id": "tx-uuid",
  "type": "topup",
  "accountId": "user-account-uuid",
  "amount": "100.00",
  "currency": "USD",
  "status": "completed",
  "reference": "Initial deposit",
  "metadata": {},
  "createdAt": "2025-12-09T12:00:00.000Z",
  "completedAt": "2025-12-09T12:00:00.050Z"
}
```

**Status Values**:
- `pending` - Processing
- `completed` - Success
- `failed` - Failed (with `failureReason`)
- `compensated` - Rolled back due to saga failure

#### Errors

- `404 Not Found` - Transaction doesn't exist

#### cURL Example

```bash
curl http://localhost:3000/api/v1/transactions/tx-uuid
```

---

### List Transactions

Get transaction history for an account.

```http
GET /api/v1/transactions?accountId=<uuid>&limit=50&offset=0
```

#### Query Parameters

- `accountId` (required) - Account UUID
- `limit` (optional) - Results per page (default: 50, max: 100)
- `offset` (optional) - Pagination offset (default: 0)

#### Response: 200 OK

```json
[
  {
    "id": "tx-1",
    "type": "topup",
    "amount": "100.00",
    "status": "completed",
    "createdAt": "2025-12-09T12:00:00.000Z"
  },
  {
    "id": "tx-2",
    "type": "transfer_debit",
    "amount": "25.00",
    "status": "completed",
    "createdAt": "2025-12-09T12:30:00.000Z"
  }
]
```

#### cURL Example

```bash
curl "http://localhost:3000/api/v1/transactions?accountId=user-account-uuid&limit=20"
```

---

## Transaction Status Flow

### Successful Transaction

```
pending → completed
```

### Failed Transaction

```
pending → failed
```

### Compensated Transaction (Saga Rollback)

```
pending → compensated
```

**Compensated** means the transaction was started but rolled back due to a failure in a multi-step operation (e.g., transfer where credit failed after debit).

---

## Idempotency in Practice

### Generate Once, Retry Safely

```typescript
const idempotencyKey = uuidv4();

// Store with request for retries
localStorage.setItem('topup-key', idempotencyKey);

try {
  await api.topup({ idempotencyKey, ...data });
} catch (error) {
  if (error.status === 409) {
    // Already processed, safe to continue
    console.log('Transaction already exists');
  } else if (error.status >= 500) {
    // Server error, retry with SAME key
    await api.topup({ idempotencyKey, ...data });
  } else {
    // Client error, don't retry
    throw error;
  }
}
```

---

## Polling Pattern

### TypeScript Implementation

```typescript
async function waitForTransaction(txId: string, timeout = 10000): Promise<Transaction> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const tx = await api.getTransaction(txId);
    
    if (tx.status === 'completed') {
      return tx;
    }
    
    if (tx.status === 'failed') {
      throw new Error(`Transaction failed: ${tx.failureReason}`);
    }
    
    if (tx.status === 'compensated') {
      throw new Error('Transaction was rolled back');
    }
    
    // Still pending, wait and retry
    await sleep(100);
  }
  
  throw new Error('Transaction timeout');
}
```

---

## Common Use Cases

### Use Case 1: User Deposits Money

```typescript
// 1. User initiates deposit
const { transactionId } = await api.topup({
  idempotencyKey: uuidv4(),
  destinationAccountId: userAccountId,
  sourceAccountId: bankAccountId,
  amount: '100.00',
  currency: 'USD'
});

// 2. Show pending state
showNotification('Processing deposit...');

// 3. Poll for completion
const tx = await waitForTransaction(transactionId);

// 4. Show success
showNotification('Deposit successful!');
refreshBalance();
```

### Use Case 2: P2P Transfer

```typescript
const result = await api.transfer({
  idempotencyKey: uuidv4(),
  sourceAccountId: aliceAccountId,
  destinationAccountId: bobAccountId,
  amount: '50.00',
  currency: 'USD',
  reference: 'Dinner split'
});

// Wait for both transactions to complete
await waitForTransaction(result.sourceTransactionId);
await waitForTransaction(result.destinationTransactionId);
```

### Use Case 3: Payment with Refund

```typescript
// Process payment
const { transactionId: paymentId } = await api.payment({
  idempotencyKey: uuidv4(),
  customerAccountId,
  merchantAccountId,
  amount: '29.99',
  currency: 'USD'
});

await waitForTransaction(paymentId);

// Later: customer requests refund
const { refundId } = await api.refund({
  idempotencyKey: uuidv4(),
  originalPaymentId: paymentId,
  refundAmount: '29.99',  // Full refund
  currency: 'USD'
});

await waitForTransaction(refundId);
```

---

## Error Handling

### Complete Error Handling Example

```typescript
async function processTransaction(data) {
  try {
    const result = await api.transfer(data);
    const tx = await waitForTransaction(result.sourceTransactionId);
    return { success: true, transaction: tx };
    
  } catch (error) {
    // Handle specific errors
    if (error.status === 400) {
      if (error.message.includes('Insufficient balance')) {
        return { success: false, reason: 'insufficient_balance' };
      }
      if (error.message.includes('Currency mismatch')) {
        return { success: false, reason: 'currency_mismatch' };
      }
    }
    
    if (error.status === 404) {
      return { success: false, reason: 'account_not_found' };
    }
    
    if (error.status === 409) {
      // Already processed
      return { success: true, duplicate: true };
    }
    
    // Unexpected error
    logError(error);
    return { success: false, reason: 'unknown_error' };
  }
}
```

---

## Related Documentation

- [REST API Overview](./rest-api.md) - General API conventions
- [Account API](./accounts.md) - Account management
- [Transfer Operation](../operations/transfer.md) - Deep dive on transfers
- [Transaction Module](../modules/transaction.md) - Internal implementation

---

**Next**: Complete your setup with the [Installation Guide](../guides/installation.md) →


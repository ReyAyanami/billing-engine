# Idempotency

## Overview

Idempotency ensures that performing the same operation multiple times has the same effect as performing it once. Critical for financial systems where network failures can cause retries.

---

## The Problem

Without idempotency:

```
1. Client: POST /transactions/topup (amount: $100)
2. Server: Processing... (adds $100)
3. Network timeout ❌
4. Client: Retry POST /transactions/topup (amount: $100)
5. Server: Processing... (adds $100 again!)
Result: $200 added instead of $100 💥
```

---

## The Solution

With idempotency keys:

```
1. Client: POST /transactions/topup
   Body: { idempotencyKey: "key-123", amount: $100 }
2. Server: Processing... (adds $100)
3. Server: Stores "key-123" → transaction-001
4. Network timeout ❌
5. Client: Retry with SAME key "key-123"
6. Server: "key-123" exists → returns existing transaction-001
Result: $100 added (correct!) ✓
```

---

## Implementation

### Idempotency Key

**Format**: UUID v4

```typescript
import { v4 as uuidv4 } from 'uuid';

const idempotencyKey = uuidv4();
// "550e8400-e29b-41d4-a716-446655440000"
```

### Storage

Keys stored in database with unique constraint:

```sql
CREATE TABLE transactions (
  idempotency_key UUID UNIQUE NOT NULL,
  ...
);
```

### Check Pattern

```typescript
// 1. Check if key exists
const existing = await findByIdempotencyKey(key);
if (existing) {
  return { status: 409, transactionId: existing.id };
}

// 2. Process transaction
const transaction = await createTransaction(params);

// 3. Store with key
await saveTransaction({ ...transaction, idempotencyKey: key });
```

---

## Client Usage

### Generate Once, Store Locally

```typescript
// Generate key
const key = uuidv4();

// Store for retries
localStorage.setItem('pending-topup', key);

// Use in request
await topup({ idempotencyKey: key, ...params });
```

### Retry with Same Key

```typescript
const key = localStorage.getItem('pending-topup') || uuidv4();

try {
  const result = await topup({ idempotencyKey: key, ...params });
  localStorage.removeItem('pending-topup');
  return result;
} catch (error) {
  if (error.status === 409) {
    // Already processed, safe to continue
    console.log('Transaction already exists');
    return error.data;
  }
  throw error;
}
```

---

## Error Handling

### 409 Conflict

When key already exists:

```json
{
  "statusCode": 409,
  "message": "Transaction with idempotency key 'key-123' already exists (ID: tx-uuid)",
  "error": "Conflict"
}
```

**Client Action**: Retrieve existing transaction by ID

---

## Best Practices

### 1. Generate Client-Side

```typescript
// ✓ GOOD: Client generates key
const key = uuidv4();
await createTransaction({ idempotencyKey: key, ...params });

// ✗ BAD: Server generates key
// (Client can't retry with same key)
```

### 2. Store Before Request

```typescript
// ✓ GOOD: Store before request
const key = uuidv4();
localStorage.setItem('pending-tx', key);
await createTransaction({ idempotencyKey: key, ...params });

// ✗ BAD: Generate new key on retry
for (let i = 0; i < 3; i++) {
  await createTransaction({ idempotencyKey: uuidv4(), ...params });
  // Each retry creates a new transaction!
}
```

### 3. Use Per-Operation

```typescript
// ✓ GOOD: Unique key per operation
const topupKey = uuidv4();
const transferKey = uuidv4();

// ✗ BAD: Reusing same key
const key = uuidv4();
await topup({ idempotencyKey: key, ... });
await transfer({ idempotencyKey: key, ... });  // Conflict!
```

---

## Related Documentation

- [Transaction API](../api/transactions.md) - API usage
- [Operations](../operations/) - Operation-specific examples


# Transaction Concepts

## Overview

Transactions represent financial operations that move money between accounts. Every transaction follows double-entry bookkeeping and uses event sourcing for complete auditability.

---

## Transaction Lifecycle

```
PENDING → COMPLETED
         ↓
        FAILED
         ↓
     COMPENSATED
```

### States

1. **PENDING**: Transaction initiated, being processed
2. **COMPLETED**: Successfully finished
3. **FAILED**: Failed without side effects
4. **COMPENSATED**: Rolled back after partial completion

---

## Transaction Types

### 1. Top-up (TOPUP)

**Pattern**: External → User  
**Purpose**: Add funds to user account  
**Example**: Bank deposit, card payment

```typescript
POST /api/v1/transactions/topup
{
  "destinationAccountId": "user-account",
  "sourceAccountId": "bank-account",
  "amount": "100.00"
}
```

### 2. Withdrawal (WITHDRAWAL)

**Pattern**: User → External  
**Purpose**: Remove funds from user account  
**Example**: Cash out, bank transfer

### 3. Transfer (TRANSFER_DEBIT / TRANSFER_CREDIT)

**Pattern**: User → User  
**Purpose**: Move funds between users  
**Special**: Creates TWO transaction records (debit + credit)

### 4. Payment (PAYMENT)

**Pattern**: Customer → Merchant  
**Purpose**: Pay for goods/services  
**Special**: Can be refunded

### 5. Refund (REFUND)

**Pattern**: Merchant → Customer  
**Purpose**: Reverse a payment  
**Special**: Links to original via `parentTransactionId`

---

## Double-Entry

Every transaction has **two sides**:

```
Debit:  Source account      -$50
Credit: Destination account +$50
───────────────────────────────
Total:                       $0  ✓ Balanced
```

**Invariant**: Sum of all changes = 0

---

## Idempotency

Every transaction requires a unique `idempotencyKey`:

```typescript
{
  "idempotencyKey": "550e8400-...",  // UUID
  ...
}
```

**Purpose**: Prevent duplicate transactions on retry

See [Idempotency Concept](./idempotency.md) for details.

---

## Eventual Consistency

Transactions are processed **asynchronously**:

```
Time  0ms: POST request received
Time 10ms: Returns { status: "pending" }
Time 50ms: Processing complete
Time 100ms: GET shows { status: "completed" }
```

**Client Pattern**: Poll until completion

```typescript
const { transactionId } = await createTransaction();
// status: "pending"

await pollUntilComplete(transactionId);
// status: "completed"
```

---

## Related Documentation

- [Operations Guides](../operations/) - Detailed flows
- [Transaction API](../api/transactions.md) - REST endpoints
- [Idempotency](./idempotency.md) - Duplicate prevention


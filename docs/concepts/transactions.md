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

### Client Patterns for Status Updates

#### Option 1: Polling (Simple)

Poll the transaction endpoint until completion:

```typescript
const { transactionId } = await createTransaction();
// status: "pending"

await pollUntilComplete(transactionId);
// status: "completed"
```

**Implementation:**

```typescript
async function pollUntilComplete(transactionId: string) {
  const maxAttempts = 30;
  const delayMs = 1000;
  
  for (let i = 0; i < maxAttempts; i++) {
    const { status } = await getTransaction(transactionId);
    
    if (status === 'completed' || status === 'failed') {
      return status;
    }
    
    await sleep(delayMs);
  }
  
  throw new Error('Transaction timeout');
}
```

**Pros:** Simple, works everywhere  
**Cons:** Inefficient, delayed updates, server load

#### Option 2: Server-Sent Events (Efficient)

Subscribe to real-time status updates:

```typescript
const { transactionId } = await createTransaction();
// status: "pending"

// Subscribe to status updates via SSE
const eventSource = new EventSource(`/api/v1/transactions/${transactionId}/stream`);

eventSource.addEventListener('status', (event) => {
  const { status, completedAt } = JSON.parse(event.data);
  console.log(`Transaction ${status}`);
  
  if (status === 'completed' || status === 'failed') {
    eventSource.close();
  }
});

eventSource.addEventListener('error', (error) => {
  console.error('SSE error:', error);
  eventSource.close();
});
```

**Server-side (example):**

```typescript
@Get(':id/stream')
@Sse()
streamStatus(@Param('id') transactionId: string): Observable<MessageEvent> {
  return this.transactionService.streamTransactionStatus(transactionId).pipe(
    map((status) => ({
      type: 'status',
      data: JSON.stringify(status),
    }))
  );
}
```

**Pros:** Real-time, efficient, lower latency  
**Cons:** Requires SSE support, one-way only

#### Option 3: WebSockets (Full Duplex)

For bidirectional communication (not implemented in this project):

```typescript
const socket = new WebSocket('ws://api/transactions/stream');
socket.send(JSON.stringify({ subscribe: transactionId }));
socket.onmessage = (event) => {
  const { status } = JSON.parse(event.data);
  // Handle status update
};
```

**Pros:** Bidirectional, real-time  
**Cons:** More complex, requires WS infrastructure

### Recommendation

- **Development/Testing**: Use polling (simpler)
- **Production**: Use SSE for better UX and efficiency
- **High-Volume Systems**: Consider WebSockets or message queues

---

## Related Documentation

- [Operations Guides](../operations/) - Detailed flows
- [Transaction API](../api/transactions.md) - REST endpoints
- [Idempotency](./idempotency.md) - Duplicate prevention


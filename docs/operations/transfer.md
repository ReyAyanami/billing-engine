# Transfer Operation

## Overview

**Transfer** moves funds atomically between two user accounts. Both accounts must be updated together—if either fails, both roll back.

**Money Flow**: User Account → User Account

---

## Pattern

```
┌──────────────────┐         ┌──────────────────┐
│   Alice          │ ──────→ │   Bob            │
│   Account        │  $25    │   Account        │
└──────────────────┘         └──────────────────┘
  Balance: $100 → $75         Balance: $0 → $25
```

**Double-Entry**:
- DEBIT: Alice's account -$25
- CREDIT: Bob's account +$25

---

## Use Cases

1. **P2P Payment**: User sends money to another user
2. **Gift/Tip**: Send funds as a gift or tip
3. **Bill Splitting**: Split costs between friends
4. **Internal Transfer**: Move funds between own accounts

---

## API Endpoint

```http
POST /api/v1/transactions/transfer
```

### Request

```json
{
  "idempotencyKey": "770e8400-e29b-41d4-a716-446655440002",
  "sourceAccountId": "alice-account-uuid",
  "destinationAccountId": "bob-account-uuid",
  "amount": "25.00",
  "currency": "USD",
  "reference": "Lunch money",
  "metadata": {
    "note": "Thanks for lunch!"
  }
}
```

### Response

```json
{
  "sourceTransactionId": "tx-debit-uuid",
  "destinationTransactionId": "tx-credit-uuid",
  "status": "pending"
}
```

**Note**: Transfer creates TWO transaction records (debit + credit).

---

## Business Rules

### Validations

1. **Both Must Be USER Accounts**
   - Cannot transfer to/from EXTERNAL or SYSTEM accounts
   - Use withdrawal/topup for external transfers

2. **Accounts Must Be Different**
   ```typescript
   if (sourceId === destinationId) {
     throw new Error('Cannot transfer to same account');
   }
   ```

3. **Sufficient Balance**
   ```typescript
   if (sourceAccount.balance < amount) {
     throw new Error('Insufficient balance');
   }
   ```

4. **Currency Must Match**
   ```typescript
   if (sourceAccount.currency !== destinationAccount.currency) {
     throw new Error('Currency mismatch');
   }
   ```

5. **Both Accounts Must Be Active**
   - Neither can be suspended or closed

6. **Respect Balance Limits**
   - Source: Cannot violate minBalance
   - Destination: Cannot exceed maxBalance

---

## Atomicity Guarantee

Transfer is **atomic** using Saga pattern:

```typescript
try {
  // 1. Debit source
  await debitAccount(sourceId, amount);
  
  // 2. Credit destination  
  await creditAccount(destId, amount);
  
  // 3. Complete
  await completeTransfer(transactionId);
  
} catch (error) {
  // COMPENSATION: If step 2 failed after step 1 succeeded
  if (sourceDebited) {
    await creditAccount(sourceId, amount);  // Undo
    await markAsCompensated(transactionId);
  }
}
```

**Guarantee**: Either both accounts update or neither updates.

---

## Processing Flow

### 1. Command Phase

```typescript
TransferCommand
↓
TransferHandler validates and creates TransactionAggregate
↓
Emits TransferRequestedEvent
↓
Returns { sourceTransactionId, destinationTransactionId, status: "pending" }
```

### 2. Saga Coordination

```typescript
TransferRequestedEvent
↓
TransferRequestedHandler (Saga):
  1. Lock source account (pessimistic)
  2. Lock destination account (pessimistic)
  3. Debit source: UpdateBalanceCommand (DEBIT)
  4. Credit destination: UpdateBalanceCommand (CREDIT)
  5. If both succeed: CompleteTransferCommand
  6. If either fails: Compensate and fail
↓
TransferCompletedEvent
```

### 3. Locking Strategy

```typescript
// Lock accounts in consistent order to prevent deadlocks
const [firstId, secondId] = [sourceId, destId].sort();

const first = await lockAccount(firstId);
const second = await lockAccount(secondId);

// Now safe to update both
```

**Why Sort?** Prevents deadlock:
- Thread A: Lock Alice, Lock Bob
- Thread B: Lock Bob, Lock Alice ❌ Deadlock!

With sorting:
- Thread A: Lock Alice, Lock Bob
- Thread B: Lock Alice (waits), Lock Bob ✓ No deadlock

---

## Example Usage

### cURL

```bash
curl -X POST http://localhost:3000/api/v1/transactions/transfer \
  -H "Content-Type: application/json" \
  -d '{
    "idempotencyKey": "'$(uuidgen)'",
    "sourceAccountId": "alice-account-uuid",
    "destinationAccountId": "bob-account-uuid",
    "amount": "25.00",
    "currency": "USD",
    "reference": "Dinner split"
  }'
```

### TypeScript

```typescript
async function transfer(fromId: string, toId: string, amount: string) {
  const response = await fetch('/api/v1/transactions/transfer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idempotencyKey: uuidv4(),
      sourceAccountId: fromId,
      destinationAccountId: toId,
      amount,
      currency: 'USD',
      reference: 'P2P transfer'
    })
  });

  const { sourceTransactionId, destinationTransactionId } = await response.json();
  
  // Wait for both transactions to complete
  await Promise.all([
    pollUntilComplete(sourceTransactionId),
    pollUntilComplete(destinationTransactionId)
  ]);
  
  return { sourceTransactionId, destinationTransactionId };
}
```

---

## Error Scenarios

### Same Account

```json
{
  "statusCode": 400,
  "message": "Cannot transfer to same account",
  "error": "Bad Request"
}
```

### Currency Mismatch

```json
{
  "statusCode": 400,
  "message": "Currency mismatch: source uses USD, destination uses EUR",
  "error": "Bad Request"
}
```

### Compensation (Saga Rollback)

If credit fails after debit succeeds:

```json
{
  "id": "tx-uuid",
  "status": "compensated",
  "failureReason": "Destination account credit failed",
  "compensationDetails": {
    "actions": [
      {
        "accountId": "source-uuid",
        "action": "CREDIT",
        "amount": "25.00",
        "reason": "Rollback of debit due to transfer failure"
      }
    ]
  }
}
```

---

## Events Generated

1. **TransferRequestedEvent**
2. **BalanceChangedEvent** (source, DEBIT)
3. **BalanceChangedEvent** (destination, CREDIT)
4. **TransferCompletedEvent** or **TransactionCompensatedEvent**

---

## Testing Saga Compensation

```typescript
describe('Transfer Compensation', () => {
  it('should rollback source debit if destination credit fails', async () => {
    // Arrange
    const alice = await createAccount({ balance: '100.00' });
    const bob = await createAccount({ maxBalance: '10.00' });
    
    // Act: Transfer exceeds Bob's max balance
    const result = await transfer({
      sourceAccountId: alice.id,
      destinationAccountId: bob.id,
      amount: '50.00'  // Would make Bob's balance $50 (> $10 max)
    });
    
    // Assert: Transaction compensated
    const tx = await getTransaction(result.sourceTransactionId);
    expect(tx.status).toBe('compensated');
    
    // Assert: Alice's balance unchanged
    const aliceAfter = await getAccount(alice.id);
    expect(aliceAfter.balance).toBe('100.00');
  });
});
```

---

## Best Practices

### 1. Handle Compensation

```typescript
const result = await transfer(params);

await pollUntilComplete(result.sourceTransactionId);

const tx = await getTransaction(result.sourceTransactionId);

if (tx.status === 'compensated') {
  showError('Transfer was rolled back: ' + tx.failureReason);
} else if (tx.status === 'completed') {
  showSuccess('Transfer successful');
}
```

### 2. Display Both Transaction IDs

```typescript
// Transfer creates 2 transactions
const { sourceTransactionId, destinationTransactionId } = result;

// Show both in UI
console.log('Debit transaction:', sourceTransactionId);
console.log('Credit transaction:', destinationTransactionId);
```

---

## Related Documentation

- [Double-Entry Bookkeeping](../architecture/double-entry.md) - Why transfers need two sides
- [CQRS Pattern](../architecture/cqrs-pattern.md) - Saga compensation
- [Transaction API](../api/transactions.md) - API reference

---

**Next**: [Payment Operation](./payment.md) →


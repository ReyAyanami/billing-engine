# Refund Operation

## Overview

**Refund** reverses a previous payment transaction (full or partial). Money flows back from merchant to customer.

**Money Flow**: Merchant Account → Customer Account (reverse of payment)

---

## Pattern

```
┌──────────────────┐         ┌──────────────────┐
│   Merchant       │ ──────→ │   Customer       │
│   Account        │  $10    │   Account        │
└──────────────────┘         └──────────────────┘
  Balance: $10 → $0           Balance: $90 → $100
```

**Double-Entry**:
- DEBIT: Merchant account -$10
- CREDIT: Customer account +$10

---

## Use Cases

1. **Order Cancellation**: Customer cancels order, full refund
2. **Return**: Product returned, refund issued
3. **Dispute Resolution**: Refund after dispute
4. **Partial Refund**: Refund portion of payment
5. **Service Credit**: Issue credit for poor service

---

## API Endpoint

```http
POST /api/v1/transactions/refund
```

### Request

```json
{
  "idempotencyKey": "990e8400-e29b-41d4-a716-446655440004",
  "originalPaymentId": "payment-tx-uuid",
  "refundAmount": "10.00",
  "currency": "USD",
  "refundMetadata": {
    "reason": "Customer request",
    "ticketId": "SUPPORT-12345",
    "requestedBy": "support_agent_42"
  }
}
```

**Note**: `refundAmount` can be less than original payment (partial refund).

### Response

```json
{
  "refundId": "refund-tx-uuid",
  "originalPaymentId": "payment-tx-uuid",
  "status": "pending"
}
```

---

## Business Rules

### Validations

1. **Original Payment Must Exist**
   ```typescript
   const payment = await findPayment(originalPaymentId);
   if (!payment) {
     throw new Error('Original payment not found');
   }
   ```

2. **Payment Must Be Completed**
   ```typescript
   if (payment.status !== 'completed') {
     throw new Error('Can only refund completed payments');
   }
   ```

3. **Refund Amount Cannot Exceed Original**
   ```typescript
   if (refundAmount > payment.amount) {
     throw new Error('Refund amount exceeds original payment');
   }
   ```

4. **Currency Must Match**
   ```typescript
   if (refundCurrency !== payment.currency) {
     throw new Error('Refund currency must match payment');
   }
   ```

5. **Merchant Must Have Sufficient Balance**
   - Merchant must have enough funds to issue refund
   - If insufficient, refund fails

6. **Multiple Refunds Allowed**
   - Can issue multiple partial refunds
   - Total refunds cannot exceed original payment

---

## Full vs Partial Refunds

### Full Refund

```json
{
  "originalPaymentId": "payment-uuid",
  "refundAmount": "29.99",  // Same as original
  "reason": "Order cancelled"
}
```

### Partial Refund

```json
{
  "originalPaymentId": "payment-uuid",
  "refundAmount": "10.00",  // Less than original $29.99
  "reason": "Partial return - 1 of 3 items"
}
```

### Multiple Partial Refunds

```typescript
// Original payment: $100
await refund({ paymentId, amount: '30.00' });  // Refund 1
await refund({ paymentId, amount: '20.00' });  // Refund 2
await refund({ paymentId, amount: '50.00' });  // Refund 3
// Total refunded: $100 ✓
```

---

## Processing Flow

1. **Validation**: Verify original payment exists and is refundable
2. **Command**: RefundCommand created with original payment reference
3. **Event**: RefundRequestedEvent emitted
4. **Saga**: Coordinates debit merchant + credit customer
5. **Completion**: RefundCompletedEvent emitted
6. **Linkage**: Refund transaction links to original via `parentTransactionId`

---

## Example Usage

### cURL

```bash
curl -X POST http://localhost:3000/api/v1/transactions/refund \
  -H "Content-Type: application/json" \
  -d '{
    "idempotencyKey": "'$(uuidgen)'",
    "originalPaymentId": "payment-uuid",
    "refundAmount": "29.99",
    "currency": "USD",
    "refundMetadata": {
      "reason": "Customer cancelled order",
      "ticketId": "SUP-2025-123"
    }
  }'
```

### TypeScript

```typescript
async function refundPayment(params: {
  originalPaymentId: string;
  refundAmount: string;
  reason: string;
}) {
  const response = await fetch('/api/v1/transactions/refund', {
    method: 'POST',
    headers: { 'Content-Type: application/json' },
    body: JSON.stringify({
      idempotencyKey: uuidv4(),
      originalPaymentId: params.originalPaymentId,
      refundAmount: params.refundAmount,
      currency: 'USD',
      refundMetadata: {
        reason: params.reason
      }
    })
  });

  const { refundId, originalPaymentId } = await response.json();
  
  // Poll for completion
  const tx = await pollUntilComplete(refundId);
  
  if (tx.status === 'completed') {
    return { success: true, refundId };
  } else {
    throw new Error(tx.failureReason);
  }
}
```

---

## Refund Metadata

Capture why refund was issued:

```json
{
  "refundMetadata": {
    "reason": "Customer request",
    "reasonCode": "CUSTOMER_CANCELLED",
    "ticketId": "SUPPORT-12345",
    "requestedBy": "support_agent_42",
    "approvedBy": "manager_7",
    "notes": "Customer was unhappy with delivery time",
    "refundMethod": "original_payment_method"
  }
}
```

**Why Metadata?**
- Audit trail for refund decisions
- Customer support reference
- Analytics (refund reasons)
- Compliance documentation

---

## Error Scenarios

### Payment Not Found

```json
{
  "statusCode": 404,
  "message": "Payment with ID 'payment-uuid' not found",
  "error": "Not Found"
}
```

### Refund Exceeds Original

```json
{
  "statusCode": 400,
  "message": "Refund amount 50.00 exceeds original payment 29.99",
  "error": "Bad Request"
}
```

### Insufficient Merchant Balance

```json
{
  "statusCode": 400,
  "message": "Merchant has insufficient balance to issue refund",
  "error": "Bad Request"
}
```

---

## Transaction Linkage

Refunds are linked to original payments:

```typescript
// Query refund transaction
const refund = await getTransaction(refundId);

console.log(refund.parentTransactionId);  // Original payment ID

// Query all refunds for a payment
const refunds = await getTransactions({
  parentTransactionId: paymentId,
  type: 'refund'
});

console.log(`Total refunds: ${refunds.length}`);
```

---

## Events Generated

1. **RefundRequestedEvent**
   ```json
   {
     "eventType": "RefundRequested",
     "data": {
       "originalPaymentId": "payment-uuid",
       "refundAmount": "29.99",
       "refundMetadata": {...}
     }
   }
   ```

2. **BalanceChangedEvent** (merchant, DEBIT)
3. **BalanceChangedEvent** (customer, CREDIT)
4. **RefundCompletedEvent**

---

## Testing

### Full Refund Test

```typescript
describe('Refund Operation', () => {
  it('should issue full refund', async () => {
    // Arrange: Process payment
    const customer = await createAccount({ balance: '100.00' });
    const merchant = await createAccount({ balance: '0' });
    
    const { transactionId: paymentId } = await processPayment({
      customerAccountId: customer.id,
      merchantAccountId: merchant.id,
      amount: '25.00'
    });
    
    await waitForCompletion(paymentId);
    
    // Act: Issue refund
    const { refundId } = await refundPayment({
      originalPaymentId: paymentId,
      refundAmount: '25.00',
      reason: 'Test refund'
    });
    
    await waitForCompletion(refundId);
    
    // Assert: Balances restored
    const customerAfter = await getAccount(customer.id);
    const merchantAfter = await getAccount(merchant.id);
    
    expect(customerAfter.balance).toBe('100.00');
    expect(merchantAfter.balance).toBe('0');
  });
});
```

### Partial Refund Test

```typescript
it('should issue partial refund', async () => {
  const { transactionId: paymentId } = await processPayment({
    amount: '100.00',
    ...
  });
  
  const { refundId } = await refundPayment({
    originalPaymentId: paymentId,
    refundAmount: '30.00',  // Partial
    reason: 'Partial return'
  });
  
  await waitForCompletion(refundId);
  
  // Customer received $30 back, merchant keeps $70
  const customerAfter = await getAccount(customer.id);
  expect(customerAfter.balance).toBe('30.00');
});
```

---

## Best Practices

### 1. Always Validate Original Payment

```typescript
const payment = await getTransaction(originalPaymentId);

if (!payment) {
  throw new Error('Payment not found');
}

if (payment.status !== 'completed') {
  throw new Error('Can only refund completed payments');
}

if (payment.type !== 'payment') {
  throw new Error('Can only refund payments');
}
```

### 2. Track Refund Reasons

```typescript
// Categorize refunds for analytics
const refundReasons = {
  CUSTOMER_CANCELLED: 'customer_cancelled',
  PRODUCT_RETURN: 'product_return',
  SERVICE_ISSUE: 'service_issue',
  DISPUTE: 'dispute_resolution',
  OTHER: 'other'
};

await refundPayment({
  ...params,
  refundMetadata: {
    reasonCode: refundReasons.CUSTOMER_CANCELLED,
    ...
  }
});
```

### 3. Notify Customer

```typescript
const { refundId } = await refundPayment(params);

await waitForCompletion(refundId);

// Send notification
await sendEmail({
  to: customer.email,
  subject: 'Refund Processed',
  body: `Your refund of $${amount} has been processed.`
});
```

---

## Related Documentation

- [Payment Operation](./payment.md) - Original payment operation
- [Transaction API](../api/transactions.md) - API reference
- [Double-Entry Bookkeeping](../architecture/double-entry.md) - Accounting principles

---

**That's all operations!** → Return to [Operations Overview](./README.md)


# Payment Operation

## Overview

**Payment** processes a customer-to-merchant (C2B) transaction. Money moves from a customer account to a merchant/system account.

**Money Flow**: Customer Account → Merchant Account

---

## Pattern

```
┌──────────────────┐         ┌──────────────────┐
│   Customer       │ ──────→ │   Merchant       │
│   Account        │  $10    │   Account        │
└──────────────────┘         └──────────────────┘
  Balance: $100 → $90         Balance: $0 → $10
```

**Double-Entry**:
- DEBIT: Customer account -$10
- CREDIT: Merchant account +$10

---

## Use Cases

1. **E-commerce Purchase**: Customer buys a product
2. **Subscription Fee**: Monthly/annual subscription payment
3. **Service Fee**: Pay for a service
4. **In-app Purchase**: Digital goods purchase

---

## API Endpoint

```http
POST /api/v1/transactions/payment
```

### Request

```json
{
  "idempotencyKey": "880e8400-e29b-41d4-a716-446655440003",
  "customerAccountId": "customer-account-uuid",
  "merchantAccountId": "merchant-account-uuid",
  "amount": "10.00",
  "currency": "USD",
  "paymentMetadata": {
    "orderId": "order-12345",
    "productId": "prod-789",
    "productName": "Premium Subscription",
    "description": "1 month premium access"
  }
}
```

### Response

```json
{
  "transactionId": "payment-tx-uuid",
  "status": "pending"
}
```

---

## Business Rules

### Validations

1. **Customer Must Be USER Account**
   - Only USER accounts can make payments
   - Cannot pay from EXTERNAL or SYSTEM accounts

2. **Merchant Can Be USER or SYSTEM**
   - USER: Another user/merchant
   - SYSTEM: Platform fees, commissions

3. **Accounts Must Be Different**
   ```typescript
   if (customerAccountId === merchantAccountId) {
     throw new Error('Customer and merchant must be different');
   }
   ```

4. **Sufficient Balance**
   ```typescript
   if (customerAccount.balance < amount) {
     throw new Error('Insufficient balance');
   }
   ```

5. **Currency Must Match**
   - Both accounts must use same currency
   - No automatic conversion

6. **Both Accounts Must Be Active**

7. **Amount Limits**
   - Positive amount required
   - May have per-transaction limits (business logic)

---

## Processing Flow

Similar to transfer, but with payment-specific metadata:

1. **Validation**: Upfront validation of accounts and balances
2. **Command**: PaymentCommand created
3. **Event**: PaymentRequestedEvent emitted
4. **Saga**: Coordinates debit customer + credit merchant
5. **Completion**: PaymentCompletedEvent emitted
6. **Refundable**: Can be reversed via Refund operation

---

## Example Usage

### cURL

```bash
curl -X POST http://localhost:3000/api/v1/transactions/payment \
  -H "Content-Type: application/json" \
  -d '{
    "idempotencyKey": "'$(uuidgen)'",
    "customerAccountId": "customer-uuid",
    "merchantAccountId": "merchant-uuid",
    "amount": "29.99",
    "currency": "USD",
    "paymentMetadata": {
      "orderId": "ORD-2025-001",
      "description": "Premium Plan - Annual"
    }
  }'
```

### TypeScript

```typescript
async function processPayment(params: {
  customerId: string;
  merchantId: string;
  amount: string;
  orderId: string;
}) {
  const response = await fetch('/api/v1/transactions/payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idempotencyKey: uuidv4(),
      customerAccountId: params.customerId,
      merchantAccountId: params.merchantId,
      amount: params.amount,
      currency: 'USD',
      paymentMetadata: {
        orderId: params.orderId
      }
    })
  });

  const { transactionId } = await response.json();
  
  // Poll for completion
  const tx = await pollUntilComplete(transactionId);
  
  if (tx.status === 'completed') {
    return { success: true, paymentId: transactionId };
  } else {
    throw new Error(tx.failureReason);
  }
}
```

---

## Payment Metadata

The `paymentMetadata` field captures payment-specific information:

```json
{
  "paymentMetadata": {
    "orderId": "ORD-123",
    "productId": "PROD-456",
    "productName": "Premium Subscription",
    "quantity": 1,
    "unitPrice": "29.99",
    "taxAmount": "2.40",
    "totalAmount": "32.39",
    "invoiceNumber": "INV-2025-001",
    "customerEmail": "customer@example.com",
    "shippingAddress": {...}
  }
}
```

**Why Metadata?**
- Links payment to order/invoice
- Provides context for refunds
- Audit trail for purchases
- Customer support reference

---

## Error Scenarios

### Insufficient Balance

```json
{
  "statusCode": 400,
  "message": "Insufficient balance: current 5.00, attempting to pay 10.00",
  "error": "Bad Request"
}
```

### Same Account

```json
{
  "statusCode": 400,
  "message": "Customer and merchant accounts must be different",
  "error": "Bad Request"
}
```

---

## Events Generated

1. **PaymentRequestedEvent**
   ```json
   {
     "eventType": "PaymentRequested",
     "data": {
       "customerAccountId": "cust-uuid",
       "merchantAccountId": "merch-uuid",
       "amount": "10.00",
       "paymentMetadata": {...}
     }
   }
   ```

2. **BalanceChangedEvent** (customer, DEBIT)
3. **BalanceChangedEvent** (merchant, CREDIT)
4. **PaymentCompletedEvent**
   ```json
   {
     "eventType": "PaymentCompleted",
     "data": {
       "customerNewBalance": "90.00",
       "merchantNewBalance": "10.00"
     }
   }
   ```

---

## Refund Support

Payments can be refunded (full or partial):

```typescript
// Original payment
const { transactionId: paymentId } = await processPayment({
  amount: '29.99',
  ...
});

// Later: Issue refund
const { refundId } = await refundPayment({
  originalPaymentId: paymentId,
  refundAmount: '29.99',  // Full refund
  reason: 'Customer request'
});
```

See [Refund Operation](./refund.md) for details.

---

## Testing

```typescript
describe('Payment Operation', () => {
  it('should process payment from customer to merchant', async () => {
    const customer = await createAccount({ balance: '100.00' });
    const merchant = await createAccount({ balance: '0' });
    
    const { transactionId } = await processPayment({
      customerAccountId: customer.id,
      merchantAccountId: merchant.id,
      amount: '25.00'
    });
    
    await waitForCompletion(transactionId);
    
    const customerAfter = await getAccount(customer.id);
    const merchantAfter = await getAccount(merchant.id);
    
    expect(customerAfter.balance).toBe('75.00');
    expect(merchantAfter.balance).toBe('25.00');
  });
});
```

---

## Related Documentation

- [Refund Operation](./refund.md) - How to reverse payments
- [Transfer Operation](./transfer.md) - Similar P2P pattern
- [Transaction API](../api/transactions.md) - API reference

---

**Next**: [Refund Operation](./refund.md) →


# Withdrawal Operation

## Overview

**Withdrawal** removes funds from a user account to an external destination (e.g., bank withdrawal, cash-out). This is how money leaves the billing system.

**Money Flow**: User Account → External Account

---

## Pattern

```
┌──────────────────┐         ┌──────────────────┐
│   USER           │ ──────→ │  EXTERNAL        │
│   Account        │  $50    │  Bank/Gateway    │
└──────────────────┘         └──────────────────┘
  Balance: $100 → $50         Balance: (ignored)
```

**Double-Entry**:
- DEBIT: User account -$50
- CREDIT: External account (not tracked)

---

## Use Cases

1. **Bank Withdrawal**: User cashes out to their bank account
2. **Payment Processing**: Send funds to payment gateway
3. **Cash Withdrawal**: Admin processes cash withdrawal
4. **External Transfer**: Move funds to external system

---

## API Endpoint

```http
POST /api/v1/transactions/withdraw
```

### Request

```json
{
  "idempotencyKey": "660e8400-e29b-41d4-a716-446655440001",
  "sourceAccountId": "user-account-uuid",
  "destinationAccountId": "external-bank-uuid",
  "amount": "50.00",
  "currency": "USD",
  "reference": "Bank withdrawal",
  "metadata": {
    "withdrawalMethod": "bank_transfer",
    "bankAccount": "*****1234"
  }
}
```

### Response

```json
{
  "transactionId": "tx-uuid",
  "accountId": "user-account-uuid",
  "amount": "50.00",
  "currency": "USD",
  "status": "pending"
}
```

---

## Business Rules

### Validations

1. **Source Must Be USER Account**
   - Cannot withdraw from SYSTEM or EXTERNAL accounts
   - Only end-user accounts can initiate withdrawals

2. **Sufficient Balance Required**
   ```typescript
   if (account.balance < amount) {
     throw new Error('Insufficient balance');
   }
   ```

3. **Amount Must Be Positive**
   - Minimum: $0.01 (or currency minimum)
   - Maximum: Account balance

4. **Currency Must Match**
   - Account and withdrawal must use same currency

5. **Account Must Be Active**
   - Suspended or closed accounts cannot withdraw

6. **Min Balance Check**
   ```typescript
   const newBalance = account.balance - amount;
   if (newBalance < account.minBalance) {
     throw new Error('Would violate minimum balance');
   }
   ```

---

## Processing Flow

Same as top-up but in reverse:

1. **Command**: WithdrawalCommand created
2. **Event**: WithdrawalRequestedEvent emitted
3. **Saga**: Updates account balance (DEBIT)
4. **Completion**: WithdrawalCompletedEvent emitted
5. **Projection**: Account and transaction projections updated

---

## Example Usage

### cURL

```bash
curl -X POST http://localhost:3000/api/v1/transactions/withdraw \
  -H "Content-Type: application/json" \
  -d '{
    "idempotencyKey": "'$(uuidgen)'",
    "sourceAccountId": "user-account-uuid",
    "destinationAccountId": "external-bank-uuid",
    "amount": "50.00",
    "currency": "USD",
    "reference": "ATM withdrawal"
  }'
```

### TypeScript

```typescript
async function withdrawFromAccount(accountId: string, amount: string) {
  const response = await fetch('/api/v1/transactions/withdraw', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idempotencyKey: uuidv4(),
      sourceAccountId: accountId,
      destinationAccountId: 'external-bank-001',
      amount,
      currency: 'USD'
    })
  });

  const { transactionId } = await response.json();
  return await pollUntilComplete(transactionId);
}
```

---

## Error Scenarios

### Insufficient Balance

```json
{
  "statusCode": 400,
  "message": "Insufficient balance: current 30.00, attempting to withdraw 50.00",
  "error": "Bad Request"
}
```

### Min Balance Violation

```json
{
  "statusCode": 400,
  "message": "Withdrawal would violate minimum balance of 10.00",
  "error": "Bad Request"
}
```

---

## Events Generated

1. **WithdrawalRequestedEvent**
2. **BalanceChangedEvent** (DEBIT)
3. **WithdrawalCompletedEvent**

---

## Related Documentation

- [Top-up Operation](./top-up.md) - Opposite operation
- [Transaction API](../api/transactions.md) - API reference

---

**Next**: [Transfer Operation](./transfer.md) →


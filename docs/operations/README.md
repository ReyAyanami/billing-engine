# Transaction Operations

## Overview

This section documents the five core transaction operations supported by the billing engine. Each operation follows double-entry bookkeeping principles and uses CQRS/Event Sourcing for processing.

---

## Operations

### [Top-up](./top-up.md)
Add funds to an account from an external source.
- **Pattern**: External → User
- **Use Case**: Bank deposits, initial funding
- **Example**: User deposits $100 from their bank account

### [Withdrawal](./withdrawal.md)
Remove funds from an account to an external destination.
- **Pattern**: User → External
- **Use Case**: Bank withdrawals, cash-outs
- **Example**: User withdraws $50 to their bank account

### [Transfer](./transfer.md)
Move funds between two user accounts atomically.
- **Pattern**: User → User
- **Use Case**: P2P payments, money transfers
- **Example**: Alice sends $25 to Bob

### [Payment](./payment.md)
Process a payment from customer to merchant.
- **Pattern**: User → Merchant/System
- **Use Case**: Purchases, subscriptions, fees
- **Example**: Customer pays $10 for a service

### [Refund](./refund.md)
Reverse a previous payment (full or partial).
- **Pattern**: Merchant → Customer (reversal)
- **Use Case**: Returns, cancellations
- **Example**: Merchant refunds $10 to customer

---

## Common Patterns

### Async Processing

All operations are asynchronous:
1. Client submits request
2. API returns `{ transactionId, status: "pending" }`
3. Client polls GET endpoint to check status
4. Status becomes `"completed"` or `"failed"`

### Idempotency

All operations require an `idempotencyKey`:
- Prevents duplicate transactions
- Safe to retry with same key
- Returns `409 Conflict` if key already used

### Error Handling

All operations can fail with:
- `400 Bad Request` - Invalid input or business rule violation
- `404 Not Found` - Account doesn't exist
- `409 Conflict` - Duplicate idempotency key

---

## Related Documentation

- [Transaction API](../api/transactions.md) - API reference
- [Double-Entry Bookkeeping](../architecture/double-entry.md) - Accounting principles
- [Transaction Module](../modules/transaction.md) - Implementation details


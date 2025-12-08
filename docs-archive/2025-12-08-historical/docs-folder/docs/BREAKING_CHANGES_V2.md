# Breaking Changes: Version 2.0 - Double-Entry System

## Overview

Version 2.0 introduces a **major architectural refactoring** to implement true double-entry bookkeeping. This is a **breaking change** that affects all transaction APIs and the database schema.

## What Changed?

### 1. All Transactions Now Require Source and Destination

**Before (v1):**
- Topup: Single `accountId`
- Withdrawal: Single `accountId`
- Transfer: `sourceAccountId` and `destinationAccountId`

**After (v2):**
- **ALL operations** require both `sourceAccountId` and `destinationAccountId`
- This provides complete money flow tracking

### 2. New Account Types

Three types of accounts:
- **USER**: End-user accounts (with balance limits)
- **EXTERNAL**: External financial services (banks, payment gateways)
- **SYSTEM**: Internal system accounts (fees, reserves)

### 3. Transaction Schema Changes

**Old Schema:**
```typescript
{
  accountId: UUID,              // Single account
  counterpartyAccountId?: UUID, // Optional
  balanceBefore: Decimal,
  balanceAfter: Decimal
}
```

**New Schema:**
```typescript
{
  sourceAccountId: UUID,                // Always required
  destinationAccountId: UUID,           // Always required
  sourceBalanceBefore: Decimal,
  sourceBalanceAfter: Decimal,
  destinationBalanceBefore: Decimal,
  destinationBalanceAfter: Decimal
}
```

## API Changes

### Top-Up

**Old API:**
```http
POST /api/v1/transactions/topup
{
  "idempotencyKey": "uuid",
  "accountId": "user-account-123",
  "amount": "100.00",
  "currency": "USD"
}
```

**New API:**
```http
POST /api/v1/transactions/topup
{
  "idempotencyKey": "uuid",
  "sourceAccountId": "external-bank-account-usd",
  "destinationAccountId": "user-account-123",
  "amount": "100.00",
  "currency": "USD"
}
```

### Withdrawal

**Old API:**
```http
POST /api/v1/transactions/withdraw
{
  "idempotencyKey": "uuid",
  "accountId": "user-account-123",
  "amount": "50.00",
  "currency": "USD"
}
```

**New API:**
```http
POST /api/v1/transactions/withdraw
{
  "idempotencyKey": "uuid",
  "sourceAccountId": "user-account-123",
  "destinationAccountId": "external-bank-account-usd",
  "amount": "50.00",
  "currency": "USD"
}
```

### Transfer (No Change to Field Names)

Transfer API already had `sourceAccountId` and `destinationAccountId`, so the structure remains the same.

## Migration Guide

### Step 1: Create External Accounts

Before you can perform topups/withdrawals, create external accounts:

```typescript
// Create external bank account for USD
const bankAccountUSD = await fetch('/api/v1/accounts', {
  method: 'POST',
  body: JSON.stringify({
    ownerId: 'bank_integration',
    ownerType: 'bank',
    accountType: 'external',
    accountSubtype: 'bank',
    currency: 'USD'
  })
});

// Create external payment gateway for USD
const paymentGatewayUSD = await fetch('/api/v1/accounts', {
  method: 'POST',
  body: JSON.stringify({
    ownerId: 'stripe',
    ownerType: 'payment_provider',
    accountType: 'external',
    accountSubtype: 'payment_gateway',
    currency: 'USD'
  })
});
```

**Note:** The migration automatically seeds common external accounts with predictable IDs:
- `00000000-0000-0000-0000-000000000001`: Bank (USD)
- `00000000-0000-0000-0000-000000000002`: Bank (EUR)
- `00000000-0000-0000-0000-000000000003`: Bank (GBP)
- `00000000-0000-0000-0000-000000000004`: Crypto Wallet (BTC)
- `00000000-0000-0000-0000-000000000005`: Crypto Wallet (ETH)

### Step 2: Update API Calls

**Before:**
```javascript
// Topup
await billingAPI.topup({
  accountId: userAccountId,
  amount: '100.00',
  currency: 'USD'
});

// Withdrawal
await billingAPI.withdraw({
  accountId: userAccountId,
  amount: '50.00',
  currency: 'USD'
});
```

**After:**
```javascript
// Topup
await billingAPI.topup({
  sourceAccountId: externalBankAccountId,  // NEW!
  destinationAccountId: userAccountId,
  amount: '100.00',
  currency: 'USD'
});

// Withdrawal
await billingAPI.withdraw({
  sourceAccountId: userAccountId,
  destinationAccountId: externalBankAccountId,  // NEW!
  amount: '50.00',
  currency: 'USD'
});
```

### Step 3: Update Response Handling

**Old Response:**
```json
{
  "transactionId": "uuid",
  "accountId": "user-123",
  "amount": "100.00",
  "balanceAfter": "100.00",
  "status": "completed"
}
```

**New Response:**
```json
{
  "transactionId": "uuid",
  "sourceAccountId": "external-bank-1",
  "destinationAccountId": "user-123",
  "amount": "100.00",
  "sourceBalanceAfter": "-100.00",
  "destinationBalanceAfter": "100.00",
  "status": "completed"
}
```

### Step 4: Update Database Queries

If you query the `transactions` table directly:

**Old:**
```sql
SELECT * FROM transactions
WHERE account_id = 'user-123';
```

**New:**
```sql
SELECT * FROM transactions
WHERE source_account_id = 'user-123'
   OR destination_account_id = 'user-123';
```

## Benefits of This Change

### 1. Complete Auditability
Every transaction now shows the complete money flow:
- ✅ Where money came from
- ✅ Where money went
- ✅ Balance changes on both sides

### 2. Regulatory Compliance
Meets accounting standards and audit requirements:
- ✅ Double-entry bookkeeping principles
- ✅ Full transaction trails
- ✅ Balance reconciliation

### 3. Better Reporting
Can now generate:
- ✅ Profit & loss statements
- ✅ Balance sheets
- ✅ Cash flow reports
- ✅ Provider-specific reports

### 4. Flexibility
- ✅ Easy to add new payment providers
- ✅ Track fees and reserves
- ✅ Support complex financial scenarios

## Compatibility

### No Backward Compatibility

This is a **breaking change**. There is no backward compatibility with v1 APIs.

### Database Migration

- Old database schema is **completely replaced**
- No automated data migration from v1 to v2
- If you have existing data, you must manually migrate it

### Recommended Approach

For existing deployments:
1. Deploy v2 to a new environment
2. Create external accounts
3. Update client applications
4. Test thoroughly
5. Migrate users gradually

For new deployments:
1. Use v2 from the start
2. Create external accounts during setup
3. Configure account types and limits

## FAQ

### Q: Can I still use the old API?
**A:** No. The old API is removed in v2.

### Q: Do I need to create external accounts for every currency?
**A:** Yes. Each currency needs at least one external account for topups/withdrawals.

### Q: Can external accounts go negative?
**A:** Yes. External accounts represent external sources/destinations and can have negative balances (they don't represent real balances in our system).

### Q: What if I only have internal transfers?
**A:** For purely internal systems (no external topups/withdrawals), you can create system accounts instead of external accounts.

### Q: How do I handle fees?
**A:** Create a system account (type: `system`, subtype: `fee_collection`) and transfer fees to it.

### Q: Can users have multiple accounts?
**A:** Yes. Create multiple accounts with the same `ownerId` but different currencies or purposes.

## Support

For questions or issues during migration:
1. Review the [Double-Entry Design Documentation](./DOUBLE_ENTRY_DESIGN.md)
2. Check the [API Examples](../README.md#api-examples)
3. Run the E2E tests to see working examples

## Timeline

- **v1.x**: Original single-account model (deprecated)
- **v2.0**: Double-entry bookkeeping (current)
- **v2.1+**: Future enhancements building on double-entry foundation


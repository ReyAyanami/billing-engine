# Named Arguments Refactoring Progress

## Status: IN PROGRESS

### ✅ Completed

#### 1. Command Classes Refactored (8/8)

All command classes now use named arguments with TypeScript interfaces:

**Transaction Commands:**
- ✅ `TransferCommand` + `TransferCommandParams`
- ✅ `PaymentCommand` + `PaymentCommandParams` + `PaymentMetadata`
- ✅ `RefundCommand` + `RefundCommandParams` + `RefundMetadata`
- ✅ `TopupCommand` + `TopupCommandParams`
- ✅ `WithdrawalCommand` + `WithdrawalCommandParams`

**Account Commands:**
- ✅ `CreateAccountCommand` + `CreateAccountCommandParams`
- ✅ `UpdateBalanceCommand` + `UpdateBalanceCommandParams`

#### 2. Service Layer Updated (2/2)

- ✅ `transaction.service.ts` - All 4 command instantiations updated
  - Topup, Withdrawal, Transfer, Refund
- ✅ `account.service.ts` - CreateAccountCommand updated

#### 3. SAGA Handlers Updated (1/5)

- ✅ `transfer-requested.handler.ts` - All 3 UpdateBalanceCommand uses updated

### 🔄 Remaining Work

#### SAGA Handlers to Update (4 files)

Each file has 2-3 `UpdateBalanceCommand` instantiations to refactor:

1. **payment-requested.handler.ts**
   - Line 39: Debit customer
   - Line 52: Credit merchant  
   - Line 94: Compensation (credit customer back)

2. **refund-requested.handler.ts**
   - Line 39: Debit merchant
   - Line 52: Credit customer
   - Line 94: Compensation (credit merchant back)

3. **topup-requested.handler.ts**
   - Line 28: Credit account

4. **withdrawal-requested.handler.ts**
   - Line 28: Debit account

#### Pattern for Remaining Updates

**Before:**
```typescript
const command = new UpdateBalanceCommand(
  event.accountId,
  event.amount,
  'DEBIT',
  `Reason text`,
  event.aggregateId,
  event.correlationId,
  event.metadata?.actorId,
);
```

**After:**
```typescript
const command = new UpdateBalanceCommand({
  accountId: event.accountId,
  changeAmount: event.amount,
  changeType: 'DEBIT',
  reason: `Reason text`,
  transactionId: event.aggregateId,
  correlationId: event.correlationId,
  actorId: event.metadata?.actorId,
});
```

## Benefits Already Achieved

### Type Safety Example

**Before (Positional):**
```typescript
// ❌ Easy to swap sourceAccountId and destinationAccountId
const command = new TransferCommand(
  txId,
  destId,      // WRONG! Should be sourceId
  sourceId,    // WRONG! Should be destId  
  amount,
  currency,
  idempKey,
);
// TypeScript can't catch this error!
```

**After (Named):**
```typescript
// ✅ TypeScript catches typos and wrong property names
const command = new TransferCommand({
  transactionId: txId,
  sourceAccountId: sourceId,      // Clear what this is
  destinationAccountId: destId,    // Can't be swapped by mistake
  amount,
  currency,
  idempotencyKey: idempKey,
});
// TypeScript validates all property names!
```

### Readability Example

**Service Layer - Before:**
```typescript
const command = new TransferCommand(
  transactionId,
  dto.sourceAccountId,
  dto.destinationAccountId,
  dto.amount,
  dto.currency,
  dto.idempotencyKey,
  context.correlationId,
  context.actorId,
);
// What's the 6th parameter? Have to count positions...
```

**Service Layer - After:**
```typescript
const command = new TransferCommand({
  transactionId,
  sourceAccountId: dto.sourceAccountId,
  destinationAccountId: dto.destinationAccountId,
  amount: dto.amount,
  currency: dto.currency,
  idempotencyKey: dto.idempotencyKey,
  correlationId: context.correlationId,
  actorId: context.actorId,
});
// Self-documenting! Clear what each value represents.
```

## Testing Status

- ⏳ Type checking: Pending (run `npm run type-check`)
- ⏳ Unit tests: Pending
- ⏳ E2E tests: Pending

## Next Steps

### To Complete the Refactoring:

1. **Update remaining SAGA handlers** (4 files, ~12 command instantiations)
   - Use the pattern shown above
   - Test after each file

2. **Update Complete* commands** (5 files)
   - CompletePaymentCommand
   - CompleteRefundCommand
   - CompleteTransferCommand
   - CompleteTopupCommand
   - CompleteWithdrawalCommand

3. **Update other command usages**
   - Search for `new .*Command\(` in src/
   - Update any remaining positional usages

4. **Run full test suite**
   ```bash
   npm run type-check
   npm run lint
   npm test
   npm run test:e2e
   ```

5. **Update tests if needed**
   - Test files may have command instantiations
   - Update to use named arguments pattern

## Files Modified So Far

### Commands (8 files)
- `src/modules/transaction/commands/transfer.command.ts`
- `src/modules/transaction/commands/payment.command.ts`
- `src/modules/transaction/commands/refund.command.ts`
- `src/modules/transaction/commands/topup.command.ts`
- `src/modules/transaction/commands/withdrawal.command.ts`
- `src/modules/account/commands/create-account.command.ts`
- `src/modules/account/commands/update-balance.command.ts`

### Services (2 files)
- `src/modules/transaction/transaction.service.ts`
- `src/modules/account/account.service.ts`

### Handlers (1 file)
- `src/modules/transaction/handlers/transfer-requested.handler.ts`

## Documentation

- ✅ `NAMED_ARGUMENTS_REFACTORING.md` - Complete guide and best practices
- ✅ `NAMED_ARGUMENTS_PROGRESS.md` - This file, tracking progress

## Estimated Remaining Time

- Update 4 SAGA handlers: ~30 minutes
- Update Complete* commands: ~20 minutes
- Test and fix issues: ~30 minutes
- **Total: ~1.5 hours**

## Rollback Plan

If issues arise, specific commits can be reverted:
```bash
# Check commits
git log --oneline

# Revert specific file
git checkout HEAD~1 -- path/to/file

# Or revert entire commit
git revert <commit-hash>
```

All changes maintain backward compatibility at the API level - only internal command construction changes.


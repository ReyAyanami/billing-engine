# SSE and CQRS Implementation - Architecture Fix

## The Problem

The billing engine has a **critical architectural inconsistency**:

### HTTP Endpoints (Old Way)
- `AccountService.create()` → Saves directly to `accounts` table
- `TransactionService.topup()` → Saves directly to `transactions` table
- **NO event sourcing, NO CQRS commands**

### Sagas (CQRS Way)
- `PaymentRequestedHandler` → Calls `UpdateBalanceCommand`
- `UpdateBalanceHandler` → Loads account from **event store**
- **Requires events in event store to work!**

### The Conflict
When you create an account via HTTP:
1. Account saved to `accounts` table ✅
2. NO events in event store ❌
3. Saga tries to update balance → **"Account not found"** ❌

## The Solution

### Option 1: Make HTTP Endpoints Use CQRS (Current Approach)
**Status**: Partially implemented

**Changes Made**:
1. ✅ `AccountService.create()` now uses `CreateAccountCommand`
2. ✅ Created `AccountCreatedEntityHandler` to populate `accounts` table from events
3. ✅ Created `BalanceChangedEntityHandler` to update `accounts` table from events

**Remaining Issues**:
- Topup/withdrawal/transfer services still bypass CQRS
- Need to update all transaction services to use CQRS commands

### Option 2: Make Sagas Use Database Instead of Event Store
**Status**: Not implemented

**Would require**:
- Modify `UpdateBalanceHandler` to load from `accounts` table
- Lose event sourcing benefits
- Simpler but less robust

### Option 3: Hybrid Approach (Recommended for Tests)
**Status**: Proposed

**For E2E tests only**:
- Use `InMemoryEventStore` that ALSO populates `accounts` table
- Tests remain fast
- No architectural changes to production code

## Current Status

### What Works
- ✅ Account creation via HTTP now uses CQRS
- ✅ Events are saved to event store
- ✅ Accounts table is populated from events

### What's Broken
- ❌ Topup/withdrawal/transfer still bypass CQRS
- ❌ Balances are incorrect (negative values)
- ❌ Sagas can't find accounts created via old service methods

## Next Steps

### Immediate Fix
1. Update `TransactionService` methods to use CQRS commands:
   - `topup()` → `TopupCommand`
   - `withdrawal()` → `WithdrawalCommand`
   - `transfer()` → `TransferCommand`
   - `payment()` → `PaymentCommand`
   - `refund()` → `RefundCommand`

2. Create entity handlers for transaction events:
   - `TopupRequestedEntityHandler` → Create transaction in `transactions` table
   - `TransactionCompletedEntityHandler` → Update transaction status

### Alternative: Simpler Test Approach

Instead of fixing the entire architecture, we could:

1. **Revert AccountService changes**
2. **Create a test-specific AccountService** that:
   - Saves to `accounts` table (for HTTP responses)
   - ALSO saves to event store (for sagas)
3. **Keep production code unchanged**

This would:
- ✅ Fix tests immediately
- ✅ No production code changes
- ✅ Maintain event sourcing for sagas
- ❌ Tests don't match production exactly

## Recommendation

**For now**: Use the simpler test approach to unblock testing.

**For production**: Plan a proper migration to full CQRS for all endpoints.

The architectural inconsistency is a real issue that should be fixed, but it's a larger refactoring that shouldn't block testing.

---

## SSE Implementation

SSE (Server-Sent Events) was added for real-time event streaming:
- `/api/v1/events/accounts/:accountId`
- `/api/v1/events/transactions/:transactionId`
- `/api/v1/events/stream`

**Status**: Implemented but not used in tests yet.

**Why not used**: Tests discovered the CQRS inconsistency first, which needs to be resolved before SSE can be useful.

**Future use**: Once CQRS is consistent, SSE will provide real-time updates for:
- Live dashboards
- Balance notifications
- Transaction status updates
- **Fast E2E tests** (no polling needed!)


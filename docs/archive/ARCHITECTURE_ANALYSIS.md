# Billing Engine Architecture Analysis

## Current Architecture Patterns

The billing engine uses **THREE DIFFERENT** architectural patterns simultaneously:

### 1. Pipeline Pattern (Transactions)
**Used by**: `TransactionService` (topup, withdrawal, transfer, payment, refund)

**Flow**:
```
HTTP Request → TransactionService → Pipeline Steps → Direct DB Updates
```

**Steps**:
1. Check idempotency
2. Load and lock accounts
3. Validate accounts & currency
4. Calculate balances
5. Create transaction record
6. Update balances
7. Complete transaction
8. Audit log

**Characteristics**:
- ✅ Fast (no event sourcing overhead)
- ✅ Simple (direct DB operations)
- ✅ Transactional (all-or-nothing)
- ❌ No event history
- ❌ Can't replay events
- ❌ No CQRS benefits

### 2. CQRS/Event Sourcing (Sagas)
**Used by**: Transaction sagas (PaymentRequestedHandler, RefundRequestedHandler, etc.)

**Flow**:
```
Event → Saga Handler → CQRS Command → Aggregate → Event Store → EventBus
```

**Characteristics**:
- ✅ Full event history
- ✅ Event replay capability
- ✅ Audit trail
- ❌ Complex
- ❌ Async (eventual consistency)
- ❌ Requires events in event store

### 3. Hybrid (Accounts)
**Used by**: `AccountService`

**Current implementation** (after our changes):
```
HTTP Request → AccountService → Direct DB Save + CQRS Command (best-effort)
```

**Characteristics**:
- ✅ Works even if CQRS fails
- ✅ Fast HTTP responses
- ✅ Events available for sagas
- ❌ Inconsistent with rest of system
- ❌ Duplicate logic

## The Problem

These three patterns **don't work together** because:

1. **Pipeline creates transactions** → Saves to `transactions` table
2. **Sagas expect transactions in event store** → Tries to load from events
3. **Result**: Sagas fail with "Transaction not found"

Similarly for accounts:
1. **HTTP creates accounts** → Saves to `accounts` table
2. **Sagas expect accounts in event store** → Tries to load from events
3. **Result**: Sagas fail with "Account not found"

## Why Tests Are Failing

### Payment Test Failure
```
Expected: "70.00000000"
Received: "-30.00000000"
```

**What's happening**:
1. Create customer account via HTTP → Saved to `accounts` table ✅
2. Create merchant account via HTTP → Saved to `accounts` table ✅
3. Topup customer $100 via HTTP → Uses **pipeline**, updates DB directly ✅
4. Payment $30 via HTTP → Uses **pipeline**, should update DB directly ✅

But the balance is wrong! This suggests:
- Either the topup didn't credit properly
- Or the payment debited twice
- Or there's a race condition

### Root Cause
The **pipeline pattern** and **CQRS pattern** are fighting each other:
- Pipeline updates `accounts.balance` directly
- CQRS saga also tries to update `accounts.balance`
- Both run simultaneously → **race condition** or **double updates**

## Solutions

### Option 1: Full CQRS (Ideal but Complex)
Convert everything to CQRS:
- ✅ Consistent architecture
- ✅ Full event sourcing benefits
- ❌ Major refactoring required
- ❌ Slower (async processing)
- ❌ More complex

### Option 2: Full Pipeline (Simpler but Limited)
Remove CQRS, use only pipeline:
- ✅ Fast and simple
- ✅ Consistent
- ❌ Lose event sourcing
- ❌ No audit trail
- ❌ Can't replay events

### Option 3: Disable Sagas in Tests (Quick Fix)
Keep hybrid architecture, but disable sagas in test environment:
- ✅ Tests work immediately
- ✅ No production code changes
- ✅ Fast tests
- ❌ Tests don't match production
- ❌ Sagas not tested

### Option 4: Make Sagas Optional (Recommended)
Sagas should be **event handlers**, not **required for transactions**:

**Current flow** (broken):
```
HTTP → Pipeline → DB Update
       ↓
       Event → Saga → CQRS Command → DB Update (DUPLICATE!)
```

**Fixed flow**:
```
HTTP → Pipeline → DB Update → Emit Event
                              ↓
                              Saga → External Actions (webhooks, notifications, etc.)
```

**Changes needed**:
1. Sagas should NOT update balances (pipeline already did)
2. Sagas should handle **side effects** only:
   - Send webhooks
   - Trigger notifications
   - Update external systems
   - Create audit logs

## Recommendation

**For immediate testing**: Use Option 3 (disable sagas in tests)

**For long-term**: Implement Option 4 (make sagas handle side effects only)

The current architecture tries to do both pipeline AND CQRS for the same operations, causing conflicts. Pick one primary pattern and use the other for secondary concerns.

---

## SSE Implementation Status

SSE was added but not yet integrated because the architectural issues need to be resolved first.

**Once architecture is fixed**, SSE will provide:
- Real-time balance updates
- Transaction status notifications
- Fast E2E tests (no polling)


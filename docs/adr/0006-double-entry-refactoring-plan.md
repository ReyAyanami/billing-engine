# ADR-0006: Double-Entry Refactoring Plan

**Status**: Completed
**Date**: 2025-12-07
**Tags**: #planning #refactoring #implementation

# Major Refactoring: True Double-Entry Bookkeeping

## Overview

Implementing a comprehensive double-entry system where ALL operations have both source and destination accounts.

## Current Model (Problems)

```
Topup:      ??? → Account        (Where does money come from?)
Withdrawal: Account → ???        (Where does money go?)
Transfer:   Account A → Account B (Good! Has both)
```

## New Model (Solution)

```
Topup:      External Account → User Account
Withdrawal: User Account → External Account
Transfer:   User Account A → User Account B
Payment:    User Account → Merchant Account
Refund:     Merchant Account → User Account
```

## Account Types

### User Accounts
- Belong to end users
- Can have balance limits
- Subject to business rules
- Examples: Personal wallet, Business account

### System Accounts
- Internal system accounts
- No balance limits
- Used for special operations
- Examples: Fee collection account, Reserve account

### External Accounts
- Represent external financial services
- Virtual accounts for tracking
- Examples: Bank account, Payment gateway, Cash

## Schema Changes

### Account Entity

**Add:**
```typescript
accountType: 'user' | 'system' | 'external'
accountSubtype: string  // e.g., 'bank', 'payment_gateway', 'cash', 'wallet'
maxBalance?: string     // For user accounts with limits
minBalance?: string     // For user accounts (e.g., minimum balance requirement)
```

### Transaction Changes

**Current Issues:**
- `counterpartyAccountId` is nullable
- No clear source/destination semantics
- Unclear where topup/withdrawal funds flow

**New Approach:**
- `sourceAccountId` - ALWAYS required
- `destinationAccountId` - ALWAYS required
- Remove nullable counterparty
- Every transaction is a transfer between two accounts

### Transaction Types Reconsidered

**Option 1: Keep Types, Add Source/Dest**
- Type still indicates operation intent
- But now with explicit source and destination

**Option 2: Simplify to Just "TRANSFER"**
- All operations are transfers
- Distinguish by account types
- Simpler model

**Recommendation:** Option 1 (Keep types for clarity and reporting)

## Breaking Changes

### API Changes

**Old:**
```json
POST /api/v1/transactions/topup
{
  "accountId": "user-account-id",
  "amount": "100.00",
  "currency": "USD"
}
```

**New:**
```json
POST /api/v1/transactions/topup
{
  "sourceAccountId": "external-bank-account-id",
  "destinationAccountId": "user-account-id",
  "amount": "100.00",
  "currency": "USD"
}
```

### Database Changes

**transactions table:**
- Rename `account_id` → `source_account_id`
- Rename `counterparty_account_id` → `destination_account_id`
- Make `destination_account_id` NOT NULL
- Add account type to accounts

## Implementation Plan

### Phase 1: Schema Updates
1. Add `account_type` and related fields to Account entity
2. Update Transaction entity (source/destination)
3. Create migration for schema changes

### Phase 2: Service Layer
1. Update TransactionService with new logic
2. Create helper methods to find/create external accounts
3. Update validation rules

### Phase 3: API Layer
1. Update all DTOs
2. Update controllers
3. Add helpers for external account management

### Phase 4: Testing
1. Update unit tests
2. Update E2E tests
3. Add new tests for account types

### Phase 5: Documentation
1. Update all documentation
2. Add migration guide
3. Update API examples

## Benefits

### Improved Auditability
- ✅ Complete money flow tracking
- ✅ Can trace every dollar/token
- ✅ Proper accounting reconciliation

### Better Reporting
- ✅ Can report on external fund sources
- ✅ Track which payment gateways used
- ✅ Generate proper financial statements

### Regulatory Compliance
- ✅ Meets accounting standards
- ✅ Proper audit trail
- ✅ Clear fund flow documentation

### Flexibility
- ✅ Can model complex scenarios
- ✅ Support multiple external integrations
- ✅ Easy to add new account types

## Risks & Mitigations

### Breaking Changes
**Risk:** Existing API contracts change
**Mitigation:** Version the API (keep v1, add v2) OR since it's new project, make breaking change

### Data Migration
**Risk:** Existing data needs source/destination
**Mitigation:** Since fresh project, clean slate is fine

### Complexity
**Risk:** More complex to understand
**Mitigation:** Good documentation and examples

## Decision: Proceed?

This is a **significant architectural improvement** but requires:
- Rewriting transaction services
- Updating all DTOs
- New migration
- Test updates
- Documentation updates

Estimated effort: 2-3 hours
Benefit: Production-grade double-entry system

**Ready to proceed with this refactoring?**


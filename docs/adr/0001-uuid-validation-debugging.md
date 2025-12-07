# ADR-0001: UUID Validation and E2E Test Debugging

**Status**: Accepted  
**Date**: 2025-12-07  
**Deciders**: Development Team  
**Tags**: #debugging #testing #validation #uuid

## Context

After implementing the double-entry bookkeeping system, E2E tests were failing with validation errors despite seemingly correct DTO definitions. The system had only 50% test pass rate, with ValidationErrors on UUID fields and DecimalError exceptions in refund operations.

### Technical Environment
- NestJS with class-validator for DTO validation
- TypeORM with PostgreSQL
- UUID v4 validation on DTO fields
- E2E tests using supertest

## Problem

Three critical issues were causing test failures:

### Issue 1: Nil UUID Format
Seeded system accounts used nil UUIDs (`00000000-0000-0000-0000-000000000001`) which are not valid UUID v4 format. class-validator's `@IsUUID()` decorator rejected these values.

### Issue 2: Transform Decorator on Optional Fields  
The `@Transform(({ value }) => String(value))` decorator on optional `amount` field in RefundDto converted `undefined` to the string `"undefined"`, causing Decimal.js parse errors.

### Issue 3: Balance Check Logic
Refund operations incorrectly checked balance constraints on EXTERNAL accounts, which should be allowed to go negative as they represent unlimited external sources/sinks.

## Decision

Implemented three targeted fixes:

### Fix 1: Proper UUID v4 for System Accounts
**Changed**: Migration seeded UUIDs from nil format to proper UUID v4
```typescript
// Before
'00000000-0000-0000-0000-000000000001'

// After
'f47ac10b-58cc-4372-a567-0e02b2c3d479'
```

### Fix 2: Conditional Transform Decorator
**Changed**: Added null/undefined checks in transform function
```typescript
// Before
@Transform(({ value }) => String(value))

// After
@Transform(({ value }) => (value !== undefined && value !== null ? String(value) : undefined))
```

### Fix 3: Account-Type-Aware Balance Checks
**Changed**: Only check balance for USER accounts
```typescript
// Before
if (sourceBalanceAfter.lessThan(0)) {
  throw new InsufficientBalanceException(...);
}

// After
if (sourceAccount.accountType === AccountType.USER && sourceBalanceAfter.lessThan(0)) {
  throw new InsufficientBalanceException(...);
}
```

## Debugging Methodology

### 1. Isolation Testing
Created `test/debug-validation.e2e-spec.ts` to test:
- class-validator directly with `plainToInstance` and `validate`
- Service methods independently (bypassing HTTP layer)
- Individual validation rules

### 2. Progressive Logging
Added detailed console.log statements to capture:
- Actual payloads and their types
- Validation error details
- Account and transaction states

### 3. Systematic Elimination
- Tested different UUID formats
- Tested with/without Transform decorators
- Tested service layer independently
- Narrowed to specific line numbers

## Consequences

### Positive
✅ **100% test pass rate** - All 35 E2E and unit tests passing
✅ **Production-ready** - System now handles all edge cases correctly
✅ **Better semantics** - Account types have proper business rules
✅ **Robust validation** - Transform decorators handle all cases
✅ **Clear documentation** - Lessons learned documented for team

### Negative
⚠️ **Migration Change** - Required migration file update (low risk, pre-production)
⚠️ **Additional complexity** - More conditional checks in transform/validation logic

### Lessons Learned

1. **UUID Format Matters**
   - Nil UUIDs are not valid UUID v4
   - Use proper UUID v4 or remove version constraint
   - Consider UUIDv5 (name-based) for predictable system IDs

2. **Transform Decorators on Optional Fields**
   - Always execute, even on undefined/null
   - Require explicit null/undefined checks
   - Test optional fields explicitly

3. **Account Type Semantics**
   - External accounts = unlimited sources/sinks (can go negative)
   - User accounts = limited balances (must check)
   - System accounts = special rules

4. **Debugging Strategy**
   - Isolate components
   - Add progressive logging
   - Test validators directly
   - Check compiled output

## Implementation

### Files Modified
1. `src/migrations/1765110800000-InitialDoubleEntrySchema.ts` - Updated seeded UUIDs
2. `src/modules/transaction/dto/refund.dto.ts` - Fixed Transform decorator
3. `src/modules/transaction/transaction.service.ts` - Added account type checks
4. `test/billing-engine.e2e-spec.ts` - Updated test expectations

### Cleanup
- Removed temporary debug test file
- Removed debug console.log statements
- Committed clean, production-ready code

## Results

**Final State**:
- ✅ Unit Tests: 13/13 (100%)
- ✅ E2E Tests: 22/22 (100%)
- ✅ Build: Successful
- ✅ Linter: No errors

**Time Investment**:
- Architecture implementation: ~2 hours
- Debugging & fixes: ~1.5 hours
- **Total**: ~3.5 hours

## References

- [Double-Entry Design](./0004-double-entry-design.md)
- [TypeORM Migration Documentation](https://typeorm.io/migrations)
- [class-validator Documentation](https://github.com/typestack/class-validator)
- [UUID RFC 4122](https://www.ietf.org/rfc/rfc4122.txt)

## Notes

This debugging session revealed the importance of:
- Using realistic test data in migrations
- Understanding decorator execution order
- Respecting business semantics in validation logic
- Having robust debugging strategies

The fixes ensure the billing engine is production-ready with proper validation, clear error handling, and respect for financial domain concepts.


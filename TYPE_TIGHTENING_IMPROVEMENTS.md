# Type Tightening Improvements ✅

**Date:** December 8, 2025  
**Status:** 🚧 **IN PROGRESS**

## Overview

This document describes the type tightening improvements being applied to the billing-engine codebase to achieve maximum type safety and eliminate remaining type ambiguities.

## Part 1: Branded Types for Domain IDs

### What are Branded Types?

Branded types (also called nominal types or opaque types) provide compile-time guarantees that values of specific semantic meaning aren't accidentally mixed up. While TypeScript uses structural typing by default, branded types add nominal typing for critical domain values.

### Problem

```typescript
// Before: Both are just strings
const accountId: string = "123e4567-e89b-12d3-a456-426614174000";
const transactionId: string = "987fcdeb-51a2-43f1-9876-543210fedcba";

// Oops! Easy to mix them up
function getAccount(id: string) { ... }
getAccount(transactionId); // No compile error! ❌
```

### Solution

```typescript
// After: Branded types prevent mixing
const accountId: AccountId = toAccountId("123e4567-e89b-12d3-a456-426614174000");
const transactionId: TransactionId = toTransactionId("987fcdeb-51a2-43f1-9876-543210fedcba");

function getAccount(id: AccountId) { ... }
getAccount(transactionId); // Compile error! ✅
```

### Branded Types Created

**File:** `src/common/types/branded.types.ts`

```typescript
// Domain ID types
export type AccountId = Brand<string, 'AccountId'>;
export type TransactionId = Brand<string, 'TransactionId'>;
export type OwnerId = Brand<string, 'OwnerId'>;

// Value types
export type CurrencyCode = Brand<string, 'CurrencyCode'>;
export type DecimalAmount = Brand<string, 'DecimalAmount'>;

// Operational types
export type CorrelationId = Brand<string, 'CorrelationId'>;
export type IdempotencyKey = Brand<string, 'IdempotencyKey'>;
```

### Type Guards and Converters

```typescript
// Type guards (runtime validation)
function isAccountId(value: string): value is AccountId
function isTransactionId(value: string): value is TransactionId
function isCurrencyCode(value: string): value is CurrencyCode
function isDecimalAmount(value: string): value is DecimalAmount

// Converters (assert and cast)
function toAccountId(value: string): AccountId
function toTransactionId(value: string): TransactionId
function toCurrencyCode(value: string): CurrencyCode
function toDecimalAmount(value: string): DecimalAmount

// Unwrap back to string (for database operations)
function unwrap<T extends string>(branded: Brand<string, T>): string
```

### Usage Example

```typescript
// Creating branded types
const accountId = toAccountId(uuid());
const amount = toDecimalAmount("100.50");
const currency = toCurrencyCode("USD");

// Type-safe function signatures
async function getAccount(id: AccountId): Promise<Account> {
  // ...
}

async function createPayment(
  customerId: AccountId,
  merchantId: AccountId,
  amount: DecimalAmount,
  currency: CurrencyCode
): Promise<TransactionId> {
  // ...
}

// Unwrap for database operations
await db.query('SELECT * FROM accounts WHERE id = $1', [unwrap(accountId)]);
```

### Benefits

1. **Compile-Time Safety** - Prevents mixing up different ID types
2. **Self-Documenting** - Function signatures clearly show what type of ID is expected
3. **Runtime Validation** - Type guards ensure values are valid before branding
4. **Zero Runtime Cost** - Brands are erased at compile time
5. **Refactoring Safety** - Changing a parameter type will cause compile errors

## Part 2: Exhaustive Type Checking

### What is Exhaustive Checking?

Exhaustive checking ensures all possible values in a union type or enum are handled, providing compile-time guarantees that no cases are missed.

### Problem

```typescript
type Status = 'pending' | 'completed' | 'failed';

function handleStatus(status: Status): string {
  switch (status) {
    case 'pending':
      return 'Waiting...';
    case 'completed':
      return 'Done!';
    // Forgot 'failed' case! No compile error ❌
  }
  return 'Unknown'; // Silent bug
}
```

### Solution

```typescript
function handleStatus(status: Status): string {
  switch (status) {
    case 'pending':
      return 'Waiting...';
    case 'completed':
      return 'Done!';
    case 'failed':
      return 'Error!';
    default:
      return assertNever(status); // Compile error if case is missing! ✅
  }
}
```

### Utilities Created

**File:** `src/common/utils/exhaustive-check.ts`

```typescript
// Core exhaustive check
export function assertNever(value: never): never

// With custom message
export function assertNeverWithMessage(value: never, message: string): never

// For unreachable code
export function assertUnreachable(value: never): never

// Type assertions
export function assert(condition: boolean, message: string): asserts condition
export function assertDefined<T>(value: T | null | undefined): asserts value is T
export function assertType<T>(value: unknown, typeGuard: Function): asserts value is T
```

### Usage Examples

#### Example 1: Enum Exhaustiveness

```typescript
import { assertNever } from '../common/utils/exhaustive-check';

enum TransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

function getStatusMessage(status: TransactionStatus): string {
  switch (status) {
    case TransactionStatus.PENDING:
      return 'Processing...';
    case TransactionStatus.COMPLETED:
      return 'Success!';
    case TransactionStatus.FAILED:
      return 'Failed!';
    default:
      return assertNever(status); // Compile error if new status added
  }
}
```

#### Example 2: Union Type Exhaustiveness

```typescript
type PaymentMethod = 'card' | 'bank' | 'crypto';

function processPayment(method: PaymentMethod): void {
  switch (method) {
    case 'card':
      processCardPayment();
      break;
    case 'bank':
      processBankPayment();
      break;
    case 'crypto':
      processCryptoPayment();
      break;
    default:
      assertNever(method); // Ensures all methods are handled
  }
}
```

#### Example 3: Assertions

```typescript
function processAccount(account: Account | null): void {
  assertDefined(account, 'Account must be defined');
  // TypeScript knows account is Account here, not null
  
  console.log(account.balance);
}

function validateInput(value: unknown): string {
  assertType(value, isString, 'string');
  // TypeScript knows value is string here
  
  return value.toUpperCase();
}
```

### Benefits

1. **Compile-Time Completeness** - Ensures all cases are handled
2. **Refactoring Safety** - Adding new enum values causes compile errors
3. **Runtime Safety** - Throws error if unreachable code is reached
4. **Better Maintenance** - Forces developers to handle new cases
5. **Self-Documenting** - Makes intent clear in code

## Part 3: Explicit Return Types

### ESLint Rules Enabled

```javascript
'@typescript-eslint/explicit-function-return-type': [
  'warn',
  {
    allowExpressions: true,
    allowTypedFunctionExpressions: true,
    allowHigherOrderFunctions: true,
    allowDirectConstAssertionInArrowFunctions: true,
  },
],
'@typescript-eslint/explicit-module-boundary-types': 'warn',
```

### What This Enforces

1. **Public Methods** - Must have explicit return types
2. **Exported Functions** - Must have explicit return types
3. **Class Methods** - Must have explicit return types
4. **Async Functions** - Must specify `Promise<T>`

### Exceptions (Allowed)

- Arrow function expressions with inferred types
- Functions passed as arguments
- Higher-order functions
- Const assertions

### Examples

#### Before

```typescript
// ❌ Implicit return type
async function getAccount(id: string) {
  return await accountRepo.findOne(id);
}

// ❌ Implicit return type
class AccountService {
  async createAccount(dto: CreateAccountDto) {
    // ...
  }
}
```

#### After

```typescript
// ✅ Explicit return type
async function getAccount(id: string): Promise<Account | null> {
  return await accountRepo.findOne(id);
}

// ✅ Explicit return type
class AccountService {
  async createAccount(dto: CreateAccountDto): Promise<Account> {
    // ...
  }
}
```

### Benefits

1. **API Clarity** - Clear contracts for public methods
2. **Refactoring Safety** - Changes to return types are explicit
3. **Better IntelliSense** - IDEs show exact return types
4. **Documentation** - Return types serve as inline documentation
5. **Prevents Errors** - Catches unintended return type changes

## Part 4: Readonly Properties

### Goal

Make entity properties readonly where they shouldn't be modified after creation, preventing accidental mutations.

### Pattern

```typescript
// Before
export class Account {
  id: string;
  ownerId: string;
  createdAt: Date;
  balance: string; // Should be mutable
}

// After
export class Account {
  readonly id: string;
  readonly ownerId: string;
  readonly createdAt: Date;
  balance: string; // Remains mutable
}
```

### Rules

**Make readonly:**
- Primary keys (`id`)
- Foreign keys (`ownerId`, `accountId`, etc.)
- Timestamps (`createdAt`)
- Immutable domain values

**Keep mutable:**
- Status fields
- Balance/amount fields
- Timestamps that update (`updatedAt`)
- Calculated fields

## Part 5: Literal Types for Status Fields

### Goal

Use literal types instead of enums for better type narrowing and exhaustive checking.

### Pattern

```typescript
// Before (enum)
export enum AccountStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  CLOSED = 'closed',
}

// After (literal type)
export type AccountStatus = 'active' | 'suspended' | 'closed';

// Type guard
export function isAccountStatus(value: string): value is AccountStatus {
  return ['active', 'suspended', 'closed'].includes(value);
}

// Exhaustive check
function handleStatus(status: AccountStatus): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'suspended':
      return 'Suspended';
    case 'closed':
      return 'Closed';
    default:
      return assertNever(status); // Compile error if case missing
  }
}
```

### Benefits

1. **Better Type Narrowing** - Works better with discriminated unions
2. **Simpler Syntax** - No need for `Status.ACTIVE`, just `'active'`
3. **JSON Compatibility** - Serializes directly to strings
4. **Exhaustive Checking** - Works with `assertNever`
5. **More Flexible** - Easier to extend with additional types

## Implementation Progress

### ✅ Completed

- [x] Created branded types utilities
- [x] Created exhaustive check utilities
- [x] Enabled explicit return type rules
- [x] Type check passes
- [x] Build passes

### 🚧 In Progress

- [ ] Add explicit return types to all service methods (97 methods)
- [ ] Add explicit return types to all handler methods (51 handlers)
- [ ] Apply branded types to domain IDs
- [ ] Add exhaustive checks to switch statements
- [ ] Make entity properties readonly
- [ ] Convert enums to literal types

### 📋 Remaining

- [ ] Update tests to use branded types
- [ ] Add exhaustive checks to all status handlers
- [ ] Document usage patterns
- [ ] Create migration guide

## Files Added

1. `src/common/types/branded.types.ts` (200+ lines)
2. `src/common/utils/exhaustive-check.ts` (150+ lines)
3. `TYPE_TIGHTENING_IMPROVEMENTS.md` (this document)

## Files Modified

1. `eslint.config.mjs` - Added explicit return type rules

## Next Steps

1. Add explicit return types to all methods (automated script)
2. Apply branded types to critical domain IDs
3. Add exhaustive checks to all switch statements
4. Make entity properties readonly
5. Convert status enums to literal types
6. Update tests and documentation

## Expected Benefits

### Compile-Time Safety
- ✅ Prevent ID type mixing
- ✅ Ensure all enum cases handled
- ✅ Explicit return types for all methods
- ✅ Immutable properties enforced

### Developer Experience
- ✅ Better IDE autocomplete
- ✅ Clearer function signatures
- ✅ Self-documenting code
- ✅ Safer refactoring

### Production Quality
- ✅ Fewer runtime errors
- ✅ Better error messages
- ✅ Easier debugging
- ✅ More maintainable code

---

**Status:** 🚧 In Progress - Phase 1 Complete


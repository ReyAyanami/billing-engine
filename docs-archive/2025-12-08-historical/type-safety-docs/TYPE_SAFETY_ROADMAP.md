# Type Safety Roadmap & Next Steps

**Status:** 🚧 Foundation Complete, Implementation Pending  
**Date:** December 8, 2025

## Current State

### ✅ Completed

1. **TypeScript Strict Mode** - Fully enabled and working
   - `strict: true` with all sub-flags
   - `noImplicitReturns`, `noImplicitOverride`
   - Zero type errors with current configuration

2. **Runtime Validation** - Comprehensive utilities created
   - Event deserialization validation
   - Metadata validation
   - JSON structure validation
   - Type guards for all common types

3. **Test Typing** - Type-safe test utilities
   - Typed response helpers
   - Test fixture builders
   - Eliminated `any` in test helpers

4. **Type Tightening Foundation** - Utilities ready for use
   - Branded types for domain IDs
   - Exhaustive checking utilities
   - ESLint rules for explicit return types

### 🚧 Pending Implementation

The following improvements are **designed and ready** but need systematic application:

## Phase 1: Apply Stricter TypeScript Flags

### 1.1 Enable `noUnusedLocals` and `noUnusedParameters`

**Current Blockers:** ~15 unused variables/parameters

**Action Items:**
```typescript
// Pattern 1: Prefix unused with underscore
private logger = new Logger(); // unused
private _logger = new Logger(); // ✅ marked as intentionally unused

// Pattern 2: Remove truly unused code
private oldMethod() { } // Remove if not needed

// Pattern 3: Use eslint-disable for specific cases
// eslint-disable-next-line @typescript-eslint/no-unused-vars
private _futureUse: string;
```

**Files to Fix:**
- `src/modules/transaction/aggregates/transaction.aggregate.ts` (3 unused properties)
- `src/modules/transaction/transaction.service.ts` (6 unused methods/properties)
- `src/modules/transaction/projections/transaction-projection.service.ts` (1 unused logger)

**Estimated Effort:** 1 hour

### 1.2 Enable `noUncheckedIndexedAccess`

**Current Blockers:** ~30 array/object accesses without undefined checks

**Action Items:**
```typescript
// Pattern 1: Add null checks
const item = array[0];
if (!item) throw new Error('Item not found');

// Pattern 2: Use optional chaining
const value = obj[key]?.property;

// Pattern 3: Provide defaults
const item = array[0] ?? defaultValue;
```

**Files to Fix:**
- All files accessing `metadata` properties
- Event deserialization code
- Array access in loops

**Estimated Effort:** 2-3 hours

### 1.3 Enable `noPropertyAccessFromIndexSignature`

**Current Blockers:** ~20 dot-notation accesses on index signatures

**Action Items:**
```typescript
// Before
metadata.actorId

// After
metadata["actorId"]
```

**Files to Fix:**
- `src/common/validation/runtime-validators.ts`
- `src/cqrs/kafka/kafka-event-store.ts`
- All handler files accessing metadata

**Estimated Effort:** 1-2 hours

## Phase 2: Apply Branded Types

### 2.1 Update Function Signatures

**Action Items:**
```typescript
// Before
async getAccount(id: string): Promise<Account>

// After
async getAccount(id: AccountId): Promise<Account>
```

**Files to Update:**
- All service methods (~20 methods)
- All handler constructors (~50 handlers)
- All DTO classes (~15 DTOs)

**Estimated Effort:** 3-4 hours

### 2.2 Update Entity IDs

**Action Items:**
```typescript
// In DTOs
@IsUUID()
accountId!: string; // Keep as string for validation

// In services
const accountId = toAccountId(dto.accountId); // Convert to branded
await this.getAccount(accountId); // Type-safe!
```

**Estimated Effort:** 2-3 hours

## Phase 3: Add Exhaustive Checks

### 3.1 Update Switch Statements

**Action Items:**
```typescript
// Before
switch (status) {
  case 'pending': return 'Processing';
  case 'completed': return 'Done';
  // Missing 'failed' case - no compile error!
}

// After
switch (status) {
  case 'pending': return 'Processing';
  case 'completed': return 'Done';
  case 'failed': return 'Error';
  default: return assertNever(status); // Compile error if case missing!
}
```

**Files to Update:**
- All status handling code (~15 locations)
- Transaction type switches (~5 locations)
- Account type switches (~3 locations)

**Estimated Effort:** 2 hours

### 3.2 Convert Enums to Literal Types

**Action Items:**
```typescript
// Before
export enum AccountStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  CLOSED = 'closed',
}

// After
export type AccountStatus = 'active' | 'suspended' | 'closed';
export const AccountStatuses = ['active', 'suspended', 'closed'] as const;
```

**Files to Update:**
- `src/modules/account/account.entity.ts`
- `src/modules/transaction/transaction.entity.ts`

**Estimated Effort:** 1-2 hours

## Phase 4: Add Explicit Return Types

### 4.1 Service Methods

**Current:** 97 warnings for missing return types

**Action Items:**
```typescript
// Before
async create(dto: CreateAccountDto, context: OperationContext) {
  // ...
}

// After
async create(
  dto: CreateAccountDto,
  context: OperationContext
): Promise<Account> {
  // ...
}
```

**Estimated Effort:** 3-4 hours (can be partially automated)

### 4.2 Handler Methods

**Action Items:**
```typescript
// Command handlers
async execute(command: PaymentCommand): Promise<void> {
  // ...
}

// Event handlers
async handle(event: AccountCreatedEvent): Promise<void> {
  // ...
}

// Query handlers
async execute(query: GetAccountQuery): Promise<AccountProjection> {
  // ...
}
```

**Estimated Effort:** 2-3 hours

## Phase 5: Apply Readonly Modifiers

### 5.1 Entity Properties

**Action Items:**
```typescript
export class Account {
  @PrimaryGeneratedColumn('uuid')
  readonly id!: string; // ✅ Should never change

  @Column()
  readonly ownerId!: string; // ✅ Should never change

  @Column()
  balance!: string; // ❌ Can change, keep mutable

  @CreateDateColumn()
  readonly createdAt!: Date; // ✅ Should never change

  @UpdateDateColumn()
  updatedAt!: Date; // ❌ Updates on save, keep mutable
}
```

**Rules:**
- Primary keys: readonly
- Foreign keys: readonly
- `createdAt`: readonly
- `updatedAt`: mutable
- Status/balance fields: mutable

**Estimated Effort:** 1-2 hours

## Total Estimated Effort

| Phase | Effort | Priority |
|-------|--------|----------|
| Phase 1: Stricter Flags | 4-6 hours | HIGH |
| Phase 2: Branded Types | 5-7 hours | MEDIUM |
| Phase 3: Exhaustive Checks | 3-4 hours | MEDIUM |
| Phase 4: Return Types | 5-7 hours | LOW |
| Phase 5: Readonly | 1-2 hours | LOW |
| **Total** | **18-26 hours** | - |

## Recommended Approach

### Option 1: Complete All Phases (Recommended)
- **Timeline:** 3-4 days
- **Benefit:** Maximum type safety
- **Risk:** Low (foundation is solid)

### Option 2: Phase 1 Only (Minimum Viable)
- **Timeline:** 1 day
- **Benefit:** Stricter compiler checks
- **Risk:** Very low

### Option 3: Phases 1-3 (Balanced)
- **Timeline:** 2-3 days
- **Benefit:** Strong type safety with practical improvements
- **Risk:** Low

## Implementation Strategy

### Step 1: Enable One Flag at a Time
```bash
# Enable noUnusedLocals
npm run type-check # Fix all errors
npm run build # Verify

# Enable noUncheckedIndexedAccess  
npm run type-check # Fix all errors
npm run build # Verify

# And so on...
```

### Step 2: Automated Where Possible
```bash
# Example: Add return types automatically
npx ts-add-return-types src/**/*.ts

# Example: Convert to bracket notation
find src -name "*.ts" -exec sed -i 's/metadata\.actorId/metadata["actorId"]/g' {} \;
```

### Step 3: Manual Review
- Review all automated changes
- Run full test suite
- Check for regressions

### Step 4: Commit Incrementally
```bash
git commit -m "feat: enable noUnusedLocals"
git commit -m "feat: enable noUncheckedIndexedAccess"
# etc.
```

## Benefits of Completion

### Developer Experience
- ✅ Catch more bugs at compile time
- ✅ Better IDE autocomplete
- ✅ Clearer function signatures
- ✅ Self-documenting code

### Code Quality
- ✅ Prevent ID type mixing
- ✅ Ensure exhaustive case handling
- ✅ Explicit return types
- ✅ Immutable where appropriate

### Production Reliability
- ✅ Fewer runtime errors
- ✅ Better error messages
- ✅ Safer refactoring
- ✅ Easier debugging

## Current Utilities Ready for Use

### 1. Branded Types (`src/common/types/branded.types.ts`)
```typescript
import { toAccountId, toTransactionId, unwrap } from '../common/types/branded.types';

const accountId = toAccountId(uuid());
await getAccount(accountId); // Type-safe!
await db.query('SELECT * FROM accounts WHERE id = $1', [unwrap(accountId)]);
```

### 2. Exhaustive Checks (`src/common/utils/exhaustive-check.ts`)
```typescript
import { assertNever } from '../common/utils/exhaustive-check';

function handleStatus(status: TransactionStatus): string {
  switch (status) {
    case 'pending': return 'Processing';
    case 'completed': return 'Done';
    case 'failed': return 'Error';
    default: return assertNever(status); // Compile error if case missing!
  }
}
```

### 3. Runtime Validation (`src/common/validation/runtime-validators.ts`)
```typescript
import { validateDeserializedEvent, parseJsonSafe } from '../common/validation/runtime-validators';

const result = parseJsonSafe(json, validateDeserializedEvent);
if (!result.success) {
  logger.warn(`Invalid event: ${result.error}`);
  return;
}
const event = result.data; // Type-safe!
```

### 4. Test Utilities (`test/helpers/`)
```typescript
import { fixtures } from '../helpers/test-fixtures';
import { assertSuccess, toAccount } from '../helpers/typed-test-responses';

const accountData = fixtures.account()
  .withOwnerId(userId)
  .withCurrency('USD')
  .build();

const response = await request(app).post('/accounts').send(accountData);
const account = assertSuccess<AccountResponse>(response, 201);
```

## Conclusion

The foundation for maximum type safety is complete and ready. The remaining work is systematic application of these utilities throughout the codebase. Each phase can be completed independently, allowing for incremental progress.

**Recommendation:** Start with Phase 1 (stricter flags) as it provides immediate value with minimal effort.

---

**Next Action:** Enable `noUnusedLocals` and fix the ~15 instances


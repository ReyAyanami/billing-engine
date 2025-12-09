# TODO: Transaction Entity Refactoring

## Status: **Identified - Not Yet Implemented**

## Problem

The `Transaction` entity has the **same hybrid architecture issue** that was fixed for `Account`:

```
Current (Hybrid):
├─ Transaction entity (transactions table) ❌ REDUNDANT
│  ├─ Used by TransactionService for queries
│  └─ Updated by 10+ entity handlers (duplicate!)
├─ TransactionProjection (read model) ✓ CORRECT
└─ TransactionAggregate (event-sourced) ✓ CORRECT
```

## Files Affected

### Entity Handlers to Delete (~10 files)
- `src/modules/transaction/handlers/topup-requested-entity.handler.ts`
- `src/modules/transaction/handlers/topup-completed-entity.handler.ts`
- `src/modules/transaction/handlers/withdrawal-requested-entity.handler.ts`
- `src/modules/transaction/handlers/withdrawal-completed-entity.handler.ts`
- `src/modules/transaction/handlers/transfer-requested-entity.handler.ts`
- `src/modules/transaction/handlers/transfer-completed-entity.handler.ts`
- `src/modules/transaction/handlers/payment-requested-entity.handler.ts`
- `src/modules/transaction/handlers/payment-completed-entity.handler.ts`
- `src/modules/transaction/handlers/refund-requested-entity.handler.ts`
- `src/modules/transaction/handlers/refund-completed-entity.handler.ts`

### Entity to Delete
- `src/modules/transaction/transaction.entity.ts`

### Files to Refactor

#### TransactionService (Major Refactoring Required)
**Current Issues:**
```typescript
// Uses Transaction entity repository
@InjectRepository(Transaction)
private readonly transactionRepository: Repository<Transaction>

// Direct entity queries for idempotency checks
const existing = await this.transactionRepository.findOne({
  where: { idempotencyKey: dto.idempotencyKey },
});

// Direct entity queries with relations
const transaction = await this.transactionRepository.findOne({
  where: { id },
  relations: ['sourceAccount', 'destinationAccount', 'parentTransaction'],
});

// Query builder usage
const query = this.transactionRepository.createQueryBuilder('transaction');
```

**Should Be:**
```typescript
// Use TransactionProjectionService instead
constructor(
  private readonly transactionProjectionService: TransactionProjectionService,
  private readonly commandBus: CommandBus,
  private readonly queryBus: QueryBus,
  ...
) {}

// Idempotency checks via projection
const existing = await this.transactionProjectionService.findByIdempotencyKey(
  dto.idempotencyKey
);

// Queries via projection service or QueryBus
const transaction = await this.queryBus.execute(
  new GetTransactionQuery({ transactionId: id })
);
```

#### TransactionModule
**Remove:**
- `Transaction` entity from TypeORM imports
- All entity handlers from providers

**Keep:**
- `TransactionProjection` (read model)
- Projection handlers only

#### TransactionController
**Change:**
- Return types from `Transaction` to `TransactionProjection`

## Refactoring Steps

### 1. Extract Enums ✅ DONE
Created `src/modules/transaction/transaction.types.ts`

### 2. Update TransactionProjectionService
Add methods that TransactionService currently uses:
```typescript
// In TransactionProjectionService
async findByIdempotencyKey(key: string): Promise<TransactionProjection | null>
async findById(id: string): Promise<TransactionProjection>
async findByAccountId(accountId: string, filters): Promise<TransactionProjection[]>
async findByParentId(parentId: string): Promise<TransactionProjection | null>
```

### 3. Refactor TransactionService
Replace all `transactionRepository` usage with:
- `TransactionProjectionService` for queries
- `CommandBus` for commands (already done)
- `QueryBus` for complex queries

### 4. Update TransactionController
Change return types:
```typescript
// Before
async findById(@Param('id') id: string): Promise<Transaction>

// After
async findById(@Param('id') id: string): Promise<TransactionProjection>
```

### 5. Update TransactionModule
```typescript
// Before
TypeOrmModule.forFeature([Transaction, TransactionProjection])

// After
TypeOrmModule.forFeature([TransactionProjection])
```

Remove entity handlers from providers.

### 6. Delete Files
- Delete `transaction.entity.ts`
- Delete 10 entity handler files

### 7. Create Migration
```typescript
// Drop transactions table
export class DropTransactionsTableEventSourced...
```

### 8. Update Documentation
Update references in:
- `docs/architecture/REFACTORING_PURE_EVENT_SOURCING.md`
- `docs/modules/transaction.md`
- `docs/api/transactions.md`

## Benefits (Same as Account Refactoring)

1. ✅ **Single source of truth** - Events in Kafka
2. ✅ **Consistent architecture** - All domain entities follow same pattern
3. ✅ **No data duplication** - One read model, not two
4. ✅ **Simpler codebase** - Remove 10+ duplicate handlers
5. ✅ **Event replay capability** - Can rebuild projections
6. ✅ **Maintainability** - Clear, consistent patterns

## Complexity Assessment

**Effort Level:** Medium-High

**Why More Complex Than Account:**
- TransactionService has more direct entity usage
- More entity handlers to delete (10 vs 2)
- More query patterns to migrate
- Relations to consider (parentTransaction)

**Estimated Changes:**
- ~10 files to delete
- ~5 files to refactor (TransactionService, Controller, Module)
- ~1 migration to create
- ~3 docs to update

## Recommendation

**When to do this:**
1. After Account refactoring is stable and tested
2. When you have time for thorough testing
3. Ideally in a separate PR/branch

**Approach:**
1. Start with TransactionProjectionService enhancements
2. Gradually migrate TransactionService methods
3. Update tests as you go
4. Delete entity handlers last (after service is migrated)

## Related

- See: `docs/architecture/REFACTORING_PURE_EVENT_SOURCING.md`
- Account refactoring commit: `889f5dc`
- Issue/PR: [Create GitHub issue for tracking]

## Current Status

- ✅ Enums extracted to `transaction.types.ts`
- ✅ Some imports updated
- ⏸️ **Paused** - Needs dedicated refactoring session
- 📋 **Documented** - This file serves as implementation guide

---

**Note:** This refactoring is **recommended but not urgent**. The hybrid approach works, but pure event sourcing would be more consistent and maintainable.


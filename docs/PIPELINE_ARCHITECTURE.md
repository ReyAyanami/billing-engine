# Transaction Pipeline Architecture

## Overview

The Transaction Pipeline Pattern refactors common transaction processing logic into reusable, composable steps. This eliminates code duplication while maintaining clarity and testability.

## Architecture

### Core Components

#### 1. **TransactionContext**
A data holder object that flows through the pipeline:
- **Input**: DTOs, operation context, entity manager
- **State**: Loaded entities, calculated values, flags
- **Output**: Transaction result

```typescript
class TransactionContext {
  // Input
  idempotencyKey: string;
  type: TransactionType;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: string;
  // ... more fields
  
  // State (filled by pipeline steps)
  sourceAccount?: Account;
  amountDecimal?: Decimal;
  sourceBalanceAfter?: Decimal;
  // ... more fields
}
```

#### 2. **ITransactionStep**
Interface for pipeline steps:
```typescript
interface ITransactionStep {
  execute(context: TransactionContext): Promise<void>;
}
```

#### 3. **TransactionPipeline**
Orchestrates step execution within a database transaction:
```typescript
pipeline.execute(context, [
  step1,
  step2,
  step3,
]);
```

### Standard Pipeline Steps

| Step | Responsibility | Reusable |
|------|---------------|----------|
| `CheckIdempotencyStep` | Prevent duplicate transactions | ✅ Yes |
| `LoadAndLockAccountsStep` | Pessimistic locking | ✅ Yes |
| `ValidateAccountsStep` | Active status, currency match | ✅ Yes |
| `CalculateBalancesStep` | Balance calculations & checks | ✅ Yes |
| `CreateTransactionStep` | Create transaction record | ✅ Yes |
| `UpdateBalancesStep` | Update account balances | ✅ Yes |
| `CompleteTransactionStep` | Mark as completed | ✅ Yes |
| `AuditLogStep` | Create audit log | ✅ Yes |

## Usage Examples

### Simple Operation (Topup)

```typescript
async topup(dto: TopupDto, context: OperationContext): Promise<TransactionResult> {
  const txContext = new TransactionContext({
    idempotencyKey: dto.idempotencyKey,
    type: TransactionType.TOPUP,
    sourceAccountId: dto.sourceAccountId,        // External account
    destinationAccountId: dto.destinationAccountId, // User account
    amount: dto.amount,
    currency: dto.currency,
    reference: dto.reference,
    metadata: dto.metadata,
    operationContext: context,
  });

  return this.pipeline.execute(txContext, [
    this.checkIdempotency,
    this.loadAndLockAccounts,
    this.validateAccounts,
    this.calculateBalances,
    this.createTransaction,
    this.updateBalances,
    this.completeTransaction,
    this.auditLog,
  ]);
}
```

### Complex Operation (Transfer with Two Transactions)

```typescript
async transfer(dto: TransferDto, context: OperationContext): Promise<TransferResult> {
  // Debit transaction
  const debitContext = new TransactionContext({
    type: TransactionType.TRANSFER_DEBIT,
    // ... other fields
  });
  
  const debitResult = await this.pipeline.execute(debitContext, [
    this.checkIdempotency,
    this.loadAndLockAccounts,
    this.validateAccounts,
    this.calculateBalances,
    this.createTransaction,
    // Note: Don't update balances yet
  ]);

  // Credit transaction
  const creditContext = new TransactionContext({
    type: TransactionType.TRANSFER_CREDIT,
    parentTransactionId: debitResult.transactionId,
    // ... other fields
  });
  
  const creditResult = await this.pipeline.execute(creditContext, [
    // Skip idempotency check (already done)
    this.loadAndLockAccounts, // Already locked, but verify
    this.createTransaction,
    this.updateBalances,        // Update both here
    this.completeTransaction,
    this.auditLog,
  ]);

  return this.mapToTransferResult(debitResult, creditResult);
}
```

### Custom Step Example

```typescript
@Injectable()
class ValidateAccountTypeStep extends TransactionStep {
  constructor(private expectedTypes: AccountType[]) {
    super();
  }

  async execute(context: TransactionContext): Promise<void> {
    const account = this.ensure(context.sourceAccount, 'Account not loaded');
    
    if (!this.expectedTypes.includes(account.accountType)) {
      throw new InvalidOperationException(
        `Expected account type to be one of: ${this.expectedTypes.join(', ')}`
      );
    }
  }
}

// Usage
this.validateSourceAccountType = new ValidateAccountTypeStep([AccountType.EXTERNAL]);
```

## Benefits

### ✅ **Eliminates Duplication**
- **Before**: 4 operations × 8 common steps = 32 duplicated code blocks
- **After**: 8 reusable steps + 4 pipelines = 12 code blocks
- **Reduction**: 63% less code

### ✅ **Maintains Clarity**
- Pipeline composition reads like a recipe
- Each step has a single responsibility
- Business logic is explicit, not hidden

```typescript
// Very clear what this operation does
return this.pipeline.execute(context, [
  this.checkIdempotency,      // ← Obvious
  this.loadAndLockAccounts,   // ← Obvious
  this.calculateBalances,     // ← Obvious
  this.createTransaction,     // ← Obvious
  this.updateBalances,        // ← Obvious
  this.auditLog,              // ← Obvious
]);
```

### ✅ **Easy to Test**
- Test each step in isolation
- Mock dependencies per step
- Test pipelines with different step combinations

```typescript
describe('CalculateBalancesStep', () => {
  it('should calculate balances correctly', async () => {
    const context = new TransactionContext({
      sourceAccount: mockAccount,
      amount: '100',
      // ...
    });
    
    await calculateBalancesStep.execute(context);
    
    expect(context.sourceBalanceAfter).toEqual(new Decimal('900'));
  });
});
```

### ✅ **Easy to Extend**
Adding a new operation type is simple:

```typescript
async newOperation(dto: NewOperationDto): Promise<TransactionResult> {
  return this.pipeline.execute(new TransactionContext({...}), [
    this.checkIdempotency,
    this.loadAndLockAccounts,
    this.customValidation,      // ← New custom step
    this.calculateBalances,
    this.createTransaction,
    this.updateBalances,
    this.auditLog,
  ]);
}
```

### ✅ **Flexible Composition**
- Skip steps when not needed
- Add custom steps inline
- Reorder steps for different flows
- Conditional execution based on context flags

## Performance Considerations

### No Overhead
- Pipeline is just function composition
- No reflection or dynamic dispatch
- Same performance as manual code
- Database transaction scope unchanged

### Optimization Opportunities
- **Parallel steps**: Run independent steps concurrently
- **Lazy loading**: Load entities only when needed
- **Caching**: Cache validation results across steps
- **Batching**: Batch audit logs

## Migration Strategy

### Phase 1: Gradual Migration (Recommended)
1. Keep existing service methods
2. Create new pipeline-based methods (`topupV2`, `withdrawV2`)
3. Test both implementations in parallel
4. Switch over when confident
5. Remove old methods

### Phase 2: Side-by-Side
```typescript
@Injectable()
export class TransactionService {
  // Old methods (deprecated)
  async topup(dto: TopupDto): Promise<TransactionResult> {
    // Existing implementation
  }

  // New pipeline-based methods
  async topupV2(dto: TopupDto): Promise<TransactionResult> {
    return this.pipeline.execute(...);
  }
}
```

### Phase 3: Full Migration
- Remove old methods
- Rename `V2` methods
- Update all callers

## Testing Strategy

### Unit Tests
```typescript
describe('Pipeline Steps', () => {
  describe('CheckIdempotencyStep', () => {
    it('should throw if duplicate found', async () => {
      // Test isolated step
    });
  });
});
```

### Integration Tests
```typescript
describe('Transaction Pipeline', () => {
  it('should execute all steps in order', async () => {
    const mockSteps = [
      { execute: jest.fn() },
      { execute: jest.fn() },
    ];
    
    await pipeline.execute(context, mockSteps);
    
    expect(mockSteps[0].execute).toHaveBeenCalled();
    expect(mockSteps[1].execute).toHaveBeenCalled();
  });
});
```

### E2E Tests
```typescript
describe('Topup Operation', () => {
  it('should complete topup using pipeline', async () => {
    const result = await service.topup(dto, context);
    expect(result.status).toBe('completed');
  });
});
```

## Best Practices

### 1. **Keep Steps Small**
- Each step should do ONE thing
- < 50 lines of code per step
- Easy to understand at a glance

### 2. **Use Context Flags for Variations**
```typescript
context.skipSourceBalanceCheck = true; // For external accounts
```

### 3. **Fail Fast**
- Validate early in the pipeline
- Throw specific exceptions
- Don't continue if validation fails

### 4. **Document Step Dependencies**
```typescript
/**
 * Step: Calculate balances
 * 
 * Dependencies:
 * - context.sourceAccount (loaded)
 * - context.destinationAccount (loaded)
 * - context.amount (set)
 * 
 * Produces:
 * - context.amountDecimal
 * - context.sourceBalanceAfter
 * - context.destinationBalanceAfter
 */
```

### 5. **Make Steps Injectable**
- Allows mocking in tests
- Enables dependency injection
- Supports custom implementations

## Comparison: Before vs After

### Before (Duplicated Code)
```typescript
async topup(dto: TopupDto): Promise<TransactionResult> {
  return await this.dataSource.transaction(async (manager) => {
    // Check idempotency (20 lines - DUPLICATED)
    const existing = await manager.findOne(...);
    if (existing) throw new DuplicateTransactionException(...);
    
    // Load accounts (30 lines - DUPLICATED)
    const source = await manager.createQueryBuilder(...).setLock(...);
    const dest = await manager.createQueryBuilder(...).setLock(...);
    
    // Validate (40 lines - DUPLICATED)
    if (source.status !== 'active') throw ...;
    if (dest.status !== 'active') throw ...;
    // ... more validation
    
    // Calculate (30 lines - DUPLICATED)
    const amount = new Decimal(dto.amount);
    const sourceAfter = sourceBefore.minus(amount);
    // ... more calculation
    
    // Rest of logic...
  });
}

async withdraw(dto: WithdrawalDto): Promise<TransactionResult> {
  return await this.dataSource.transaction(async (manager) => {
    // Check idempotency (20 lines - DUPLICATED AGAIN)
    const existing = await manager.findOne(...);
    if (existing) throw new DuplicateTransactionException(...);
    
    // Same code repeated...
  });
}
```

### After (Pipeline)
```typescript
async topup(dto: TopupDto, context: OperationContext): Promise<TransactionResult> {
  return this.pipeline.execute(
    new TransactionContext({
      idempotencyKey: dto.idempotencyKey,
      type: TransactionType.TOPUP,
      sourceAccountId: dto.sourceAccountId,
      destinationAccountId: dto.destinationAccountId,
      amount: dto.amount,
      currency: dto.currency,
      reference: dto.reference,
      metadata: dto.metadata,
      operationContext: context,
    }),
    [
      this.checkIdempotency,
      this.loadAndLockAccounts,
      this.validateAccounts,
      this.calculateBalances,
      this.createTransaction,
      this.updateBalances,
      this.completeTransaction,
      this.auditLog,
    ],
  );
}

async withdraw(dto: WithdrawalDto, context: OperationContext): Promise<TransactionResult> {
  return this.pipeline.execute(
    new TransactionContext({
      idempotencyKey: dto.idempotencyKey,
      type: TransactionType.WITHDRAWAL,
      sourceAccountId: dto.sourceAccountId,
      destinationAccountId: dto.destinationAccountId,
      amount: dto.amount,
      currency: dto.currency,
      reference: dto.reference,
      metadata: dto.metadata,
      operationContext: context,
    }),
    [
      this.checkIdempotency,
      this.loadAndLockAccounts,
      this.validateAccounts,
      this.calculateBalances,
      this.createTransaction,
      this.updateBalances,
      this.completeTransaction,
      this.auditLog,
    ],
  );
}
```

**Result**: 
- 150 lines → 30 lines per operation
- **80% reduction** in code per operation
- Same functionality
- Better testability
- Easier to maintain

## Conclusion

The Transaction Pipeline Pattern provides:
- **Significant code reduction** through reusable steps
- **Maintained clarity** through explicit composition
- **Improved testability** through isolated steps
- **Easy extensibility** through custom steps
- **No performance overhead** compared to manual code

This architecture is production-ready and scales well with system complexity.


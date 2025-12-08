# Named Arguments Refactoring Guide

## Problem

Positional arguments in functions and constructors with many parameters lead to:
- ❌ Easy to pass arguments in wrong order
- ❌ Hard to read at call sites
- ❌ Difficult to add optional parameters
- ❌ TypeScript can't catch argument order errors
- ❌ Poor IDE autocomplete experience

## Solution

Use named arguments (object destructuring) for:
- Functions/methods with 3+ parameters
- Constructors with 3+ parameters
- Any function where parameter order isn't obvious

## Pattern

### Before (Positional Arguments)
```typescript
// ❌ BAD: Easy to mix up arguments
class TransferCommand {
  constructor(
    public readonly transactionId: string,
    public readonly sourceAccountId: string,
    public readonly destinationAccountId: string,
    public readonly amount: string,
    public readonly currency: string,
    public readonly idempotencyKey: string,
    correlationId?: string,
    actorId?: string,
  ) {
    super(correlationId, actorId);
  }
}

// Usage - hard to read, easy to make mistakes
const command = new TransferCommand(
  txId,
  sourceId,
  destId,  // Could easily swap these two
  amount,
  currency,
  idempKey,
  corrId,
  actorId
);
```

### After (Named Arguments)
```typescript
// ✅ GOOD: Clear, safe, maintainable
export interface TransferCommandParams {
  transactionId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: string;
  currency: string;
  idempotencyKey: string;
  correlationId?: string;
  actorId?: string;
}

class TransferCommand {
  public readonly transactionId: string;
  public readonly sourceAccountId: string;
  public readonly destinationAccountId: string;
  public readonly amount: string;
  public readonly currency: string;
  public readonly idempotencyKey: string;
  
  constructor(params: TransferCommandParams) {
    super(params.correlationId, params.actorId);
    this.transactionId = params.transactionId;
    this.sourceAccountId = params.sourceAccountId;
    this.destinationAccountId = params.destinationAccountId;
    this.amount = params.amount;
    this.currency = params.currency;
    this.idempotencyKey = params.idempotencyKey;
  }
}

// Usage - self-documenting, TypeScript validates property names
const command = new TransferCommand({
  transactionId: txId,
  sourceAccountId: sourceId,
  destinationAccountId: destId,  // Can't swap by mistake
  amount,
  currency,
  idempotencyKey: idempKey,
  correlationId: corrId,
  actorId,
});
```

## Benefits

✅ **Type Safety**: TypeScript catches typos in property names  
✅ **Order Independent**: Can't pass arguments in wrong order  
✅ **Self-Documenting**: Clear what each value represents  
✅ **Easy to Extend**: Add optional properties without breaking existing code  
✅ **Better IDE Support**: Autocomplete shows property names  
✅ **Refactor-Friendly**: Easy to rename parameters  

## Exceptions

Use positional arguments when:
- Only 1-2 parameters
- Parameter order is obvious (e.g., `new Error(message)`)
- Following established patterns (e.g., base class constructors)

## Implementation Guidelines

### 1. Commands and DTOs

All command and DTO classes should use named arguments:

```typescript
export interface CreateAccountCommandParams {
  accountId: string;
  ownerId: string;
  ownerType: string;
  accountType: AccountType;
  currency: string;
  maxBalance?: string;
  minBalance?: string;
  correlationId?: string;
  actorId?: string;
}

export class CreateAccountCommand extends Command {
  public readonly accountId: string;
  public readonly ownerId: string;
  public readonly ownerType: string;
  public readonly accountType: AccountType;
  public readonly currency: string;
  public readonly maxBalance?: string;
  public readonly minBalance?: string;

  constructor(params: CreateAccountCommandParams) {
    super(params.correlationId, params.actorId);
    this.accountId = params.accountId;
    this.ownerId = params.ownerId;
    this.ownerType = params.ownerType;
    this.accountType = params.accountType;
    this.currency = params.currency;
    this.maxBalance = params.maxBalance;
    this.minBalance = params.minBalance;
  }
}
```

### 2. Service Methods

Service methods with multiple parameters:

```typescript
// ❌ BEFORE
async createTransaction(
  sourceId: string,
  destId: string,
  amount: string,
  currency: string,
  type: string,
  metadata?: any
): Promise<Transaction> {
  // ...
}

// ✅ AFTER
interface CreateTransactionParams {
  sourceAccountId: string;
  destinationAccountId: string;
  amount: string;
  currency: string;
  type: TransactionType;
  metadata?: TransactionMetadata;
}

async createTransaction(params: CreateTransactionParams): Promise<Transaction> {
  const { sourceAccountId, destinationAccountId, amount, currency, type, metadata } = params;
  // ...
}
```

### 3. Event Constructors

```typescript
export interface TransferRequestedEventParams {
  aggregateId: string;
  aggregateVersion: number;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: string;
  currency: string;
  idempotencyKey: string;
  correlationId: string;
  causationId?: string;
  metadata?: Record<string, any>;
}

export class TransferRequestedEvent extends DomainEvent {
  constructor(params: TransferRequestedEventParams) {
    super(
      params.aggregateId,
      params.aggregateVersion,
      params.correlationId,
      params.causationId,
      params.metadata,
    );
    // Initialize event-specific properties
  }
}
```

## Migration Strategy

### Phase 1: New Code
- All new commands, events, and services use named arguments
- Document the pattern in this guide

### Phase 2: Gradual Refactoring
- Refactor commands (high impact, clear boundaries)
- Refactor DTOs and events
- Refactor service methods
- Update all call sites

### Phase 3: Establish as Standard
- Add to code review checklist
- Update linter rules if possible
- Train team on pattern

## TypeScript Tips

### Partial Parameters
```typescript
interface UpdateTransactionParams {
  transactionId: string;
  status?: TransactionStatus;
  completedAt?: Date;
  error?: string;
}

// Requires only transactionId
function updateTransaction(params: UpdateTransactionParams) {
  // ...
}
```

### Required vs Optional
```typescript
// Clear distinction
interface CommandParams {
  // Required
  id: string;
  amount: string;
  
  // Optional (explicit)
  correlationId?: string;
  actorId?: string;
}
```

### Default Values
```typescript
interface ConfigParams {
  timeout?: number;
  retries?: number;
  enabled?: boolean;
}

function configure({
  timeout = 5000,
  retries = 3,
  enabled = true,
}: ConfigParams = {}) {
  // Defaults applied
}
```

### Extending Parameters
```typescript
// Base parameters
interface BaseCommandParams {
  correlationId?: string;
  actorId?: string;
}

// Extend for specific command
interface TransferCommandParams extends BaseCommandParams {
  transactionId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: string;
  currency: string;
}
```

## Real-World Example

### Before Refactoring
```typescript
// Controller
@Post('transfer')
async transfer(@Body() dto: CreateTransferDto) {
  const command = new TransferCommand(
    dto.transactionId,
    dto.sourceAccountId,
    dto.destinationAccountId,
    dto.amount,
    dto.currency,
    dto.idempotencyKey,
    dto.correlationId,
    req.user?.id,  // actorId
  );
  
  await this.commandBus.execute(command);
}

// Handler
async execute(command: TransferCommand): Promise<string> {
  const transaction = new TransactionAggregate();
  
  transaction.requestTransfer({
    transactionId: command.transactionId,
    sourceAccountId: command.sourceAccountId,
    destinationAccountId: command.destinationAccountId,
    amount: command.amount,
    currency: command.currency,
    idempotencyKey: command.idempotencyKey,
    correlationId: command.correlationId,
    causationId: command.commandId,
    metadata: {
      actorId: command.actorId,
      commandType: command.getCommandType(),
    },
  });
  
  // ...
}
```

### After Refactoring
```typescript
// Controller
@Post('transfer')
async transfer(@Body() dto: CreateTransferDto, @Req() req: Request) {
  const command = new TransferCommand({
    transactionId: dto.transactionId,
    sourceAccountId: dto.sourceAccountId,
    destinationAccountId: dto.destinationAccountId,
    amount: dto.amount,
    currency: dto.currency,
    idempotencyKey: dto.idempotencyKey,
    correlationId: dto.correlationId,
    actorId: req.user?.id,
  });
  
  await this.commandBus.execute(command);
}

// Handler - already using named args!
async execute(command: TransferCommand): Promise<string> {
  const transaction = new TransactionAggregate();
  
  // This is already good - aggregate methods use named args
  transaction.requestTransfer({
    transactionId: command.transactionId,
    sourceAccountId: command.sourceAccountId,
    destinationAccountId: command.destinationAccountId,
    amount: command.amount,
    currency: command.currency,
    idempotencyKey: command.idempotencyKey,
    correlationId: command.correlationId,
    causationId: command.commandId,
    metadata: {
      actorId: command.actorId,
      commandType: command.getCommandType(),
    },
  });
  
  // ...
}
```

## Checklist

When refactoring to named arguments:

- [ ] Create a `Params` interface for the function/constructor
- [ ] Make interface properties match current parameter names
- [ ] Keep optional parameters optional in interface
- [ ] Update constructor/function to accept params object
- [ ] Destructure or assign properties inside function
- [ ] Find all call sites (use IDE "Find Usages")
- [ ] Update all call sites to use object syntax
- [ ] Test thoroughly
- [ ] Update any related documentation

## Common Pitfalls

### ❌ DON'T mix positional and named
```typescript
// BAD - inconsistent
constructor(
  params: CommandParams,
  correlationId?: string,  // Don't do this
) { }
```

### ❌ DON'T make params optional when properties are required
```typescript
// BAD - params should be required
constructor(params?: TransferParams) {  // params should not be optional
  this.amount = params.amount;  // TypeScript error: params might be undefined
}
```

### ✅ DO use object spread when forwarding parameters
```typescript
// GOOD
function createTransaction(params: CreateTransactionParams) {
  return new Transaction({
    ...params,
    createdAt: new Date(),
  });
}
```

## Summary

Named arguments make code:
- **Safer**: TypeScript validates property names
- **Clearer**: Self-documenting at call sites
- **Maintainable**: Easy to add/remove parameters
- **Professional**: Industry best practice

**Rule of Thumb**: If you have to count positions to understand a call, use named arguments.


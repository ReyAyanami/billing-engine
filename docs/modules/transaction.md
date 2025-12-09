# Transaction Module

## Overview

The Transaction module processes all financial operations using CQRS, event sourcing, and saga pattern for coordination. Implements double-entry bookkeeping with automatic compensation on failures.

**Location**: `src/modules/transaction/`

---

## Module Structure

```
src/modules/transaction/
├── transaction.module.ts           # Module definition
├── transaction.controller.ts       # REST endpoints
├── transaction.service.ts          # Orchestration
├── transaction.entity.ts           # Write model
│
├── aggregates/
│   └── transaction.aggregate.ts    # Domain logic
│
├── commands/                       # 11 command files
│   ├── topup.command.ts
│   ├── withdrawal.command.ts
│   ├── transfer.command.ts
│   ├── payment.command.ts
│   ├── refund.command.ts
│   ├── complete-*.command.ts      # 5 completion commands
│   ├── fail-transaction.command.ts
│   └── compensate-transaction.command.ts
│
├── events/                         # 12 domain events
│   ├── *-requested.event.ts       # 5 request events
│   ├── *-completed.event.ts       # 5 completion events
│   ├── transaction-failed.event.ts
│   └── transaction-compensated.event.ts
│
├── handlers/                       # 27+ handlers
│   ├── topup.handler.ts           # Command handlers (5)
│   ├── complete-*.handler.ts      # Completion handlers (5)
│   ├── *-requested.handler.ts     # Saga handlers (5)
│   ├── *-entity.handler.ts        # Entity update handlers (10)
│   └── projection/                # Projection handlers (12)
│
├── projections/
│   ├── transaction-projection.entity.ts
│   └── transaction-projection.service.ts
│
├── queries/
│   ├── get-transaction.query.ts
│   └── get-transactions-by-account.query.ts
│
└── dto/                            # Request DTOs
    ├── topup.dto.ts
    ├── withdrawal.dto.ts
    ├── transfer.dto.ts
    ├── create-payment.dto.ts
    └── create-refund.dto.ts
```

---

## Key Classes

### TransactionAggregate

**Purpose**: Encapsulates transaction business logic.

**Location**: `src/modules/transaction/aggregates/transaction.aggregate.ts`

**Key Methods**:

```typescript
class TransactionAggregate extends AggregateRoot {
  // Request operations
  requestTopup(params): void;
  requestWithdrawal(params): void;
  requestTransfer(params): void;
  requestPayment(params): void;
  requestRefund(params): void;
  
  // Complete operations
  completeTopup(params): void;
  completeWithdrawal(params): void;
  completeTransfer(params): void;
  completePayment(params): void;
  completeRefund(params): void;
  
  // Failure handling
  fail(reason, errorCode): void;
  compensate(reason, compensationActions): void;
  
  // Event handlers
  onTopupRequested(event): void;
  onTopupCompleted(event): void;
  onTransactionFailed(event): void;
  onTransactionCompensated(event): void;
}
```

**State Machine**:

```
Initial
  ↓
[RequestOperation] → PENDING
  ↓
[CompleteOperation] → COMPLETED
  or
[Fail] → FAILED
  or
[Compensate] → COMPENSATED
```

---

### Transaction Entity

**Purpose**: Database entity for transaction state (write model).

```typescript
@Entity('transactions')
class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  @Column({ unique: true })
  idempotencyKey: string;
  
  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType;
  
  @Column()
  sourceAccountId: string;
  
  @Column()
  destinationAccountId: string;
  
  @Column({ type: 'decimal' })
  amount: string;
  
  @Column()
  currency: string;
  
  // Audit trail
  @Column({ type: 'decimal' })
  sourceBalanceBefore: string;
  
  @Column({ type: 'decimal' })
  sourceBalanceAfter: string;
  
  @Column({ type: 'decimal' })
  destinationBalanceBefore: string;
  
  @Column({ type: 'decimal' })
  destinationBalanceAfter: string;
  
  @Column({ type: 'enum', enum: TransactionStatus })
  status: TransactionStatus;
  
  @Column({ nullable: true })
  reference: string;
  
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown>;
  
  // For refunds
  @Column({ nullable: true })
  parentTransactionId: string;
}
```

---

## Transaction Operations

### Top-up Flow

```typescript
1. Client → POST /api/v1/transactions/topup
2. Controller → TransactionService.topup()
3. Service → TopupCommand
4. TopupHandler:
   - Check idempotency
   - Create TransactionAggregate
   - aggregate.requestTopup()
   - Emit TopupRequestedEvent
5. TopupRequestedHandler (Saga):
   - Execute UpdateBalanceCommand on destination account
   - Execute CompleteTopupCommand
6. CompleteTopupHandler:
   - aggregate.completeTopup()
   - Emit TopupCompletedEvent
7. Projections updated
```

### Transfer Flow (with Saga)

```typescript
1. TransferCommand → TransferHandler
2. Emit TransferRequestedEvent
3. TransferRequestedHandler (Saga):
   a. Lock source account
   b. Lock destination account (ordered to prevent deadlock)
   c. Debit source: UpdateBalanceCommand
   d. Credit destination: UpdateBalanceCommand
   e. On success: CompleteTransferCommand
   f. On failure: Compensate
4. CompleteTransferHandler:
   - Emit TransferCompletedEvent
5. Projections updated
```

**Compensation Example**:

```typescript
try {
  await debitSource(sourceId, amount);  // ✓ Success
  await creditDest(destId, amount);     // ❌ Fails
} catch (error) {
  // COMPENSATION
  await creditSource(sourceId, amount); // Undo debit
  await compensateTransaction(txId, {
    actions: [{
      accountId: sourceId,
      action: 'CREDIT',
      amount,
      reason: 'Rollback of debit'
    }]
  });
}
```

---

## Commands

### TopupCommand

```typescript
class TopupCommand extends Command {
  constructor(
    public readonly transactionId: string,
    public readonly destinationAccountId: string,
    public readonly sourceAccountId: string,
    public readonly amount: string,
    public readonly currency: string,
    public readonly idempotencyKey: string,
    public readonly correlationId: string,
  ) {}
}
```

### CompleteTransferCommand

```typescript
class CompleteTransferCommand extends Command {
  constructor(
    public readonly transactionId: string,
    public readonly sourceNewBalance: string,
    public readonly destinationNewBalance: string,
    public readonly correlationId: string,
  ) {}
}
```

### CompensateTransactionCommand

```typescript
class CompensateTransactionCommand extends Command {
  constructor(
    public readonly transactionId: string,
    public readonly reason: string,
    public readonly compensationActions: CompensationAction[],
    public readonly correlationId: string,
  ) {}
}

interface CompensationAction {
  accountId: string;
  action: 'CREDIT' | 'DEBIT';
  amount: string;
  reason: string;
}
```

---

## Events

### TopupRequestedEvent

```typescript
class TopupRequestedEvent extends DomainEvent {
  constructor(
    public readonly destinationAccountId: string,
    public readonly sourceAccountId: string,
    public readonly amount: string,
    public readonly currency: string,
    eventMetadata: EventMetadata,
  ) {
    super('TopupRequested', eventMetadata);
  }
}
```

### TransactionCompensatedEvent

```typescript
class TransactionCompensatedEvent extends DomainEvent {
  constructor(
    public readonly reason: string,
    public readonly compensationActions: CompensationAction[],
    eventMetadata: EventMetadata,
  ) {
    super('TransactionCompensated', eventMetadata);
  }
}
```

---

## Saga Handlers

### TransferRequestedHandler (Saga Coordinator)

**Purpose**: Coordinates transfer operation across two accounts with compensation.

```typescript
@EventsHandler(TransferRequestedEvent)
class TransferRequestedHandler implements IEventHandler<TransferRequestedEvent> {
  async handle(event: TransferRequestedEvent): Promise<void> {
    let sourceDebited = false;
    
    try {
      // Step 1: Debit source
      const debitCmd = new UpdateBalanceCommand({
        accountId: event.sourceAccountId,
        changeAmount: event.amount,
        changeType: 'DEBIT',
        reason: `Transfer to ${event.destinationAccountId}`,
        transactionId: event.aggregateId,
      });
      await this.commandBus.execute(debitCmd);
      sourceDebited = true;
      
      // Step 2: Credit destination
      const creditCmd = new UpdateBalanceCommand({
        accountId: event.destinationAccountId,
        changeAmount: event.amount,
        changeType: 'CREDIT',
        reason: `Transfer from ${event.sourceAccountId}`,
        transactionId: event.aggregateId,
      });
      await this.commandBus.execute(creditCmd);
      
      // Step 3: Complete
      const completeCmd = new CompleteTransferCommand(
        event.aggregateId,
        sourceNewBalance,
        destNewBalance,
        event.correlationId
      );
      await this.commandBus.execute(completeCmd);
      
    } catch (error) {
      if (sourceDebited) {
        // COMPENSATION: Credit back the source
        await this.commandBus.execute(
          new UpdateBalanceCommand({
            accountId: event.sourceAccountId,
            changeAmount: event.amount,
            changeType: 'CREDIT',
            reason: 'Compensation for failed transfer',
          })
        );
        
        // Mark as compensated
        await this.commandBus.execute(
          new CompensateTransactionCommand(
            event.aggregateId,
            error.message,
            [...compensationActions]
          )
        );
      } else {
        // Just fail (no compensation needed)
        await this.commandBus.execute(
          new FailTransactionCommand(event.aggregateId, error.message)
        );
      }
    }
  }
}
```

---

## Idempotency

### Check Pattern

```typescript
// Before processing command
const existing = await transactionService.findByIdempotencyKey(idempotencyKey);
if (existing) {
  throw new DuplicateTransactionException(idempotencyKey, existing.id);
}

// Then process
const transaction = await processTransaction(command);
```

### Storage

Idempotency keys stored in `transactions.idempotency_key` column (unique constraint).

---

## Business Rules

### General Rules

1. All operations require idempotency key
2. Amount must be positive
3. Currency must match account currency
4. Accounts must be active
5. Source must have sufficient balance (for debits)

### Transfer-Specific

1. Source and destination must be different
2. Both accounts must be USER type
3. Currencies must match
4. Atomic: both succeed or both fail (saga pattern)

### Refund-Specific

1. Original payment must exist and be completed
2. Refund amount ≤ original payment amount
3. Multiple partial refunds allowed
4. Total refunds ≤ original payment
5. Merchant must have sufficient balance

---

## Extension Points

### Add New Operation Type

1. Create new command class
2. Create new event classes (*Requested, *Completed)
3. Create command handler
4. Create saga handler for coordination
5. Update TransactionAggregate with new methods
6. Add completion command and handler

**Example**: Adding a "TransferWithFee" operation:

```typescript
// 1. Command
class TransferWithFeeCommand extends Command { ... }

// 2. Events
class TransferWithFeeRequestedEvent extends DomainEvent { ... }
class TransferWithFeeCompletedEvent extends DomainEvent { ... }

// 3. Aggregate method
requestTransferWithFee(params): void {
  this.apply(new TransferWithFeeRequestedEvent(...));
}

// 4. Saga handler
@EventsHandler(TransferWithFeeRequestedEvent)
class TransferWithFeeHandler {
  async handle(event) {
    await debitSource(event.sourceId, event.amount + event.fee);
    await creditDest(event.destId, event.amount);
    await creditSystem(systemFeeAccount, event.fee);
    await complete(event.aggregateId);
  }
}
```

---

## Testing

### Saga Compensation Test

```typescript
describe('Transfer Saga', () => {
  it('should compensate when destination credit fails', async () => {
    const source = await createAccount({ balance: '100.00' });
    const dest = await createAccount({ maxBalance: '10.00' });
    
    // Transfer exceeds dest max balance
    const result = await transfer({
      sourceAccountId: source.id,
      destinationAccountId: dest.id,
      amount: '50.00'
    });
    
    await waitForCompletion(result.sourceTransactionId);
    
    const tx = await getTransaction(result.sourceTransactionId);
    
    expect(tx.status).toBe('compensated');
    expect(tx.failureReason).toContain('exceed max balance');
    
    // Source balance should be unchanged (compensated)
    const sourceAfter = await getAccount(source.id);
    expect(sourceAfter.balance).toBe('100.00');
  });
});
```

---

## Related Documentation

- [Transaction API](../api/transactions.md) - REST endpoints
- [Operations Guides](../operations/) - Detailed operation flows
- [Double-Entry Bookkeeping](../architecture/double-entry.md) - Accounting principles
- [CQRS Pattern](../architecture/cqrs-pattern.md) - Saga pattern details


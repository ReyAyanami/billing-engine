# CQRS + Event Sourcing Architecture

## Overview

This billing engine implements **CQRS (Command Query Responsibility Segregation)** combined with **Event Sourcing**. This document explains what these patterns are, why they're used, and how they're implemented.

> 🎓 **Learning Focus**: CQRS and Event Sourcing add significant complexity. They're appropriate for financial systems where auditability matters more than simplicity.

---

## What is CQRS?

**CQRS** separates **read operations** (queries) from **write operations** (commands).

### Traditional CRUD Approach

```
Client → API → Service → Database
                ↓
          READ & WRITE
          (same model)
```

### CQRS Approach

```
Client → API → Commands → Write Model → Events
                            ↓
                          Kafka
                            ↓
        ← Queries ← Read Model (Projections)
```

**Key Insight**: Different models optimized for reading vs. writing.

---

## Why CQRS for Billing?

### Problems with Traditional CRUD

1. **Complex Queries Slow Down Writes**
   - Billing needs fast balance updates
   - Complex reporting queries compete for resources

2. **Security Concerns**
   - Read and write permissions often differ
   - Same model makes it hard to separate

3. **Scaling Challenges**
   - Reads typically far outnumber writes
   - Can't scale them independently

4. **Audit Requirements**
   - Financial systems need complete history
   - CRUD typically only stores current state

### Benefits of CQRS

✅ **Independent Scaling**: Scale reads and writes separately  
✅ **Optimized Models**: Denormalized reads, normalized writes  
✅ **Security**: Separate read/write permissions  
✅ **Audit Trail**: Events capture every change  
✅ **Flexibility**: Multiple read models from same events

### Trade-offs

❌ **Complexity**: More code and concepts to understand  
❌ **Eventual Consistency**: Reads lag behind writes slightly  
❌ **Duplication**: Same data in multiple stores  
❌ **Learning Curve**: Team must understand the pattern

**When NOT to use CQRS**: Simple CRUD applications where reads and writes are similar.

---

## Command Side (Write Operations)

Commands represent **intent to change state**.

### Command Structure

```typescript
// Example: TopupCommand
interface TopupCommandParams {
  transactionId: string;
  accountId: string;
  amount: string;
  currency: string;
  sourceAccountId: string;
  idempotencyKey: string;
  correlationId?: string;
  actorId?: string;
}

class TopupCommand extends Command {
  public readonly transactionId: string;
  public readonly accountId: string;
  public readonly amount: string;
  public readonly currency: string;
  public readonly sourceAccountId: string;
  public readonly idempotencyKey: string;

  constructor(params: TopupCommandParams) {
    super(params.correlationId, params.actorId);
    this.transactionId = params.transactionId;
    this.accountId = params.accountId;
    this.amount = params.amount;
    this.currency = params.currency;
    this.sourceAccountId = params.sourceAccountId;
    this.idempotencyKey = params.idempotencyKey;
  }
}
```

**Key Properties**:
- **Immutable** (fields are readonly)
- **Named parameters** (params object pattern for clarity and extensibility)
- Contains all data needed for the operation
- Includes tracing information (correlationId)
- Idempotency key for duplicate prevention

### Available Commands

#### Account Commands
- `CreateAccountCommand` - Create new account
- `UpdateBalanceCommand` - Change account balance

#### Transaction Commands
- `TopupCommand` - Add funds from external source
- `WithdrawalCommand` - Remove funds to external destination
- `TransferCommand` - Move funds between accounts
- `PaymentCommand` - Customer-to-merchant payment
- `RefundCommand` - Reverse a payment

#### Transaction Completion Commands
- `CompleteTopupCommand` - Mark topup as completed
- `CompleteWithdrawalCommand` - Mark withdrawal as completed
- `CompleteTransferCommand` - Mark transfer as completed
- `CompletePaymentCommand` - Mark payment as completed
- `CompleteRefundCommand` - Mark refund as completed
- `FailTransactionCommand` - Mark transaction as failed
- `CompensateTransactionCommand` - Compensate failed transaction

---

### Command Flow

```
1. Client sends HTTP request
   ↓
2. Controller validates input (class-validator)
   ↓
3. Controller creates Command
   ↓
4. CommandBus.execute(command)
   ↓
5. CommandBus routes to appropriate Handler
   ↓
6. Handler loads Aggregate from Event Store
   ↓
7. Aggregate executes business logic
   ↓
8. Aggregate emits Domain Events
   ↓
9. Events persisted to Kafka (Event Store)
   ↓
10. Events published to EventBus
   ↓
11. Response returned to client (often "pending")
```

---

### Command Handler Example

```typescript
@CommandHandler(TopupCommand)
export class TopupHandler implements ICommandHandler<TopupCommand> {
  constructor(
    @Inject('EVENT_STORE') private eventStore: IEventStore,
    private eventBus: EventBus,
  ) {}

  async execute(command: TopupCommand): Promise<string> {
    // Create new transaction aggregate
    const transaction = new TransactionAggregate();

    // Execute business logic (aggregate emits events)
    transaction.requestTopup({
      transactionId: command.transactionId,
      destinationAccountId: command.destinationAccountId,
      sourceAccountId: command.sourceAccountId,
      amount: command.amount,
      currency: command.currency,
      idempotencyKey: command.idempotencyKey,
      correlationId: command.correlationId,
      causationId: command.commandId,
      metadata: { actorId: command.actorId }
    });

    // Get uncommitted events from aggregate
    const events = transaction.getUncommittedEvents();

    // Persist events to Kafka
    await this.eventStore.append('Transaction', command.transactionId, events);

    // Publish events for async processing
    events.forEach(event => this.eventBus.publish(event));

    // Mark events as committed
    transaction.commit();

    return command.transactionId;
  }
}
```

**Key Points**:
- Handler is thin - business logic lives in aggregate
- Events are persisted BEFORE being published
- Returns immediately (async processing)

---

## Query Side (Read Operations)

Queries represent **intent to read data**.

### Query Structure

```typescript
// Example: GetAccountQuery
interface GetAccountQueryParams {
  accountId: AccountId;
  correlationId?: string;
}

class GetAccountQuery extends Query {
  public readonly accountId: AccountId;

  constructor(params: GetAccountQueryParams) {
    super(params.correlationId);
    this.accountId = params.accountId;
  }
}
```

**Key Properties**:
- **Immutable** (fields are readonly)
- **Named parameters** (params object pattern)
- Contains only what's needed to find data
- No side effects

### Available Queries

- `GetAccountQuery` - Get account by ID
- `GetAccountsByOwnerQuery` - Get all accounts for an owner
- `GetTransactionQuery` - Get transaction by ID
- `GetTransactionsByAccountQuery` - Get transaction history

---

### Query Flow

```
1. Client sends HTTP request
   ↓
2. Controller validates input
   ↓
3. Controller creates Query
   ↓
4. QueryBus.execute(query)
   ↓
5. QueryBus routes to appropriate Handler
   ↓
6. Handler reads from Projection (PostgreSQL)
   ↓
7. Response returned immediately
```

**Note**: Queries read from **projections**, not aggregates. Projections are optimized read models.

---

### Query Handler Example

```typescript
@QueryHandler(GetAccountQuery)
export class GetAccountHandler implements IQueryHandler<GetAccountQuery> {
  constructor(
    private accountProjectionService: AccountProjectionService,
  ) {}

  async execute(query: GetAccountQuery): Promise<Account> {
    // Read directly from projection (denormalized read model)
    const projection = await this.accountProjectionService.findById(
      query.accountId
    );

    if (!projection) {
      throw new AccountNotFoundException(query.accountId);
    }

    return projection;
  }
}
```

**Key Points**:
- Handler reads from projection, not aggregate
- Fast queries (no event replay needed)
- Optimized indexes for specific queries

---

## Event Sourcing

**Event Sourcing** stores every state change as an immutable event.

### What is an Event?

Events represent **something that happened in the past**:

```typescript
interface BalanceChangedEventParams {
  previousBalance: string;
  newBalance: string;
  changeAmount: string;
  changeType: 'CREDIT' | 'DEBIT';
  signedAmount: string;
  reason: string;
  aggregateId: string;
  aggregateVersion: number;
  correlationId: string;
  causationId?: string;
  metadata?: EventMetadata;
  transactionId?: string;
}

class BalanceChangedEvent extends DomainEvent {
  public readonly previousBalance: string;
  public readonly newBalance: string;
  public readonly changeAmount: string;
  public readonly changeType: 'CREDIT' | 'DEBIT';
  public readonly signedAmount: string;
  public readonly reason: string;
  public readonly transactionId?: string;

  constructor(params: BalanceChangedEventParams) {
    super({
      aggregateId: params.aggregateId,
      aggregateVersion: params.aggregateVersion,
      correlationId: params.correlationId,
      causationId: params.causationId,
      metadata: params.metadata,
      aggregateType: 'Account',
    });
    this.previousBalance = params.previousBalance;
    this.newBalance = params.newBalance;
    this.changeAmount = params.changeAmount;
    this.changeType = params.changeType;
    this.signedAmount = params.signedAmount;
    this.reason = params.reason;
    this.transactionId = params.transactionId;
  }
}
```

**Event Properties**:
- **Immutable** (past can't change)
- **Named parameters** (params object pattern for consistency)
- **Past tense names** (`BalanceChanged`, not `ChangeBalance`)
- Contains complete information about what happened
- Includes metadata (who, when, why)
- Includes `signedAmount` for simplified calculations (positive for CREDIT, negative for DEBIT)

---

### Domain Events

#### Account Events
- `AccountCreated` - New account created
- `BalanceChanged` - Account balance updated
- `AccountStatusChanged` - Account status changed
- `AccountLimitsChanged` - Balance limits updated

#### Transaction Events
- `TopupRequested` - Topup initiated
- `TopupCompleted` - Topup successful
- `WithdrawalRequested` - Withdrawal initiated
- `WithdrawalCompleted` - Withdrawal successful
- `TransferRequested` - Transfer initiated
- `TransferCompleted` - Transfer successful
- `PaymentRequested` - Payment initiated
- `PaymentCompleted` - Payment successful
- `RefundRequested` - Refund initiated
- `RefundCompleted` - Refund successful
- `TransactionFailed` - Transaction failed
- `TransactionCompensated` - Transaction compensated (rolled back)

---

### Event Store (Kafka)

Events are persisted to **Kafka** as an append-only log.

#### Topics

- `billing.account-events` - All account events
- `billing.transaction-events` - All transaction events

#### Event Structure in Kafka

```json
{
  "key": "account-uuid",
  "value": {
    "eventType": "BalanceChanged",
    "aggregateId": "account-uuid",
    "aggregateVersion": 5,
    "aggregateType": "Account",
    "timestamp": "2025-12-09T12:00:00.000Z",
    "correlationId": "uuid",
    "causationId": "command-uuid",
    "metadata": {
      "actorId": "user_123",
      "actorType": "api"
    },
    "data": {
      "previousBalance": "100.00",
      "newBalance": "150.00",
      "changeAmount": "50.00",
      "changeType": "CREDIT",
      "reason": "Topup",
      "transactionId": "tx-uuid"
    }
  }
}
```

#### Partitioning

Events are partitioned by `aggregateId`:
- Ensures ordering per aggregate
- Allows parallel processing of different aggregates
- 3 partitions per topic (configurable)

**Why Kafka?**
- **Pro**: Distributed, durable, append-only log
- **Pro**: Multiple consumers can subscribe
- **Pro**: Built-in partitioning and replication
- **Pro**: Can replay events from any point
- **Con**: Operational complexity
- **Alternatives Not Used**: EventStoreDB (now Kurrent.io - restrictive licensing), PostgreSQL (simpler but less scalable)

---

### Rebuilding State from Events

Aggregates rebuild state by replaying events:

```typescript
class AccountAggregate extends AggregateRoot {
  private balance: Decimal = new Decimal(0);
  private status: AccountStatus;

  // Event handlers update internal state
  onBalanceChanged(event: BalanceChangedEvent): void {
    this.balance = new Decimal(event.newBalance);
    this.updatedAt = event.timestamp;
  }

  onAccountStatusChanged(event: AccountStatusChangedEvent): void {
    this.status = event.newStatus;
    this.updatedAt = event.timestamp;
  }
}

// To load aggregate from history:
const events = await eventStore.getEvents('Account', accountId);
const aggregate = new AccountAggregate();
events.forEach(event => aggregate.applyEvent(event));  // Rebuild state
```

**Benefits**:
- Complete audit trail
- Time travel debugging (replay to any point)
- Can create new projections from old events

**Trade-offs**:
- Slower than loading current state from database
- Storage overhead (all events kept)
- Event schema evolution is complex

---

## Projections (Read Models)

Projections are **denormalized read models** built from events.

### Why Projections?

1. **Speed**: Reading from events is slow, projections are fast
2. **Optimization**: Different queries need different structures
3. **Simplicity**: Queries don't need to understand events

### How Projections Work

```
Event Published → Event Handler → Update Projection → Query Reads Projection
```

### Example: AccountProjection

```typescript
@Entity('account_projections')
export class AccountProjection {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  ownerId: string;

  @Column()
  ownerType: string;

  @Column()
  currency: string;

  @Column({ type: 'decimal', precision: 28, scale: 8 })
  balance: string;

  @Column()
  status: string;

  @Column()
  type: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### Projection Update Handler

```typescript
@EventsHandler(BalanceChangedEvent)
export class BalanceChangedHandler implements IEventHandler<BalanceChangedEvent> {
  constructor(
    private accountProjectionService: AccountProjectionService,
  ) {}

  async handle(event: BalanceChangedEvent): Promise<void> {
    // Update projection with new balance
    await this.accountProjectionService.updateBalance(
      event.aggregateId,
      event.newBalance,
    );
  }
}
```

**Key Points**:
- Projections are **eventually consistent** (slight lag)
- Multiple projections can be built from same events
- Projections can be rebuilt by replaying events

---

## Sagas (Long-Running Transactions)

**Sagas** coordinate multi-step operations across multiple aggregates.

### What is a Saga?

This system implements **orchestration-based sagas** where a coordinator manages the workflow:

```
Transfer Flow:
1. TransferRequested event
   ↓
2. SagaCoordinator: Start saga, track steps
   ↓
3. Saga: Debit source account → completeStep()
   ↓
4. Saga: Credit destination account → completeStep()
   ↓
5. Saga: Complete transaction → completeStep()
   ↓
6. On success: Saga marked as "completed"
   On failure: failSaga() + compensation
```

### Saga Orchestration Architecture

#### SagaCoordinator Service

Tracks saga execution state with immediate consistency:

```typescript
@Injectable()
export class SagaCoordinator {
  constructor(
    @InjectRepository(SagaState)
    private repository: Repository<SagaState>,
  ) {}
  
  // Start saga tracking
  async startSaga(params: StartSagaParams): Promise<void> {
    await this.repository.save({
      sagaId: params.sagaId,
      sagaType: params.sagaType,
      status: 'in_progress',
      steps: params.steps,
      currentStep: 0,
      totalSteps: params.steps.length,
      metadata: params.metadata,
    });
  }
  
  // Mark step as complete
  async completeStep(params: CompleteStepParams): Promise<void> {
    const saga = await this.findById(params.sagaId);
    saga.currentStep++;
    saga.results = { ...saga.results, [params.step]: params.result };
    
    if (saga.currentStep === saga.totalSteps) {
      saga.status = 'completed';
    }
    
    await this.repository.save(saga);
  }
  
  // Handle saga failure
  async failSaga(params: FailSagaParams): Promise<void> {
    const saga = await this.findById(params.sagaId);
    saga.status = params.canCompensate ? 'compensating' : 'failed';
    saga.errorMessage = params.error.message;
    await this.repository.save(saga);
  }
  
  // Record compensation action
  async recordCompensation(sagaId, action, result): Promise<void> {
    const saga = await this.findById(sagaId);
    saga.compensationActions = [
      ...saga.compensationActions,
      { action, result, timestamp: new Date() }
    ];
    await this.repository.save(saga);
  }
}
```

#### SagaEventBus Service

Provides ordered, synchronous event processing for saga coordination:

```typescript
@Injectable()
export class SagaEventBus implements OnModuleInit {
  private queue: DomainEvent[] = [];
  private isProcessing = false;
  private sagaHandlers: Map<string, IEventHandler[]>;
  
  onModuleInit(): void {
    // Subscribe to domain events and filter for saga processing
    this.eventBus.subscribe((event: unknown) => {
      if (event && typeof event === 'object' && 'getEventType' in event) {
        const domainEvent = event as DomainEvent;
        const eventType = domainEvent.getEventType();
        if (this.sagaHandlers.has(eventType)) {
          void this.enqueue(domainEvent);
        }
      }
    });
  }
  
  // Process events sequentially (strict ordering)
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    
    while (this.queue.length > 0) {
      const event = this.queue.shift()!;
      await this.processEvent(event); // Synchronous!
    }
    
    this.isProcessing = false;
  }
}
```

### Transfer Saga Example (Orchestration)

```typescript
@Injectable()
@SagaHandler(TransferRequestedEvent)  // Saga coordination (immediate consistency)
export class TransferRequestedHandler implements IEventHandler<TransferRequestedEvent> {
  constructor(
    private commandBus: CommandBus,
    private sagaCoordinator: SagaCoordinator,
  ) {}

  async handle(event: TransferRequestedEvent): Promise<void> {
    // Start saga tracking
    await this.sagaCoordinator.startSaga({
      sagaId: event.aggregateId,
      sagaType: 'transfer',
      steps: ['debit_source', 'credit_destination', 'complete_transaction'],
      metadata: event.metadata,
    });

    let sourceDebited = false;

    try {
      // Step 1: DEBIT source account
      const sourceNewBalance = await this.commandBus.execute(
        new UpdateBalanceCommand({
          accountId: event.sourceAccountId,
          changeAmount: event.amount,
          changeType: 'DEBIT',
          reason: `Transfer to ${event.destinationAccountId}`,
          transactionId: event.aggregateId,
          correlationId: event.correlationId,
        })
      );
      sourceDebited = true;
      
      await this.sagaCoordinator.completeStep({
        sagaId: event.aggregateId,
        step: 'debit_source',
        result: { sourceNewBalance },
      });

      // Step 2: CREDIT destination account
      const destinationNewBalance = await this.commandBus.execute(
        new UpdateBalanceCommand({
          accountId: event.destinationAccountId,
          changeAmount: event.amount,
          changeType: 'CREDIT',
          reason: `Transfer from ${event.sourceAccountId}`,
          transactionId: event.aggregateId,
          correlationId: event.correlationId,
        })
      );
      
      await this.sagaCoordinator.completeStep({
        sagaId: event.aggregateId,
        step: 'credit_destination',
        result: { destinationNewBalance },
      });

      // Step 3: Complete transfer
      await this.commandBus.execute(
        new CompleteTransferCommand(event.aggregateId, ...)
      );
      
      await this.sagaCoordinator.completeStep({
        sagaId: event.aggregateId,
        step: 'complete_transaction',
        result: { sourceNewBalance, destinationNewBalance },
      });

    } catch (error) {
      // COMPENSATION: If source was debited but destination credit failed
      if (sourceDebited) {
        await this.sagaCoordinator.failSaga({
          sagaId: event.aggregateId,
          step: 'credit_destination',
          error,
          canCompensate: true,
        });
        
        // Reverse the debit
        await this.commandBus.execute(
          new UpdateBalanceCommand({
            accountId: event.sourceAccountId,
            changeAmount: event.amount,
            changeType: 'CREDIT',  // Reverse!
            reason: `Compensation for failed transfer`,
            transactionId: event.aggregateId,
            correlationId: event.correlationId,
          })
        );
        
        await this.sagaCoordinator.recordCompensation(
          event.aggregateId,
          'credit_source_rollback',
          sourceNewBalance,
        );

        // Mark as compensated
        await this.commandBus.execute(
          new CompensateTransactionCommand(event.aggregateId, ...)
        );
        
        await this.sagaCoordinator.completeCompensation(event.aggregateId);
      } else {
        await this.sagaCoordinator.failSaga({
          sagaId: event.aggregateId,
          step: 'debit_source',
          error,
          canCompensate: false,
        });
        
        // No compensation needed, just fail
        await this.commandBus.execute(
          new FailTransactionCommand(event.aggregateId, ...)
        );
      }
    }
  }
}
```

### Saga State API

Query saga status via REST API:

```bash
GET /api/v1/sagas/{sagaId}
```

Response:
```json
{
  "sagaId": "uuid",
  "sagaType": "transfer",
  "status": "completed",
  "currentStep": 3,
  "totalSteps": 3,
  "steps": ["debit_source", "credit_destination", "complete_transaction"],
  "results": {
    "debit_source": { "sourceNewBalance": "50.00" },
    "credit_destination": { "destinationNewBalance": "150.00" }
  },
  "createdAt": "2025-12-09T12:00:00Z",
  "updatedAt": "2025-12-09T12:00:01Z"
}
```

### Transactional Outbox Pattern

Guarantees event delivery with at-least-once semantics:

```typescript
@Injectable()
export class OutboxProcessor {
  async processPendingEvents(): Promise<void> {
    const events = await this.outboxRepository.find({
      where: { status: 'pending' },
      order: { createdAt: 'ASC' },
      take: 100,
    });
    
    for (const event of events) {
      try {
        // Publish to event bus
        this.eventBus.publish(event.payload);
        
        // Mark as delivered
        await this.outboxRepository.update(event.id, {
          status: 'delivered',
          processedAt: new Date(),
        });
      } catch (error) {
        // Retry with exponential backoff
        await this.outboxRepository.update(event.id, {
          retries: event.retries + 1,
          lastError: error.message,
        });
      }
    }
  }
}
```

**Key Concepts**:
- **Orchestration**: Central coordinator manages workflow
- **Immediate Consistency**: Saga state updated synchronously
- **Compensation**: Tracked and observable rollback actions
- **Guaranteed Delivery**: Outbox pattern ensures no lost events
- **Observability**: Saga state API for monitoring and debugging

**Benefits over Choreography**:
- ✅ No race conditions (synchronous coordination)
- ✅ Clear business process visibility
- ✅ Easier testing (query saga state)
- ✅ Built-in compensation tracking
- ✅ Better error handling and monitoring

---

## Consistency Models

This system uses **dual consistency models**:

### 1. Saga State (Immediate Consistency)

**Write Model** - Synchronously updated during business process execution:

```
Time: 0ms   - Command processed
Time: 1ms   - Saga started (SagaCoordinator.startSaga)
Time: 10ms  - Step 1 complete (SagaCoordinator.completeStep)
Time: 20ms  - Step 2 complete (SagaCoordinator.completeStep)
Time: 30ms  - Saga completed (status = "completed")
```

**Query Saga State**:
```typescript
// Query saga (immediate consistency)
const saga = await fetch(`/api/v1/sagas/${transactionId}`);
const { status } = await saga.json();
// status === "completed" (immediately after saga finishes)
```

### 2. Projections (Eventual Consistency)

**Read Model** - Asynchronously updated from events:

```
Time: 0ms   - Command processed
Time: 10ms  - Events persisted to Kafka
Time: 20ms  - Event handlers process events (async)
Time: 30ms  - Projections updated (async)
Time: 40ms  - Client queries projection
```

**Query Projection**:
```typescript
// Query projection (eventual consistency)
const tx = await fetch(`/api/v1/transactions/${transactionId}`);
const { status } = await tx.json();
// status might still be "pending" (projection not yet updated)
```

### Handling Dual Consistency

**Recommended Client Pattern (Query Saga State)**:
```typescript
// 1. Submit command
const response = await fetch('/api/v1/transactions/topup', {
  method: 'POST',
  body: JSON.stringify(topupData)
});

const { transactionId } = await response.json();

// 2. Poll saga state (immediate consistency)
while (true) {
  await sleep(50);  // Short poll interval
  
  const saga = await fetch(`/api/v1/sagas/${transactionId}`);
  const { status } = await saga.json();
  
  if (status === 'completed') {
    console.log('Success! Saga completed.');
    break;
  }
  
  if (status === 'failed' || status === 'cancelled') {
    console.log('Failed:', saga.errorMessage);
    break;
  }
}

// 3. (Optional) Wait for projection if needed for display
const tx = await fetch(`/api/v1/transactions/${transactionId}`);
const transactionDetails = await tx.json();
```

**Alternative Pattern (Query Projection Only)**:
```typescript
// For non-critical operations, query projection directly
const tx = await fetch(`/api/v1/transactions/${transactionId}`);
const { status } = await tx.json();

// Accept eventual consistency (projection may lag)
if (status === 'completed') {
  console.log('Transaction completed');
} else if (status === 'pending') {
  console.log('Still processing...');
}
```

### When to Use Each Model

**Use Saga State (Immediate Consistency)** when:
- ✅ Need to know business process completion immediately
- ✅ Testing (no race conditions)
- ✅ Workflows that depend on saga completion
- ✅ Critical operations (payments, transfers)

**Use Projections (Eventual Consistency)** when:
- ✅ Displaying transaction history
- ✅ Running analytics/reports
- ✅ Non-critical queries
- ✅ Optimized queries with complex filters

**Key Insight**: Saga state is the **write model** (source of truth for process execution), projections are **read models** (optimized for queries).

**Trade-offs**:
- **Pro**: Clear separation of consistency guarantees
- **Pro**: No race conditions in critical paths
- **Pro**: Optimized read models remain async (fast queries)
- **Con**: Clients must understand which API to query

---

## Benefits for Billing Systems

### 1. Complete Audit Trail

Every balance change captured as an event:
```
Account 123:
- AccountCreated (balance: 0)
- BalanceChanged (0 → 100) [Topup tx-001]
- BalanceChanged (100 → 75) [Transfer tx-002]
- BalanceChanged (75 → 125) [Topup tx-003]
```

### 2. Time Travel Debugging

Can replay events to any point in time:
```typescript
// What was balance on Dec 1?
const eventsUntilDec1 = await eventStore.getEvents(
  'Account',
  accountId,
  { until: new Date('2025-12-01') }
);

const aggregate = new AccountAggregate();
eventsUntilDec1.forEach(e => aggregate.applyEvent(e));
console.log(aggregate.getBalance());  // Balance on Dec 1
```

### 3. Regulatory Compliance

Financial regulations often require:
- ✅ Complete history (events provide this)
- ✅ Immutable records (events are append-only)
- ✅ Audit trail with timestamps and actors
- ✅ Ability to reconstruct past states

### 4. Scalability

- **Reads**: Scale horizontally (multiple projection instances)
- **Writes**: Partition by aggregate ID
- **Event Consumers**: Multiple independent consumers

---

## Trade-offs

### Pros

✅ **Auditability**: Complete history of all changes  
✅ **Debuggability**: Replay events to understand issues  
✅ **Scalability**: Independent scaling of reads/writes  
✅ **Flexibility**: Create new projections from existing events  
✅ **Compliance**: Meets regulatory requirements

### Cons

❌ **Complexity**: More moving parts (commands, events, projections, sagas)  
❌ **Learning Curve**: Team must understand CQRS/ES patterns  
❌ **Eventual Consistency**: Reads lag behind writes  
❌ **Storage Overhead**: Events are stored forever  
❌ **Operational Complexity**: Kafka adds infrastructure burden

---

## When to Use CQRS + Event Sourcing

### Good Fit ✅

- Financial systems (billing, accounting, banking)
- Systems with high audit requirements
- Complex business logic with many state transitions
- Systems needing multiple read models
- Event-driven architectures

### Poor Fit ❌

- Simple CRUD applications
- Systems without audit requirements
- Low-complexity domains
- Teams unfamiliar with the pattern
- Projects with tight deadlines

---

## What's Simplified

For learning purposes, this implementation simplifies:

- ✗ No event versioning strategy (events assumed immutable)
- ✗ No snapshot strategy (event replay could be slow)
- ✗ No event upcasting (old events never migrated)
- ✗ No event compaction (all events kept forever)
- ✗ No saga timeout handling (sagas could hang indefinitely)
- ✗ No distributed saga coordination (single-node coordinator)

A production system would need these!

**What's NOT Simplified** (Production-Grade Features):

- ✅ Saga orchestration with state tracking
- ✅ Transactional outbox pattern for guaranteed delivery
- ✅ Projection idempotency checks
- ✅ Compensation tracking for failed sagas
- ✅ Clear separation of write/read model consistency

---

## Related Documentation

- [System Design](./system-design.md) - Overall architecture
- [Event Sourcing](./event-sourcing.md) - Deep dive on event store
- [Data Model](./data-model.md) - Database schema

---

**Next**: Learn about the [Data Model](./data-model.md) →


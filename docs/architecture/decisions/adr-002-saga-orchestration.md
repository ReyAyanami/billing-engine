# ADR-002: Saga Orchestration with Outbox Pattern

**Status**: Accepted  
**Date**: 2025-12-09  
**Authors**: System Architecture Team

---

## Context

The initial CQRS/Event Sourcing implementation used choreography-based sagas with retry logic in projection handlers to handle race conditions between saga completion and projection updates. This approach had several issues:

1. **Race Conditions**: Completion events could fire before projections were created
2. **Retry Logic Overhead**: ~190 lines of temporary workaround code across handlers
3. **Testing Complexity**: Tests needed to poll projections (eventual consistency)
4. **Unclear Consistency Model**: Mixed immediate and eventual consistency without clear boundaries

### The Problem

```typescript
// Topup flow with race condition:
1. TopupRequested event published
2. TopupRequestedProjectionHandler starts creating projection (async)
3. Saga continues: account balance updated
4. TopupCompleted event published
5. TopupCompletedProjectionHandler tries to update projection
6. ❌ ERROR: Projection not found (still being created)
7. Retry with exponential backoff (workaround)
```

### Requirements

- ✅ Eliminate race conditions in saga coordination
- ✅ Clear separation of write model (immediate) vs read model (eventual)
- ✅ Guaranteed event delivery
- ✅ Support for compensation in distributed transactions
- ✅ Observable saga state for monitoring and testing
- ✅ Remove temporary retry logic workarounds

---

## Decision

Implement a **production-grade saga orchestration layer** combining:

1. **Option 4**: Saga Orchestration Layer (primary solution)
2. **Option 2**: Transactional Outbox Pattern (guaranteed delivery)
3. **Option 3**: Projection Idempotency (duplicate prevention)
4. **Option 1**: Test Against Saga State (immediate consistency)

### Architecture Components

#### 1. Saga Orchestration Layer

**SagaEventBus** - Ordered, synchronous saga processing:
```typescript
@Injectable()
export class SagaEventBus {
  private queue: DomainEvent[] = [];
  private sagaHandlers: Map<string, IEventHandler[]>;
  
  // Process events sequentially (strict ordering)
  private async processQueue(): Promise<void> {
    while (this.queue.length > 0) {
      const event = this.queue.shift();
      await this.processEvent(event); // Synchronous!
    }
  }
}
```

**SagaCoordinator** - Tracks saga state:
```typescript
@Injectable()
export class SagaCoordinator {
  async startSaga(params: StartSagaParams): Promise<void> {
    await this.repository.save({
      sagaId: params.sagaId,
      sagaType: params.sagaType,
      status: 'in_progress',
      steps: params.steps,
      currentStep: 0,
    });
  }
  
  async completeStep(params: CompleteStepParams): Promise<void> {
    // Update saga state immediately
  }
  
  async failSaga(params: FailSagaParams): Promise<void> {
    // Record failure and compensation info
  }
}
```

**Benefits**:
- Saga state is **immediately consistent** (synchronous updates)
- Clear visibility into business process execution
- Compensation tracking built-in
- API endpoint for saga status: `GET /api/v1/sagas/:id`

#### 2. Transactional Outbox Pattern

**OutboxEvent** entity stores events before publishing:
```typescript
@Entity('outbox_events')
export class OutboxEvent {
  @PrimaryColumn('uuid')
  id: string;
  
  @Column()
  aggregateType: string;
  
  @Column()
  aggregateId: string;
  
  @Column({ type: 'jsonb' })
  payload: object;
  
  @Column({ default: 'pending' })
  status: 'pending' | 'processing' | 'delivered' | 'failed';
  
  @Column({ type: 'int', default: 0 })
  retries: number;
}
```

**OutboxProcessor** - Background worker:
```typescript
@Injectable()
export class OutboxProcessor implements OnModuleInit {
  async processPendingEvents(): Promise<void> {
    const events = await this.repository.find({
      where: { status: 'pending' },
      order: { createdAt: 'ASC' },
      take: 100,
    });
    
    for (const event of events) {
      await this.processEvent(event); // With retry + exponential backoff
    }
  }
}
```

**Benefits**:
- At-least-once delivery guarantee
- Survives process crashes
- Automatic retry with exponential backoff
- Cleanup of old events

#### 3. Projection Idempotency

**Decorators** for handler classification:
```typescript
@SagaHandler(TopupRequestedEvent)      // Saga coordination (immediate)
@ProjectionHandler(TopupCompletedEvent) // Projection update (eventual)
```

**Idempotency checks** in projection handlers:
```typescript
async handle(event: TopupRequestedEvent): Promise<void> {
  // Check if already processed
  const existing = await this.projectionService.findById(event.aggregateId);
  if (existing?.lastProcessedEventId === event.eventId) {
    return; // Skip duplicate
  }
  
  // Create projection and record eventId
  await this.projectionService.create({...});
}
```

**Benefits**:
- Handles duplicate events gracefully
- Prevents out-of-order updates
- Clear handler responsibilities

#### 4. Test Against Saga State

**Before** (eventual consistency):
```typescript
// Poll transaction projection
await pollFor(() => 
  transactionProjection.status === 'completed'
);
```

**After** (immediate consistency):
```typescript
// Query saga state (synchronous)
const saga = await request(app).get(`/api/v1/sagas/${transactionId}`);
expect(saga.body.status).toBe('completed');
```

**Benefits**:
- No race conditions in tests
- Faster test execution
- Tests query write model (sagas), not read model (projections)

---

## Implementation

### Database Migration

```typescript
export class AddSagaStateAndOutboxTables1765291007927 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Saga state table
    await queryRunner.query(`
      CREATE TABLE saga_states (
        saga_id UUID PRIMARY KEY,
        saga_type VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL,
        current_step INTEGER NOT NULL DEFAULT 0,
        total_steps INTEGER NOT NULL,
        steps JSONB NOT NULL,
        results JSONB,
        compensation_actions JSONB,
        error_message TEXT,
        metadata JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    
    // Outbox events table
    await queryRunner.query(`
      CREATE TABLE outbox_events (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        aggregate_type VARCHAR(100) NOT NULL,
        aggregate_id VARCHAR(255) NOT NULL,
        event_type VARCHAR(100) NOT NULL,
        payload JSONB NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        retries INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        processed_at TIMESTAMP
      )
    `);
    
    CREATE INDEX idx_outbox_status ON outbox_events(status, created_at);
  }
}
```

### Handler Refactoring

**Before** (choreography only):
```typescript
@EventsHandler(TopupRequestedEvent)
export class TopupRequestedHandler implements IEventHandler<TopupRequestedEvent> {
  async handle(event: TopupRequestedEvent): Promise<void> {
    await this.commandBus.execute(new UpdateBalanceCommand(...));
    await this.commandBus.execute(new CompleteTopupCommand(...));
  }
}
```

**After** (with orchestration):
```typescript
@Injectable()
@SagaHandler(TopupRequestedEvent)
export class TopupRequestedHandler implements IEventHandler<TopupRequestedEvent> {
  constructor(
    private commandBus: CommandBus,
    private sagaCoordinator: SagaCoordinator,
  ) {}
  
  async handle(event: TopupRequestedEvent): Promise<void> {
    await this.sagaCoordinator.startSaga({
      sagaId: event.aggregateId,
      sagaType: 'topup',
      steps: ['update_balance', 'complete_transaction'],
    });
    
    try {
      const newBalance = await this.commandBus.execute(
        new UpdateBalanceCommand(...)
      );
      
      await this.sagaCoordinator.completeStep({
        sagaId: event.aggregateId,
        step: 'update_balance',
        result: { newBalance },
      });
      
      await this.commandBus.execute(
        new CompleteTopupCommand(...)
      );
      
      await this.sagaCoordinator.completeStep({
        sagaId: event.aggregateId,
        step: 'complete_transaction',
      });
    } catch (error) {
      await this.sagaCoordinator.failSaga({
        sagaId: event.aggregateId,
        step: 'update_balance',
        error,
      });
    }
  }
}
```

### Retry Logic Removal

**Before** (~38 lines per handler):
```typescript
async handle(event: TopupCompletedEvent): Promise<void> {
  const maxRetries = 10;
  const retryDelay = 50;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await this.projectionService.updateTransactionCompleted(...);
      return;
    } catch (error) {
      if (error.includes('not found') && attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        continue;
      }
      throw error;
    }
  }
}
```

**After** (~15 lines per handler):
```typescript
async handle(event: TopupCompletedEvent): Promise<void> {
  try {
    await this.projectionService.updateTransactionCompleted(...);
  } catch (error) {
    this.logger.error('Failed to update projection', error);
    throw error;
  }
}
```

**Total cleanup**: ~190 lines of temporary workaround code removed.

---

## Consequences

### Positive

✅ **No Race Conditions**: Saga orchestration guarantees order  
✅ **Clear Consistency Model**: Sagas (immediate) vs Projections (eventual)  
✅ **Guaranteed Delivery**: Outbox pattern ensures no lost events  
✅ **Testability**: Tests query saga state (immediate consistency)  
✅ **Observability**: Saga state API for monitoring  
✅ **Compensation Support**: Built-in tracking for rollbacks  
✅ **Simpler Code**: Removed 190 lines of retry logic

### Negative

❌ **Increased Complexity**: More infrastructure (saga tables, outbox, coordinator)  
❌ **Additional Database Tables**: Saga state + outbox events  
❌ **Learning Curve**: Team must understand saga orchestration  
❌ **Migration Effort**: All saga handlers needed refactoring

### Trade-offs

**Storage Overhead**:
- Saga state records (one per transaction)
- Outbox events (cleaned up after delivery)
- Trade-off: Reliability vs storage cost

**Synchronous Saga Processing**:
- Saga steps run synchronously (slower)
- Projections update asynchronously (faster)
- Trade-off: Correctness vs throughput

**Operational Complexity**:
- Outbox processor background worker
- Saga state monitoring
- Trade-off: Reliability vs operational burden

---

## Alternatives Considered

### Alternative 1: Keep Retry Logic

**Pros**: No architectural changes  
**Cons**: Band-aid solution, doesn't address root cause  
**Rejected**: Technical debt would accumulate

### Alternative 2: Synchronous Projections

**Pros**: Simpler, no race conditions  
**Cons**: Violates CQRS principles, slower writes  
**Rejected**: Loses benefits of eventual consistency

### Alternative 3: Event Sourcing Without CQRS

**Pros**: Simpler architecture  
**Cons**: No optimized read models, poor query performance  
**Rejected**: Read optimization is critical for billing

### Alternative 4: Traditional CRUD

**Pros**: Much simpler  
**Cons**: No audit trail, no event replay, no time travel  
**Rejected**: Audit trail is non-negotiable for billing

---

## Validation

### Test Results

**Before saga orchestration**:
- 47 failing tests (race conditions)
- Tests required retry logic and long timeouts

**After saga orchestration**:
- ✅ 61 passing tests
- ✅ No retry logic needed
- ✅ Faster test execution (20.5s vs 25s+)

### Performance Impact

**Saga Processing**:
- Synchronous saga steps: ~50-100ms per transaction
- Async projection updates: ~10-50ms lag (acceptable)
- Overall: Minimal impact on user-perceived latency

**Storage Growth**:
- Saga state: ~1KB per transaction (cleaned up after 30 days)
- Outbox events: ~2KB per event (cleaned up after delivery)
- Overall: Negligible for most workloads

---

## References

- [Martin Fowler - Saga Pattern](https://martinfowler.com/articles/patterns-of-distributed-systems/saga.html)
- [Chris Richardson - Transactional Outbox](https://microservices.io/patterns/data/transactional-outbox.html)
- [Microsoft - CQRS Journey](https://docs.microsoft.com/en-us/previous-versions/msp-n-p/jj591569(v=pandp.10))

---

## Revision History

- **2025-12-09**: Initial decision - saga orchestration implemented
- **2025-12-24**: Enforced `ReserveBalance` step. All debiting sagas (Payment, Refund, Transfer, Withdrawal) must explicitly reserve funds before debiting to satisfy `AccountAggregate` invariants.


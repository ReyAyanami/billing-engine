# Event Sourcing Implementation

## Overview

This billing engine uses **Event Sourcing** to persist all state changes as a sequence of immutable events. Instead of storing current state, we store the history of events that led to that state.

> 🎓 **Learning Focus**: Event Sourcing adds complexity but provides complete auditability, time-travel debugging, and the ability to rebuild state from history.

---

## What is Event Sourcing?

### Traditional State Storage

```
Account Balance: $100
↓ (update)
Account Balance: $150
```

**Problem**: We lost the history. We don't know:
- Why the balance changed
- Who changed it
- When it changed
- What the old value was

### Event Sourcing Approach

```
Events:
1. AccountCreated (balance: $0)
2. TopupCompleted (amount: $100)  → Current state: $100
3. TopupCompleted (amount: $50)   → Current state: $150
```

**Benefits**: Complete history preserved. Current state = replay all events.

---

## Why Event Sourcing for Billing?

### Financial Requirements

1. **Audit Trail**: Financial regulations require complete history
2. **Debugging**: Understand exactly what happened and why
3. **Compliance**: Prove every transaction for audits
4. **Reconciliation**: Verify account balances at any point in time

### Technical Benefits

1. **Time Travel**: Query state at any point in history
2. **Event Replay**: Rebuild state from events
3. **New Projections**: Create new read models from existing events
4. **Debugging**: Replay production events in development

### Trade-offs

✅ **Pros**:
- Complete audit trail
- Time-travel queries
- Event replay capability
- Natural fit with CQRS

❌ **Cons**:
- Storage overhead (all events kept)
- Complexity (event schema evolution)
- Eventual consistency
- Slower to load aggregates (must replay events)

---

## Event Store Architecture

### Kafka as Event Store

We use **Apache Kafka** as our event store:

```
┌──────────────────────────────────────┐
│         Application Layer            │
│  ┌────────────┐    ┌──────────────┐ │
│  │ Aggregate  │───→│ Domain Event │ │
│  └────────────┘    └──────┬───────┘ │
└───────────────────────────┼─────────┘
                            ▼
┌──────────────────────────────────────┐
│          Kafka Event Store           │
│                                      │
│  billing.account.events              │
│  ┌─────────────────────────────────┐│
│  │ Partition 0 │ Partition 1 │ ... ││
│  │ [events...] │ [events...] │     ││
│  └─────────────────────────────────┘│
│                                      │
│  billing.transaction.events          │
│  ┌─────────────────────────────────┐│
│  │ Partition 0 │ Partition 1 │ ... ││
│  │ [events...] │ [events...] │     ││
│  └─────────────────────────────────┘│
└──────────────────────────────────────┘
```

**Why Kafka?**
- **Durable**: Persists events to disk
- **Distributed**: Replication and high availability
- **Append-only**: Natural fit for event sourcing
- **Partitioned**: Parallel processing
- **Ordered**: Per-partition ordering guarantee
- **Scalable**: Handle millions of events

**Alternatives Considered**:
- **EventStoreDB** (now Kurrent.io): Purpose-built for event sourcing, but not used due to restrictive licensing
- **PostgreSQL**: Simpler setup, but less scalable
- **MongoDB**: Document storage, but ordering guarantees weaker

---

## Kafka Topic Structure

### Topic Naming Convention

```
billing.<aggregate-type>.events
```

**Topics**:
- `billing.account.events` - All account events
- `billing.transaction.events` - All transaction events

### Partitioning Strategy

Events are partitioned by `aggregateId`:

```typescript
{
  key: "account-550e8400-...",  // aggregateId
  value: <event-json>
}
```

**Why partition by aggregateId?**
- Guarantees **ordering per aggregate** (all events for same account go to same partition)
- Enables **parallel processing** (different accounts in different partitions)
- Allows **scale-out** (add more partitions as load increases)

### Topic Configuration

```typescript
{
  name: "billing.account.events",
  numPartitions: 3,              // Configurable
  replicationFactor: 1,          // 1 for dev, 3 for prod
  retentionMs: 604800000,        // 7 days (604800000 ms)
  cleanupPolicy: "delete"        // "compact" for snapshots
}
```

---

## Event Structure

### Domain Event Base Class

```typescript
abstract class DomainEvent {
  readonly eventId: string;            // Unique event ID
  readonly eventType: string;          // Event type name
  readonly aggregateId: string;        // Aggregate this event belongs to
  readonly aggregateType: string;      // Type of aggregate
  readonly aggregateVersion: number;   // Version after this event
  readonly timestamp: Date;            // When event occurred
  readonly correlationId: string;      // For tracing
  readonly causationId?: string;       // What caused this event
  readonly metadata?: Record<string, unknown>; // Additional context
}
```

### Example: BalanceChanged Event

```typescript
class BalanceChangedEvent extends DomainEvent {
  constructor(
    public readonly previousBalance: string,
    public readonly newBalance: string,
    public readonly changeAmount: string,      // Always positive
    public readonly changeType: 'CREDIT' | 'DEBIT',  // Direction
    public readonly signedAmount: string,      // Signed for convenience
    public readonly reason: string,
    eventMetadata: EventMetadata,
    public readonly transactionId?: string,
  ) {
    super('BalanceChanged', eventMetadata);
  }
}
```

**Fields**:
- `changeAmount`: Always positive (e.g., "100.00")
- `changeType`: Semantic direction (CREDIT = money in, DEBIT = money out)
- `signedAmount`: Computed signed amount (e.g., "100.00" for CREDIT, "-100.00" for DEBIT)

### Event Serialization

Events are serialized to JSON for Kafka storage:

```json
{
  "eventId": "evt-550e8400-e29b-41d4-a716-446655440000",
  "eventType": "BalanceChanged",
  "aggregateId": "account-123",
  "aggregateType": "Account",
  "aggregateVersion": 5,
  "timestamp": "2025-12-09T12:00:00.000Z",
  "correlationId": "corr-uuid",
  "causationId": "cmd-uuid",
  "metadata": {
    "actorId": "user_123",
    "actorType": "api"
  },
  "data": {
    "previousBalance": "100.00",
    "newBalance": "150.00",
    "changeAmount": "50.00",
    "changeType": "CREDIT",
    "signedAmount": "50.00",
    "reason": "Topup",
    "transactionId": "tx-uuid"
  }
}
```

---

## Writing Events

### Append Events to Kafka

```typescript
class KafkaEventStore implements IEventStore {
  async append(
    aggregateType: string,
    aggregateId: string,
    events: DomainEvent[],
  ): Promise<void> {
    const topic = `billing.${aggregateType.toLowerCase()}.events`;
    const producer = this.kafkaService.getProducer();

    const messages = events.map((event) => ({
      key: aggregateId,              // Partition by aggregate ID
      value: JSON.stringify(event),  // Serialize to JSON
      headers: {
        eventType: Buffer.from(event.eventType),
        aggregateVersion: Buffer.from(event.aggregateVersion.toString()),
        correlationId: Buffer.from(event.correlationId),
        timestamp: Buffer.from(event.timestamp.toISOString()),
      }
    }));

    await producer.send({ topic, messages });
  }
}
```

**Flow**:
1. Command handler executes command on aggregate
2. Aggregate emits domain events
3. Events persisted to Kafka via `append()`
4. Events published to EventBus for async processing

---

## Reading Events

### Event Replay

To load an aggregate, we replay all its events:

```typescript
async getEvents(
  aggregateType: string,
  aggregateId: string,
  fromVersion?: number,
): Promise<DomainEvent[]> {
  const topic = `billing.${aggregateType}.events`;
  const consumer = await this.kafkaService.createConsumer(consumerGroupId);
  
  const events: DomainEvent[] = [];
  
  await consumer.subscribe({ topics: [topic], fromBeginning: true });
  
  await consumer.run({
    eachMessage: async ({ message }) => {
      const messageKey = message.key?.toString();
      
      // Only process events for this specific aggregate
      if (messageKey === aggregateId) {
        const eventData = JSON.parse(message.value!.toString());
        
        // Apply version filter if specified
        if (!fromVersion || eventData.aggregateVersion >= fromVersion) {
          events.push(eventData);
        }
      }
    }
  });
  
  return events;
}
```

**Performance Note**: This is simplified for learning. In production:
- Use **snapshots** to avoid replaying all events
- Cache aggregate state
- Use dedicated projection for event lookups

---

## Aggregate Reconstruction

### Loading Aggregate from History

```typescript
class AccountAggregate extends AggregateRoot {
  private balance: Decimal = new Decimal(0);
  private status: AccountStatus;

  // Apply a single event
  applyEvent(event: DomainEvent): void {
    switch (event.eventType) {
      case 'AccountCreated':
        this.onAccountCreated(event as AccountCreatedEvent);
        break;
      case 'BalanceChanged':
        this.onBalanceChanged(event as BalanceChangedEvent);
        break;
      case 'AccountStatusChanged':
        this.onAccountStatusChanged(event as AccountStatusChangedEvent);
        break;
    }
  }

  // Event handler: Update internal state
  onBalanceChanged(event: BalanceChangedEvent): void {
    this.balance = new Decimal(event.newBalance);
    this.updatedAt = event.timestamp;
  }
}

// Reconstruct aggregate from events
const events = await eventStore.getEvents('Account', accountId);
const aggregate = new AccountAggregate();
events.forEach(event => aggregate.applyEvent(event));
// aggregate now has current state
```

**Key Principle**: Events are the source of truth, not the aggregate state.

---

## Event Versioning

### The Problem

What happens when you need to change an event structure?

**Example**: Add a new field to `BalanceChanged`:

```typescript
// Version 1
class BalanceChangedEvent {
  previousBalance: string;
  newBalance: string;
}

// Version 2 (new field added)
class BalanceChangedEvent {
  previousBalance: string;
  newBalance: string;
  currency: string;  // NEW FIELD
}
```

Old events in Kafka don't have `currency` field!

### Solution: Event Upcasting

```typescript
class EventUpcaster {
  upcast(event: DeserializedEvent): DomainEvent {
    if (event.eventType === 'BalanceChanged') {
      if (!event.data.currency) {
        // Upcast v1 to v2 by adding default currency
        event.data.currency = 'USD';
      }
    }
    return event;
  }
}
```

**⚠️ Not Implemented**: This project doesn't implement event versioning (simplified for learning).

---

## Snapshots (Future Enhancement)

### The Problem

Loading an aggregate requires replaying ALL events:

```
Account with 10,000 events:
Load time = 10,000 × (deserialize + apply) = slow!
```

### Solution: Snapshots

Store periodic snapshots of aggregate state:

```
Events:
1-1000: (snapshot: balance=$1000)
1001: TopupCompleted (+$50)
1002: WithdrawalCompleted (-$30)
...

Load aggregate:
1. Load snapshot (version 1000)
2. Replay events 1001-1002
Total: Much faster!
```

**Implementation** (not yet done):
```typescript
interface AggregateSnapshot {
  aggregateId: string;
  aggregateVersion: number;
  state: JsonObject;
  timestamp: Date;
}

// Save snapshot every 100 events
if (aggregate.version % 100 === 0) {
  await snapshotStore.save(aggregate.toSnapshot());
}
```

---

## Message Size Limits

### Kafka Limits

```typescript
// Hard limit: 10MB per message
const MAX_MESSAGE_SIZE_MB = 10;

// Warning threshold: 1MB
const WARNING_THRESHOLD_MB = 1;
```

**Why Limits?**
- Kafka has broker-level limits (default 1MB, configured to 100MB)
- Large messages slow down consumers
- Large events indicate design issues

**Validation**:
```typescript
private validateMessageSize(serializedEvent: string): void {
  const sizeInBytes = Buffer.byteLength(serializedEvent, 'utf8');
  const sizeInMB = sizeInBytes / (1024 * 1024);
  
  if (sizeInBytes > MAX_MESSAGE_SIZE_BYTES) {
    throw new Error(`Event too large: ${sizeInMB.toFixed(2)} MB`);
  }
  
  if (sizeInBytes > WARNING_THRESHOLD_BYTES) {
    this.logger.warn(`Large event: ${sizeInMB.toFixed(2)} MB`);
  }
}
```

---

## Ordering Guarantees

### Kafka Ordering

Kafka guarantees ordering **per partition**:

```
Partition 0: [Event 1] → [Event 2] → [Event 3]  ✅ Ordered
Partition 1: [Event 4] → [Event 5] → [Event 6]  ✅ Ordered

Across partitions: NO ordering guarantee
```

### Our Strategy

**Partition by aggregateId**:
- All events for Account A go to same partition
- Events for Account A are ordered
- Events for Account A and Account B may be interleaved (but we don't care)

**Why This Works**:
- Aggregates are consistency boundaries
- Only need ordering within an aggregate
- Can process different aggregates in parallel

---

## Event Handlers

### Projection Updates

Events are consumed by handlers that update read models:

```typescript
@EventsHandler(BalanceChangedEvent)
export class BalanceChangedHandler implements IEventHandler<BalanceChangedEvent> {
  constructor(
    private accountProjectionService: AccountProjectionService,
  ) {}

  async handle(event: BalanceChangedEvent): Promise<void> {
    // Update projection (read model)
    await this.accountProjectionService.updateBalance(
      event.aggregateId,
      event.newBalance,
    );
  }
}
```

**Pattern**: 
1. Event published to EventBus
2. Handler updates projection
3. Queries read from projection (not events)

---

## Time Travel Debugging

### Query Historical State

```typescript
async getAccountBalanceAt(accountId: string, date: Date): Promise<string> {
  // Get all events up to that date
  const events = await eventStore.getEvents('Account', accountId);
  const historicalEvents = events.filter(e => e.timestamp <= date);
  
  // Replay events to reconstruct state
  const aggregate = new AccountAggregate();
  historicalEvents.forEach(e => aggregate.applyEvent(e));
  
  return aggregate.getBalance().toString();
}
```

**Use Cases**:
- "What was the balance on Dec 1?"
- "Reproduce production bug from yesterday"
- "Audit trail: show all changes to account X"

---

## Event Replay

### Rebuild Projections

If projections become corrupted or you want to add a new one:

```typescript
async rebuildAccountProjections(): Promise<void> {
  // 1. Clear existing projections
  await db.query('TRUNCATE account_projections');
  
  // 2. Replay all events
  const allEvents = eventStore.getAllEvents('Account');
  
  for await (const event of allEvents) {
    // Apply event to projection
    await balanceChangedHandler.handle(event);
  }
  
  // 3. Projections rebuilt from history!
}
```

**Benefits**:
- Fix projection bugs
- Add new projections
- Recover from data loss

---

## Eventual Consistency

### The Reality

Events are processed **asynchronously**:

```
Time 0ms:   Command executed
Time 10ms:  Event persisted to Kafka
Time 20ms:  Event consumed by handler
Time 30ms:  Projection updated
Time 40ms:  Query sees updated value
```

**Client Experience**:
```typescript
// 1. Submit command
const { transactionId } = await api.topup(data);
// Response: { status: "pending" }

// 2. Query immediately
const tx = await api.getTransaction(transactionId);
// May still show "pending" (projection not updated yet)

// 3. Query after 100ms
await sleep(100);
const tx2 = await api.getTransaction(transactionId);
// Now shows "completed"
```

**Typical Delay**: 50-200ms

---

## Best Practices

### 1. Events are Immutable

```typescript
// ❌ BAD: Modifying event
event.amount = "200.00";

// ✅ GOOD: Events are readonly
readonly amount: string;
```

### 2. Events are in Past Tense

```typescript
// ❌ BAD: Command-like names
class CreateAccount extends DomainEvent { }

// ✅ GOOD: Past tense (something that happened)
class AccountCreated extends DomainEvent { }
```

### 3. Keep Events Small

```typescript
// ❌ BAD: Huge metadata object
{
  metadata: {
    requestHeaders: { ... },  // 1KB
    fullUserProfile: { ... }, // 10KB
    sessionData: { ... }       // 5KB
  }
}

// ✅ GOOD: Only essential data
{
  metadata: {
    actorId: "user_123",
    actorType: "api"
  }
}
```

### 4. Event Naming Conventions

```typescript
// Pattern: <Entity><Action>
AccountCreated
BalanceChanged
TransferCompleted
PaymentRequested
```

---

## What's Simplified

For educational purposes, this implementation omits:

- ✗ **Event Versioning**: No upcasting strategy
- ✗ **Snapshots**: Full event replay every time
- ✗ **Optimistic Concurrency**: No version conflict detection
- ✗ **Event Compaction**: All events kept forever
- ✗ **Stream Processing**: No Kafka Streams for complex queries
- ✗ **Schema Registry**: No centralized schema management

A production system would need these!

---

## Related Documentation

- [CQRS Pattern](./cqrs-pattern.md) - Event sourcing works with CQRS
- [System Design](./system-design.md) - Overall architecture
- [Data Model](./data-model.md) - Database projections from events

---

**Next**: Learn about [Double-Entry Bookkeeping](./double-entry.md) →


# CQRS Module

## Overview

The CQRS module provides infrastructure for Command Query Responsibility Segregation and Event Sourcing. Includes base classes, Kafka event store, and integration with NestJS CQRS.

**Location**: `src/cqrs/`

---

## Module Structure

```
src/cqrs/
├── base/
│   ├── aggregate-root.ts           # Base class for aggregates
│   ├── command.ts                  # Base command class
│   ├── query.ts                    # Base query class
│   ├── domain-event.ts             # Base event class
│   └── index.ts
│
├── interfaces/
│   ├── event-store.interface.ts    # Event store contract
│   └── index.ts
│
└── kafka/
    ├── kafka.module.ts             # Kafka module
    ├── kafka.service.ts            # Kafka client wrapper
    └── kafka-event-store.ts        # Kafka event store implementation
```

---

## Base Classes

### AggregateRoot

**Purpose**: Base class for all domain aggregates.

**Location**: `src/cqrs/base/aggregate-root.ts`

**Key Features**:
- Manages uncommitted events
- Supports event replay for state reconstruction
- Tracks aggregate version
- Provides apply() method for emitting events

**Implementation**:

```typescript
abstract class AggregateRoot {
  protected aggregateId: string;
  protected version: number = 0;
  private uncommittedEvents: DomainEvent[] = [];
  
  // Abstract method - must be implemented
  protected abstract getAggregateType(): string;
  
  // Apply and record event
  protected apply(event: DomainEvent): void {
    this.applyEvent(event);
    this.uncommittedEvents.push(event);
    this.version++;
  }
  
  // Apply event to update state (called during replay)
  applyEvent(event: DomainEvent): void {
    const handler = this.getEventHandler(event);
    if (handler) {
      handler.call(this, event);
    }
  }
  
  // Get events to persist
  getUncommittedEvents(): DomainEvent[] {
    return this.uncommittedEvents;
  }
  
  // Mark events as persisted
  commit(): void {
    this.uncommittedEvents = [];
  }
  
  // Event handler routing
  private getEventHandler(event: DomainEvent) {
    const handlerName = `on${event.eventType}`;
    return this[handlerName];
  }
}
```

**Usage**:

```typescript
class AccountAggregate extends AggregateRoot {
  private balance: Decimal = new Decimal(0);
  
  protected getAggregateType(): string {
    return 'Account';
  }
  
  // Command method
  changeBalance(params) {
    // Business logic validation
    if (params.changeType === 'DEBIT' && this.balance.lessThan(params.amount)) {
      throw new Error('Insufficient balance');
    }
    
    // Emit event
    const event = new BalanceChangedEvent(...);
    this.apply(event);  // Calls applyEvent() + records event
  }
  
  // Event handler (called by apply)
  onBalanceChanged(event: BalanceChangedEvent): void {
    this.balance = new Decimal(event.newBalance);
  }
}
```

---

### DomainEvent

**Purpose**: Base class for all domain events.

**Location**: `src/cqrs/base/domain-event.ts`

**Structure**:

```typescript
abstract class DomainEvent {
  readonly eventId: string;            // Unique event ID
  readonly eventType: string;          // Event type name
  readonly aggregateId: string;        // Which aggregate
  readonly aggregateType: string;      // Type of aggregate
  readonly aggregateVersion: number;   // Version after event
  readonly timestamp: Date;            // When it occurred
  readonly correlationId: string;      // Request tracing
  readonly causationId?: string;       // What caused this event
  readonly metadata?: Record<string, unknown>;
  
  constructor(
    eventType: string,
    eventMetadata: EventMetadata
  ) {
    this.eventId = uuidv4();
    this.eventType = eventType;
    this.aggregateId = eventMetadata.aggregateId;
    this.aggregateVersion = eventMetadata.aggregateVersion;
    this.timestamp = new Date();
    this.correlationId = eventMetadata.correlationId;
    this.causationId = eventMetadata.causationId;
    this.metadata = eventMetadata.metadata;
  }
  
  // Serialize to JSON
  toJSON(): Record<string, unknown> {
    return {
      eventId: this.eventId,
      eventType: this.eventType,
      aggregateId: this.aggregateId,
      aggregateType: this.getAggregateType(),
      aggregateVersion: this.aggregateVersion,
      timestamp: this.timestamp.toISOString(),
      correlationId: this.correlationId,
      causationId: this.causationId,
      metadata: this.metadata,
      data: this.getEventData(),
    };
  }
  
  protected abstract getAggregateType(): string;
  protected abstract getEventData(): Record<string, unknown>;
}
```

**Usage**:

```typescript
class BalanceChangedEvent extends DomainEvent {
  constructor(
    public readonly previousBalance: string,
    public readonly newBalance: string,
    public readonly changeAmount: string,
    public readonly changeType: 'CREDIT' | 'DEBIT',
    public readonly reason: string,
    eventMetadata: EventMetadata,
  ) {
    super('BalanceChanged', eventMetadata);
  }
  
  protected getAggregateType(): string {
    return 'Account';
  }
  
  protected getEventData(): Record<string, unknown> {
    return {
      previousBalance: this.previousBalance,
      newBalance: this.newBalance,
      changeAmount: this.changeAmount,
      changeType: this.changeType,
      reason: this.reason,
    };
  }
}
```

---

### Command & Query

**Purpose**: Base classes for CQRS commands and queries.

```typescript
abstract class Command {
  readonly commandId: string = uuidv4();
  readonly timestamp: Date = new Date();
  
  abstract getCommandType(): string;
}

abstract class Query {
  readonly queryId: string = uuidv4();
  readonly timestamp: Date = new Date();
}
```

---

## Event Store

### IEventStore Interface

**Purpose**: Contract for event store implementations.

```typescript
interface IEventStore {
  // Append events to store
  append(
    aggregateType: string,
    aggregateId: string,
    events: DomainEvent[],
    expectedVersion?: number
  ): Promise<void>;
  
  // Get all events for aggregate
  getEvents(
    aggregateType: string,
    aggregateId: string,
    fromVersion?: number
  ): Promise<DomainEvent[]>;
  
  // Stream all events (for projections)
  getAllEvents(
    aggregateType: string,
    fromTimestamp?: Date
  ): AsyncGenerator<DomainEvent>;
}
```

---

### KafkaEventStore

**Purpose**: Kafka-based event store implementation.

**Location**: `src/cqrs/kafka/kafka-event-store.ts`

**Key Methods**:

#### append()

```typescript
async append(
  aggregateType: string,
  aggregateId: string,
  events: DomainEvent[]
): Promise<void> {
  const topic = `billing.${aggregateType.toLowerCase()}.events`;
  const producer = this.kafkaService.getProducer();
  
  const messages = events.map(event => ({
    key: aggregateId,  // Partition by aggregate ID
    value: JSON.stringify(event.toJSON()),
    headers: {
      eventType: Buffer.from(event.eventType),
      aggregateVersion: Buffer.from(event.aggregateVersion.toString()),
      correlationId: Buffer.from(event.correlationId),
    }
  }));
  
  await producer.send({ topic, messages });
}
```

**Partitioning**: Key = aggregateId ensures ordering per aggregate.

#### getEvents()

```typescript
async getEvents(
  aggregateType: string,
  aggregateId: string
): Promise<DomainEvent[]> {
  const topic = `billing.${aggregateType}.events`;
  const consumer = await this.kafkaService.createConsumer(consumerGroupId);
  const events: DomainEvent[] = [];
  
  await consumer.subscribe({ topics: [topic], fromBeginning: true });
  
  await consumer.run({
    eachMessage: async ({ message }) => {
      if (message.key?.toString() === aggregateId) {
        const eventData = JSON.parse(message.value!.toString());
        events.push(eventData);
      }
    }
  });
  
  return events;
}
```

**Note**: Simplified for learning. Production would use snapshots to avoid replaying all events.

---

## Kafka Service

**Purpose**: Wrapper around KafkaJS client.

**Location**: `src/cqrs/kafka/kafka.service.ts`

**Key Features**:
- Manages Kafka producer and consumers
- Connection pooling
- Health checks
- Lifecycle management (connect/disconnect)

**Usage**:

```typescript
@Injectable()
class KafkaService {
  async onModuleInit(): Promise<void> {
    await this.producer.connect();
    await this.admin.connect();
  }
  
  getProducer(): Producer {
    return this.producer;
  }
  
  async createConsumer(groupId: string): Promise<Consumer> {
    const consumer = this.kafka.consumer({ groupId });
    await consumer.connect();
    this.consumers.set(groupId, consumer);
    return consumer;
  }
  
  async isHealthy(): Promise<boolean> {
    try {
      await this.admin.listTopics();
      return true;
    } catch {
      return false;
    }
  }
}
```

---

## Integration with NestJS CQRS

### Command Flow

```typescript
// 1. Create command
const command = new TopupCommand(...);

// 2. Execute via CommandBus
await this.commandBus.execute(command);

// 3. NestJS routes to handler
@CommandHandler(TopupCommand)
class TopupHandler implements ICommandHandler<TopupCommand> {
  async execute(command: TopupCommand): Promise<string> {
    // Load aggregate
    const aggregate = new TransactionAggregate();
    
    // Execute business logic
    aggregate.requestTopup(command);
    
    // Persist events
    const events = aggregate.getUncommittedEvents();
    await this.eventStore.append('Transaction', command.transactionId, events);
    
    // Publish for async processing
    events.forEach(event => this.eventBus.publish(event));
    
    return command.transactionId;
  }
}
```

### Event Flow

```typescript
// 1. Event published via EventBus
this.eventBus.publish(new BalanceChangedEvent(...));

// 2. NestJS routes to handlers
@EventsHandler(BalanceChangedEvent)
class BalanceChangedHandler implements IEventHandler<BalanceChangedEvent> {
  async handle(event: BalanceChangedEvent): Promise<void> {
    // Update projection
    await this.projectionService.updateBalance(
      event.aggregateId,
      event.newBalance
    );
  }
}
```

### Query Flow

```typescript
// 1. Create query
const query = new GetAccountQuery(accountId);

// 2. Execute via QueryBus
const account = await this.queryBus.execute(query);

// 3. NestJS routes to handler
@QueryHandler(GetAccountQuery)
class GetAccountHandler implements IQueryHandler<GetAccountQuery> {
  async execute(query: GetAccountQuery): Promise<Account> {
    // Read from projection
    return await this.projectionService.findById(query.accountId);
  }
}
```

---

## Extension Points

### Add Custom Event Store

1. Implement `IEventStore` interface
2. Register in module providers
3. Use instead of KafkaEventStore

```typescript
@Injectable()
class PostgresEventStore implements IEventStore {
  async append(aggregateType, aggregateId, events) {
    // Store events in PostgreSQL
  }
  
  async getEvents(aggregateType, aggregateId) {
    // Query from PostgreSQL
  }
}

// In module
@Module({
  providers: [
    {
      provide: 'EVENT_STORE',
      useClass: PostgresEventStore  // Instead of KafkaEventStore
    }
  ]
})
```

---

## Testing

### In-Memory Event Store

For testing, use in-memory event store:

```typescript
class InMemoryEventStore implements IEventStore {
  private events: Map<string, DomainEvent[]> = new Map();
  
  async append(aggregateType, aggregateId, events) {
    const key = `${aggregateType}:${aggregateId}`;
    const existing = this.events.get(key) || [];
    this.events.set(key, [...existing, ...events]);
  }
  
  async getEvents(aggregateType, aggregateId) {
    const key = `${aggregateType}:${aggregateId}`;
    return this.events.get(key) || [];
  }
}
```

---

## Related Documentation

- [CQRS Pattern](../architecture/cqrs-pattern.md) - Architecture overview
- [Event Sourcing](../architecture/event-sourcing.md) - Event store details
- [System Design](../architecture/system-design.md) - Overall architecture


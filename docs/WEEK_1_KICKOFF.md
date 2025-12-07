# Week 1 Kickoff: Foundation Setup

**Project**: Billing Engine Event-Driven Transformation  
**Timeline**: 12 weeks total  
**Current Phase**: Week 1 - Foundation  
**Start Date**: TBD (Set by team)  
**Decision**: [ADR-0007](./adr/0007-async-event-sourcing-kafka.md)

---

## 🎯 Week 1 Goals

By end of Week 1, we will have:
- ✅ Kafka cluster running (3 brokers)
- ✅ All topics created with proper configuration
- ✅ Schema Registry operational
- ✅ Monitoring dashboards live
- ✅ First event published and consumed (proof of concept)

**Success Criteria**: Can publish an event to Kafka and consume it successfully.

---

## 📅 Day-by-Day Plan

### **Day 1 (Monday): Kafka Setup & Team Kickoff**

#### Morning: Team Kickoff (2-3 hours)
```
09:00 - 09:30  Project kickoff meeting
               - Present ADR-0007
               - Review 12-week timeline
               - Assign roles & responsibilities

09:30 - 10:30  CQRS & Event Sourcing concepts
               - Watch: Greg Young - CQRS & Event Sourcing (1 hour)
               - Discuss: Questions & clarifications

10:30 - 11:00  Kafka fundamentals overview
               - Topics, partitions, replication
               - Producers & consumers
               - Guarantees & ordering

11:00 - 12:00  Review implementation roadmap
               - Week-by-week breakdown
               - Dependencies & risks
               - Communication plan
```

#### Afternoon: Kafka Infrastructure (4-5 hours)

**Option A: Local Development (Docker Compose)**

1. **Create Kafka Docker Compose** (30 min)
```bash
cd /Users/macbook/projects/billing-engine
mkdir -p infrastructure/kafka
```

Create `infrastructure/kafka/docker-compose.yml`:
```yaml
version: '3.8'

services:
  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    container_name: billing-zookeeper
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_TICK_TIME: 2000
      ZOOKEEPER_SERVER_ID: 1
    ports:
      - "2181:2181"
    volumes:
      - zookeeper-data:/var/lib/zookeeper/data
      - zookeeper-logs:/var/lib/zookeeper/log
    networks:
      - billing-network

  kafka-1:
    image: confluentinc/cp-kafka:7.5.0
    container_name: billing-kafka-1
    depends_on:
      - zookeeper
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092,PLAINTEXT_INTERNAL://kafka-1:19092
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,PLAINTEXT_INTERNAL:PLAINTEXT
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT_INTERNAL
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 3
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 2
      KAFKA_MIN_INSYNC_REPLICAS: 2
      KAFKA_DEFAULT_REPLICATION_FACTOR: 3
      KAFKA_NUM_PARTITIONS: 10
      KAFKA_LOG_RETENTION_MS: -1
    ports:
      - "9092:9092"
    volumes:
      - kafka-1-data:/var/lib/kafka/data
    networks:
      - billing-network

  kafka-2:
    image: confluentinc/cp-kafka:7.5.0
    container_name: billing-kafka-2
    depends_on:
      - zookeeper
    environment:
      KAFKA_BROKER_ID: 2
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9093,PLAINTEXT_INTERNAL://kafka-2:19093
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,PLAINTEXT_INTERNAL:PLAINTEXT
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT_INTERNAL
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 3
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 2
      KAFKA_MIN_INSYNC_REPLICAS: 2
      KAFKA_DEFAULT_REPLICATION_FACTOR: 3
    ports:
      - "9093:9093"
    volumes:
      - kafka-2-data:/var/lib/kafka/data
    networks:
      - billing-network

  kafka-3:
    image: confluentinc/cp-kafka:7.5.0
    container_name: billing-kafka-3
    depends_on:
      - zookeeper
    environment:
      KAFKA_BROKER_ID: 3
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9094,PLAINTEXT_INTERNAL://kafka-3:19094
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,PLAINTEXT_INTERNAL:PLAINTEXT
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT_INTERNAL
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 3
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 2
      KAFKA_MIN_INSYNC_REPLICAS: 2
      KAFKA_DEFAULT_REPLICATION_FACTOR: 3
    ports:
      - "9094:9094"
    volumes:
      - kafka-3-data:/var/lib/kafka/data
    networks:
      - billing-network

  schema-registry:
    image: confluentinc/cp-schema-registry:7.5.0
    container_name: billing-schema-registry
    depends_on:
      - kafka-1
      - kafka-2
      - kafka-3
    environment:
      SCHEMA_REGISTRY_HOST_NAME: schema-registry
      SCHEMA_REGISTRY_KAFKASTORE_BOOTSTRAP_SERVERS: kafka-1:19092,kafka-2:19093,kafka-3:19094
      SCHEMA_REGISTRY_LISTENERS: http://0.0.0.0:8081
    ports:
      - "8081:8081"
    networks:
      - billing-network

  kafka-ui:
    image: provectuslabs/kafka-ui:latest
    container_name: billing-kafka-ui
    depends_on:
      - kafka-1
      - kafka-2
      - kafka-3
      - schema-registry
    environment:
      KAFKA_CLUSTERS_0_NAME: billing-cluster
      KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS: kafka-1:19092,kafka-2:19093,kafka-3:19094
      KAFKA_CLUSTERS_0_SCHEMAREGISTRY: http://schema-registry:8081
      KAFKA_CLUSTERS_0_METRICS_PORT: 9997
    ports:
      - "8080:8080"
    networks:
      - billing-network

volumes:
  zookeeper-data:
  zookeeper-logs:
  kafka-1-data:
  kafka-2-data:
  kafka-3-data:

networks:
  billing-network:
    driver: bridge
```

2. **Start Kafka Cluster** (10 min)
```bash
cd infrastructure/kafka
docker-compose up -d

# Wait for cluster to be ready (2-3 minutes)
docker-compose ps

# Check logs
docker-compose logs -f kafka-1
```

3. **Verify Cluster Health** (10 min)
```bash
# Access Kafka UI
open http://localhost:8080

# Or use CLI
docker exec billing-kafka-1 kafka-broker-api-versions \
  --bootstrap-server localhost:9092
```

**Option B: Managed Kafka (Confluent Cloud)** - Skip if using Docker

1. Sign up for Confluent Cloud (free tier available)
2. Create cluster (Basic or Standard)
3. Configure retention (indefinite for event sourcing)
4. Note connection details for later

---

### **Day 2 (Tuesday): Topic Creation & Monitoring**

#### Morning: Create Kafka Topics (2 hours)

1. **Create Topic Creation Script** (30 min)

Create `infrastructure/kafka/create-topics.sh`:
```bash
#!/bin/bash

BOOTSTRAP_SERVERS="localhost:9092,localhost:9093,localhost:9094"

echo "Creating Kafka topics for Billing Engine..."

# Account events
docker exec billing-kafka-1 kafka-topics --create \
  --bootstrap-server $BOOTSTRAP_SERVERS \
  --topic billing.account.events \
  --partitions 10 \
  --replication-factor 3 \
  --config retention.ms=-1 \
  --config min.insync.replicas=2 \
  --config compression.type=lz4 \
  --if-not-exists

echo "✅ Created: billing.account.events"

# Transaction events
docker exec billing-kafka-1 kafka-topics --create \
  --bootstrap-server $BOOTSTRAP_SERVERS \
  --topic billing.transaction.events \
  --partitions 10 \
  --replication-factor 3 \
  --config retention.ms=-1 \
  --config min.insync.replicas=2 \
  --config compression.type=lz4 \
  --if-not-exists

echo "✅ Created: billing.transaction.events"

# Saga events
docker exec billing-kafka-1 kafka-topics --create \
  --bootstrap-server $BOOTSTRAP_SERVERS \
  --topic billing.saga.events \
  --partitions 5 \
  --replication-factor 3 \
  --config retention.ms=-1 \
  --config min.insync.replicas=2 \
  --config compression.type=lz4 \
  --if-not-exists

echo "✅ Created: billing.saga.events"

# Dead letter queue
docker exec billing-kafka-1 kafka-topics --create \
  --bootstrap-server $BOOTSTRAP_SERVERS \
  --topic billing.dead-letter \
  --partitions 1 \
  --replication-factor 3 \
  --config retention.ms=-1 \
  --config min.insync.replicas=2 \
  --if-not-exists

echo "✅ Created: billing.dead-letter"

# List all topics
echo ""
echo "All topics:"
docker exec billing-kafka-1 kafka-topics --list \
  --bootstrap-server $BOOTSTRAP_SERVERS

echo ""
echo "✅ All topics created successfully!"
```

2. **Run Topic Creation** (5 min)
```bash
chmod +x infrastructure/kafka/create-topics.sh
./infrastructure/kafka/create-topics.sh
```

3. **Verify Topics** (10 min)
```bash
# Describe account events topic
docker exec billing-kafka-1 kafka-topics --describe \
  --bootstrap-server localhost:9092 \
  --topic billing.account.events

# Check Kafka UI
open http://localhost:8080
```

#### Afternoon: Monitoring Setup (4 hours)

1. **Add Prometheus & Grafana** (1 hour)

Update `infrastructure/kafka/docker-compose.yml`, add:
```yaml
  prometheus:
    image: prom/prometheus:latest
    container_name: billing-prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    ports:
      - "9090:9090"
    networks:
      - billing-network

  grafana:
    image: grafana/grafana:latest
    container_name: billing-grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false
    volumes:
      - grafana-data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning
    ports:
      - "3000:3000"
    networks:
      - billing-network
    depends_on:
      - prometheus

volumes:
  # ... existing volumes ...
  prometheus-data:
  grafana-data:
```

2. **Create Prometheus Config** (30 min)

Create `infrastructure/kafka/prometheus.yml`:
```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'kafka'
    static_configs:
      - targets: ['kafka-1:9092', 'kafka-2:9093', 'kafka-3:9094']
  
  - job_name: 'billing-api'
    static_configs:
      - targets: ['host.docker.internal:3001']
```

3. **Import Grafana Dashboards** (1 hour)
- Kafka Overview
- Consumer Lag
- Topic Metrics
- Broker Health

4. **Restart & Verify** (30 min)
```bash
cd infrastructure/kafka
docker-compose up -d

# Access Grafana
open http://localhost:3000
# Login: admin / admin
```

---

### **Day 3 (Wednesday): NestJS CQRS Setup**

#### Morning: Install Dependencies (2 hours)

1. **Install Packages** (10 min)
```bash
cd /Users/macbook/projects/billing-engine

npm install @nestjs/cqrs@^10.0.0
npm install kafkajs@^2.2.4
npm install @nestjs/microservices@^10.0.0
npm install @confluentinc/schemaregistry@^3.0.0

npm install --save-dev @types/kafkajs
```

2. **Create CQRS Module Structure** (30 min)
```bash
mkdir -p src/cqrs/base
mkdir -p src/cqrs/kafka
mkdir -p src/cqrs/interfaces
```

3. **Create Base Classes** (1 hour)

See implementation in afternoon section.

#### Afternoon: Base Classes Implementation (4 hours)

1. **Domain Event Base Class** (30 min)

Create `src/cqrs/base/domain-event.ts`:
```typescript
import { v4 as uuidv4 } from 'uuid';

export abstract class DomainEvent {
  readonly eventId: string;
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly aggregateVersion: number;
  readonly timestamp: Date;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly metadata?: Record<string, any>;

  constructor(props: {
    aggregateId: string;
    aggregateType: string;
    aggregateVersion: number;
    correlationId: string;
    causationId?: string;
    metadata?: Record<string, any>;
  }) {
    this.eventId = uuidv4();
    this.aggregateId = props.aggregateId;
    this.aggregateType = props.aggregateType;
    this.aggregateVersion = props.aggregateVersion;
    this.timestamp = new Date();
    this.correlationId = props.correlationId;
    this.causationId = props.causationId;
    this.metadata = props.metadata || {};
  }

  abstract getEventType(): string;
}
```

2. **Command Base Class** (20 min)

Create `src/cqrs/base/command.ts`:
```typescript
import { v4 as uuidv4 } from 'uuid';

export abstract class Command {
  readonly commandId: string;
  readonly timestamp: Date;
  readonly correlationId: string;
  readonly actorId?: string;

  constructor(
    correlationId?: string,
    actorId?: string,
  ) {
    this.commandId = uuidv4();
    this.timestamp = new Date();
    this.correlationId = correlationId || uuidv4();
    this.actorId = actorId;
  }
}
```

3. **Query Base Class** (20 min)

Create `src/cqrs/base/query.ts`:
```typescript
import { v4 as uuidv4 } from 'uuid';

export abstract class Query {
  readonly queryId: string;
  readonly timestamp: Date;
  readonly correlationId?: string;

  constructor(correlationId?: string) {
    this.queryId = uuidv4();
    this.timestamp = new Date();
    this.correlationId = correlationId;
  }
}
```

4. **Aggregate Root Base Class** (1 hour)

Create `src/cqrs/base/aggregate-root.ts`:
```typescript
import { DomainEvent } from './domain-event';

export abstract class AggregateRoot {
  protected aggregateId: string;
  protected version: number = 0;
  private uncommittedEvents: DomainEvent[] = [];

  protected abstract getAggregateType(): string;

  protected apply(event: DomainEvent, isNew: boolean = true): void {
    // Call the appropriate event handler
    const handler = this.getEventHandler(event);
    if (handler) {
      handler.call(this, event);
    }

    if (isNew) {
      this.uncommittedEvents.push(event);
    }

    this.version = event.aggregateVersion;
  }

  private getEventHandler(event: DomainEvent): Function | undefined {
    const eventType = event.getEventType();
    const handlerName = `on${eventType}`;
    return (this as any)[handlerName];
  }

  getUncommittedEvents(): DomainEvent[] {
    return [...this.uncommittedEvents];
  }

  commit(): void {
    this.uncommittedEvents = [];
  }

  getId(): string {
    return this.aggregateId;
  }

  getVersion(): number {
    return this.version;
  }

  static fromEvents<T extends AggregateRoot>(
    this: new () => T,
    events: DomainEvent[],
  ): T {
    const aggregate = new this();
    events.forEach(event => {
      aggregate.apply(event, false);
    });
    return aggregate;
  }
}
```

5. **Create Interfaces** (30 min)

Create `src/cqrs/interfaces/event-store.interface.ts`:
```typescript
import { DomainEvent } from '../base/domain-event';

export interface IEventStore {
  append(
    aggregateType: string,
    aggregateId: string,
    events: DomainEvent[],
    expectedVersion?: number,
  ): Promise<void>;

  getEvents(
    aggregateType: string,
    aggregateId: string,
    fromVersion?: number,
  ): Promise<DomainEvent[]>;

  getAllEvents(
    aggregateType: string,
    fromTimestamp?: Date,
  ): AsyncGenerator<DomainEvent>;
}
```

---

### **Day 4 (Thursday): Kafka Integration**

#### Full Day: Kafka Event Store Implementation (6-7 hours)

1. **Kafka Module** (1 hour)

Create `src/cqrs/kafka/kafka.module.ts`:
```typescript
import { Module, Global } from '@nestjs/common';
import { KafkaEventStore } from './kafka-event-store';
import { KafkaService } from './kafka.service';

@Global()
@Module({
  providers: [
    KafkaService,
    {
      provide: 'EVENT_STORE',
      useClass: KafkaEventStore,
    },
  ],
  exports: ['EVENT_STORE', KafkaService],
})
export class KafkaModule {}
```

2. **Kafka Service** (2 hours)

Create `src/cqrs/kafka/kafka.service.ts`:
```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Producer, Consumer, Admin } from 'kafkajs';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private kafka: Kafka;
  private producer: Producer;
  private admin: Admin;
  private consumers: Map<string, Consumer> = new Map();

  constructor(private configService: ConfigService) {
    this.kafka = new Kafka({
      clientId: 'billing-engine',
      brokers: this.configService.get('KAFKA_BROKERS', 'localhost:9092,localhost:9093,localhost:9094').split(','),
      retry: {
        initialRetryTime: 100,
        retries: 8,
      },
    });

    this.producer = this.kafka.producer({
      allowAutoTopicCreation: false,
      transactionalId: 'billing-producer',
    });

    this.admin = this.kafka.admin();
  }

  async onModuleInit() {
    await this.producer.connect();
    await this.admin.connect();
    console.log('✅ Kafka producer connected');
  }

  async onModuleDestroy() {
    await this.producer.disconnect();
    await this.admin.disconnect();
    
    for (const [groupId, consumer] of this.consumers) {
      await consumer.disconnect();
    }
  }

  getProducer(): Producer {
    return this.producer;
  }

  async createConsumer(groupId: string): Promise<Consumer> {
    if (this.consumers.has(groupId)) {
      return this.consumers.get(groupId)!;
    }

    const consumer = this.kafka.consumer({
      groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });

    await consumer.connect();
    this.consumers.set(groupId, consumer);

    return consumer;
  }

  getAdmin(): Admin {
    return this.admin;
  }
}
```

3. **Kafka Event Store** (3 hours)

Create `src/cqrs/kafka/kafka-event-store.ts`:
```typescript
import { Injectable, Inject } from '@nestjs/common';
import { IEventStore } from '../interfaces/event-store.interface';
import { DomainEvent } from '../base/domain-event';
import { KafkaService } from './kafka.service';

@Injectable()
export class KafkaEventStore implements IEventStore {
  constructor(private kafkaService: KafkaService) {}

  async append(
    aggregateType: string,
    aggregateId: string,
    events: DomainEvent[],
    expectedVersion?: number,
  ): Promise<void> {
    const topic = this.getTopicName(aggregateType);
    const producer = this.kafkaService.getProducer();

    // Optimistic concurrency check would go here
    // For now, we'll implement basic version checking later

    const messages = events.map(event => ({
      key: aggregateId,
      value: JSON.stringify(event),
      headers: {
        eventType: event.getEventType(),
        eventVersion: '1',
        aggregateType: aggregateType,
        aggregateVersion: event.aggregateVersion.toString(),
        correlationId: event.correlationId,
        timestamp: event.timestamp.toISOString(),
      },
    }));

    await producer.send({
      topic,
      messages,
    });
  }

  async getEvents(
    aggregateType: string,
    aggregateId: string,
    fromVersion?: number,
  ): Promise<DomainEvent[]> {
    // This is a simplified version
    // In production, you'd want to use Kafka's offset management
    // and potentially cache aggregate state
    
    const topic = this.getTopicName(aggregateType);
    const consumer = await this.kafkaService.createConsumer(`${aggregateId}-loader`);

    const events: DomainEvent[] = [];

    await consumer.subscribe({ topic, fromBeginning: true });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        consumer.disconnect();
        resolve(events);
      }, 5000); // 5 second timeout

      consumer.run({
        eachMessage: async ({ message }) => {
          if (message.key?.toString() === aggregateId) {
            const event = JSON.parse(message.value!.toString());
            
            if (!fromVersion || event.aggregateVersion >= fromVersion) {
              events.push(event);
            }
          }
        },
      }).catch(reject);
    });
  }

  async *getAllEvents(
    aggregateType: string,
    fromTimestamp?: Date,
  ): AsyncGenerator<DomainEvent> {
    const topic = this.getTopicName(aggregateType);
    const consumer = await this.kafkaService.createConsumer(`${aggregateType}-stream`);

    await consumer.subscribe({ topic, fromBeginning: true });

    // This is a generator that yields events as they're consumed
    // Implementation would be more complex in production
    yield* [];
  }

  private getTopicName(aggregateType: string): string {
    return `billing.${aggregateType.toLowerCase()}.events`;
  }
}
```

4. **Update .env** (10 min)
```bash
# Add to .env
KAFKA_BROKERS=localhost:9092,localhost:9093,localhost:9094
KAFKA_CLIENT_ID=billing-engine
```

---

### **Day 5 (Friday): First Event POC & Week Wrap-up**

#### Morning: First Event Implementation (3 hours)

1. **Create First Domain Event** (30 min)

Create `src/modules/account/events/account-created.event.ts`:
```typescript
import { DomainEvent } from '../../../cqrs/base/domain-event';
import { AccountType } from '../../account/account.entity';

export class AccountCreatedEvent extends DomainEvent {
  constructor(
    public readonly ownerId: string,
    public readonly ownerType: string,
    public readonly accountType: AccountType,
    public readonly currency: string,
    public readonly maxBalance?: string,
    public readonly minBalance?: string,
    props: {
      aggregateId: string;
      aggregateVersion: number;
      correlationId: string;
    },
  ) {
    super({
      ...props,
      aggregateType: 'Account',
    });
  }

  getEventType(): string {
    return 'AccountCreated';
  }
}
```

2. **Create Test Command** (30 min)

Create `src/modules/account/commands/create-account.command.ts`:
```typescript
import { Command } from '../../../cqrs/base/command';
import { AccountType } from '../account.entity';

export class CreateAccountCommand extends Command {
  constructor(
    public readonly accountId: string,
    public readonly ownerId: string,
    public readonly ownerType: string,
    public readonly accountType: AccountType,
    public readonly currency: string,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}
```

3. **Create Command Handler** (1 hour)

Create `src/modules/account/handlers/create-account.handler.ts`:
```typescript
import { CommandHandler, ICommandHandler, EventBus } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { CreateAccountCommand } from '../commands/create-account.command';
import { IEventStore } from '../../../cqrs/interfaces/event-store.interface';
import { AccountCreatedEvent } from '../events/account-created.event';

@CommandHandler(CreateAccountCommand)
export class CreateAccountHandler implements ICommandHandler<CreateAccountCommand> {
  constructor(
    @Inject('EVENT_STORE') private eventStore: IEventStore,
    private eventBus: EventBus,
  ) {}

  async execute(command: CreateAccountCommand): Promise<void> {
    // Create event
    const event = new AccountCreatedEvent(
      command.ownerId,
      command.ownerType,
      command.accountType,
      command.currency,
      undefined, // maxBalance
      undefined, // minBalance
      {
        aggregateId: command.accountId,
        aggregateVersion: 1,
        correlationId: command.correlationId,
      },
    );

    // Save to Kafka
    await this.eventStore.append('Account', command.accountId, [event]);

    // Publish for async handlers
    this.eventBus.publish(event);

    console.log(`✅ Account created: ${command.accountId}`);
  }
}
```

4. **Create Event Handler** (30 min)

Create `src/modules/account/handlers/account-created.handler.ts`:
```typescript
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { AccountCreatedEvent } from '../events/account-created.event';

@EventsHandler(AccountCreatedEvent)
export class AccountCreatedHandler implements IEventHandler<AccountCreatedEvent> {
  async handle(event: AccountCreatedEvent) {
    console.log(`📨 Handling AccountCreatedEvent: ${event.aggregateId}`);
    
    // This is where you'd update projections
    // For now, just log
    console.log(`  - Owner: ${event.ownerId}`);
    console.log(`  - Type: ${event.accountType}`);
    console.log(`  - Currency: ${event.currency}`);
  }
}
```

5. **Update Account Module** (30 min)

Update `src/modules/account/account.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { KafkaModule } from '../../cqrs/kafka/kafka.module';
import { CreateAccountHandler } from './handlers/create-account.handler';
import { AccountCreatedHandler } from './handlers/account-created.handler';
// ... existing imports

@Module({
  imports: [
    // ... existing imports
    CqrsModule,
    KafkaModule,
  ],
  controllers: [AccountController],
  providers: [
    AccountService,
    // Command handlers
    CreateAccountHandler,
    // Event handlers
    AccountCreatedHandler,
    // ... existing providers
  ],
  exports: [AccountService],
})
export class AccountModule {}
```

#### Afternoon: Testing & Week Wrap-up (3 hours)

1. **Write POC Test** (1 hour)

Create `test/week1-poc.e2e-spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { CommandBus, EventBus } from '@nestjs/cqrs';
import { CreateAccountCommand } from '../src/modules/account/commands/create-account.command';
import { AccountType } from '../src/modules/account/account.entity';
import { AppModule } from '../src/app.module';

describe('Week 1 POC - First Event (e2e)', () => {
  let app: TestingModule;
  let commandBus: CommandBus;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    await app.init();

    commandBus = app.get<CommandBus>(CommandBus);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should publish first event to Kafka', async () => {
    const accountId = 'test-account-1';
    
    const command = new CreateAccountCommand(
      accountId,
      'user-1',
      'USER',
      AccountType.USER,
      'USD',
    );

    await commandBus.execute(command);

    // Wait a bit for async processing
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check Kafka UI to verify event was published
    console.log('✅ POC Test Complete');
    console.log('📋 Verify in Kafka UI: http://localhost:8080');
  });
});
```

2. **Run POC Test** (30 min)
```bash
npm run test:e2e -- week1-poc.e2e-spec.ts
```

3. **Week 1 Retrospective** (1 hour)
- What went well?
- What challenges did we face?
- Any adjustments needed for Week 2?
- Update timeline if necessary

4. **Documentation** (30 min)
- Document any deviations from plan
- Update ADR-0007 if needed
- Prepare Week 2 detailed plan

---

## ✅ Week 1 Success Checklist

By end of Friday, verify:

### Infrastructure
- [ ] Kafka cluster running (3 brokers)
- [ ] All 4 topics created
- [ ] Schema Registry operational
- [ ] Kafka UI accessible
- [ ] Prometheus collecting metrics
- [ ] Grafana dashboards working

### Code
- [ ] @nestjs/cqrs installed
- [ ] kafkajs installed
- [ ] Base classes created (DomainEvent, Command, Query, AggregateRoot)
- [ ] Kafka integration complete
- [ ] First event (AccountCreated) defined
- [ ] First command handler working
- [ ] First event handler working

### Testing
- [ ] POC test passing
- [ ] Event visible in Kafka UI
- [ ] Event handler logs visible
- [ ] No errors in console

### Team
- [ ] Everyone understands CQRS basics
- [ ] Everyone can run Kafka locally
- [ ] Everyone can publish/consume events
- [ ] Communication channels established

---

## 🚨 Common Issues & Solutions

### Issue: Kafka won't start
```bash
# Check ports
lsof -i :9092
lsof -i :9093
lsof -i :9094

# Clear volumes and restart
docker-compose down -v
docker-compose up -d
```

### Issue: Can't connect to Kafka
```bash
# Check broker connectivity
docker exec billing-kafka-1 kafka-broker-api-versions \
  --bootstrap-server localhost:9092

# Check network
docker network inspect kafka_billing-network
```

### Issue: Schema Registry not working
```bash
# Test Schema Registry
curl http://localhost:8081/subjects

# Check logs
docker-compose logs schema-registry
```

---

## 📞 Communication

### Daily Standup (15 min)
- What did I do yesterday?
- What will I do today?
- Any blockers?

### Slack Channels
- `#billing-transformation` - General discussion
- `#billing-tech` - Technical issues
- `#billing-daily` - Daily updates

### End-of-Day Status
Post in Slack:
- ✅ Completed tasks
- 🚧 In-progress tasks
- ❌ Blockers
- 📅 Tomorrow's plan

---

## 📚 Resources

### Learning Materials
- [NestJS CQRS Docs](https://docs.nestjs.com/recipes/cqrs)
- [KafkaJS Documentation](https://kafka.js.org/)
- [Event Sourcing by Martin Fowler](https://martinfowler.com/eaaDev/EventSourcing.html)
- [CQRS by Greg Young](https://cqrs.files.wordpress.com/2010/11/cqrs_documents.pdf)

### Project Docs
- [ADR-0007](./adr/0007-async-event-sourcing-kafka.md)
- [Implementation Roadmap](./IMPLEMENTATION_ROADMAP.md)
- [Analysis](./async-and-event-sourcing-analysis.md)

---

## 🎯 Week 2 Preview

Next week we'll:
1. Implement Account aggregate (complete)
2. Implement all account domain events
3. Create account command handlers
4. Set up projection for account balance
5. Create first query handler

**Goal**: Complete Account aggregate with event sourcing

---

**Status**: Ready to start! 🚀  
**Questions**: Ask in #billing-transformation  
**Blocker**: Escalate immediately


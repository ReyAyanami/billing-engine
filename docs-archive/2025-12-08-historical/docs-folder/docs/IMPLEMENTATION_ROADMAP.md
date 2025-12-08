# Implementation Roadmap: Async Processing & Event Sourcing

**Based on**: [ADR-0007](./adr/0007-async-event-sourcing-kafka.md)  
**Timeline**: 12 weeks  
**Approach**: One-sweep implementation with Kafka

---

## 🎯 Overview

Transform the billing engine from synchronous to event-driven architecture in 12 weeks.

**Key Principle**: Build complete new system alongside current, validate extensively, then cutover.

---

## 📅 Week-by-Week Plan

### 🏗️ **Weeks 1-2: Foundation**

**Goal**: Infrastructure and framework setup

#### Week 1: Kafka Infrastructure

**Day 1-2: Provision Kafka**
```bash
# Option 1: Local Development (Docker Compose)
docker-compose.kafka.yml:
  - zookeeper
  - kafka-1, kafka-2, kafka-3 (cluster)
  - schema-registry
  - kafka-ui (management)

# Option 2: Managed (Confluent Cloud)
- Create cluster
- Configure retention (indefinite)
- Set up Schema Registry
- Create service accounts
```

**Day 3-4: Create Topics**
```bash
# Create event store topics
kafka-topics --create --topic billing.account.events \
  --partitions 10 --replication-factor 3 \
  --config retention.ms=-1  # Indefinite

kafka-topics --create --topic billing.transaction.events \
  --partitions 10 --replication-factor 3 \
  --config retention.ms=-1

kafka-topics --create --topic billing.saga.events \
  --partitions 5 --replication-factor 3 \
  --config retention.ms=-1

kafka-topics --create --topic billing.dead-letter \
  --partitions 1 --replication-factor 3
```

**Day 5: Monitoring Setup**
```yaml
# Prometheus exporters
- kafka-exporter
- jmx-exporter (Kafka JMX metrics)

# Grafana dashboards
- Kafka Overview
- Consumer Lag
- Topic Metrics
- Broker Health
```

**Deliverables**:
- ✅ 3-broker Kafka cluster running
- ✅ All topics created with proper configuration
- ✅ Schema Registry operational
- ✅ Monitoring dashboards live

#### Week 2: NestJS CQRS Framework

**Day 1-2: Install Dependencies**
```bash
npm install @nestjs/cqrs kafkajs @nestjs/microservices
npm install --save-dev @types/kafkajs
```

**Day 3: Base Classes**
```typescript
// src/cqrs/base/domain-event.ts
export abstract class DomainEvent {
  aggregateId: string;
  aggregateVersion: number;
  eventId: string = uuidv4();
  timestamp: Date = new Date();
  correlationId: string;
  causationId?: string;
  metadata?: Record<string, any>;
}

// src/cqrs/base/command.ts
export abstract class Command {
  commandId: string = uuidv4();
  timestamp: Date = new Date();
  correlationId: string;
  actorId?: string;
}

// src/cqrs/base/query.ts
export abstract class Query {
  queryId: string = uuidv4();
  timestamp: Date = new Date();
}

// src/cqrs/base/aggregate-root.ts
export abstract class AggregateRoot {
  private uncommittedEvents: DomainEvent[] = [];
  protected version: number = 0;
  
  protected apply(event: DomainEvent, isNew: boolean = true): void {
    const handler = this.getEventHandler(event);
    handler.call(this, event);
    
    if (isNew) {
      this.uncommittedEvents.push(event);
    }
    this.version = event.aggregateVersion;
  }
  
  getUncommittedEvents(): DomainEvent[] {
    return [...this.uncommittedEvents];
  }
  
  commit(): void {
    this.uncommittedEvents = [];
  }
}
```

**Day 4-5: Kafka Integration**
```typescript
// src/cqrs/kafka/kafka-event-store.ts
@Injectable()
export class KafkaEventStore implements IEventStore {
  constructor(
    @Inject('KAFKA_PRODUCER') private producer: Producer,
    private schemaRegistry: SchemaRegistry,
  ) {}

  async append(
    aggregateType: string,
    aggregateId: string,
    events: DomainEvent[],
  ): Promise<void> {
    const topic = `billing.${aggregateType.toLowerCase()}.events`;
    
    await this.producer.send({
      topic,
      messages: events.map(event => ({
        key: aggregateId,
        value: await this.schemaRegistry.encode(event),
        headers: {
          eventType: event.constructor.name,
          eventVersion: '1',
          correlationId: event.correlationId,
        },
      })),
    });
  }

  async getEvents(
    aggregateType: string,
    aggregateId: string,
  ): Promise<DomainEvent[]> {
    // Use Kafka consumer to read from beginning
    const topic = `billing.${aggregateType.toLowerCase()}.events`;
    const events: DomainEvent[] = [];
    
    // Read partition for this aggregateId
    const partition = this.getPartition(aggregateId, topic);
    
    // Seek to beginning and read all
    // (Use Kafka consumer with fromBeginning: true)
    
    return events;
  }
}
```

**Deliverables**:
- ✅ CQRS base classes
- ✅ Kafka event store implementation
- ✅ Schema registry integration
- ✅ Basic tests for infrastructure

---

### 💰 **Weeks 3-5: Core Domain**

**Goal**: Implement aggregates, events, and commands

#### Week 3: Account Aggregate

**Domain Events**:
```typescript
// src/modules/account/events/account-created.event.ts
export class AccountCreatedEvent extends DomainEvent {
  ownerId: string;
  ownerType: string;
  accountType: AccountType;
  currency: string;
  maxBalance?: string;
  minBalance?: string;
}

// src/modules/account/events/balance-changed.event.ts
export class BalanceChangedEvent extends DomainEvent {
  balanceBefore: string;
  balanceAfter: string;
  reason: string;
  transactionId: string;
}
```

**Account Aggregate**:
```typescript
// src/modules/account/aggregates/account.aggregate.ts
export class AccountAggregate extends AggregateRoot {
  private accountId: string;
  private balance: Decimal = new Decimal(0);
  private currency: string;
  private accountType: AccountType;
  private status: AccountStatus;
  private maxBalance?: Decimal;
  private minBalance?: Decimal;

  create(cmd: CreateAccountCommand): void {
    this.validateCreate(cmd);
    
    this.apply(new AccountCreatedEvent({
      aggregateId: cmd.accountId,
      aggregateVersion: 1,
      ...cmd,
    }));
  }

  credit(amount: Decimal, transactionId: string): void {
    const newBalance = this.balance.plus(amount);
    
    // Check max balance
    if (this.maxBalance && newBalance.greaterThan(this.maxBalance)) {
      throw new BalanceLimitExceededException();
    }
    
    this.apply(new BalanceChangedEvent({
      aggregateId: this.accountId,
      aggregateVersion: this.version + 1,
      balanceBefore: this.balance.toString(),
      balanceAfter: newBalance.toString(),
      reason: 'credit',
      transactionId,
    }));
  }

  debit(amount: Decimal, transactionId: string): void {
    const newBalance = this.balance.minus(amount);
    
    // Check min balance / insufficient funds
    if (this.accountType === AccountType.USER && newBalance.lessThan(0)) {
      throw new InsufficientBalanceException();
    }
    
    this.apply(new BalanceChangedEvent({
      aggregateId: this.accountId,
      aggregateVersion: this.version + 1,
      balanceBefore: this.balance.toString(),
      balanceAfter: newBalance.toString(),
      reason: 'debit',
      transactionId,
    }));
  }

  // Event handlers (pure functions)
  onAccountCreated(event: AccountCreatedEvent): void {
    this.accountId = event.aggregateId;
    this.currency = event.currency;
    this.accountType = event.accountType;
    this.status = AccountStatus.ACTIVE;
    this.maxBalance = event.maxBalance ? new Decimal(event.maxBalance) : undefined;
    this.minBalance = event.minBalance ? new Decimal(event.minBalance) : undefined;
  }

  onBalanceChanged(event: BalanceChangedEvent): void {
    this.balance = new Decimal(event.balanceAfter);
  }

  // Rebuild from event history
  static fromEvents(events: DomainEvent[]): AccountAggregate {
    const account = new AccountAggregate();
    events.forEach(event => {
      account.apply(event, false);  // false = don't add to uncommitted
    });
    return account;
  }
}
```

**Command Handler**:
```typescript
@CommandHandler(CreditAccountCommand)
export class CreditAccountHandler implements ICommandHandler<CreditAccountCommand> {
  constructor(
    private eventStore: KafkaEventStore,
    private eventBus: EventBus,
  ) {}

  async execute(cmd: CreditAccountCommand): Promise<void> {
    // Load aggregate from events
    const events = await this.eventStore.getEvents('Account', cmd.accountId);
    const account = AccountAggregate.fromEvents(events);
    
    // Execute command (generates events)
    account.credit(new Decimal(cmd.amount), cmd.transactionId);
    
    // Save new events
    await this.eventStore.append(
      'Account',
      cmd.accountId,
      account.getUncommittedEvents(),
    );
    
    // Publish for async processing
    account.getUncommittedEvents().forEach(event => {
      this.eventBus.publish(event);
    });
    
    account.commit();
  }
}
```

**Deliverables**:
- ✅ AccountAggregate with full domain logic
- ✅ All account-related events defined
- ✅ Command handlers implemented
- ✅ Unit tests (aggregate behavior)

#### Week 4: Transaction Aggregate

**Domain Events**:
```typescript
export class TopupRequestedEvent extends DomainEvent {
  idempotencyKey: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: string;
  currency: string;
  reference?: string;
}

export class TopupCompletedEvent extends DomainEvent {
  transactionId: string;
  sourceBalanceBefore: string;
  sourceBalanceAfter: string;
  destinationBalanceBefore: string;
  destinationBalanceAfter: string;
  completedAt: Date;
}

export class TopupFailedEvent extends DomainEvent {
  reason: string;
  errorCode: string;
}

// Similar for: Withdrawal, Transfer, Refund
```

**Saga for Topup** (multi-step process):
```typescript
@Saga()
export class TopupSaga {
  @SagaStart(TopupRequestedEvent)
  *onTopupRequested(event: TopupRequestedEvent) {
    // Step 1: Debit external account
    yield new DebitAccountCommand({
      accountId: event.sourceAccountId,
      amount: event.amount,
      transactionId: event.aggregateId,
    });
  }

  @SagaStep(AccountDebitedEvent)
  *onAccountDebited(event: AccountDebitedEvent) {
    // Step 2: Credit user account
    yield new CreditAccountCommand({
      accountId: event.destinationAccountId,
      amount: event.amount,
      transactionId: event.transactionId,
    });
  }

  @SagaComplete(AccountCreditedEvent)
  *onComplete(event: AccountCreditedEvent) {
    // Step 3: Mark transaction as completed
    yield new CompleteTransactionCommand({
      transactionId: event.transactionId,
    });
  }

  @SagaError()
  *onError(error: Error, context: SagaContext) {
    // Compensate: Reverse the debit
    if (context.completedSteps.includes('AccountDebited')) {
      yield new CreditAccountCommand({
        accountId: context.sourceAccountId,
        amount: context.amount,
        reason: 'compensation',
      });
    }
    
    // Mark transaction as failed
    yield new FailTransactionCommand({
      transactionId: context.transactionId,
      reason: error.message,
    });
  }
}
```

**Deliverables**:
- ✅ Transaction-related events
- ✅ Topup, Withdrawal, Transfer, Refund sagas
- ✅ Command handlers for all operations
- ✅ Saga tests (compensation scenarios)

#### Week 5: Integration & Testing

**Command Bus Integration**:
```typescript
// Controller layer
@Controller('transactions')
export class TransactionController {
  constructor(
    private commandBus: CommandBus,
    private queryBus: QueryBus,
  ) {}

  @Post('topup')
  async topup(@Body() dto: TopupDto): Promise<{ trackingId: string }> {
    const correlationId = uuidv4();
    
    await this.commandBus.execute(
      new TopupCommand({
        ...dto,
        correlationId,
      })
    );
    
    return {
      status: 'processing',
      trackingId: dto.idempotencyKey,
      correlationId,
      message: 'Transaction accepted and processing',
    };
  }

  @Get('status/:trackingId')
  async getStatus(@Param('trackingId') trackingId: string) {
    return this.queryBus.execute(
      new GetTransactionStatusQuery({ trackingId })
    );
  }
}
```

**Deliverables**:
- ✅ All 4 operations implemented (topup, withdraw, transfer, refund)
- ✅ Command/Query separation
- ✅ Integration tests
- ✅ Kafka producer/consumer working

---

### 👁️ **Weeks 6-7: Projections & Queries**

**Goal**: Build optimized read models

#### Week 6: Balance Projection

**Projection Schema** (PostgreSQL):
```sql
CREATE SCHEMA IF NOT EXISTS projections;

CREATE TABLE projections.account_balance (
  account_id UUID PRIMARY KEY,
  balance NUMERIC(20, 8) NOT NULL,
  currency VARCHAR(10) NOT NULL,
  version INTEGER NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  INDEX idx_balance_updated (updated_at),
  INDEX idx_balance_currency (currency)
);

CREATE TABLE projections.transaction_history (
  transaction_id UUID PRIMARY KEY,
  idempotency_key UUID UNIQUE NOT NULL,
  type VARCHAR(50) NOT NULL,
  source_account_id UUID NOT NULL,
  destination_account_id UUID NOT NULL,
  amount NUMERIC(20, 8) NOT NULL,
  currency VARCHAR(10) NOT NULL,
  status VARCHAR(20) NOT NULL,
  created_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  
  INDEX idx_history_source (source_account_id, created_at DESC),
  INDEX idx_history_dest (destination_account_id, created_at DESC),
  INDEX idx_history_status (status),
  INDEX idx_history_created (created_at DESC)
);
```

**Projection Implementation**:
```typescript
@Injectable()
export class BalanceProjection {
  constructor(
    @InjectRepository(AccountBalanceProjection)
    private repo: Repository<AccountBalanceProjection>,
  ) {}

  @EventsHandler(AccountCreatedEvent, BalanceChangedEvent)
  async onBalanceEvent(event: AccountCreatedEvent | BalanceChangedEvent) {
    if (event instanceof AccountCreatedEvent) {
      await this.repo.save({
        accountId: event.aggregateId,
        balance: '0',
        currency: event.currency,
        version: event.aggregateVersion,
      });
    } else if (event instanceof BalanceChangedEvent) {
      await this.repo.update(
        { accountId: event.aggregateId },
        {
          balance: event.balanceAfter,
          version: event.aggregateVersion,
          updatedAt: new Date(),
        }
      );
    }
  }

  // Rebuild projection from Kafka
  async rebuild(): Promise<void> {
    console.log('Rebuilding balance projection from events...');
    
    // Truncate current projection
    await this.repo.clear();
    
    // Consume all events from Kafka from beginning
    const consumer = await this.createConsumer('balance-rebuilder');
    
    await consumer.subscribe({
      topic: 'billing.account.events',
      fromBeginning: true,
    });
    
    await consumer.run({
      eachMessage: async ({ message }) => {
        const event = await this.deserialize(message.value);
        await this.onBalanceEvent(event);
      },
    });
    
    console.log('Projection rebuilt successfully!');
  }
}
```

**Query Handler**:
```typescript
@QueryHandler(GetBalanceQuery)
export class GetBalanceHandler implements IQueryHandler<GetBalanceQuery> {
  constructor(
    @InjectRepository(AccountBalanceProjection)
    private repo: Repository<AccountBalanceProjection>,
  ) {}

  async execute(query: GetBalanceQuery): Promise<BalanceDto> {
    const projection = await this.repo.findOne({
      where: { accountId: query.accountId },
    });
    
    if (!projection) {
      throw new AccountNotFoundException(query.accountId);
    }
    
    return {
      accountId: projection.accountId,
      balance: projection.balance,
      currency: projection.currency,
      asOf: projection.updatedAt,
      version: projection.version,
    };
  }
}
```

**Deliverables**:
- ✅ Balance projection (real-time account balances)
- ✅ Transaction history projection
- ✅ Query handlers for fast reads
- ✅ Projection rebuild capability

#### Week 7: Analytics & Historical Projections

**Historical Balance Projection**:
```typescript
// Enable time-travel queries
CREATE TABLE projections.balance_history (
  account_id UUID NOT NULL,
  balance NUMERIC(20, 8) NOT NULL,
  version INTEGER NOT NULL,
  valid_from TIMESTAMP NOT NULL,
  valid_to TIMESTAMP,  -- NULL = current
  
  PRIMARY KEY (account_id, version),
  INDEX idx_temporal (account_id, valid_from, valid_to)
);

@QueryHandler(GetBalanceAtTimeQuery)
export class GetBalanceAtTimeHandler {
  async execute(query: GetBalanceAtTimeQuery): Promise<BalanceDto> {
    // Query balance as it was at specific time
    return await this.repo
      .createQueryBuilder('h')
      .where('h.accountId = :accountId', { accountId: query.accountId })
      .andWhere('h.validFrom <= :timestamp', { timestamp: query.timestamp })
      .andWhere('(h.validTo IS NULL OR h.validTo > :timestamp)')
      .getOne();
  }
}
```

**Deliverables**:
- ✅ Historical projections (time-travel)
- ✅ Analytics projections (daily totals, trends)
- ✅ All query handlers
- ✅ Performance tests (< 5ms queries)

---

### 🔄 **Weeks 8-9: Saga Orchestration**

**Goal**: Complex workflows with compensation

#### Week 8: Transfer Saga

```typescript
@Saga()
export class TransferSaga {
  @SagaStart(TransferRequestedEvent)
  *onTransferRequested(event: TransferRequestedEvent) {
    // Step 1: Reserve funds from source
    yield new ReserveFundsCommand({
      accountId: event.sourceAccountId,
      amount: event.amount,
      reservationId: event.aggregateId,
    });
  }

  @SagaStep(FundsReservedEvent)
  *onFundsReserved(event: FundsReservedEvent) {
    // Step 2: Debit source account
    yield new DebitAccountCommand({
      accountId: event.accountId,
      amount: event.amount,
      transactionId: event.transactionId,
    });
  }

  @SagaStep(AccountDebitedEvent)
  *onAccountDebited(event: AccountDebitedEvent) {
    // Step 3: Credit destination account
    yield new CreditAccountCommand({
      accountId: event.destinationAccountId,
      amount: event.amount,
      transactionId: event.transactionId,
    });
  }

  @SagaStep(AccountCreditedEvent)
  *onAccountCredited(event: AccountCreditedEvent) {
    // Step 4: Release reservation
    yield new ReleaseReservationCommand({
      accountId: event.sourceAccountId,
      reservationId: event.reservationId,
    });
  }

  @SagaComplete(ReservationReleasedEvent)
  *onComplete(event: ReservationReleasedEvent) {
    // Transfer completed successfully
    yield new CompleteTransferCommand({
      transactionId: event.transactionId,
    });
  }

  @SagaError()
  *onError(error: Error, context: SagaContext) {
    // Compensation based on which step failed
    
    if (context.completedSteps.includes('AccountCredited')) {
      // Reverse credit
      yield new DebitAccountCommand({
        accountId: context.destinationAccountId,
        amount: context.amount,
        reason: 'compensation',
      });
    }
    
    if (context.completedSteps.includes('AccountDebited')) {
      // Reverse debit
      yield new CreditAccountCommand({
        accountId: context.sourceAccountId,
        amount: context.amount,
        reason: 'compensation',
      });
    }
    
    if (context.completedSteps.includes('FundsReserved')) {
      // Release reservation
      yield new ReleaseReservationCommand({
        accountId: context.sourceAccountId,
        reservationId: context.reservationId,
      });
    }
    
    // Mark transfer as failed
    yield new FailTransferCommand({
      transactionId: context.transactionId,
      reason: error.message,
    });
  }
}
```

**Deliverables**:
- ✅ Transfer saga with full compensation
- ✅ Refund saga
- ✅ Payment saga (if applicable)
- ✅ Saga persistence (state recovery)
- ✅ Saga tests (all compensation paths)

#### Week 9: Integration Features

**Webhook System**:
```typescript
@EventsHandler(TopupCompletedEvent, WithdrawalCompletedEvent)
export class WebhookHandler {
  async handle(event: TransactionCompletedEvent) {
    // Get account's webhook configuration
    const webhooks = await this.getWebhooks(event.accountId);
    
    await Promise.all(
      webhooks.map(webhook =>
        this.http.post(webhook.url, {
          event: event.constructor.name,
          data: event,
          timestamp: event.timestamp,
        })
      )
    );
  }
}
```

**Real-Time Notifications**:
```typescript
@WebSocketGateway()
export class TransactionGateway {
  @EventsHandler(TransactionCompletedEvent)
  async onTransactionCompleted(event: TransactionCompletedEvent) {
    // Notify connected clients
    this.server
      .to(`account:${event.destinationAccountId}`)
      .emit('balance-updated', {
        balance: event.destinationBalanceAfter,
        transactionId: event.transactionId,
      });
  }
}
```

**Deliverables**:
- ✅ Webhook system
- ✅ WebSocket real-time notifications
- ✅ Dead letter queue handling
- ✅ Retry logic with exponential backoff

---

### 🧪 **Weeks 10-11: Shadow Mode & Validation**

**Goal**: Run both systems in parallel, validate results

#### Week 10: Shadow Mode Implementation

**Dual-Write Controller**:
```typescript
@Controller('transactions')
export class TransactionController {
  constructor(
    private commandBus: CommandBus,
    private oldService: TransactionService,  // Keep old
    private comparisonService: ComparisonService,
  ) {}

  @Post('topup')
  async topup(@Body() dto: TopupDto) {
    const correlationId = uuidv4();
    
    // Execute in BOTH systems (parallel)
    const [newResult, oldResult] = await Promise.allSettled([
      this.commandBus.execute(new TopupCommand({ ...dto, correlationId })),
      this.oldService.topup(dto, { correlationId, ... }),
    ]);
    
    // Compare results (async, don't block)
    this.comparisonService.compare(newResult, oldResult, correlationId)
      .catch(err => this.logger.error('Comparison failed', err));
    
    // Return OLD result (trusted for now)
    if (oldResult.status === 'fulfilled') {
      return oldResult.value;
    }
    
    throw oldResult.reason;
  }
}
```

**Automated Comparison**:
```typescript
@Injectable()
export class ComparisonService {
  async compare(newResult: any, oldResult: any, correlationId: string) {
    const matches = {
      amount: newResult.amount === oldResult.amount,
      sourceBalance: this.compareBalances(
        newResult.sourceBalanceAfter,
        oldResult.sourceBalanceAfter
      ),
      destBalance: this.compareBalances(
        newResult.destinationBalanceAfter,
        oldResult.destinationBalanceAfter
      ),
    };
    
    if (!Object.values(matches).every(m => m)) {
      await this.alertDiscrepancy({
        correlationId,
        newResult,
        oldResult,
        matches,
      });
    }
    
    // Log to metrics
    this.metrics.recordComparison(matches);
  }
}
```

**Deliverables**:
- ✅ Shadow mode running (both systems)
- ✅ Automated comparison for every transaction
- ✅ Discrepancy alerts
- ✅ Metrics dashboard

#### Week 11: Data Migration & Validation

**Migrate Historical Data**:
```typescript
// Replay existing transactions as events
async migrateHistoricalData() {
  const transactions = await this.oldDb.query(`
    SELECT * FROM transactions ORDER BY created_at ASC
  `);
  
  for (const tx of transactions) {
    // Convert to event
    const event = this.transactionToEvent(tx);
    
    // Publish to Kafka
    await this.eventStore.append(
      'Transaction',
      tx.id,
      [event],
    );
  }
  
  console.log(`Migrated ${transactions.length} transactions`);
}

// Rebuild all projections from events
async rebuildProjections() {
  await Promise.all([
    this.balanceProjection.rebuild(),
    this.historyProjection.rebuild(),
    this.analyticsProjection.rebuild(),
  ]);
  
  console.log('All projections rebuilt from events');
}

// Validate: Compare balances
async validateBalances() {
  const accounts = await this.oldDb.query('SELECT * FROM accounts');
  
  for (const account of accounts) {
    const oldBalance = account.balance;
    const newBalance = await this.balanceProjection.get(account.id);
    
    if (oldBalance !== newBalance.balance) {
      throw new Error(`Balance mismatch for ${account.id}`);
    }
  }
  
  console.log('✅ All balances validated');
}
```

**Stress Testing**:
```typescript
// Load test: 10,000 TPS
async loadTest() {
  const operations = 10000;
  const concurrent = 100;
  
  const start = Date.now();
  
  await Promise.all(
    Array.from({ length: concurrent }, async (_, i) => {
      for (let j = 0; j < operations / concurrent; j++) {
        await this.commandBus.execute(
          new TopupCommand({
            idempotencyKey: uuidv4(),
            sourceAccountId: externalAccount,
            destinationAccountId: `user-${i}`,
            amount: '10.00',
            currency: 'USD',
          })
        );
      }
    })
  );
  
  const duration = (Date.now() - start) / 1000;
  const tps = operations / duration;
  
  console.log(`Processed ${operations} in ${duration}s = ${tps} TPS`);
  // Target: > 10,000 TPS
}
```

**Deliverables**:
- ✅ Historical data migrated to Kafka
- ✅ All projections rebuilt
- ✅ Balance validation (100% match)
- ✅ Load testing (>10K TPS achieved)
- ✅ 3 weeks of shadow mode data

---

### 🚀 **Week 12: Cutover & Cleanup**

**Goal**: Switch to new system, decommission old

#### Day 1-2: Gradual Traffic Shift

```typescript
// Feature flag for gradual rollout
@Controller('transactions')
export class TransactionController {
  @Post('topup')
  async topup(@Body() dto: TopupDto) {
    const rolloutPercent = await this.config.get('NEW_SYSTEM_PERCENT');
    const useNewSystem = Math.random() * 100 < rolloutPercent;
    
    if (useNewSystem) {
      // New system (event-driven)
      return await this.commandBus.execute(new TopupCommand(dto));
    } else {
      // Old system (synchronous)
      return await this.oldService.topup(dto);
    }
  }
}

// Rollout plan:
// Day 1 Morning: 1% traffic → Monitor 4 hours
// Day 1 Afternoon: 5% traffic → Monitor 4 hours
// Day 2 Morning: 10% traffic → Monitor overnight
// Day 2 Afternoon: 25% traffic → Monitor 4 hours
// Day 3 Morning: 50% traffic → Monitor 4 hours
// Day 3 Afternoon: 100% traffic → Monitor 24 hours
```

#### Day 3-4: Full Cutover

```typescript
// Remove feature flag, use new system 100%
@Controller('transactions')
export class TransactionController {
  @Post('topup')
  async topup(@Body() dto: TopupDto) {
    return await this.commandBus.execute(new TopupCommand(dto));
  }
}
```

#### Day 5: Cleanup & Monitoring

**Remove Old Code**:
```bash
# Delete old implementation
rm src/modules/transaction/transaction.service.ts.old
rm src/modules/transaction/transaction.controller.ts.old

# Update tests (remove comparison tests)
rm test/shadow-mode-comparison.e2e-spec.ts

# Update documentation
# Mark old docs as deprecated
```

**Monitor Closely**:
- Error rates
- Latency percentiles
- Consumer lag
- Projection consistency
- Business metrics

**Deliverables**:
- ✅ 100% traffic on new system
- ✅ Old code removed
- ✅ All tests passing
- ✅ Monitoring confirms health
- ✅ Team trained on new system

---

## 🎯 Success Criteria

### Week 2 Checkpoint
- ✅ Kafka cluster running
- ✅ CQRS framework integrated
- ✅ First event published and consumed

### Week 5 Checkpoint
- ✅ All aggregates implemented
- ✅ All commands working
- ✅ Events flowing to Kafka
- ✅ Unit tests passing

### Week 7 Checkpoint
- ✅ All projections working
- ✅ Queries returning correct data
- ✅ Projection rebuild works
- ✅ Performance < 5ms for queries

### Week 9 Checkpoint
- ✅ Sagas handling complex workflows
- ✅ Compensation working
- ✅ Webhooks operational
- ✅ Real-time notifications working

### Week 11 Checkpoint (GO/NO-GO)
- ✅ 3 weeks shadow mode complete
- ✅ 99.9% result match rate
- ✅ No data loss
- ✅ Performance > 10K TPS
- ✅ All stakeholders approve

### Week 12 Completion
- ✅ 100% traffic on new system
- ✅ Old system decommissioned
- ✅ Monitoring green
- ✅ Documentation updated
- ✅ Team trained

---

## 🛠️ Development Environment Setup

### Local Kafka (Docker Compose)

```yaml
# docker-compose.kafka.yml
version: '3.8'
services:
  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_TICK_TIME: 2000

  kafka-1:
    image: confluentinc/cp-kafka:7.5.0
    depends_on: [zookeeper]
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka-1:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3
    ports: ["9092:9092"]

  kafka-2:
    image: confluentinc/cp-kafka:7.5.0
    depends_on: [zookeeper]
    environment:
      KAFKA_BROKER_ID: 2
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka-2:9093
    ports: ["9093:9093"]

  kafka-3:
    image: confluentinc/cp-kafka:7.5.0
    depends_on: [zookeeper]
    environment:
      KAFKA_BROKER_ID: 3
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka-3:9094
    ports: ["9094:9094"]

  schema-registry:
    image: confluentinc/cp-schema-registry:7.5.0
    depends_on: [kafka-1]
    environment:
      SCHEMA_REGISTRY_HOST_NAME: schema-registry
      SCHEMA_REGISTRY_KAFKASTORE_BOOTSTRAP_SERVERS: kafka-1:9092
    ports: ["8081:8081"]

  kafka-ui:
    image: provectuslabs/kafka-ui:latest
    depends_on: [kafka-1]
    environment:
      KAFKA_CLUSTERS_0_NAME: local
      KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS: kafka-1:9092,kafka-2:9093,kafka-3:9094
      KAFKA_CLUSTERS_0_SCHEMAREGISTRY: http://schema-registry:8081
    ports: ["8080:8080"]
```

### Start Development Environment

```bash
# Start Kafka cluster
docker-compose -f docker-compose.kafka.yml up -d

# Verify cluster
docker-compose -f docker-compose.kafka.yml ps

# Access Kafka UI
open http://localhost:8080

# Create topics
npm run kafka:create-topics
```

---

## 📊 Monitoring Dashboards

### Kafka Metrics (Grafana)
- **Broker Health**: CPU, memory, disk, network
- **Topic Metrics**: Messages/sec, bytes/sec, partition distribution
- **Consumer Lag**: How far behind are projections?
- **Producer Performance**: Success rate, latency

### Application Metrics
- **Command Latency**: Time to execute commands
- **Event Processing Time**: Time from event to projection
- **Query Performance**: p50, p95, p99 latencies
- **Error Rates**: By operation type

### Business Metrics
- **Throughput**: Transactions per second
- **Success Rate**: % of transactions completed
- **Balance Consistency**: Projection vs event store
- **Audit Trail**: % of events with complete data

---

## 🚨 Troubleshooting Guide

### Common Issues

**Issue**: High consumer lag
```bash
# Scale up consumers
kubectl scale deployment projection-consumer --replicas=20

# Check for slow queries
# Optimize projection database indexes
```

**Issue**: Event schema mismatch
```bash
# Use schema registry upcasting
# Define migration from V1 to V2
```

**Issue**: Projection inconsistency
```bash
# Rebuild projection from events
npm run projection:rebuild balance

# Verify against event store
npm run projection:verify balance
```

---

## 📚 Resources for Team

### Learning Materials
1. **CQRS & Event Sourcing**:
   - [Greg Young - CQRS Documents](https://cqrs.files.wordpress.com/2010/11/cqrs_documents.pdf)
   - [Martin Fowler - Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html)

2. **Apache Kafka**:
   - [Confluent Kafka Course](https://developer.confluent.io/courses/)
   - [Kafka: The Definitive Guide](https://www.confluent.io/resources/kafka-the-definitive-guide/)

3. **NestJS CQRS**:
   - [Official Docs](https://docs.nestjs.com/recipes/cqrs)
   - [Example Application](https://github.com/nestjs/cqrs)

### Code References
- **Pipeline Pattern** (current): Shows our modular approach
- **ADR-0007**: Complete architectural decision
- **Analysis Doc**: Detailed benefits and trade-offs

---

## ✅ Pre-Flight Checklist

Before starting Week 1:
- [ ] Team trained on CQRS/Event Sourcing concepts
- [ ] Kafka infrastructure provisioned
- [ ] Development environment tested
- [ ] Monitoring infrastructure ready
- [ ] Stakeholders informed
- [ ] Timeline communicated
- [ ] Budget approved
- [ ] Rollback plan understood

---

## 🎊 Expected Outcomes

After 12 weeks:
- ✅ **100× performance increase** (10,000+ TPS)
- ✅ **Sub-10ms API latency** (instant responses)
- ✅ **Perfect audit trail** (events never lost)
- ✅ **Time-travel debugging** (replay any point)
- ✅ **Real-time features** (WebSockets, webhooks)
- ✅ **Multiple views** (optimized for each use case)
- ✅ **Horizontal scaling** (add workers = add throughput)
- ✅ **71% cost savings** at target scale

**Result**: World-class event-driven billing platform 🚀

---

**Document Status**: Ready for implementation  
**Next Action**: Begin Week 1 (Foundation setup)  
**Questions**: See ADR-0007 or docs/async-and-event-sourcing-analysis.md


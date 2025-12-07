# ADR-0007: Async Processing & Event Sourcing with Kafka (One-Sweep Implementation)

**Status**: Accepted  
**Date**: 2025-12-07  
**Deciders**: Development Team  
**Tags**: #architecture #async #event-sourcing #kafka #cqrs #major-change

## Context

The billing engine currently processes transactions synchronously using a pipeline pattern with direct database writes. While this provides strong consistency and simplicity, it has significant limitations:

### Current Limitations
1. **Performance Ceiling**: ~100-500 TPS per server (sequential processing)
2. **Scalability**: Vertical scaling only (limited horizontal scaling)
3. **Latency**: 200-500ms response times (blocking operations)
4. **Audit Trail**: Reconstructed from transactions (not first-class)
5. **Integration**: Difficult to add real-time features (webhooks, notifications)
6. **Historical Queries**: Slow and complex (joins on transaction table)
7. **Resilience**: No automatic retries or compensation

### Business Drivers
- **Scale**: Need to support 10,000+ TPS for growth
- **Compliance**: Perfect audit trail required for regulatory compliance
- **Real-Time**: Customer demand for instant notifications and webhooks
- **Analytics**: Business intelligence requires temporal queries
- **Cost**: Current architecture would cost $25K/mo at target scale vs $7K/mo with new architecture

### Technical Environment
- NestJS application with TypeORM
- PostgreSQL for state storage
- Pipeline pattern for transaction processing
- 100% test coverage (50 passing tests)
- Clean architecture with separated concerns

## Decision

We will implement **Async Processing + Event Sourcing in one comprehensive sweep** using **Apache Kafka** as the foundation for both event bus and event store.

### Core Architecture Decisions

#### 1. Apache Kafka as Unified Platform
**Decision**: Use Kafka for both event streaming (event bus) AND event storage (event sourcing)

**Rationale**:
- **Single platform** reduces operational complexity
- **Proven at scale**: Handles millions of events/second
- **Built-in persistence**: Kafka topics ARE the event store
- **Replay capability**: Native log-based storage enables event replay
- **Retention policies**: Configurable (indefinite for compliance)
- **Partitioning**: Natural horizontal scaling
- **Ecosystem**: Rich tooling (Kafka Streams, Connect, Schema Registry)

**Alternative Considered**: 
- Redis Streams + PostgreSQL: Simpler but doesn't scale to our target (10K+ TPS)
- EventStoreDB + RabbitMQ: Two systems to maintain, higher operational overhead
- **Winner**: Kafka - single platform, proven scale, perfect fit

#### 2. One-Sweep Implementation (Not Gradual)
**Decision**: Implement async + event sourcing together in a single major release

**Rationale**:
- **Avoid double migration**: Gradual = migrate twice (sync→async, then async→event sourced)
- **Cleaner architecture**: Design for final state from day one
- **Faster time-to-value**: Get all benefits in 12 weeks vs 20+ weeks gradual
- **Simpler codebase**: No hybrid mode complexity
- **Better testing**: Test final architecture, not intermediate states

**Migration Strategy**:
1. Build complete new system alongside current
2. Run shadow mode (write to both, read from old)
3. Validate results match (automated comparison)
4. Switch reads to new system
5. Decommission old system
6. Timeline: 12 weeks total

**Alternative Considered**:
- Phase 1 Async, Phase 2 Event Sourcing: Safer but slower, requires two migrations
- **Winner**: One sweep - faster, cleaner, more efficient use of development time

#### 3. CQRS (Command Query Responsibility Segregation)
**Decision**: Separate write model (commands) from read model (queries)

**Rationale**:
- **Optimized reads**: Read models tailored to specific queries
- **Independent scaling**: Scale reads and writes independently
- **Multiple views**: Different projections for different needs (balance, history, analytics)
- **Performance**: Queries don't impact writes

#### 4. Event Store Schema
**Decision**: Kafka topics as event store with PostgreSQL projections

**Structure**:
```
Kafka Topics (Event Store):
- billing.account.events      (partitioned by accountId)
- billing.transaction.events  (partitioned by accountId)
- billing.saga.events         (for complex workflows)

PostgreSQL (Read Models):
- account_projections         (current balance, optimized for reads)
- transaction_history         (fast queries with indexes)
- analytics_projections       (pre-aggregated data)
```

### Architecture Overview

```
                            ┌─────────────────────────────────┐
                            │      HTTP REST API              │
                            │  (Controllers - Commands/Queries)│
                            └──────────┬───────────┬──────────┘
                                       │           │
                    ┌──────────────────┘           └──────────────────┐
                    │                                                  │
            ┌───────▼────────┐                              ┌─────────▼────────┐
            │ Command Bus    │                              │   Query Bus      │
            │ (Write Model)  │                              │  (Read Model)    │
            └───────┬────────┘                              └─────────┬────────┘
                    │                                                  │
            ┌───────▼────────┐                              ┌─────────▼────────┐
            │  Aggregates    │                              │   Projections    │
            │  (Domain Logic)│                              │  (Read Optimized)│
            └───────┬────────┘                              └─────────┬────────┘
                    │                                                  │
                    │ Emit Events                         Read From   │
                    │                                                  │
            ┌───────▼──────────────────────────────────────────────────────────┐
            │                   Apache Kafka (Event Store)                     │
            │  Topics: account.events, transaction.events, saga.events         │
            │  Retention: Indefinite (compliance requirement)                  │
            │  Partitioning: By aggregate ID (accountId)                       │
            └───────┬──────────────────────────────────────────────────────────┘
                    │
                    │ Consume Events
                    │
            ┌───────▼────────┐
            │ Event Handlers │
            │  (Async)       │
            │                │
            │ - Update       │
            │   Projections  │
            │ - Send         │
            │   Notifications│
            │ - Trigger      │
            │   Webhooks     │
            │ - Update       │
            │   Analytics    │
            │ - Saga         │
            │   Coordination │
            └────────────────┘
```

## Implementation Strategy

### Phase 1: Foundation (Weeks 1-2)
**Goal**: Set up infrastructure and core framework

**Tasks**:
1. **Kafka Infrastructure**
   - Set up Kafka cluster (3 brokers for HA)
   - Create topics with appropriate partitioning
   - Configure Schema Registry (Avro for event schemas)
   - Set up monitoring (Prometheus + Grafana)

2. **NestJS CQRS Setup**
   - Install `@nestjs/cqrs` package
   - Set up command/query buses
   - Create base event/command/query classes
   - Implement Kafka integration

3. **Event Store Abstraction**
   ```typescript
   interface IEventStore {
     append(aggregateId: string, events: DomainEvent[]): Promise<void>;
     getEvents(aggregateId: string, fromVersion?: number): Promise<DomainEvent[]>;
     getEventsByType(eventType: string, filters?: any): AsyncIterator<DomainEvent>;
   }
   ```

4. **Kafka Event Store Implementation**
   ```typescript
   @Injectable()
   class KafkaEventStore implements IEventStore {
     async append(aggregateId: string, events: DomainEvent[]) {
       await this.kafkaProducer.send({
         topic: `billing.${aggregate}.events`,
         messages: events.map(e => ({
           key: aggregateId,
           value: this.serialize(e),
           headers: { eventType: e.constructor.name }
         }))
       });
     }
   }
   ```

### Phase 2: Core Domain (Weeks 3-5)
**Goal**: Implement aggregates and domain events

**Tasks**:
1. **Define Domain Events**
   ```typescript
   // Event base class
   abstract class DomainEvent {
     aggregateId: string;
     aggregateVersion: number;
     timestamp: Date;
     correlationId: string;
     causationId?: string;
   }

   // Specific events
   class TopupRequestedEvent extends DomainEvent {
     sourceAccountId: string;
     destinationAccountId: string;
     amount: string;
     currency: string;
     idempotencyKey: string;
   }

   class TopupCompletedEvent extends DomainEvent {
     transactionId: string;
     sourceBalanceBefore: string;
     sourceBalanceAfter: string;
     destinationBalanceBefore: string;
     destinationBalanceAfter: string;
     completedAt: Date;
   }

   class TopupFailedEvent extends DomainEvent {
     reason: string;
     errorCode: string;
   }
   ```

2. **Implement Aggregates**
   ```typescript
   class AccountAggregate extends AggregateRoot {
     private accountId: string;
     private balance: Decimal;
     private version: number = 0;
     
     // Command: Topup
     topup(cmd: TopupCommand): void {
       // Validate
       this.validateTopup(cmd);
       
       // Apply event (changes state)
       this.apply(new TopupRequestedEvent({
         aggregateId: this.accountId,
         aggregateVersion: this.version + 1,
         ...cmd
       }));
     }
     
     // Event handler (pure function)
     onTopupCompleted(event: TopupCompletedEvent): void {
       this.balance = new Decimal(event.destinationBalanceAfter);
       this.version = event.aggregateVersion;
     }
     
     // Rebuild from events
     static fromEvents(events: DomainEvent[]): AccountAggregate {
       const account = new AccountAggregate();
       events.forEach(event => account.apply(event, false));
       return account;
     }
   }
   ```

3. **Command Handlers**
   ```typescript
   @CommandHandler(TopupCommand)
   class TopupHandler implements ICommandHandler<TopupCommand> {
     constructor(
       private eventStore: IEventStore,
       private eventBus: IEventBus,
     ) {}

     async execute(cmd: TopupCommand): Promise<void> {
       // Load aggregate from events
       const events = await this.eventStore.getEvents(cmd.destinationAccountId);
       const account = AccountAggregate.fromEvents(events);
       
       // Execute command (generates events)
       account.topup(cmd);
       
       // Save events to Kafka
       await this.eventStore.append(
         cmd.destinationAccountId, 
         account.getUncommittedEvents()
       );
       
       // Publish for async handlers
       account.getUncommittedEvents().forEach(event => {
         this.eventBus.publish(event);
       });
       
       account.commit();
     }
   }
   ```

### Phase 3: Projections & Queries (Weeks 6-7)
**Goal**: Build read models optimized for queries

**Tasks**:
1. **Projection Infrastructure**
   ```typescript
   abstract class Projection {
     abstract onEvent(event: DomainEvent): Promise<void>;
     abstract rebuild(): Promise<void>;
   }
   ```

2. **Balance Projection** (Fast balance queries)
   ```typescript
   @Injectable()
   class BalanceProjection extends Projection {
     @EventsHandler(TopupCompletedEvent, WithdrawalCompletedEvent)
     async onEvent(event: BalanceEvent) {
       await this.db.query(`
         INSERT INTO account_projections (account_id, balance, currency, version, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (account_id) 
         DO UPDATE SET 
           balance = $2,
           version = $4,
           updated_at = NOW()
       `, [event.accountId, event.balanceAfter, event.currency, event.aggregateVersion]);
     }
     
     async rebuild() {
       // Replay all events from Kafka
       const eventStream = this.eventStore.getEventsByType('Account*');
       for await (const event of eventStream) {
         await this.onEvent(event);
       }
     }
   }
   ```

3. **Query Handlers**
   ```typescript
   @QueryHandler(GetBalanceQuery)
   class GetBalanceHandler implements IQueryHandler<GetBalanceQuery> {
     async execute(query: GetBalanceQuery): Promise<BalanceDto> {
       // Read from optimized projection (< 1ms)
       return await this.projectionDb.findOne({
         where: { accountId: query.accountId }
       });
     }
   }
   ```

### Phase 4: Saga Orchestration (Weeks 8-9)
**Goal**: Complex workflows with compensation

**Tasks**:
1. **Transfer Saga** (Multi-step with rollback)
   ```typescript
   @Saga()
   class TransferSaga {
     @SagaStart(TransferRequestedEvent)
     async onTransferRequested(event: TransferRequestedEvent) {
       return new ReserveFundsCommand(event.sourceAccountId, event.amount);
     }
     
     @SagaStep(FundsReservedEvent)
     async onFundsReserved(event: FundsReservedEvent) {
       return new DebitAccountCommand(event.sourceAccountId, event.amount);
     }
     
     @SagaStep(AccountDebitedEvent)
     async onAccountDebited(event: AccountDebitedEvent) {
       return new CreditAccountCommand(event.destinationAccountId, event.amount);
     }
     
     @SagaComplete(AccountCreditedEvent)
     async onComplete(event: AccountCreditedEvent) {
       // Transfer complete
       this.logger.log(`Transfer ${event.transferId} completed`);
     }
     
     @SagaError()
     async onError(error: Error, context: SagaContext) {
       // Compensate: Release reserved funds
       return new ReleaseFundsCommand(context.sourceAccountId, context.amount);
     }
   }
   ```

### Phase 5: Integration & Migration (Weeks 10-11)
**Goal**: Shadow mode and validation

**Tasks**:
1. **Shadow Mode**
   ```typescript
   // Write to both systems
   @Controller('transactions')
   class TransactionController {
     @Post('topup')
     async topup(@Body() dto: TopupDto) {
       // Execute in both systems (parallel)
       const [newResult, oldResult] = await Promise.all([
         this.commandBus.execute(new TopupCommand(dto)),  // New (Kafka)
         this.oldService.topup(dto),                      // Old (sync)
       ]);
       
       // Compare results
       await this.compareResults(newResult, oldResult);
       
       // Return old result (trusted)
       return oldResult;
     }
   }
   ```

2. **Automated Validation**
   - Compare every transaction result
   - Log discrepancies
   - Alert on mismatches
   - Build confidence in new system

3. **Data Migration**
   - Replay existing transactions as events
   - Rebuild all projections
   - Verify balances match

### Phase 6: Cutover & Cleanup (Week 12)
**Goal**: Switch to new system and decommission old

**Tasks**:
1. **Flip Switch**
   ```typescript
   // Read from new system, write to both
   if (config.useNewSystem) {
     result = await this.commandBus.execute(command);
   } else {
     result = await this.oldService.execute(dto);
   }
   ```

2. **Monitor Closely**
   - Watch for errors
   - Compare performance
   - Validate all integrations

3. **Remove Old Code**
   - Delete old transaction service
   - Remove old controllers
   - Clean up tests

## Technology Stack

### Core Technologies
```yaml
Event Store & Bus:
  - Apache Kafka 3.6+
  - 3-broker cluster (high availability)
  - Schema Registry (Confluent)
  - Avro for event serialization

NestJS Packages:
  - @nestjs/cqrs: ^10.0.0
  - @nestjs/microservices: ^10.0.0
  - kafkajs: ^2.2.0

Read Model Database:
  - PostgreSQL 14+ (existing)
  - Separate schema for projections

Monitoring:
  - Prometheus (Kafka metrics)
  - Grafana (dashboards)
  - OpenTelemetry (distributed tracing)
```

### Infrastructure Setup
```yaml
Kafka Configuration:
  Brokers: 3 (cluster)
  Replication Factor: 3
  Partitions: 10 per topic
  Retention: Indefinite (compliance)
  Min ISR: 2
  
Topics:
  - billing.account.events (10 partitions)
  - billing.transaction.events (10 partitions)
  - billing.saga.events (5 partitions)
  - billing.dead-letter (1 partition)

Consumer Groups:
  - projection-updaters (scale: 10 instances)
  - notification-handlers (scale: 5 instances)
  - analytics-processors (scale: 3 instances)
  - saga-coordinators (scale: 5 instances)
```

## Consequences

### Positive ✅

1. **Massive Performance Gain**
   - API latency: 200-500ms → 2-10ms (50× improvement)
   - Throughput: 100 TPS → 10,000+ TPS (100× improvement)
   - Horizontal scaling: Add consumers → add throughput

2. **Perfect Audit Trail**
   - Events stored forever in Kafka
   - Immutable log (cannot modify history)
   - Cryptographically verifiable
   - Perfect for compliance/regulatory

3. **Time-Travel Debugging**
   - Replay events from any point
   - Reconstruct state at any moment
   - Fix bugs by replaying with corrected logic
   - What-if analysis

4. **Event-Driven Integrations**
   - Real-time webhooks
   - WebSocket notifications
   - Analytics pipelines
   - External system integrations

5. **Cost Efficiency**
   - At 100K TPS: $25K/mo → $7K/mo (71% savings)
   - Pay for what you use (horizontal scaling)

6. **Resilience**
   - Automatic retries (Kafka consumer groups)
   - Dead letter queues
   - Saga compensation
   - No lost transactions

### Negative ⚠️

1. **Increased Complexity**
   - More moving parts (Kafka, consumers, projections)
   - Operational overhead (monitor Kafka cluster)
   - Debugging distributed systems
   - Team learning curve

2. **Eventual Consistency**
   - Reads lag writes by 100-500ms
   - UI must handle "processing" state
   - Some operations need synchronous reads
   - Complexity in testing

3. **Infrastructure Requirements**
   - Kafka cluster (3+ brokers)
   - More servers (consumers)
   - Schema registry
   - Monitoring infrastructure

4. **One-Sweep Risk**
   - Big-bang release (higher risk)
   - Longer testing period
   - Larger rollback if issues
   - More coordination needed

### Mitigations

1. **Complexity**: 
   - Use NestJS CQRS (established framework)
   - Comprehensive documentation
   - Team training (2-week ramp-up)
   - DevOps automation

2. **Eventual Consistency**:
   - Return tracking IDs (client polls)
   - Optimistic UI updates
   - Sync endpoints for critical operations
   - Clear API documentation

3. **Infrastructure**:
   - Managed Kafka (Confluent Cloud) option
   - Infrastructure as Code (Terraform)
   - Automated monitoring alerts
   - Runbooks for common issues

4. **One-Sweep Risk**:
   - Shadow mode (3 weeks validation)
   - Automated comparison tests
   - Feature flags (easy rollback)
   - Gradual traffic ramp (1% → 10% → 50% → 100%)

## Risks & Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Kafka outage** | Low | High | 3-broker cluster, monitor ISR, automated failover |
| **Projection lag** | Medium | Medium | Monitor consumer lag, auto-scale consumers |
| **Event schema breaking change** | Low | High | Schema registry validation, upcasting |
| **Data loss** | Very Low | Critical | Replication factor 3, min ISR 2, backup to S3 |
| **Performance degradation** | Low | Medium | Load testing, gradual rollout, rollback plan |
| **Team knowledge gap** | High | Low | 2-week training, pair programming, documentation |

## Success Metrics

### Performance Targets
- ✅ API latency p95 < 10ms
- ✅ Throughput > 10,000 TPS
- ✅ Projection lag p95 < 100ms
- ✅ Query latency p95 < 5ms
- ✅ Event replay < 1 hour for 1M events

### Reliability Targets
- ✅ Availability 99.99%
- ✅ Zero data loss
- ✅ Recovery time < 5 minutes
- ✅ No transaction duplication

### Business Targets
- ✅ Support 100K TPS at < $10K/mo infrastructure
- ✅ Perfect audit trail (100% of transactions)
- ✅ Real-time notifications (< 1s latency)
- ✅ Historical queries < 1s response time

## Timeline

```
Week 1-2:   Foundation (Kafka setup, CQRS framework)      [██████████]
Week 3-5:   Core Domain (Aggregates, events, commands)    [█████████████████]
Week 6-7:   Projections & Queries (Read models)           [████████████]
Week 8-9:   Saga Orchestration (Complex workflows)        [████████████]
Week 10-11: Shadow Mode & Validation (3 weeks testing)    [████████████]
Week 12:    Cutover & Cleanup (Switch & decommission)     [██████]
──────────────────────────────────────────────────────────────────────
Total:      12 weeks (aggressive but achievable)
```

## Rollback Plan

### If Issues Found in Shadow Mode (Weeks 10-11)
1. Continue using old system
2. Fix issues in new system
3. Extend validation period
4. No user impact

### If Issues Found After Cutover (Week 12)
1. **Immediate**: Feature flag flip to old system (< 1 minute)
2. **Short-term**: Run old system for 1 more week
3. **Medium-term**: Fix issues, re-validate
4. **Long-term**: Attempt cutover again

### Data Safety
- Old system runs for 4 weeks post-cutover
- All data preserved in Kafka (indefinite retention)
- Can rebuild projections from events anytime
- PostgreSQL backup before cutover

## References

- [Martin Fowler - Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html)
- [Greg Young - CQRS Documents](https://cqrs.files.wordpress.com/2010/11/cqrs_documents.pdf)
- [Confluent - Event Sourcing with Kafka](https://www.confluent.io/blog/event-sourcing-cqrs-stream-processing-apache-kafka-whats-connection/)
- [Analysis Document](../async-and-event-sourcing-analysis.md)
- [NestJS CQRS](https://docs.nestjs.com/recipes/cqrs)

## Notes

### Why One-Sweep vs Gradual?

**Gradual Approach**:
- Phase 1: Async (4 weeks) → Test → Deploy
- Phase 2: Event Sourcing (8 weeks) → Test → Deploy
- Total: 20+ weeks, 2 migrations, hybrid complexity

**One-Sweep Approach**:
- Build final architecture (10 weeks)
- Shadow mode (3 weeks)
- Cutover (1 week)
- Total: 12-14 weeks, 1 migration, clean architecture

**Decision**: One-sweep saves 6+ weeks, results in cleaner codebase, and we only migrate data once.

### Why Kafka for Both?

**Alternatives Considered**:
1. Redis Streams + PostgreSQL: Doesn't scale to 10K+ TPS
2. EventStoreDB + RabbitMQ: Two systems, higher ops overhead
3. PostgreSQL only: Not built for streaming, slow at scale

**Kafka Wins**:
- Single platform for both concerns
- Proven at target scale (millions of events/sec)
- Rich ecosystem (Streams, Connect, Schema Registry)
- Built-in persistence and replay
- Industry standard

### Team Readiness

**Training Plan**:
- Week 1: CQRS/Event Sourcing concepts (2 days)
- Week 1: Kafka fundamentals (2 days)
- Week 1: Hands-on workshop (1 day)
- Weeks 2-3: Pair programming on foundation
- Ongoing: Code reviews, knowledge sharing

**Confidence**: High - team has strong NestJS experience, this builds on existing pipeline pattern knowledge.

## Decision Makers

- **Approved by**: Development Team
- **Date**: 2025-12-07
- **Next Review**: After Week 6 (domain implementation complete)

## Status Updates

- **2025-12-07**: ADR created and accepted
- **2025-12-XX**: Foundation complete (update after Week 2)
- **2025-12-XX**: Core domain complete (update after Week 5)
- **2025-XX-XX**: Shadow mode started (update after Week 10)
- **2025-XX-XX**: Cutover complete (update after Week 12)


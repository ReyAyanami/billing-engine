# System Design

## Overview

The Billing Engine is built using **CQRS (Command Query Responsibility Segregation)**, **Event Sourcing**, and **Double-Entry Bookkeeping** patterns. This document explains the high-level architecture and how components interact.

> 🎓 **Learning Focus**: This architecture prioritizes auditability and learning over simplicity. For many applications, a simpler CRUD approach would suffice.

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                        Client Layer                          │
│                    (HTTP/REST Clients)                       │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                      API Layer                               │
│                   (NestJS Controllers)                       │
│                                                              │
│  • Input Validation (class-validator)                       │
│  • Swagger/OpenAPI Documentation                            │
│  • Error Handling & Exception Filters                       │
│  • Correlation ID Tracking                                  │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                   Application Layer                          │
│                  (CQRS + DDD Pattern)                        │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Commands (Write Operations)                       │    │
│  │  • TopupCommand                                    │    │
│  │  • WithdrawalCommand                               │    │
│  │  • TransferCommand                                 │    │
│  │  • PaymentCommand                                  │    │
│  │  • RefundCommand                                   │    │
│  └──────────────────────┬─────────────────────────────┘    │
│                         │                                    │
│  ┌──────────────────────▼─────────────────────────────┐    │
│  │  Command Handlers                                  │    │
│  │  • Load Aggregates                                 │    │
│  │  • Execute Business Logic                          │    │
│  │  • Emit Domain Events                              │    │
│  │  • Save to Event Store                             │    │
│  └──────────────────────┬─────────────────────────────┘    │
│                         │                                    │
│  ┌──────────────────────▼─────────────────────────────┐    │
│  │  Aggregates (Domain Model)                         │    │
│  │  • AccountAggregate                                │    │
│  │  • TransactionAggregate                            │    │
│  │  • Enforce Business Rules                          │    │
│  │  • Generate Domain Events                          │    │
│  └──────────────────────┬─────────────────────────────┘    │
│                         │                                    │
│                         ▼                                    │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Domain Events                                     │    │
│  │  • AccountCreated, BalanceChanged                  │    │
│  │  • TopupRequested, TopupCompleted                  │    │
│  │  • TransferRequested, TransferCompleted            │    │
│  │  • PaymentRequested, PaymentCompleted              │    │
│  └──────────────────────┬─────────────────────────────┘    │
│                         │                                    │
│                         ├───────────────┐                    │
│                         │               │                    │
│  ┌──────────────────────▼────┐   ┌─────▼──────────────┐   │
│  │  Event Handlers            │   │  Sagas             │   │
│  │  • Update Projections      │   │  • Coordinate      │   │
│  │  • Audit Logging           │   │    Multi-step      │   │
│  │  • SSE Notifications       │   │    Operations      │   │
│  └────────────────────────────┘   └────────────────────┘   │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Queries (Read Operations)                         │    │
│  │  • GetAccountQuery                                 │    │
│  │  • GetTransactionQuery                             │    │
│  │  • GetAccountsByOwnerQuery                         │    │
│  └──────────────────────┬─────────────────────────────┘    │
│                         │                                    │
│  ┌──────────────────────▼─────────────────────────────┐    │
│  │  Query Handlers                                    │    │
│  │  • Read from Projections                           │    │
│  │  • Optimized for Queries                           │    │
│  └────────────────────────────────────────────────────┘    │
└───────────────────────────┬──────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│     PostgreSQL           │  │        Kafka             │
│   (Read Models Only)     │  │   (Event Store)          │
│                          │  │                          │
│  • AccountProjections    │  │  • account-events        │
│  • TransactionProjections│  │  • transaction-events    │
│  • AuditLogs             │  │  • Append-only Log       │
│  • Currencies            │  │  • Complete Audit Trail  │
│                          │  │  • Event Replay          │
│  Query optimization      │  │  • Source of Truth       │
│  Eventually consistent   │  │                          │
│                          │  │  Event Sourcing Store    │
│  ACID for projections    │  │  Partitioned by ID       │
└──────────────────────────┘  └──────────────────────────┘
```

---

## System Components

### 1. API Layer (Controllers)

**Purpose**: Entry point for all external requests.

**Responsibilities**:
- Validate incoming requests using `class-validator`
- Transform DTOs using `class-transformer`
- Handle HTTP concerns (status codes, headers)
- Generate correlation IDs for tracing
- Delegate to Application Layer

**Technologies**:
- NestJS Controllers
- Swagger/OpenAPI for documentation
- Exception filters for error handling

**Why this approach?**
- **Pro**: Clear separation of HTTP concerns from business logic
- **Pro**: Automatic API documentation with Swagger
- **Con**: Extra layer of indirection
- **Alternative**: Controllers directly access repositories (simpler but mixes concerns)

---

### 2. Application Layer (CQRS)

**Purpose**: Orchestrate business operations using CQRS pattern.

#### Commands (Write Side)

Commands represent **intent to change state**:

```typescript
// Example: TopupCommand
{
  idempotencyKey: string;      // Prevents duplicates
  destinationAccountId: string;
  sourceAccountId: string;
  amount: string;
  currency: string;
  correlationId: string;       // For tracing
}
```

**Command Flow**:
1. Controller creates command with validated input
2. `CommandBus` routes command to appropriate handler
3. Handler loads aggregate from event store
4. Aggregate executes business logic
5. Aggregate emits domain events
6. Events persisted to Kafka
7. Response returned to client (often "pending" status)

**Why Commands?**
- **Pro**: Explicit intent (not just "update balance")
- **Pro**: Perfect for async processing
- **Pro**: Built-in idempotency support
- **Con**: More verbose than simple method calls
- **Alternative**: Service methods (simpler, less traceable)

#### Queries (Read Side)

Queries represent **intent to read data**:

```typescript
// Example: GetAccountQuery
{
  accountId: string;
}
```

**Query Flow**:
1. Controller creates query
2. `QueryBus` routes query to handler
3. Handler reads from optimized projection (PostgreSQL)
4. Response returned immediately

**Why Queries?**
- **Pro**: Optimized read models (denormalized for speed)
- **Pro**: Separate from write concerns
- **Con**: Eventual consistency (reads lag behind writes)
- **Alternative**: Read directly from write model (simpler, consistent, slower)

---

### 3. Domain Layer (Aggregates)

**Purpose**: Encapsulate business rules and domain logic.

#### AccountAggregate

State derived from events:

```typescript
class AccountAggregate {
  private balance: Decimal;
  private status: AccountStatus;
  private currency: string;
  
  // Commands
  create(params): void
  changeBalance(params): void
  changeStatus(params): void
  
  // Event Handlers
  onAccountCreated(event): void
  onBalanceChanged(event): void
  onAccountStatusChanged(event): void
}
```

**Key Principles**:
- Aggregates are **consistency boundaries**
- Business rules enforced in aggregates
- State rebuilt by replaying events
- Aggregates emit events, never mutate state directly

**Why Aggregates?**
- **Pro**: Clear ownership of business rules
- **Pro**: Testable in isolation
- **Pro**: Event sourcing enables time travel debugging
- **Con**: Complexity overhead
- **Alternative**: Transaction script (simpler, less maintainable)

---

### 4. Event Store (Kafka)

**Purpose**: Append-only log of all domain events.

#### Topics

- `billing.account-events` - All account events
- `billing.transaction-events` - All transaction events

#### Event Structure

```json
{
  "eventType": "AccountCreated",
  "aggregateId": "uuid",
  "aggregateVersion": 1,
  "timestamp": "2025-12-09T12:00:00.000Z",
  "correlationId": "uuid",
  "data": {
    "ownerId": "user_123",
    "currency": "USD",
    "status": "active"
  }
}
```

**Partitioning Strategy**:
- Partition by `aggregateId` (ensures ordering per aggregate)
- 3 partitions per topic (configurable)

**Why Kafka as Event Store?**
- **Pro**: Durable, distributed, append-only log
- **Pro**: Can replay events to rebuild state
- **Pro**: Multiple consumers can subscribe
- **Pro**: Complete audit trail
- **Con**: Storage overhead (keeps all events)
- **Con**: Complexity compared to database storage
- **Alternatives Not Used**: EventStoreDB (now Kurrent.io - restrictive licensing), PostgreSQL (simpler but less scalable)

**What's Simplified**:
- No event versioning strategy yet
- No snapshots (event replay could be slow for long-lived aggregates)
- No compaction strategy

---

### 5. Read Store (PostgreSQL Projections)

**Purpose**: Optimized read models for queries.

#### Projections

**AccountProjection**:
```sql
CREATE TABLE account_projections (
  id UUID PRIMARY KEY,
  owner_id VARCHAR NOT NULL,
  owner_type VARCHAR NOT NULL,
  currency VARCHAR(3) NOT NULL,
  balance DECIMAL(28, 8) NOT NULL,
  status VARCHAR(20) NOT NULL,
  type VARCHAR(20) NOT NULL,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE INDEX idx_account_projection_owner 
  ON account_projections(owner_id, owner_type);
```

**TransactionProjection**:
```sql
CREATE TABLE transaction_projections (
  id UUID PRIMARY KEY,
  type VARCHAR(20) NOT NULL,
  account_id UUID NOT NULL,
  amount DECIMAL(28, 8) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  status VARCHAR(20) NOT NULL,
  reference TEXT,
  created_at TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX idx_transaction_projection_account 
  ON transaction_projections(account_id, created_at DESC);
```

**How Projections are Updated**:
1. Domain event published to Kafka
2. Event handler subscribes to topic
3. Handler updates projection (denormalized view)
4. Queries read from projections, not aggregates

**Why Projections?**
- **Pro**: Optimized for specific queries
- **Pro**: Can have multiple projections from same events
- **Pro**: Fast reads (no joins, denormalized)
- **Con**: Eventual consistency (slight lag)
- **Con**: Storage duplication
- **Alternative**: Query write model directly (consistent but slower)

---

### 6. Event Store (Kafka) and Projections (PostgreSQL)

**Purpose**: Pure event sourcing architecture with separate read/write models.

**Write Side (Event Store in Kafka)**:
- `AccountAggregate` - Domain logic, emits events
- `TransactionAggregate` - Transaction coordination, emits events
- Events are the authoritative source of truth
- No direct database writes for aggregates

**Read Side (Projections in PostgreSQL)**:
- `AccountProjection` - Denormalized account state for fast queries
- `TransactionProjection` - Denormalized transaction history with signed amounts
- `Currency` - Currency configuration
- `AuditLog` - Compliance and debugging

**Pessimistic Locking** (on Projections Only):
```typescript
// Lock account projection during update (not the aggregate!)
const accountProjection = await this.projectionRepository.findOne({
  where: { id: accountId },
  lock: { mode: 'pessimistic_write' }  // SELECT FOR UPDATE
});

// Update projection from event
accountProjection.balance = newBalance;
await this.projectionRepository.save(accountProjection);
```

**Why Pessimistic Locking on Projections?**
- **Purpose**: Prevents race conditions when multiple events update the same projection
- **Scope**: Only for projection updates, not for aggregates
- **Note**: Aggregates are event-sourced and reconstructed from Kafka events
- **Alternative**: Eventually consistent projections without locks (acceptable delay)

---

## Design Principles

### 1. CQRS (Command Query Responsibility Segregation)

**Principle**: Separate read and write models.

**Implementation**:
- **Commands** modify state → Aggregates emit events → Events to Kafka
- **Event Handlers** update projections → Write to PostgreSQL
- **Queries** read state → Read from optimized projections in PostgreSQL

**Benefits**:
- Independent scaling of reads and writes
- Optimized read models for specific queries
- Clear separation of concerns

**Trade-offs**:
- Increased complexity
- Eventual consistency (projections lag behind events)
- More code to maintain

---

### 2. Event Sourcing

**Principle**: Store events, not current state.

**Implementation**:
- All state changes captured as events
- Events stored in Kafka (append-only)
- Current state derived by replaying events
- Projections built from events

**Benefits**:
- Complete audit trail (WHO, WHAT, WHEN)
- Time travel debugging (replay to any point)
- Event replay for new projections
- Natural fit with CQRS

**Trade-offs**:
- Storage overhead (all events kept)
- Complexity in event schema evolution
- Eventual consistency
- Learning curve

---

### 3. Double-Entry Bookkeeping

**Principle**: Every transaction has two sides.

**Implementation**:
- Three account types: USER, EXTERNAL, SYSTEM
- Top-up: EXTERNAL → USER
- Withdrawal: USER → EXTERNAL
- Transfer: USER → USER
- Payment: USER → SYSTEM

**Benefits**:
- Financial accuracy (balances reconcile)
- Complete audit trail
- Fraud detection (imbalanced books)
- Compliance with accounting standards

**Trade-offs**:
- More complex than single-entry
- Requires understanding of accounting

---

### 4. Domain-Driven Design (DDD)

**Principle**: Model complex domain logic explicitly.

**Implementation**:
- **Aggregates**: `AccountAggregate`, `TransactionAggregate`
- **Value Objects**: `Money`, `Currency`
- **Domain Events**: `BalanceChanged`, `TransferCompleted`
- **Bounded Contexts**: Account, Transaction, Audit

**Benefits**:
- Business logic in domain layer
- Testable in isolation
- Ubiquitous language
- Clear ownership

**Trade-offs**:
- Steeper learning curve
- More abstraction layers
- Can be overkill for simple domains

---

## Data Flow Examples

### Example 1: Transfer Flow

```
1. Client → POST /api/v1/transactions/transfer
   {
     "idempotencyKey": "uuid",
     "sourceAccountId": "alice",
     "destinationAccountId": "bob",
     "amount": "100.00",
     "currency": "USD"
   }

2. Controller → TransactionService.transfer()

3. Service → CommandBus.execute(TransferCommand)

4. TransferHandler:
   a. Check idempotency key
   b. Load source and destination accounts (with locks)
   c. Validate business rules
   d. Emit TransferRequestedEvent → Kafka

5. TransferSaga:
   a. Listen for TransferRequestedEvent
   b. Execute CompleteTransferCommand
   
6. CompleteTransferHandler:
   a. Debit source account (AccountAggregate.changeBalance)
   b. Credit destination account (AccountAggregate.changeBalance)
   c. Emit BalanceChangedEvent (x2) → Kafka
   d. Emit TransferCompletedEvent → Kafka
   e. Update database (COMMIT transaction)

7. Event Handlers:
   a. BalanceChangedHandler updates AccountProjections
   b. TransferCompletedHandler updates TransactionProjections
   c. AuditHandler logs to AuditLog table

8. Response → Client:
   {
     "sourceTransactionId": "uuid",
     "destinationTransactionId": "uuid",
     "status": "pending"
   }

9. Client polls → GET /api/v1/transactions/:id
   Eventually returns { "status": "completed" }
```

**Why Eventual Consistency?**
- Events processed asynchronously
- Projections updated after commit
- Enables high throughput
- Small delay (typically < 100ms)

---

## Technology Stack

### Core Framework
- **NestJS 11** - Modular application framework
- **TypeScript 5** - Type-safe development
- **Node.js 18+** - Runtime environment

### Data Persistence
- **PostgreSQL 14+** - Relational database for state
- **TypeORM** - ORM with migration support
- **Kafka 3.x** - Event store and message broker
- **KafkaJS** - Kafka client for Node.js

### Libraries
- **@nestjs/cqrs** - CQRS pattern support
- **class-validator** - DTO validation
- **class-transformer** - DTO transformation
- **Decimal.js** - Precise decimal arithmetic
- **uuid** - UUID generation

### Development
- **Jest** - Testing framework
- **Supertest** - HTTP testing
- **ESLint** - Code linting
- **Prettier** - Code formatting
- **Husky** - Git hooks

---

## Scalability Considerations

### Horizontal Scaling

**Current State**: Single instance

**Scaling Strategy**:
1. **API Layer**: Stateless, can scale horizontally behind load balancer
2. **Event Handlers**: Multiple instances can consume from Kafka (consumer groups)
3. **Database**: Read replicas for query operations
4. **Kafka**: Already distributed, add more brokers/partitions

### Performance Bottlenecks

**Identified**:
- Pessimistic locking serializes writes per account
- Event replay for long-lived aggregates
- No caching layer

**Mitigation Strategies**:
- Implement snapshot strategy for aggregates
- Add Redis cache for frequently accessed projections
- Optimize database indexes
- Consider optimistic locking for high-throughput scenarios

---

## What's NOT Implemented (Intentionally)

For educational focus, these are excluded:

- ✗ Authentication/Authorization
- ✗ Multi-tenancy
- ✗ Rate limiting
- ✗ Currency conversion
- ✗ Transaction fees
- ✗ Scheduled transactions
- ✗ Webhooks for notifications
- ✗ Event schema versioning
- ✗ Snapshot strategy
- ✗ Production-grade monitoring
- ✗ Disaster recovery procedures

---

## Related Documentation

- [CQRS Pattern](./cqrs-pattern.md) - Deep dive into CQRS implementation
- [Event Sourcing](./event-sourcing.md) - Event store details
- [Data Model](./data-model.md) - Database schema
- [Double-Entry Bookkeeping](./double-entry.md) - Accounting principles

---

**Next**: Learn about [CQRS Pattern](./cqrs-pattern.md) in detail. →


# Account Module

## Overview

The Account module manages account lifecycle, balances, and status. Implements CQRS with AccountAggregate for writes and AccountProjection for reads.

**Location**: `src/modules/account/`

---

## Module Structure

```
src/modules/account/
├── account.module.ts               # Module definition
├── account.controller.ts           # REST endpoints
├── account.service.ts              # Orchestration layer
├── account.entity.ts               # Write model (current state)
│
├── aggregates/
│   └── account.aggregate.ts        # Domain logic
│
├── commands/
│   ├── create-account.command.ts
│   └── update-balance.command.ts
│
├── queries/
│   ├── get-account.query.ts
│   └── get-accounts-by-owner.query.ts
│   └── handlers/                   # Query handlers
│
├── events/
│   ├── account-created.event.ts
│   ├── balance-changed.event.ts
│   ├── account-status-changed.event.ts
│   └── account-limits-changed.event.ts
│
├── handlers/
│   ├── create-account.handler.ts   # Command handlers
│   ├── update-balance.handler.ts
│   ├── balance-changed.handler.ts  # Event handlers
│   └── ...
│
├── projections/
│   ├── account-projection.entity.ts    # Read model
│   └── account-projection.service.ts
│
└── dto/
    ├── create-account.dto.ts
    └── update-account-status.dto.ts
```

---

## Key Classes

### AccountAggregate

**Purpose**: Encapsulates account business logic using event sourcing.

**Location**: `src/modules/account/aggregates/account.aggregate.ts`

**Responsibilities**:
- Enforce business rules
- Emit domain events
- Rebuild state from events

**Key Methods**:

```typescript
class AccountAggregate extends AggregateRoot {
  // Commands (write operations)
  create(params): void;
  changeBalance(params): void;
  changeStatus(params): void;
  changeLimits(params): void;
  
  // Event handlers (state updates)
  onAccountCreated(event): void;
  onBalanceChanged(event): void;
  onAccountStatusChanged(event): void;
  
  // Getters (read state)
  getBalance(): Decimal;
  getStatus(): AccountStatus;
  getCurrency(): string;
}
```

**Usage Example**:

```typescript
// Load aggregate from event store
const events = await eventStore.getEvents('Account', accountId);
const aggregate = new AccountAggregate();
events.forEach(event => aggregate.applyEvent(event));

// Execute command
aggregate.changeBalance({
  changeAmount: '50.00',
  changeType: 'CREDIT',
  reason: 'Topup',
  correlationId: uuid()
});

// Get uncommitted events
const newEvents = aggregate.getUncommittedEvents();

// Persist to event store
await eventStore.append('Account', accountId, newEvents);
```

---

### Account Entity

**Purpose**: Database entity for current account state (write model).

**Location**: `src/modules/account/account.entity.ts`

**Schema**:

```typescript
@Entity('accounts')
class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  @Column()
  ownerId: string;
  
  @Column()
  ownerType: string;
  
  @Column({ type: 'enum', enum: AccountType })
  accountType: AccountType;
  
  @Column()
  currency: string;
  
  @Column({ type: 'decimal', precision: 20, scale: 8 })
  balance: string;
  
  @Column({ type: 'enum', enum: AccountStatus })
  status: AccountStatus;
  
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown>;
  
  @VersionColumn()
  version: number;  // For optimistic locking
}
```

**Usage**: Read/write via `AccountService`

---

### AccountProjection

**Purpose**: Optimized read model for queries.

**Location**: `src/modules/account/projections/account-projection.entity.ts`

**Differences from Account Entity**:
- Denormalized (no foreign keys)
- Simpler structure (only fields needed for queries)
- Updated by event handlers (eventual consistency)

**Schema**:

```typescript
@Entity('account_projections')
class AccountProjection {
  @PrimaryColumn('uuid')
  id: string;
  
  @Column()
  ownerId: string;
  
  @Column()
  ownerType: string;
  
  @Column()
  currency: string;
  
  @Column({ type: 'decimal' })
  balance: string;
  
  @Column()
  status: string;
  
  @Column()
  type: string;
}
```

**Usage**: Queries read from this, not from Account entity.

---

## Commands

### CreateAccountCommand

**Purpose**: Create a new account.

```typescript
class CreateAccountCommand extends Command {
  constructor(
    public readonly accountId: string,
    public readonly ownerId: string,
    public readonly ownerType: string,
    public readonly currency: string,
    public readonly accountType: AccountType,
    public readonly correlationId: string,
  ) {}
}
```

**Handler Flow**:
1. Validate currency exists
2. Create new AccountAggregate
3. aggregate.create(params)
4. Persist events to Kafka
5. Publish events to EventBus

### UpdateBalanceCommand

**Purpose**: Update account balance (internal command, not exposed via API).

```typescript
class UpdateBalanceCommand extends Command {
  constructor(
    public readonly accountId: string,
    public readonly changeAmount: string,
    public readonly changeType: 'CREDIT' | 'DEBIT',
    public readonly reason: string,
    public readonly transactionId?: string,
    public readonly correlationId: string,
  ) {}
}
```

**Usage**: Called by transaction sagas to update balances.

---

## Queries

### GetAccountQuery

```typescript
class GetAccountQuery extends Query {
  constructor(public readonly accountId: string) {}
}
```

**Handler**: Reads from AccountProjection table.

### GetAccountsByOwnerQuery

```typescript
class GetAccountsByOwnerQuery extends Query {
  constructor(
    public readonly ownerId: string,
    public readonly ownerType: string,
  ) {}
}
```

**Handler**: Queries AccountProjection by owner.

---

## Events

### AccountCreatedEvent

```typescript
class AccountCreatedEvent extends DomainEvent {
  constructor(
    public readonly ownerId: string,
    public readonly ownerType: string,
    public readonly accountType: AccountType,
    public readonly currency: string,
    public readonly status: AccountStatus,
    public readonly initialBalance: string,
    eventMetadata: EventMetadata,
  ) {
    super('AccountCreated', eventMetadata);
  }
}
```

**Subscribers**:
- AccountProjectionService (updates read model)
- AuditService (logs creation)

### BalanceChangedEvent

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

**Subscribers**:
- AccountProjectionService (updates balance in read model)
- Account Entity Handler (updates write model)
- AuditService (logs balance change)

---

## Services

### AccountService

**Purpose**: Orchestration layer for account operations.

**Key Methods**:

```typescript
class AccountService {
  async create(dto, context): Promise<Account>;
  async findById(id): Promise<Account>;
  async findByOwner(ownerId, ownerType): Promise<Account[]>;
  async getBalance(id): Promise<{ balance, currency, status }>;
  async updateStatus(id, status, context): Promise<Account>;
}
```

**Role**: Coordinates commands, queries, and database operations.

---

## Event Handlers

### BalanceChangedHandler

**Purpose**: Update AccountProjection when balance changes.

```typescript
@EventsHandler(BalanceChangedEvent)
class BalanceChangedHandler implements IEventHandler<BalanceChangedEvent> {
  async handle(event: BalanceChangedEvent): Promise<void> {
    await this.projectionService.updateBalance(
      event.aggregateId,
      event.newBalance
    );
  }
}
```

---

## Business Rules

### Account Creation

1. Currency must exist in `currencies` table
2. OwnerId and ownerType are required
3. Initial balance is always 0
4. Default status is ACTIVE

### Balance Updates

1. Account must be ACTIVE
2. New balance cannot exceed maxBalance (if set)
3. New balance cannot go below minBalance (defaults to 0 for USER accounts)
4. Balance changes must be justified with a reason

### Status Transitions

```
ACTIVE → SUSPENDED ✓
ACTIVE → CLOSED ✓
SUSPENDED → ACTIVE ✓
SUSPENDED → CLOSED ✓
CLOSED → any ✗ (terminal state)
```

---

## Extension Points

### Add New Account Type

1. Update `AccountType` enum in `account.entity.ts`
2. Add validation rules in `AccountAggregate`
3. Update documentation

### Add Custom Validation

Override `changeBalance` in AccountAggregate:

```typescript
changeBalance(params) {
  // Custom validation
  if (this.metadata.vipStatus === 'platinum') {
    // Skip balance limits for platinum users
  }
  
  // Call parent method
  super.changeBalance(params);
}
```

---

## Testing

### Unit Test Example

```typescript
describe('AccountAggregate', () => {
  it('should enforce minimum balance', () => {
    const aggregate = new AccountAggregate();
    aggregate.create({ ... });
    
    expect(() => {
      aggregate.changeBalance({
        changeAmount: '1000.00',
        changeType: 'DEBIT',  // Would make balance negative
        reason: 'Test'
      });
    }).toThrow('Insufficient balance');
  });
});
```

---

## Related Documentation

- [Account API](../api/accounts.md) - REST endpoints
- [Account Concept](../concepts/accounts.md) - Account types and lifecycle
- [CQRS Pattern](../architecture/cqrs-pattern.md) - Architecture overview


# Module Documentation

## Overview

This section provides deep dives into each module's internal implementation. For developers who want to understand or extend the codebase.

---

## Modules

### [Account Module](./account.md)
Account lifecycle management, aggregates, projections, and commands/queries.
- AccountAggregate (domain logic)
- Account Entity (write model)
- AccountProjection (read model)
- Commands: CreateAccount, UpdateBalance
- Queries: GetAccount, GetAccountsByOwner

### [Transaction Module](./transaction.md)
Transaction processing with CQRS, sagas, and double-entry bookkeeping.
- TransactionAggregate (domain logic)
- Transaction Entity (write model)
- TransactionProjection (read model)
- Commands: Topup, Withdrawal, Transfer, Payment, Refund
- Sagas: Transfer coordination and compensation

### [CQRS Module](./cqrs.md)
CQRS infrastructure including event store, base classes, and Kafka integration.
- AggregateRoot base class
- DomainEvent base class
- KafkaEventStore implementation
- EventBus and command/query buses
- Event handlers

### Currency Module
Currency configuration and validation (see [Currency API](../api/currencies.md)).

### Audit Module
Audit logging for compliance (see [Audit Trail concept](../concepts/audit-trail.md)).

### Events Module
Server-Sent Events (SSE) for real-time updates (see [Events API](../api/events.md)).

---

## Module Structure

Each module follows NestJS conventions:

```
src/modules/<module-name>/
├── <module>.module.ts          # Module definition
├── <module>.controller.ts      # REST API endpoints
├── <module>.service.ts         # Business logic orchestration
├── <module>.entity.ts          # Database entity (write model)
├── dto/                        # Data transfer objects
├── commands/                   # CQRS commands
├── queries/                    # CQRS queries
├── events/                     # Domain events
├── handlers/                   # Command/event/query handlers
├── aggregates/                 # Domain aggregates
└── projections/               # Read models
```

---

## Related Documentation

- [System Design](../architecture/system-design.md) - Overall architecture
- [CQRS Pattern](../architecture/cqrs-pattern.md) - CQRS implementation
- [Development Guide](../development/local-setup.md) - Development setup


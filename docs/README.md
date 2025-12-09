# Billing Engine Documentation

Welcome to the Billing Engine documentation! This guide will help you understand, use, and learn from this educational billing system project.

> 🎓 **Educational Project**: This documentation focuses on explaining **WHY** decisions were made, not just **HOW** to use the system. Each major design choice includes reasoning, alternatives considered, and trade-offs made.

---

## 📚 Documentation Structure

This documentation is organized into focused sections:

### 🚀 Getting Started

New to the project? Start here:

- **[Getting Started Guide](../GETTING_STARTED.md)** - Set up and run your first transactions in 10 minutes
- **[Installation Guide](./guides/installation.md)** - Detailed installation instructions and troubleshooting
- **[Configuration Guide](./guides/configuration.md)** - Environment variables and configuration options

### 🏛️ Architecture

Understand the system's design and patterns:

- **[System Design](./architecture/system-design.md)** - High-level architecture overview and components
- **[CQRS Pattern](./architecture/cqrs-pattern.md)** - Command/Query separation explained with examples
- **[Data Model](./architecture/data-model.md)** - Database schema, entities, and relationships
- **[Event Sourcing](./architecture/event-sourcing.md)** - Event store implementation with Kafka
- **[Double-Entry Bookkeeping](./architecture/double-entry.md)** - Financial accounting principles applied

### 🌐 API Reference

Complete REST API documentation:

- **[REST API Overview](./api/rest-api.md)** - API conventions, error handling, and standards
- **[Account Endpoints](./api/accounts.md)** - Create and manage accounts
- **[Transaction Endpoints](./api/transactions.md)** - All transaction operations
- **[Currency Endpoints](./api/currencies.md)** - Currency configuration
- **[Real-time Events](./api/events.md)** - Server-Sent Events (SSE) for live updates

### 🔧 Guides

Practical how-to guides:

- **[Installation](./guides/installation.md)** - Step-by-step installation
- **[Configuration](./guides/configuration.md)** - Environment setup and tuning
- **[Deployment](./guides/deployment.md)** - Deployment strategies
- **[Monitoring](./guides/monitoring.md)** - Observability and health checks

### 📦 Modules

Deep dives into each module:

- **[Account Module](./modules/account.md)** - Account management implementation
- **[Transaction Module](./modules/transaction.md)** - Transaction processing logic
- **[CQRS Infrastructure](./modules/cqrs.md)** - CQRS implementation details

### 💰 Operations

Understanding transaction operations:

- **[Top-up](./operations/top-up.md)** - Adding funds from external sources
- **[Withdrawal](./operations/withdrawal.md)** - Removing funds to external destinations
- **[Transfer](./operations/transfer.md)** - Moving funds between accounts
- **[Payment](./operations/payment.md)** - Customer-to-merchant payments
- **[Refund](./operations/refund.md)** - Reversing payments

### 🛠️ Development

Developer guides and best practices:

- **[Local Development](./development/local-setup.md)** - Setting up your dev environment
- **[Testing Guide](./development/testing.md)** - Unit and E2E testing strategies
- **[Debugging Guide](./development/debugging.md)** - Debugging tips and tools
- **[Code Style Guide](./development/code-style.md)** - Coding standards and conventions
- **[Database Migrations](./development/migrations.md)** - Managing schema changes

### 🧠 Concepts

Core concepts explained:

- **[Accounts](./concepts/accounts.md)** - Account types, lifecycle, and states
- **[Transactions](./concepts/transactions.md)** - Transaction types, states, and flows
- **[Idempotency](./concepts/idempotency.md)** - Preventing duplicate operations
- **[Locking](./concepts/locking.md)** - Concurrency control and pessimistic locking
- **[Audit Trail](./concepts/audit-trail.md)** - Compliance and auditability

### 🐳 Infrastructure

Infrastructure setup and management:

- **[PostgreSQL](./infrastructure/postgres.md)** - Database configuration
- **[Kafka](./infrastructure/kafka.md)** - Event store setup
- **[Docker](./infrastructure/docker.md)** - Container orchestration

---

## 🎯 Quick Navigation

### I want to...

#### Get Started
- **Run the application** → [Getting Started Guide](../GETTING_STARTED.md)
- **Understand the architecture** → [System Design](./architecture/system-design.md)
- **Use the API** → [REST API Overview](./api/rest-api.md)

#### Learn Concepts
- **Understand CQRS** → [CQRS Pattern](./architecture/cqrs-pattern.md)
- **Learn Event Sourcing** → [Event Sourcing](./architecture/event-sourcing.md)
- **Understand Double-Entry** → [Double-Entry Bookkeeping](./architecture/double-entry.md)

#### Implement Features
- **Process a payment** → [Payment Operation](./operations/payment.md)
- **Handle refunds** → [Refund Operation](./operations/refund.md)
- **Create accounts** → [Account API](./api/accounts.md)

#### Develop & Test
- **Set up development** → [Local Development](./development/local-setup.md)
- **Write tests** → [Testing Guide](./development/testing.md)
- **Debug issues** → [Debugging Guide](./development/debugging.md)

---

## 📖 Documentation Philosophy

This documentation is designed with learning in mind:

### Focus on WHY, Not Just HOW

Every major architectural decision includes:
- **The Problem**: What issue does this solve?
- **The Reasoning**: Why this approach?
- **The Alternatives**: What else was considered?
- **The Trade-offs**: What did we gain/lose?
- **The Limitations**: What's simplified or missing?

### Example: Why CQRS?

Instead of just explaining "here's how to use CommandBus," the docs explain:
- **Problem**: Complex billing queries slow down write operations
- **Reasoning**: Separate read/write models for optimization
- **Alternatives**: Simple CRUD (simpler but slower at scale)
- **Trade-offs**: Complexity vs. scalability and auditability
- **Limitations**: Eventual consistency, not immediate consistency

This approach helps you understand not just *what* the code does, but *why* it was designed this way.

---

## 🎓 Learning Path

### For Beginners

1. **[Getting Started](../GETTING_STARTED.md)** - Get hands-on experience
2. **[System Design](./architecture/system-design.md)** - Understand the big picture
3. **[Accounts Concept](./concepts/accounts.md)** - Learn the basics
4. **[REST API Overview](./api/rest-api.md)** - Explore the API

### For Intermediate Developers

1. **[CQRS Pattern](./architecture/cqrs-pattern.md)** - Deep dive into CQRS
2. **[Event Sourcing](./architecture/event-sourcing.md)** - Master event-driven architecture
3. **[Transaction Module](./modules/transaction.md)** - Understand transaction processing
4. **[Testing Guide](./development/testing.md)** - Learn testing strategies

### For Advanced Users

1. **[Double-Entry Bookkeeping](./architecture/double-entry.md)** - Financial accuracy
2. **[Data Model](./architecture/data-model.md)** - Database design deep dive
3. **[Locking Strategies](./concepts/locking.md)** - Concurrency control
4. **[Deployment Guide](./guides/deployment.md)** - Production considerations

---

## 🔍 Key Topics

### CQRS + Event Sourcing

This system uses CQRS (Command Query Responsibility Segregation) with Event Sourcing:

- **Commands** modify state (e.g., `TopupCommand`, `TransferCommand`)
- **Events** capture what happened (e.g., `BalanceChanged`, `TransferCompleted`)
- **Queries** read from optimized projections (e.g., `GetAccountQuery`)
- **Sagas** orchestrate complex workflows

Learn more: [CQRS Pattern](./architecture/cqrs-pattern.md) | [Event Sourcing](./architecture/event-sourcing.md)

### Double-Entry Bookkeeping

Every transaction has two sides:

- **Account Types**: USER, EXTERNAL, SYSTEM
- **Operations**: Top-up (External→User), Withdrawal (User→External), Transfer (User→User)
- **Guarantee**: Sum of all balances always equals zero
- **Audit**: Complete transaction history for compliance

Learn more: [Double-Entry Bookkeeping](./architecture/double-entry.md)

### Idempotency & Consistency

Financial systems must be reliable:

- **Idempotency Keys**: UUID keys prevent duplicate transactions
- **Pessimistic Locking**: Prevents race conditions on balances
- **ACID Transactions**: Database guarantees for consistency
- **Saga Pattern**: Coordinates multi-step operations with compensation

Learn more: [Idempotency](./concepts/idempotency.md) | [Locking](./concepts/locking.md)

---

## 🚀 Example Use Cases

### Use Case 1: Top-up Account

**Goal**: Add funds to a user account from a bank.

**Steps**:
1. Create USER account → [Account API](./api/accounts.md)
2. Create EXTERNAL account (bank) → [Account API](./api/accounts.md)
3. Post top-up transaction → [Top-up Operation](./operations/top-up.md)
4. System creates two-sided entry (debit external, credit user)
5. Events published to Kafka for audit trail
6. Projections updated for queries

**Learn More**: [Top-up Operation](./operations/top-up.md)

### Use Case 2: Transfer Between Users

**Goal**: Transfer money from Alice to Bob atomically.

**Steps**:
1. Post transfer transaction → [Transfer Operation](./operations/transfer.md)
2. Saga coordinates both account updates
3. Pessimistic locks prevent concurrent modifications
4. If either side fails, entire transfer rolls back
5. Events capture complete audit trail

**Learn More**: [Transfer Operation](./operations/transfer.md) | [Transaction Module](./modules/transaction.md)

### Use Case 3: Payment with Refund

**Goal**: Process a customer payment and later refund it.

**Steps**:
1. Customer pays merchant → [Payment Operation](./operations/payment.md)
2. Payment events published (requested, completed)
3. Later, issue refund → [Refund Operation](./operations/refund.md)
4. Refund reverses the original payment
5. Both operations linked in audit trail

**Learn More**: [Payment Operation](./operations/payment.md) | [Refund Operation](./operations/refund.md)

---

## 🛠️ Development Resources

### Quick Reference

- **API Base URL**: `http://localhost:3000/api/v1`
- **Swagger Docs**: `http://localhost:3000/api/docs`
- **PostgreSQL**: `localhost:5432` (user: postgres, db: billing_engine)
- **Kafka**: `localhost:9092`

### Useful Commands

```bash
# Start everything
npm start

# Run tests
npm test

# View logs
npm run env:logs

# Check service status
npm run env:status

# Generate migration
npm run migration:generate -- src/migrations/MigrationName
```

### Project Structure

```
billing-engine/
├── src/
│   ├── modules/          # Feature modules
│   │   ├── account/      # Account management
│   │   ├── transaction/  # Transaction processing
│   │   ├── currency/     # Currency support
│   │   └── audit/        # Audit logging
│   ├── cqrs/             # CQRS infrastructure
│   │   ├── base/         # Base classes
│   │   └── kafka/        # Kafka event store
│   └── common/           # Shared utilities
├── test/                 # Tests
│   ├── unit/            # Unit tests
│   └── e2e/             # E2E tests
└── docs/                # Documentation (you are here!)
```

---

## ⚠️ Important Notes

### This is a Study Project

- **Not Production Ready**: Simplified for learning purposes
- **No Support**: Use at your own risk
- **No License Restrictions**: Use freely for learning and inspiration
- **Learning Focus**: Emphasis on understanding concepts

See [Project Philosophy](../PROJECT_PHILOSOPHY.md) for full context.

### What's Simplified

This project intentionally simplifies:
- Authentication/Authorization (no JWT, no OAuth)
- Multi-tenancy (single tenant assumed)
- Currency conversion (not implemented)
- Transaction fees (not implemented)
- Snapshots (event replay not optimized)
- Webhooks (no outbound notifications)

These are left out to focus on core patterns: CQRS, Event Sourcing, and Double-Entry Bookkeeping.

---

## 💬 Getting Help

### Documentation Issues

If something in the docs is unclear:
1. Check related documentation sections
2. Review code examples in the repository
3. Open an issue on GitHub
4. Ask in discussions

### Technical Issues

If you encounter technical problems:
1. Check the [Troubleshooting section](./guides/installation.md#troubleshooting)
2. Review service logs: `npm run env:logs`
3. Search existing GitHub issues
4. Open a new issue with details

### Learning Questions

Questions about concepts are welcomed!
- Open a GitHub discussion
- Ask why something was designed a certain way
- Propose alternative approaches

Remember: This is a learning project. Questions and discussions help everyone learn!

---

## 📚 External Resources

This project builds on established patterns:

### Books
- **Domain-Driven Design** by Eric Evans
- **Implementing Domain-Driven Design** by Vaughn Vernon
- **Designing Data-Intensive Applications** by Martin Kleppmann

### Articles & Patterns
- [Martin Fowler - CQRS](https://martinfowler.com/bliki/CQRS.html)
- [Greg Young - Event Sourcing](https://www.kurrent.io/blog/what-is-event-sourcing)
- [Microsoft - CQRS Pattern](https://docs.microsoft.com/en-us/azure/architecture/patterns/cqrs)
- [Saga Pattern](https://microservices.io/patterns/data/saga.html)

### Related Projects
- [NestJS CQRS](https://docs.nestjs.com/recipes/cqrs)
- [Apache Kafka](https://kafka.apache.org/documentation/)

**Note**: EventStoreDB (now [Kurrent.io](https://www.kurrent.io/)) is not used in this project due to restrictive licensing. We use Apache Kafka as our event store instead.

---

## 🎯 Next Steps

Choose your path:

### For New Users
👉 Start with the [Getting Started Guide](../GETTING_STARTED.md)

### For Architects
👉 Read [System Design](./architecture/system-design.md) and [CQRS Pattern](./architecture/cqrs-pattern.md)

### For Developers
👉 Check [API Reference](./api/rest-api.md) and [Local Development](./development/local-setup.md)

### For Learners
👉 Explore [Project Philosophy](../PROJECT_PHILOSOPHY.md) and [Concepts](./concepts/)

---

**Happy Learning! 🚀**

*Remember: This shows how billing systems CAN be built, not how they SHOULD be built. Use as inspiration, not gospel.*


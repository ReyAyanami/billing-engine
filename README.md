# Billing Engine

> 🎓 **Educational Study Project**: A demonstration of CQRS, Event Sourcing, and Double-Entry Bookkeeping patterns applied to a billing system.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11-red)](https://nestjs.com/)
[![License](https://img.shields.io/badge/License-Unlicensed-green)](LICENSE)

## 📚 What is This?

This is a **personal learning project** exploring how billing systems can be built using modern architectural patterns. It demonstrates:

- **Pure Event Sourcing** with Kafka as the source of truth
- **CQRS (Command Query Responsibility Segregation)** with complete read/write separation
- **Double-Entry Bookkeeping** for financial accuracy
- **Domain-Driven Design** with aggregates and bounded contexts

**⚠️ Important**: This is study material, not production-ready software. Use it to learn concepts, not as a blueprint for real billing systems.

---

## ✨ Key Features

### Financial Operations
- 💰 **Account Management**: Create and manage USER, EXTERNAL, and SYSTEM accounts
- 💸 **Transactions**: Top-up, Withdrawal, Transfer, Payment, and Refund operations
- 🌍 **Multi-Currency**: Support for fiat (USD, EUR, GBP) and non-fiat (BTC, ETH, POINTS) currencies
- 🔄 **Atomic Transfers**: Guaranteed consistency with pessimistic locking
- 🌐 **Multi-Region Active-Active**: Global scale with Hybrid Logical Clocks (HLC) and Cross-Region Replication
- 🛡️ **Reservation-Based Liquidity**: Zero double-spend guarantees via regional reservation pools

### Architecture Highlights
- 📝 **Event Sourcing**: Complete audit trail with event replay capability
- ⚡ **CQRS Pattern**: Optimized read/write models with projections
- 🔐 **Idempotency**: Duplicate transaction prevention with UUID keys
- 🎯 **Saga Orchestration**: Production-grade transaction coordination with state tracking
- 📦 **Outbox Pattern**: Guaranteed event delivery with at-least-once semantics
- 🕰️ **Hybrid Logical Clocks**: Causal ordering of events across distributed regions
- 🔄 **Dual Consistency**: Immediate (saga/reservation) + eventual (projections)
- 📊 **Real-time Events**: Server-Sent Events (SSE) for live updates

---

## 🚀 Quick Start

### Prerequisites

- **Docker Desktop** 4.0+ (for PostgreSQL and Kafka)
- **Node.js** 18+ 
- **5 minutes** of your time

### One-Command Setup

```bash
# Clone the repository
git clone <your-repo-url>
cd billing-engine

# Install dependencies
npm install

# Start everything (PostgreSQL, Kafka, and the app)
npm start
```

That's it! The application will:
1. Start PostgreSQL and Kafka via Docker Compose
2. Run database migrations automatically
3. Start the API server on `http://localhost:3000`
4. Initialize default currencies

### Verify Installation

```bash
# Check health
curl http://localhost:3000/health

# View API documentation
open http://localhost:3000/api/docs
```

---

## 🎯 Your First API Call

### 1. Create an Account

```bash
curl -X POST http://localhost:3000/api/v1/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "ownerId": "user_123",
    "ownerType": "user",
    "currency": "USD",
    "type": "USER"
  }'
```

Response:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "ownerId": "user_123",
  "ownerType": "user",
  "currency": "USD",
  "balance": "0",
  "status": "active",
  "type": "USER"
}
```

### 2. Add Funds (Top-up)

```bash
curl -X POST http://localhost:3000/api/v1/transactions/topup \
  -H "Content-Type: application/json" \
  -d '{
    "idempotencyKey": "unique-key-123",
    "destinationAccountId": "550e8400-e29b-41d4-a716-446655440000",
    "amount": "100.00",
    "currency": "USD",
    "sourceAccountId": "external-bank-001"
  }'
```

Response:
```json
{
  "transactionId": "660e8400-e29b-41d4-a716-446655440001",
  "status": "pending"
}
```

### 3. Check Balance

```bash
curl http://localhost:3000/api/v1/accounts/550e8400-e29b-41d4-a716-446655440000/balance
```

Response:
```json
{
  "balance": "100.00",
  "currency": "USD",
  "status": "active"
}
```

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   REST API Layer                     │
│              (NestJS Controllers)                    │
└──────────────────┬──────────────────────────────────┘
                   │
         ┌─────────▼─────────┐
         │  CQRS/DDD Layer   │
         │                   │
         │  Commands ────────┼───> Command Handlers
         │  Queries  ────────┼───> Query Handlers
         │  Events   ────────┼───> Event Handlers
         │  Sagas    ────────┼───> Transaction Coordination
         │                   │
         └─────────┬─────────┘
                   │
      ┌────────────┴────────────┐
      │                         │
┌─────▼──────┐          ┌──────▼─────┐
│ PostgreSQL │          │   Kafka    │
│            │          │            │
│ Read/Write │          │Event Store │
│ Projections│          │Audit Trail │
└────────────┘          └────────────┘
```

### Technology Stack

- **Framework**: NestJS 11 with TypeScript 5
- **Database**: PostgreSQL 14+ with TypeORM
- **Event Store**: Kafka 3.x via KafkaJS
- **Validation**: class-validator + class-transformer
- **API Docs**: Swagger/OpenAPI

---

## 📖 Documentation

Comprehensive documentation is available in the [`/docs`](./docs) directory:

### Getting Started
- 📘 [Getting Started Guide](./GETTING_STARTED.md) - Detailed setup walkthrough
- 🔧 [Installation Guide](./docs/guides/installation.md) - Installation options and troubleshooting
- ⚙️ [Configuration Guide](./docs/guides/configuration.md) - Environment variables and settings

### Architecture
- 🏛️ [System Design](./docs/architecture/system-design.md) - High-level architecture overview
- 🎯 [CQRS Pattern](./docs/architecture/cqrs-pattern.md) - Command/Query separation explained
- 📊 [Data Model](./docs/architecture/data-model.md) - Database schema and entities
- 📝 [Event Sourcing](./docs/architecture/event-sourcing.md) - Event store implementation
- 📚 [Double-Entry Bookkeeping](./docs/architecture/double-entry.md) - Financial accounting principles

### API Reference
- 🌐 [REST API Overview](./docs/api/rest-api.md) - Complete API documentation
- 👤 [Account Endpoints](./docs/api/accounts.md) - Account management API
- 💰 [Transaction Endpoints](./docs/api/transactions.md) - Transaction operations API
- 💱 [Currency Endpoints](./docs/api/currencies.md) - Currency configuration
- ⚡ [Real-time Events](./docs/api/events.md) - Server-Sent Events (SSE)

### Development
- 🛠️ [Local Development](./docs/development/local-setup.md) - Development environment setup
- 🧪 [Testing Guide](./docs/development/testing.md) - Unit and E2E testing
- 🐛 [Debugging Guide](./docs/development/debugging.md) - Debugging tips and tools

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in parallel
npm run test:parallel

# Run with coverage
npm run test:cov

# Run E2E tests
npm run test:e2e

# Run in watch mode
npm run test:watch
```

---

## 📋 Available Commands

### Development
```bash
npm start              # Start infrastructure and run dev server
npm run dev            # Run dev server only (requires services running)
npm run dev:debug      # Run with Node.js debugger
```

### Infrastructure
```bash
npm run env:start      # Start PostgreSQL and Kafka
npm run env:stop       # Stop all services
npm run env:clean      # Stop and remove volumes
npm run env:status     # Check service status
npm run env:logs       # View service logs
```

### Database
```bash
npm run migration:run       # Run pending migrations
npm run migration:revert    # Revert last migration
npm run migration:generate  # Generate new migration
```

### Code Quality
```bash
npm run lint           # Run ESLint with auto-fix
npm run lint:check     # Check without fixing
npm run format         # Format code with Prettier
npm run type-check     # TypeScript type checking
```

---

## 🎓 What You'll Learn

This project demonstrates:

### 1. CQRS + Event Sourcing
- **Why**: Separate optimized read/write models for financial data
- **How**: Commands modify state, events capture changes, queries read projections
- **Trade-offs**: Increased complexity vs. auditability and scalability

### 2. Double-Entry Bookkeeping
- **Why**: Every transaction needs balanced debit/credit entries
- **How**: Three account types (USER, EXTERNAL, SYSTEM) with two-sided transactions
- **Trade-offs**: Complexity vs. financial accuracy and compliance

### 3. Domain-Driven Design
- **Why**: Model complex business logic in the domain layer
- **How**: Aggregates, commands, domain events, and sagas
- **Trade-offs**: Learning curve vs. maintainable business logic

### 4. Event Sourcing with Kafka
- **Why**: Complete audit trail and event replay capability
- **How**: Kafka as append-only event log with projections for queries
- **Trade-offs**: Storage overhead vs. auditability and debugging

### 5. Idempotency & Concurrency
- **Why**: Prevent duplicate transactions and race conditions
- **How**: UUID idempotency keys and pessimistic database locking
- **Trade-offs**: Performance vs. correctness

### 6. Saga Orchestration
- **Why**: Coordinate multi-step transactions without race conditions
- **How**: Saga coordinator with state tracking, outbox pattern for delivery
- **Trade-offs**: Complexity vs. reliability and observability

For detailed explanations of **WHY** each decision was made, see [Project Philosophy](./PROJECT_PHILOSOPHY.md) and [ADR-002: Saga Orchestration](./docs/architecture/decisions/adr-002-saga-orchestration.md).

---

## ⚠️ Important Disclaimers

### Not for Production

This code:
- ❌ Lacks comprehensive error handling for all edge cases
- ❌ Hasn't been tested under production loads
- ❌ May contain security vulnerabilities
- ❌ Doesn't implement all features needed for real billing systems
- ✅ Prioritizes learning over robustness

### No Guarantees

- **No support**: Use at your own risk
- **No updates**: May or may not evolve
- **No warranty**: Provided as-is
- **No license restrictions**: Use freely for learning

### Learning in Public

I'm not an expert in billing systems—I'm learning and sharing that journey. Constructive criticism and better approaches are genuinely welcomed!

---

## 🤝 Contributing

Contributions, questions, and discussions are welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

**Ways to Contribute:**
- 💡 Share better approaches or patterns
- 🐛 Report issues or conceptual problems
- 📝 Improve documentation
- 💬 Discuss trade-offs and alternatives

---

## 📚 Further Reading

This project builds on concepts from:
- **Domain-Driven Design** by Eric Evans
- **Event Sourcing** patterns by Greg Young
- **CQRS** architecture principles
- **Double-Entry Accounting** fundamentals
- **NestJS** best practices

Recommended resources:
- [Martin Fowler - CQRS](https://martinfowler.com/bliki/CQRS.html)
- [Event Sourcing - Greg Young](https://www.eventstore.com/blog/what-is-event-sourcing)
- [Double-Entry Bookkeeping Explained](https://en.wikipedia.org/wiki/Double-entry_bookkeeping)

---

## 📝 Project Status

**Current Version**: 2.0.0 (CQRS + Event Sourcing Architecture)

✅ **Completed Features**:
- CQRS architecture with commands and queries
- Event sourcing with Kafka
- Double-entry bookkeeping
- **Saga orchestration with state tracking** ⚡ NEW
- **Transactional outbox pattern** ⚡ NEW
- **Projection idempotency** ⚡ NEW
- **Multi-Region Active-Active Architecture** ⚡ NEW
- **Reservation-Based Liquidity Management** ⚡ NEW
- **Hybrid Logical Clocks (HLC)** ⚡ NEW
- Account management (USER, EXTERNAL, SYSTEM types)
- Core transactions (Top-up, Withdrawal, Transfer)
- Payment and Refund operations with compensation
- Multi-currency support
- Real-time SSE events
- Comprehensive audit trail
- E2E testing (61 tests passing)

🚧 **What's Missing** (intentionally simplified):
- Authentication and authorization
- Rate limiting
- Webhook notifications
- Currency conversion
- Transaction fees
- Scheduled transactions
- Snapshots for event replay optimization
- Multi-tenancy
- Distributed saga coordination
- Saga timeout handling
- Production-grade monitoring

See [CHANGELOG.md](./CHANGELOG.md) for version history.

---

## 📬 Feedback

Questions? Suggestions? Found a better approach?

This is a learning exercise—constructive feedback helps everyone learn!

---

## 📄 License

**Unlicensed** - Use this however you want:
- Study it
- Copy from it  
- Adapt it
- Build on it
- Criticize it

No attribution required, no strings attached.

---

**Remember**: This shows how billing systems *CAN* be built, not how they *SHOULD* be built. Your requirements will differ—use this as inspiration, not gospel! 🚀


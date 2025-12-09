# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Documentation
- Complete documentation restructure
- Added comprehensive guides for all operations
- Added architecture deep-dives
- Added API reference documentation
- Added concept guides (accounts, transactions, idempotency)
- Added development guides (testing, setup)
- Added `PROJECT_PHILOSOPHY.md` explaining study project nature

---

## [1.0.0] - 2025-12-09

### Added

#### Core Features
- Event-sourced billing engine with CQRS pattern
- Double-entry bookkeeping system
- Kafka-based event store
- PostgreSQL projections for read models
- Account management (USER, EXTERNAL, SYSTEM types)
- Transaction operations:
  - Top-up (external → user)
  - Withdrawal (user → external)
  - Transfer (user → user)
  - Payment (customer → merchant)
  - Refund (merchant → customer)

#### API Endpoints
- Account CRUD operations (`/api/v1/accounts`)
- Transaction operations (`/api/v1/transactions`)
- Currency management (`/api/v1/currencies`)
- Server-Sent Events for real-time updates (`/api/v1/events`)
- Swagger documentation (`/api/docs`)

#### Technical Features
- Idempotency key support for all transactions
- Pessimistic locking for concurrency control
- Saga pattern for multi-account transactions
- Compensation handling for failed operations
- Correlation ID tracking across events
- Account balance limits (min/max)
- Account status management (active, suspended, closed)
- Multi-currency support (one currency per account)

#### Infrastructure
- Docker Compose setup (PostgreSQL, Kafka, Zookeeper)
- Database migrations with TypeORM
- Event versioning support
- Tenant-based schema isolation
- Health checks and monitoring endpoints

#### Testing
- Unit tests for aggregates and services
- E2E tests for complete transaction flows
- Test fixtures and helpers
- Event polling utilities
- In-memory event store for testing

#### Documentation
- Comprehensive README
- Quick start guide (GETTING_STARTED.md)
- Architecture documentation
- API reference
- Operation guides
- Module documentation
- Concept guides
- Development guides
- Contributing guidelines

---

## Project Philosophy

This is a **study project** for personal exploration and learning about:
- Event sourcing and CQRS
- Double-entry bookkeeping
- Distributed systems
- Domain-driven design
- Saga pattern
- Financial system concepts

**Not production-ready**: This project is intentionally simplified and omits many production requirements (authentication, monitoring, performance optimization, etc.) for educational clarity.

See [PROJECT_PHILOSOPHY.md](./PROJECT_PHILOSOPHY.md) for details.

---

## Future Learning Topics (Ideas)

These are potential areas for exploration, not a committed roadmap:

### Advanced Event Sourcing
- Event upcasting (schema evolution)
- Snapshotting for performance
- Event replay and time travel debugging
- GDPR compliance (event deletion/anonymization)

### Scaling Patterns
- Read model scaling
- Event store partitioning
- Distributed sagas
- Outbox pattern

### Financial Features
- Multi-currency conversion
- Transaction fees and commissions
- Scheduled/recurring payments
- Batch processing
- Reconciliation

### Observability
- Distributed tracing (OpenTelemetry)
- Metrics (Prometheus)
- Structured logging
- Audit queries

### Domain Concepts
- Compound accounts (sub-accounts)
- Holds/reservations
- Settlements
- Chargebacks

---

## Versioning

This project does not follow semantic versioning strictly, as it's a study project rather than a production library. Version numbers mark significant milestones in the learning journey.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.

Note: This is primarily a personal learning project. Contributions that enhance educational value are welcome.

---

## License

MIT License - See [LICENSE](./LICENSE)


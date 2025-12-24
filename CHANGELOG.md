# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [2.0.0] - 2025-12-24

### Added
- **Saga Reservations**: Added mandatory `ReserveBalance` step to Payment, Refund, Transfer, and Withdrawal sagas to prevent "Insufficient local reservation" errors.
- **Event Serialization Fix**: Implemented `getEventData` in `BalanceReservedEvent` for correct hydration.

### Fixed
- **E2E Tests**: Fixed all end-to-end tests for transaction flows.
- **Type Safety**: Resolved typescript errors in event definitions.

### Added

#### Fault Tolerance Features
- **Projection Rebuilding Services**: Reconstruct projections from event store
  - `AccountProjectionRebuildService` - Rebuild account projections
  - `TransactionProjectionRebuildService` - Rebuild transaction projections
  - Support for single entity or bulk rebuilding

#### Documentation
- **ADR-003**: Added [ADR-003](./docs/architecture/decisions/adr-003-multi-region-active-active.md) documenting Multi-Region interactions, HLC, and Reservation strategy.
- **System Design**: Added "Multi-Region Active-Active Architecture" section.
- **Reconciliation Services**: Verify projection consistency with events
  - `AccountReconciliationService` - Detect account inconsistencies
  - `TransactionReconciliationService` - Detect transaction inconsistencies
  - Stuck transaction detection (pending too long)
  - Accounting equation verification
- **Retry Utility**: Exponential backoff for transient failures
  - Configurable retry attempts and delays
  - Automatic detection of retryable errors (deadlocks, timeouts, etc.)
- **Enhanced Exception Handling**:
  - `OptimisticLockException` - Version conflict detection
  - `InvariantViolationException` - State validation failures
  - `ProjectionOutOfSyncException` - Projection inconsistency errors
  - `InvalidCurrencyException` - Currency validation
- **State Invariant Validation**: Business rule enforcement in aggregates
  - Negative balance detection
  - Max/min balance limit validation
  - Consistency checks
- **Admin API Module**: REST endpoints for operational maintenance
  - `POST /api/v1/admin/accounts/:id/rebuild` - Rebuild account projection
  - `POST /api/v1/admin/accounts/rebuild-all` - Rebuild all accounts
  - `GET /api/v1/admin/accounts/:id/reconcile` - Verify account consistency
  - `GET /api/v1/admin/accounts/reconcile-all` - Verify all accounts
  - `GET /api/v1/admin/accounts/accounting-equation` - System integrity check
  - `POST /api/v1/admin/transactions/:id/rebuild` - Rebuild transaction projection
  - `POST /api/v1/admin/transactions/rebuild-all` - Rebuild all transactions
  - `GET /api/v1/admin/transactions/:id/reconcile` - Verify transaction consistency
  - `GET /api/v1/admin/transactions/reconcile-all` - Verify all transactions
  - `GET /api/v1/admin/transactions/stuck` - Find stuck transactions

### Changed
- Removed redundant inline comments across codebase for better readability
- Improved code clarity by eliminating obvious comments that duplicate code

### Documentation
- Added comprehensive fault tolerance guide (`docs/operations/fault-tolerance.md`)
- Updated operations README with fault tolerance section
- Complete documentation restructure
- Added comprehensive guides for all operations
- Added architecture deep-dives
- Added API reference documentation
- Added concept guides (accounts, transactions, idempotency)
- Added development guides (testing, setup)
- Added `PROJECT_PHILOSOPHY.md` explaining study project nature

### Testing
- Added fault tolerance unit tests (`test/unit/fault-tolerance.spec.ts`)
- Tests for invariant validation
- Tests for reconciliation detection
- Tests for projection rebuilding

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
- Docker Compose setup (PostgreSQL, Kafka with KRaft)
- Database migrations with TypeORM
- Event versioning support
- Tenant-based schema isolation (for testing)
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

This project does not have an open-source license. All rights reserved for educational purposes.


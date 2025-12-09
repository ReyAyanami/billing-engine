# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records (ADRs) documenting significant architectural decisions made in the billing engine project.

## What is an ADR?

An Architecture Decision Record (ADR) captures an important architectural decision made along with its context and consequences. ADRs help document the "why" behind architectural choices, making it easier to understand the evolution of the system.

## ADR Format

Each ADR follows this structure:
- **Title**: Short noun phrase describing the decision
- **Date**: When the decision was made
- **Status**: Proposed, Accepted, Deprecated, Superseded
- **Context**: What is the issue we're seeing that motivates this decision?
- **Decision**: What is the change we're actually proposing or doing?
- **Consequences**: What becomes easier or more difficult because of this change?

## ADR Index

### ADR-001: [Adopt Pure Event Sourcing Architecture](./adr-001-pure-event-sourcing.md)
**Date**: December 2025  
**Status**: Accepted and Implemented

Migrated from hybrid CQRS/traditional database to pure event sourcing with Kafka as the single source of truth.

**Key Changes**:
- Removed `Account` and `Transaction` entities
- Kafka events became the authoritative source
- PostgreSQL used only for read-optimized projections

### ADR-002: [Saga Orchestration with Outbox Pattern](./adr-002-saga-orchestration.md)
**Date**: December 9, 2025  
**Status**: Accepted and Implemented

Implemented production-grade saga orchestration to eliminate race conditions and provide clear consistency guarantees.

**Key Changes**:
- Added SagaCoordinator for state tracking (immediate consistency)
- Implemented transactional outbox pattern for guaranteed delivery
- Added projection idempotency checks
- Separated saga coordination (synchronous) from projection updates (asynchronous)
- Removed ~190 lines of temporary retry logic workarounds
- Tests now query saga state instead of projections

**Impact**: 
- Zero race conditions in saga coordination
- Clear separation: write model (sagas) vs read model (projections)
- All 61 tests passing

---

## Contributing

When documenting a new architectural decision:
1. Create a new ADR file: `adr-NNN-short-title.md`
2. Follow the ADR template structure
3. Update this README with the new ADR in the index
4. Link related ADRs if applicable


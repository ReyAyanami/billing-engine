# Documentation

This directory contains technical documentation and architectural decision records for the Billing Engine.

## Structure

```
docs/
├── README.md                           # This file
├── BREAKING_CHANGES_V2.md              # Migration guide for V2
├── PIPELINE_ARCHITECTURE.md            # Pipeline pattern documentation
├── PIPELINE_MIGRATION_EXAMPLE.md       # Migration examples
├── pipeline-refactoring-proposal.md    # Original pipeline proposal
├── adr/                                # Architecture Decision Records
│   ├── README.md                       # ADR index and guidelines
│   ├── 0001-uuid-validation-debugging.md
│   ├── 0002-pipeline-pattern-adoption.md
│   ├── 0003-double-entry-bookkeeping.md
│   ├── 0004-double-entry-design.md
│   ├── 0005-foreign-key-strategy.md
│   └── 0006-double-entry-refactoring-plan.md
└── archive/                            # Historical documents
    └── pipeline-status-final.md        # Completed pipeline status
```

## Quick Navigation

### 📚 Core Documentation
- **[Main README](../README.md)** - Project overview and getting started
- **[Requirements](../REQUIREMENTS.md)** - Functional & non-functional requirements
- **[Architecture](../ARCHITECTURE.md)** - High-level system architecture
- **[Data Model](../DATA_MODEL.md)** - Database schema and entities
- **[Quick Start](../QUICK_START.md)** - Get up and running in 5 minutes

### 🏗️ Architecture & Design
- **[Pipeline Architecture](./PIPELINE_ARCHITECTURE.md)** - Transaction pipeline pattern
- **[Double-Entry Design](./adr/0004-double-entry-design.md)** - Accounting system design
- **[Foreign Keys Strategy](./adr/0005-foreign-key-strategy.md)** - Database integrity approach

### 🔄 Migration Guides
- **[Breaking Changes V2](./BREAKING_CHANGES_V2.md)** - Upgrade guide for V2
- **[Pipeline Migration Examples](./PIPELINE_MIGRATION_EXAMPLE.md)** - Code migration examples

### 📝 Decision Records (ADRs)
All architectural decisions are documented in `/docs/adr/`. See [ADR README](./adr/README.md) for index and guidelines.

**Recent Decisions**:
1. [UUID Validation Debugging](./adr/0001-uuid-validation-debugging.md)
2. [Pipeline Pattern Adoption](./adr/0002-pipeline-pattern-adoption.md)
3. [Double-Entry Bookkeeping](./adr/0003-double-entry-bookkeeping.md)
4. [Double-Entry Design](./adr/0004-double-entry-design.md)
5. [Foreign Key Strategy](./adr/0005-foreign-key-strategy.md)
6. [Refactoring Plan](./adr/0006-double-entry-refactoring-plan.md)

## For Developers

### Understanding the System
1. Start with [README](../README.md) for overview
2. Read [Requirements](../REQUIREMENTS.md) to understand goals
3. Study [Architecture](../ARCHITECTURE.md) for system design
4. Review [Data Model](../DATA_MODEL.md) for database schema

### Making Changes
1. Check [ADRs](./adr/) for previous decisions
2. Review [Pipeline Architecture](./PIPELINE_ARCHITECTURE.md) for patterns
3. Follow [Migration Examples](./PIPELINE_MIGRATION_EXAMPLE.md) for consistency
4. Document new decisions as ADRs

### Running the System
1. Follow [Quick Start](../QUICK_START.md) guide
2. Check [Breaking Changes](./BREAKING_CHANGES_V2.md) if upgrading
3. Review migrations in `/src/migrations/`

## Contributing

When adding documentation:
- **Root docs** (`/`) - Core, user-facing documentation
- **Technical docs** (`/docs/`) - Implementation guides and references
- **ADRs** (`/docs/adr/`) - Architectural decisions (use ADR template)
- **Archive** (`/docs/archive/`) - Historical/completed documents

### Creating an ADR

Follow the ADR template in [docs/adr/README.md](./adr/README.md).

ADRs should:
- ✅ Capture the context and problem
- ✅ Document the decision made
- ✅ Explain consequences (positive & negative)
- ✅ Include implementation details
- ✅ Show results/metrics

## Maintenance

### Regular Updates
- Update breaking changes doc when API changes
- Create ADR for significant architectural decisions
- Archive completed status documents
- Keep main README current

### Annual Review
- Review and update outdated docs
- Archive superseded ADRs
- Consolidate redundant documentation
- Ensure accuracy of quick start guide


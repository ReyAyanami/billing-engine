# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records (ADRs) for the Billing Engine project.

## What is an ADR?

An ADR is a document that captures an important architectural decision made along with its context and consequences.

**Purpose**: To provide historical context for decisions, making it easier for current and future team members to understand why the system is built the way it is.

## Index of ADRs

| ADR | Title | Status | Date | Tags |
|-----|-------|--------|------|------|
| [0001](./0001-uuid-validation-debugging.md) | UUID Validation and E2E Test Debugging | Accepted | 2025-12-07 | debugging, testing, validation |
| [0002](./0002-pipeline-pattern-adoption.md) | Transaction Pipeline Pattern Adoption | Accepted | 2025-12-07 | architecture, pipeline, design-pattern |
| [0003](./0003-double-entry-bookkeeping.md) | Double-Entry Bookkeeping System | Accepted | 2025-12-07 | double-entry, refactoring |
| [0004](./0004-double-entry-design.md) | Double-Entry System Design | Accepted | 2025-12-07 | design, architecture |
| [0005](./0005-foreign-key-strategy.md) | Foreign Key Constraint Strategy | Accepted | 2025-12-07 | database, integrity |
| [0006](./0006-double-entry-refactoring-plan.md) | Double-Entry Refactoring Plan | Completed | 2025-12-07 | planning, implementation |
| [0007](./0007-async-event-sourcing-kafka.md) | **Async Processing & Event Sourcing with Kafka** | **Accepted** | **2025-12-07** | **async, event-sourcing, kafka, cqrs, major-change** |

## ADR Status

- **Proposed** - Decision under discussion
- **Accepted** - Decision has been made and is active
- **Deprecated** - Decision no longer applies but kept for history
- **Superseded** - Decision replaced by another ADR (link to new ADR)
- **Completed** - One-time decision that has been implemented

## ADR Template

Use this template when creating a new ADR:

```markdown
# ADR-XXXX: [Title]

**Status**: [Proposed|Accepted|Deprecated|Superseded|Completed]  
**Date**: YYYY-MM-DD  
**Deciders**: [Names or team]  
**Tags**: #tag1 #tag2

## Context

What is the issue we're facing? What are the circumstances that require a decision?

### Background
- Current situation
- Problems to solve
- Constraints to consider

### Technical Environment
- Technologies involved
- System components affected
- Dependencies

## Decision

What is the change that we're proposing or have made?

### Approach
[Describe the solution]

### Alternatives Considered
1. **Option A**: Description (Why not chosen)
2. **Option B**: Description (Why not chosen)
3. **Option C**: Description (✅ Chosen)

## Consequences

What becomes easier or more difficult as a result of this decision?

### Positive
✅ Benefit 1
✅ Benefit 2

### Negative
⚠️ Trade-off 1
⚠️ Trade-off 2

### Risks
- Risk 1 (Mitigation: ...)
- Risk 2 (Mitigation: ...)

## Implementation

### Changes Required
- File/component changes
- Configuration updates
- Database migrations

### Timeline
- Phase 1: Description
- Phase 2: Description

### Rollback Plan
How to undo if needed

## Results

What actually happened after implementation?

### Metrics
- Performance: [data]
- Quality: [data]
- Team velocity: [data]

### Lessons Learned
1. Lesson 1
2. Lesson 2

## References

- [Related ADR](./xxxx-title.md)
- [External Resource](https://example.com)
- [RFC/Spec](https://spec-url.com)

## Notes

Additional context, future considerations, or follow-up items.
```

## Creating a New ADR

### 1. Determine the Number
Use the next sequential number (e.g., if last ADR is 0006, use 0007).

### 2. Create the File
```bash
touch docs/adr/XXXX-short-title.md
```

### 3. Fill in the Template
- Copy the template above
- Fill in all sections
- Be specific and objective
- Include data/metrics where possible

### 4. Get Review
- Share with team for feedback
- Status starts as "Proposed"
- Update to "Accepted" once decided

### 5. Update This Index
Add a row to the table above.

## Best Practices

### Writing ADRs

✅ **Do**:
- Write in the past tense once decision is made
- Be specific and provide context
- Include measurable consequences
- Link to related ADRs
- Document alternatives considered
- Include code examples if helpful

❌ **Don't**:
- Write overly long ADRs (aim for 1-3 pages)
- Include implementation details that change frequently
- Make decisions without team input
- Leave decisions undocumented

### When to Write an ADR

Write an ADR when:
- Making a significant architectural decision
- Choosing between competing approaches
- Establishing a new pattern or practice
- Deprecating an existing approach
- Learning important lessons from debugging/issues

Don't write an ADR for:
- Minor implementation details
- Obvious or trivial choices
- Decisions that affect only one component
- Routine bug fixes (unless they reveal design issues)

### Maintaining ADRs

- **Review annually**: Check if ADRs are still relevant
- **Update status**: Mark as deprecated/superseded when appropriate
- **Link related ADRs**: Create cross-references
- **Keep history**: Never delete old ADRs, mark as superseded instead

## ADR Lifecycle

```
Proposed → Discussion → Accepted → Active
                            ↓
                        Deprecated
                            ↓
                        Superseded → [Link to new ADR]
```

One-time decisions follow:
```
Proposed → Accepted → Completed
```

## Questions?

If you have questions about ADRs or this process:
- Check the [ADR GitHub org](https://adr.github.io/) for more info
- Review existing ADRs for examples
- Ask the team in your next architecture discussion

## Resources

- [ADR GitHub Organization](https://adr.github.io/)
- [Michael Nygard's ADR Article](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
- [ADR Tools](https://github.com/npryce/adr-tools)
- [When to Use ADRs](https://github.com/joelparkerhenderson/architecture-decision-record)


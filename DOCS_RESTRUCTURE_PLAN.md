# Documentation Restructure Plan

## Current State Analysis

**Total Files**: 17 markdown files (excluding node_modules)

### Issues Identified
1. ❌ **Root clutter**: 11 MD files in root (too many)
2. ❌ **No ADR structure**: Evolutionary docs mixed with main docs
3. ❌ **Redundancy**: Multiple overlapping documents
4. ❌ **Outdated status docs**: PIPELINE_STATUS.md is historical

---

## Proposed Structure

### 📁 Root Level (Essential Docs Only)
**Keep these 6 files:**
```
README.md              - Main entry point ✅
REQUIREMENTS.md        - Requirements specification ✅
ARCHITECTURE.md        - System architecture ✅
DATA_MODEL.md          - Data model & entities ✅
QUICK_START.md         - Getting started guide ✅
WARP.md                - Dev tool configuration ✅
```

### 📁 docs/ (Technical Documentation)
```
docs/
├── BREAKING_CHANGES_V2.md        - Migration guide ✅
├── PIPELINE_ARCHITECTURE.md      - Pipeline pattern docs ✅
└── PIPELINE_MIGRATION_EXAMPLE.md - Migration examples ✅
```

### 📁 docs/adr/ (Architecture Decision Records)
**NEW - Following ADR standard format:**
```
docs/adr/
├── 0001-uuid-validation-debugging.md     (was: DEBUGGING_RESOLUTION.md)
├── 0002-pipeline-pattern-adoption.md     (was: PIPELINE_REFACTORING.md)
├── 0003-double-entry-bookkeeping.md      (was: REFACTORING_SUMMARY.md)
├── 0004-double-entry-design.md           (was: docs/DOUBLE_ENTRY_DESIGN.md)
├── 0005-foreign-key-strategy.md          (was: docs/FOREIGN_KEYS.md)
└── 0006-double-entry-refactoring-plan.md (was: docs/REFACTORING_PLAN.md)
```

### 📁 docs/archive/ (Historical/Completed)
```
docs/archive/
└── pipeline-status-final.md (was: PIPELINE_STATUS.md)
```

### 🗑️ Remove (Redundant)
```
PROJECT_SUMMARY.md - Redundant with README.md ❌
```

---

## ADR Format Standard

Each ADR will follow this structure:
```markdown
# ADR-XXXX: [Title]

**Status**: [Accepted|Superseded|Deprecated]  
**Date**: YYYY-MM-DD  
**Deciders**: [Who made the decision]  

## Context
[What is the issue we're seeing that motivates this decision?]

## Decision
[What is the change that we're proposing/have made?]

## Consequences
[What becomes easier or more difficult?]

## Implementation
[Key changes made]

## Results
[What happened after implementation]
```

---

## Actions Required

### Phase 1: Create Structure
- [ ] Create `docs/adr/` directory
- [ ] Create `docs/archive/` directory

### Phase 2: Move Files
- [ ] Move 6 files to `docs/adr/` with ADR naming
- [ ] Move 1 file to `docs/archive/`
- [ ] Delete 1 redundant file

### Phase 3: Update References
- [ ] Update README.md to reference new structure
- [ ] Update internal doc links
- [ ] Add docs/README.md explaining structure

### Phase 4: Validate
- [ ] Check all links work
- [ ] Ensure no broken references
- [ ] Test documentation navigation

---

## Benefits

✅ **Clear organization**: Docs by purpose (main/technical/decisions/archive)
✅ **ADR best practice**: Standard format for architectural decisions
✅ **Reduced clutter**: Root has only 6 essential files
✅ **Better discovery**: Easy to find relevant documentation
✅ **Historical context**: ADRs preserve decision-making history
✅ **Maintainability**: Clear what to update vs what's historical

---

## Implementation Timeline

- **Phase 1**: 5 minutes (create directories)
- **Phase 2**: 10 minutes (move/rename files)
- **Phase 3**: 15 minutes (update references)
- **Phase 4**: 5 minutes (validation)

**Total**: ~35 minutes


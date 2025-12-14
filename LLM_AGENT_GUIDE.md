# LLM Agent Collaboration Guide

> A guide for AI assistants working on this project. Read this first to understand how to collaborate effectively.

---

## 🎯 Project Context

**What This Is**: A study project demonstrating CQRS, Event Sourcing, and Double-Entry Bookkeeping in a billing system.

**What This Is NOT**: A production-ready system. Clarity and learning value trump performance and production-readiness.

**Key Philosophy**: 
- Educational value > Production hardening
- Maintainability > Clever optimizations
- Explicit > Implicit
- WHY > WHAT (in comments and documentation)

See [README.md](./README.md) and [PROJECT_PHILOSOPHY.md](./PROJECT_PHILOSOPHY.md) for full context.

---

## 🤝 How to Work With Me

### Communication Style

**DO**:
- ✅ Explain the reasoning behind your suggestions
- ✅ Present tradeoffs when multiple approaches exist
- ✅ Ask clarifying questions when requirements are ambiguous
- ✅ Point out potential issues or edge cases
- ✅ Reference existing patterns in the codebase
- ✅ Suggest improvements with context

**DON'T**:
- ❌ Assume I want production-grade features (auth, rate limiting, etc.)
- ❌ Over-engineer solutions
- ❌ Make changes without explaining the reasoning
- ❌ Ignore existing architectural patterns
- ❌ Add features "for completeness" without being asked

### Decision Making

**Autonomous Decisions** (Go ahead without asking):
- Bug fixes that maintain existing behavior
- Code formatting and style improvements
- Adding missing type annotations
- Refactoring for clarity (without changing behavior)
- Writing or updating tests
- Documentation improvements
- Following existing patterns in the codebase

**Ask First**:
- Architectural changes (new patterns, abstractions)
- Breaking changes to existing APIs
- Adding new dependencies
- Changing database schema
- Adding new features beyond the request
- Deviating from established patterns

---

## 🏗️ Architecture Principles

This project follows strict architectural patterns. **Always** adhere to these:

### 1. Event Sourcing

**ALL state changes MUST go through events**:

```typescript
// ✓ CORRECT: State changes via events
aggregate.debit({ amount, transactionId });
// Internally emits AccountDebitedEvent

// ✗ WRONG: Direct state mutation
aggregate.balance -= amount;
```

**Events are immutable**:
- Never modify an existing event
- Events represent past facts
- Event schemas should be versioned

### 2. CQRS Pattern

**Separate commands from queries**:

```typescript
// ✓ CORRECT: Command for writes
await this.commandBus.execute(new CreateAccountCommand(params));

// ✓ CORRECT: Query for reads  
const account = await this.queryBus.execute(new GetAccountQuery(id));

// ✗ WRONG: Mixed responsibility
const account = await service.createAndReturn(params);
```

**Key rules**:
- Commands: Change state, return void or minimal ack
- Queries: Read state, never modify
- Projections: Built from events for query optimization

### 3. Domain-Driven Design

**Business logic lives in aggregates**:

```typescript
// ✓ CORRECT: Aggregate enforces rules
aggregate.changeBalance({ amount, reason });
// Aggregate internally validates minimum balance, etc.

// ✗ WRONG: Service enforces domain rules
if (account.balance + amount < 0) {
  throw new Error('Insufficient balance');
}
account.balance += amount;
```

### 4. Double-Entry Bookkeeping

**Every transaction affects exactly two accounts**:
- USER accounts: End-user balances
- EXTERNAL accounts: External entities (banks, payment processors)
- SYSTEM accounts: Revenue, fees, reserves

**Examples**:
- Top-up: EXTERNAL (debit) → USER (credit)
- Withdrawal: USER (debit) → EXTERNAL (credit)
- Payment: USER (debit) → MERCHANT/USER (credit)
- Transfer: USER (debit) → USER (credit)

### 5. Saga Orchestration

**Multi-step transactions use sagas**:
- Saga coordinators manage state and compensation
- Outbox pattern ensures reliable event delivery
- Idempotency keys prevent duplicates

**Don't modify saga patterns without discussion**.

---

## 💻 Code Style & Conventions

### TypeScript Guidelines

**Strict typing** (no `any`, explicit returns):

```typescript
// ✓ CORRECT
async function createAccount({
  ownerId,
  currency,
  type,
}: CreateAccountParams): Promise<Account> {
  // Implementation
}

// ✗ WRONG
async function createAccount(ownerId, currency, type) {
  // Implementation
}
```

**Use undefined over null**:
```typescript
// ✓ CORRECT
type Account = {
  description?: string; // undefined when not present
};

// ✗ WRONG
type Account = {
  description: string | null;
};
```

### Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Classes | PascalCase | `AccountAggregate`, `TransferCommand` |
| Functions | camelCase | `createAccount`, `updateBalance` |
| Constants | UPPER_SNAKE_CASE | `MAX_BALANCE`, `DEFAULT_CURRENCY` |
| Files | kebab-case | `account.service.ts`, `transfer.handler.ts` |
| Interfaces | PascalCase, no "I" prefix | `Account`, not `IAccount` |
| Types | PascalCase | `CreateAccountParams` |

### File Organization

```
src/
├── modules/
│   ├── account/
│   │   ├── commands/           # Command handlers
│   │   ├── queries/            # Query handlers  
│   │   ├── events/             # Event handlers
│   │   ├── domain/             # Aggregates, entities
│   │   ├── entities/           # TypeORM entities (projections)
│   │   └── account.module.ts
│   └── transaction/
│       └── ...
├── shared/                     # Shared utilities
└── config/                     # Configuration
```

**Don't create new top-level directories without discussion**.

### Comments & Documentation

**Focus on WHY, not WHAT**:

```typescript
// ✓ CORRECT: Explains reasoning
// Use pessimistic locking to prevent race conditions when 
// multiple transfers affect the same account simultaneously.
// This ensures consistent balance calculations under high concurrency.
await this.repo.findOne({ 
  where: { id }, 
  lock: { mode: 'pessimistic_write' } 
});

// ✗ WRONG: States the obvious
// Find account by ID with lock
await this.repo.findOne({ 
  where: { id }, 
  lock: { mode: 'pessimistic_write' } 
});
```

**Add JSDoc for public APIs**:
```typescript
/**
 * Creates a new account with the specified parameters.
 * 
 * @param params - Account creation parameters
 * @returns The created account's ID
 * @throws {AccountAlreadyExistsError} If an account already exists
 */
async createAccount(params: CreateAccountParams): Promise<string> {
  // Implementation
}
```

---

## 🧪 Testing Expectations

### Test Coverage Requirements

**ALWAYS write tests** for:
- ✅ New features (unit + E2E)
- ✅ Bug fixes (regression tests)
- ✅ Domain logic in aggregates (comprehensive unit tests)
- ✅ Command/query handlers (unit tests)
- ✅ Complete transaction flows (E2E tests)

**Test organization**:
```
test/
├── unit/                       # Unit tests
│   ├── account-aggregate.spec.ts
│   └── ...
└── e2e/                        # End-to-end tests
    └── features/
        └── transactions/
            ├── payment.e2e.spec.ts
            └── ...
```

### Testing Style

**Descriptive test names**:

```typescript
// ✓ CORRECT: Clear, specific
it('should prevent withdrawal when balance is insufficient', async () => {
  // Test implementation
});

it('should emit AccountDebitedEvent when debiting account', async () => {
  // Test implementation
});

// ✗ WRONG: Vague
it('should work', async () => {
  // Test implementation
});
```

**Arrange-Act-Assert pattern**:

```typescript
it('should create account with initial balance of zero', async () => {
  // Arrange
  const params = {
    ownerId: 'user_123',
    currency: 'USD',
    type: 'USER',
  };

  // Act
  const accountId = await createAccount(params);
  const account = await getAccount(accountId);

  // Assert
  expect(account.balance).toBe('0.00');
  expect(account.currency).toBe('USD');
});
```

### Running Tests

Before considering work complete:

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- account-aggregate.spec.ts

# Run E2E tests
npm run test:e2e

# Watch mode for TDD
npm run test:watch
```

**Tests must pass before submitting changes**.

---

## 📚 Documentation Expectations

### When to Update Documentation

Update docs when:
- ✅ Adding new features or operations
- ✅ Changing existing behavior or APIs
- ✅ Adding new architectural patterns
- ✅ Fixing bugs that affect documented behavior

**Don't** create unnecessary documentation:
- ❌ Don't add generic README files without value
- ❌ Don't document internal implementation details
- ❌ Don't create docs that duplicate code comments

### Documentation Structure

```
docs/
├── architecture/               # System design, patterns, ADRs
├── api/                        # REST API reference
├── guides/                     # How-to guides
├── operations/                 # Transaction operations
├── modules/                    # Code module documentation
├── development/                # Development guides
└── concepts/                   # Core concepts
```

### Writing Style

**Educational and clear**:
- Explain WHY decisions were made
- Include code examples
- Use simple, direct language
- Add diagrams for complex flows
- Link to related docs

**Example**:
```markdown
## Why Saga Orchestration?

We use saga orchestration instead of saga choreography because:

1. **Explicit flow**: The saga coordinator provides a single place 
   to see the entire transaction flow
2. **Compensation logic**: Centralized rollback logic is easier 
   to reason about
3. **Observability**: State tracking makes debugging easier

See [ADR-002](./architecture/decisions/adr-002-saga-orchestration.md) 
for the full decision context.
```

---

## 🔧 Common Tasks & Workflows

### Adding a New Transaction Type

If I ask you to add a new transaction type:

1. **Create command** in `src/modules/transaction/commands/`
2. **Create command handler** following CQRS pattern
3. **Create saga** in `src/modules/transaction/sagas/` for orchestration
4. **Add events** for each step
5. **Update projections** to handle new events
6. **Add REST endpoint** in controller
7. **Write E2E test** in `test/e2e/features/transactions/`
8. **Update documentation** in `docs/operations/`

**Follow existing transaction patterns** (look at transfer, payment, etc.).

### Modifying an Aggregate

When changing aggregates:

1. **Never** modify events directly (they're immutable history)
2. Add new event types if behavior changes
3. Update aggregate to handle both old and new events (event versioning)
4. Update tests comprehensively
5. Consider event migration strategy if needed

### Database Changes

When schema changes are needed:

1. **Generate migration**: `npm run migration:generate`
2. Review migration SQL carefully
3. Test migration: `npm run migration:run`
4. Update entity definitions
5. Update projections if needed
6. Test rollback: `npm run migration:revert`

**Never modify existing migrations** - create new ones.

---

## ⚠️ What NOT to Do

### Don't Add These Without Asking

This is a **study project** prioritizing clarity. Don't add:

- ❌ Authentication/authorization
- ❌ Rate limiting
- ❌ API versioning (beyond current v1)
- ❌ Caching layers
- ❌ Performance optimizations (unless they improve clarity)
- ❌ Production deployment configs
- ❌ Monitoring/observability (beyond basic logging)
- ❌ Multi-tenancy
- ❌ Webhook notifications
- ❌ Currency conversion
- ❌ Transaction fees (unless explicitly requested)

### Don't Break These Patterns

- ❌ Don't bypass CQRS (no mixed command/query operations)
- ❌ Don't skip event sourcing (no direct DB mutations)
- ❌ Don't put business logic in services (belongs in aggregates)
- ❌ Don't create active record patterns (use repository pattern)
- ❌ Don't add ORMs other than TypeORM
- ❌ Don't use database transactions for event-sourced aggregates
- ❌ Don't modify event schemas without versioning strategy

### Don't Use These Practices

- ❌ `any` types
- ❌ `null` (use `undefined`)
- ❌ Mutable event objects
- ❌ Direct aggregate state access from outside
- ❌ Synchronous event handlers with side effects
- ❌ Global state
- ❌ Circular dependencies

---

## 🚀 Workflow Preferences

### Making Changes

**Incremental approach**:
1. Understand existing patterns first (read similar code)
2. Make minimal changes to achieve the goal
3. Write tests alongside implementation
4. Run tests frequently (`npm run test:watch`)
5. Update documentation last

### Code Review Mindset

When presenting changes:
- Explain the reasoning
- Highlight any tradeoffs made
- Point out areas where you're uncertain
- Suggest alternative approaches if relevant
- Note any deviations from patterns (with justification)

### Handling Uncertainty

When you're not sure:
1. **Search the codebase** for similar patterns
2. **Check documentation** in `/docs`
3. **Look at tests** for usage examples
4. **Ask** rather than guessing

**It's better to ask than to implement the wrong pattern**.

---

## 🛠️ Development Commands

Common commands you might need:

```bash
# Development
npm start              # Start infrastructure + dev server
npm run dev            # Dev server only
npm run dev:debug      # With debugger

# Infrastructure  
npm run env:start      # Start PostgreSQL + Kafka
npm run env:stop       # Stop services
npm run env:clean      # Stop + remove volumes
npm run env:status     # Check status

# Database
npm run migration:run       # Run migrations
npm run migration:revert    # Rollback last migration
npm run migration:generate  # Generate from entity changes

# Testing
npm test                    # All tests (sequential)
npm run test:parallel       # Parallel execution
npm run test:e2e            # E2E tests only
npm run test:watch          # Watch mode
npm run test:cov            # With coverage

# Code Quality
npm run lint                # ESLint with auto-fix
npm run lint:check          # Check without fixing
npm run format              # Prettier
npm run type-check          # TypeScript validation
```

---

## 📋 Checklist Before Completion

Before saying "I'm done", verify:

- [ ] Code follows established patterns
- [ ] Tests are written and passing
- [ ] TypeScript compiles without errors (`npm run type-check`)
- [ ] Linter is happy (`npm run lint:check`)
- [ ] Documentation is updated (if needed)
- [ ] No new dependencies added (or justified if added)
- [ ] Event sourcing principles maintained
- [ ] CQRS separation maintained
- [ ] Double-entry accounting rules followed (for transactions)
- [ ] Idempotency considered (for commands)

---

## 📖 Key Reference Documents

Must-read documents:

1. **[README.md](./README.md)** - Project overview and quick start
2. **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Code style and contribution guidelines  
3. **[PROJECT_PHILOSOPHY.md](./PROJECT_PHILOSOPHY.md)** - Why this project exists
4. **[docs/architecture/system-design.md](./docs/architecture/system-design.md)** - Architecture overview
5. **[docs/architecture/event-sourcing.md](./docs/architecture/event-sourcing.md)** - Event sourcing implementation
6. **[docs/architecture/cqrs-pattern.md](./docs/architecture/cqrs-pattern.md)** - CQRS implementation
7. **[docs/architecture/decisions/](./docs/architecture/decisions/)** - Architectural Decision Records

---

## 🤔 Examples of Good Collaboration

### Example 1: Adding a Feature

**Good**:
> "I'll add the refund operation following the existing payment pattern. 
> This will involve:
> 1. Creating a RefundCommand and RefundSaga
> 2. Reversing the double-entry (debit merchant, credit customer)
> 3. Adding compensation logic for failed refunds
> 4. Writing E2E tests similar to payment.e2e.spec.ts
>
> I'll use the same saga orchestration pattern and outbox approach. 
> Should I proceed?"

**Bad**:
> "I'll add refunds with a new event choreography pattern for better 
> performance."

### Example 2: Bug Fix

**Good**:
> "Found the issue - the aggregate is not validating minimum balance 
> before debits. I'll add the validation in AccountAggregate.debit() 
> and add a regression test."

**Bad**:
> "Fixed it by adding a check in the controller."

### Example 3: Suggesting Improvements

**Good**:
> "I notice the balance calculation could be extracted into a value 
> object for clarity. This would make the arithmetic logic more 
> explicit and testable. Would you like me to refactor it?"

**Bad**:
> "This code is messy, let me rewrite it with a better pattern."

---

## 💬 Communication Templates

### When Proposing Changes

```
I suggest [CHANGE] because [REASONING].

Current approach: [CURRENT]
Proposed approach: [PROPOSED]

Tradeoffs:
- Pro: [BENEFIT]
- Con: [DRAWBACK]

Alternative: [ALTERNATIVE if applicable]

Should I proceed?
```

### When Uncertain

```
I'm not sure about [SPECIFIC CONCERN].

I see two approaches:
1. [OPTION A]: [Explanation and tradeoffs]
2. [OPTION B]: [Explanation and tradeoffs]

Based on [EXISTING PATTERN or PRINCIPLE], I'm leaning toward [CHOICE].

What do you think?
```

### When Complete

```
Changes complete:

What changed:
- [CHANGE 1]
- [CHANGE 2]

Testing:
- [TEST 1] ✓
- [TEST 2] ✓

Documentation:
- Updated [DOC] with [INFO]

All tests pass: ✓
Linter clean: ✓
Type check: ✓
```

---

## 🎓 Learning Resources

To understand this codebase better:

**Core Concepts**:
- [Event Sourcing](https://www.eventstore.com/blog/what-is-event-sourcing) by Greg Young
- [CQRS](https://martinfowler.com/bliki/CQRS.html) by Martin Fowler
- [Domain-Driven Design](https://www.domainlanguage.com/ddd/) by Eric Evans
- [Double-Entry Bookkeeping](https://en.wikipedia.org/wiki/Double-entry_bookkeeping)

**Patterns Used**:
- Saga Pattern (orchestration variant)
- Outbox Pattern
- Repository Pattern
- Aggregate Pattern
- Event Sourcing
- CQRS

---

## ✨ Final Notes

**Remember**:
- This is a **learning project** - clarity matters most
- When in doubt, **follow existing patterns**
- **Tests** are your safety net - use them
- **Ask** when uncertain - it's faster than guessing wrong
- **Explain your reasoning** - I want to learn too

**Goal**: Collaborate effectively to maintain a clean, educational codebase that demonstrates architectural patterns clearly.

---

Thank you for reading this guide! It helps us work together more effectively. 🚀

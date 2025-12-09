# Contributing to Billing Engine

## ⚠️ Important Note

This is a **study project** for personal exploration and learning. It is NOT production-ready and is not actively maintained as an open-source project.

See [PROJECT_PHILOSOPHY.md](./PROJECT_PHILOSOPHY.md) for context.

---

## Contribution Guidelines

While this is primarily a personal learning project, contributions are welcome if they:

1. **Improve educational value**
   - Add explanatory comments
   - Improve documentation
   - Add examples demonstrating concepts

2. **Fix bugs**
   - Correct logical errors
   - Fix broken functionality
   - Address security issues

3. **Enhance learning features**
   - Add new patterns to demonstrate
   - Improve test coverage
   - Add instrumentation/observability

---

## What NOT to Contribute

Please avoid:
- Production-hardening (this is intentionally simplified)
- Performance optimizations (clarity > performance)
- Enterprise features (authentication, authorization, multi-tenancy)
- Deployment infrastructure (Docker Compose is sufficient)

**Why?** This project prioritizes learning and clarity over production readiness.

---

## Development Setup

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- Git

### Setup

```bash
# Clone repository
git clone https://github.com/yourusername/billing-engine.git
cd billing-engine

# Install dependencies
npm install

# Start infrastructure
npm run env:start

# Run migrations
npm run migration:run

# Start application
npm run dev
```

See [Installation Guide](./docs/guides/installation.md) for details.

---

## Code Style

### TypeScript

- **Strict typing**: Use TypeScript types, avoid `any`
- **Named parameters**: Use object destructuring for function parameters
- **Explicit returns**: Declare return types
- **No null**: Use `undefined` for optional values

**Good**:
```typescript
async function createAccount({
  ownerId,
  currency,
  type
}: CreateAccountParams): Promise<Account> {
  // Implementation
}
```

**Bad**:
```typescript
async function createAccount(ownerId, currency, type) {
  // Implementation
}
```

### Naming Conventions

- **Classes**: PascalCase (`AccountAggregate`, `TransferCommand`)
- **Functions**: camelCase (`createAccount`, `updateBalance`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_BALANCE`, `DEFAULT_CURRENCY`)
- **Files**: kebab-case (`account.service.ts`, `transfer.handler.ts`)

### Comments

**WHY over WHAT**:

```typescript
// ✓ GOOD: Explains why
// Use pessimistic locking to prevent race conditions when 
// multiple transfers affect the same account simultaneously
await this.accountRepo.findOne({ id, lock: { mode: 'pessimistic_write' } });

// ✗ BAD: States the obvious
// Find account by ID
await this.accountRepo.findOne({ id });
```

---

## Testing

### Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# E2E tests only
npm run test:e2e

# With coverage
npm run test:cov
```

### Writing Tests

1. **Unit tests** for business logic (aggregates, services)
2. **E2E tests** for complete flows (account creation, transactions)
3. **Descriptive names**: `it('should prevent withdrawal when balance is insufficient')`

See [Testing Guide](./docs/development/testing.md) for details.

---

## Making Changes

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
```

### 2. Make Changes

- Follow code style guidelines
- Add/update tests
- Update documentation if needed

### 3. Run Tests

```bash
npm test
```

### 4. Commit

Use conventional commits:

```bash
git commit -m "feat: add currency validation"
git commit -m "fix: prevent negative balance in edge case"
git commit -m "docs: improve transfer operation guide"
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `test`: Test additions/changes
- `refactor`: Code restructuring (no behavior change)
- `chore`: Maintenance tasks

### 5. Push and Create PR

```bash
git push origin feature/your-feature-name
```

Create a pull request with:
- Clear description of changes
- Why the change is needed
- Testing performed
- Any breaking changes

---

## Architecture Principles

Follow these principles when contributing:

### 1. Event Sourcing

All state changes go through events:

```typescript
// ✓ GOOD: Emit event
aggregate.changeBalance({ amount, reason });
// Internally emits BalanceChangedEvent

// ✗ BAD: Direct state mutation
aggregate.balance += amount;
```

### 2. CQRS

Separate commands from queries:

```typescript
// ✓ GOOD: Command for writes
await commandBus.execute(new CreateAccountCommand(params));

// ✓ GOOD: Query for reads
const account = await queryBus.execute(new GetAccountQuery(id));

// ✗ BAD: Mixed responsibility
const account = service.createAndReturn(params);
```

### 3. Immutability

Events are immutable:

```typescript
// ✓ GOOD: Create new event
const event = new BalanceChangedEvent(data);

// ✗ BAD: Modify existing event
event.amount = newAmount;
```

### 4. Domain Logic in Aggregates

Business rules belong in aggregates:

```typescript
// ✓ GOOD: Aggregate enforces rule
aggregate.changeBalance({ amount });
// Aggregate checks minimum balance internally

// ✗ BAD: Service enforces rule
if (account.balance + amount < account.minBalance) {
  throw new Error('Insufficient balance');
}
account.balance += amount;
```

---

## Documentation

### When to Update

Update documentation when:
- Adding new features
- Changing existing behavior
- Fixing bugs that affect usage
- Adding new concepts or patterns

### Documentation Structure

```
docs/
├── architecture/   # System design, patterns
├── api/            # REST API reference
├── guides/         # How-to guides
├── operations/     # Transaction operations
├── modules/        # Code modules
├── development/    # Development guides
└── concepts/       # Core concepts
```

### Writing Style

- **Educational**: Explain WHY, not just WHAT
- **Examples**: Include code examples
- **Clear**: Use simple language
- **Structured**: Use headings and lists

---

## Questions?

- **Issues**: Create an issue for bugs or questions
- **Discussions**: Use GitHub discussions for general questions
- **Documentation**: Check [docs/](./docs/) first

---

## License

MIT License - See [LICENSE](./LICENSE) for details.

This project is provided as-is for educational purposes. Use at your own risk.


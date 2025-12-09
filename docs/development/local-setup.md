# Local Development Setup

## Overview

Complete guide for setting up a local development environment for the billing engine. Covers tooling, configuration, common workflows, and troubleshooting.

---

## Prerequisites

### Required Tools

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | 18+ | Runtime |
| **npm** | 9+ | Package manager |
| **Docker** | 20+ | Containers |
| **Docker Compose** | 2.0+ | Multi-container orchestration |
| **Git** | 2.0+ | Version control |

### Optional Tools

| Tool | Purpose |
|------|---------|
| **Postman** or **Insomnia** | API testing |
| **DBeaver** or **pgAdmin** | Database GUI |
| **Kafka Tool** | Kafka topic inspection |
| **VS Code** | IDE (recommended) |

---

## Quick Start

```bash
# 1. Clone repository
git clone https://github.com/yourusername/billing-engine.git
cd billing-engine

# 2. Install dependencies
npm install

# 3. Start infrastructure (PostgreSQL, Kafka)
npm run env:start

# 4. Run database migrations
npm run migration:run

# 5. Start application in dev mode
npm run dev

# Application available at http://localhost:3000
# Swagger docs at http://localhost:3000/api/docs
```

See [Installation Guide](../guides/installation.md) for detailed steps.

---

## Development Scripts

### Application Scripts

```bash
# Development (watch mode)
npm run dev

# Production build
npm run build

# Start production build
npm start

# Lint code
npm run lint

# Format code
npm run format

# Type check
npm run type-check
```

### Database Scripts

```bash
# Run migrations
npm run migration:run

# Revert last migration
npm run migration:revert

# Generate new migration
npm run migration:generate -- -n MigrationName

# Create empty migration
npm run migration:create -- -n MigrationName
```

### Testing Scripts

```bash
# Run all tests
npm test

# Run in parallel (faster)
npm run test:parallel

# Watch mode
npm run test:watch

# E2E tests
npm run test:e2e

# Coverage report
npm run test:cov
```

### Infrastructure Scripts

```bash
# Start all services
npm run env:start

# Stop all services
npm run env:stop

# Restart services
npm run env:restart

# View logs
npm run env:logs

# Clean volumes (⚠️ deletes data)
npm run env:clean
```

---

## IDE Setup

### VS Code (Recommended)

**Recommended Extensions**:

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "firsttris.vscode-jest-runner",
    "ms-azuretools.vscode-docker",
    "orta.vscode-jest"
  ]
}
```

**Settings** (`.vscode/settings.json`):

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "jest.autoRun": "off"
}
```

**Debug Configuration** (`.vscode/launch.json`):

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug NestJS",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "start:dev", "--", "--debug"],
      "console": "integratedTerminal",
      "restart": true,
      "protocol": "inspector"
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Jest Current File",
      "program": "${workspaceFolder}/node_modules/.bin/jest",
      "args": ["${relativeFile}"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

---

## Environment Configuration

### .env File

Create `.env` in project root:

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=billing_engine

# Kafka
KAFKA_BROKERS=localhost:29092
KAFKA_CLIENT_ID=billing-engine

# Application
PORT=3000
NODE_ENV=development

# Logging
LOG_LEVEL=debug
```

### Environment-Specific Configs

```
.env              # Local development
.env.test         # Testing
.env.staging      # Staging (optional)
.env.production   # Production (optional)
```

**Load with**:

```bash
# Development (default)
npm run dev

# Test
NODE_ENV=test npm test

# Production
NODE_ENV=production npm start
```

---

## Development Workflow

### 1. Start Development

```bash
# Terminal 1: Infrastructure
npm run env:start

# Terminal 2: Application
npm run dev

# Terminal 3: Tests (watch mode)
npm run test:watch
```

### 2. Make Changes

```bash
# Create feature branch
git checkout -b feature/your-feature

# Make changes to src/
# Tests run automatically (watch mode)

# Lint and format
npm run lint
npm run format
```

### 3. Test Changes

```bash
# Run all tests
npm test

# Test specific file
npm test -- src/modules/account/account.service.spec.ts

# E2E tests
npm run test:e2e
```

### 4. Commit Changes

```bash
# Stage changes
git add .

# Commit (pre-commit hook runs automatically)
git commit -m "feat: add new feature"

# Push
git push origin feature/your-feature
```

---

## Database Management

### Connect to PostgreSQL

```bash
# Using psql
docker exec -it billing-engine-postgres psql -U postgres -d billing_engine

# Or with Docker Compose
npm run env:psql
```

### Useful SQL Queries

```sql
-- List all tables
\dt

-- Describe table
\d accounts

-- Query accounts
SELECT * FROM accounts LIMIT 10;

-- Check recent transactions
SELECT * FROM transactions 
ORDER BY created_at DESC 
LIMIT 10;

-- Account balance summary
SELECT 
  currency,
  SUM(balance) as total_balance,
  COUNT(*) as account_count
FROM accounts
WHERE status = 'active'
GROUP BY currency;
```

### Reset Database

```bash
# Stop application
# (Ctrl+C in dev terminal)

# Revert all migrations
npm run migration:revert

# Or clean Docker volume
npm run env:clean
npm run env:start

# Re-run migrations
npm run migration:run
```

---

## Kafka Management

### Connect to Kafka

```bash
# List topics
docker exec -it billing-engine-kafka kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --list

# Describe topic
docker exec -it billing-engine-kafka kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --describe \
  --topic billing-engine.account.events

# Consume events
docker exec -it billing-engine-kafka kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic billing-engine.account.events \
  --from-beginning
```

### View Events

```bash
# Tail account events
docker exec -it billing-engine-kafka kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic billing-engine.account.events \
  --property print.key=true \
  --property key.separator=": "

# Tail transaction events
docker exec -it billing-engine-kafka kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic billing-engine.transaction.events \
  --property print.timestamp=true
```

---

## API Testing

### Using cURL

```bash
# Create account
curl -X POST http://localhost:3000/api/v1/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "ownerId": "user_123",
    "ownerType": "user",
    "currency": "USD",
    "type": "USER"
  }'

# Get account
curl http://localhost:3000/api/v1/accounts/{accountId}

# Top-up
curl -X POST http://localhost:3000/api/v1/transactions/topup \
  -H "Content-Type: application/json" \
  -d '{
    "idempotencyKey": "550e8400-e29b-41d4-a716-446655440000",
    "destinationAccountId": "{accountId}",
    "sourceAccountId": "external-001",
    "amount": "100.00",
    "currency": "USD"
  }'
```

### Using Postman

1. Import Swagger JSON:
   ```
   http://localhost:3000/api/docs-json
   ```

2. Or manually create collection with:
   - Base URL: `http://localhost:3000/api/v1`
   - Headers: `Content-Type: application/json`

### Using Swagger UI

Open browser:
```
http://localhost:3000/api/docs
```

- Interactive API documentation
- Try endpoints directly
- View request/response schemas

---

## Debugging

### Debug with VS Code

1. Set breakpoint in code
2. Press F5 or select "Debug NestJS"
3. Application starts in debug mode
4. Breakpoint hits when code executes

### Debug Tests

1. Open test file
2. Set breakpoint
3. Run "Jest Current File" debug config
4. Or use Jest Runner extension

### Debug Logs

```typescript
// Add debug logging
console.log('Debug:', { variable });

// Or use Logger
import { Logger } from '@nestjs/common';

const logger = new Logger('ClassName');
logger.debug('Debug message', { data });
logger.error('Error message', error.stack);
```

### View Application Logs

```bash
# View Docker logs
docker logs -f billing-engine-app

# Or if running locally
# Logs appear in terminal
```

---

## Hot Reload

Application automatically reloads on file changes:

```bash
# Start dev mode
npm run dev

# Make changes to src/modules/account/account.service.ts
# Application automatically rebuilds and restarts
# Output: "Application restarted successfully"
```

**What triggers reload**:
- TypeScript files (`.ts`)
- Configuration changes

**What doesn't**:
- `.env` changes (requires manual restart)
- `package.json` changes (run `npm install` then restart)

---

## Troubleshooting

### Port Already in Use

```bash
# Error: Port 3000 already in use

# Find process
lsof -ti:3000

# Kill process
kill -9 $(lsof -ti:3000)

# Or change port in .env
PORT=3001
```

### Docker Services Not Starting

```bash
# Check Docker status
docker ps

# Restart Docker daemon
# (macOS: Docker Desktop → Restart)

# Check logs
docker logs billing-engine-postgres
docker logs billing-engine-kafka

# Clean and restart
npm run env:clean
npm run env:start
```

### Migration Errors

```bash
# Error: Migration already exists

# Revert last migration
npm run migration:revert

# Or reset database
npm run env:clean
npm run env:start
npm run migration:run
```

### Kafka Connection Issues

```bash
# Check Kafka status
docker exec -it billing-engine-kafka kafka-broker-api-versions.sh \
  --bootstrap-server localhost:9092

# Restart Kafka
docker restart billing-engine-kafka

# Check logs
docker logs billing-engine-kafka
```

### Test Failures

```bash
# Clean test database
npm run test:e2e -- --clearCache

# Run tests in sequence (not parallel)
npm test -- --runInBand

# View detailed output
npm test -- --verbose
```

---

## Performance Tips

### Speed Up Tests

```bash
# Parallel execution
npm run test:parallel

# Only changed files
npm test -- --onlyChanged

# Watch mode (fastest for active development)
npm run test:watch
```

### Reduce Docker Resource Usage

Edit `docker-compose.yml`:

```yaml
services:
  postgres:
    mem_limit: 512m  # Limit memory
  kafka:
    mem_limit: 1g
```

### Faster npm install

```bash
# Use npm ci (clean install)
npm ci

# Or use pnpm (faster alternative)
npm install -g pnpm
pnpm install
```

---

## Best Practices

### 1. Keep Dependencies Updated

```bash
# Check outdated packages
npm outdated

# Update
npm update

# Or use interactive tool
npx npm-check-updates -u
```

### 2. Use Pre-commit Hooks

Automatically configured via `husky`:
- Linting
- Formatting
- Type checking
- Tests (optional)

### 3. Clean Up Regularly

```bash
# Remove node_modules
rm -rf node_modules
npm install

# Clean Docker volumes (⚠️ deletes data)
npm run env:clean

# Clear test cache
npm test -- --clearCache
```

---

## Related Documentation

- [Installation Guide](../guides/installation.md) - Initial setup
- [Testing Guide](./testing.md) - Testing patterns
- [Docker Setup](../infrastructure/docker.md) - Docker details
- [Kafka Setup](../infrastructure/kafka.md) - Kafka configuration


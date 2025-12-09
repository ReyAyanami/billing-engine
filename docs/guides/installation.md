# Installation Guide

## Overview

This guide covers detailed installation instructions, configuration options, and troubleshooting for the Billing Engine.

> 🚀 **Quick Start**: If you just want to get running quickly, see the [Getting Started Guide](../../GETTING_STARTED.md).

---

## Prerequisites

### Required Software

| Software | Minimum Version | Purpose |
|----------|----------------|---------|
| **Node.js** | 18.0.0+ | Runtime environment |
| **npm** | 9.0.0+ | Package management |
| **Docker Desktop** | 4.0.0+ | Infrastructure (PostgreSQL, Kafka) |
| **Git** | 2.0.0+ | Source control |

### System Requirements

- **OS**: macOS 10.15+, Ubuntu 20.04+, Windows 10+ (with WSL2)
- **RAM**: 2GB minimum, 4GB recommended
- **Disk**: 5GB free space
- **Ports**: 3000 (API), 5432 (PostgreSQL), 9092 (Kafka)

### Verify Prerequisites

```bash
# Check Node.js version
node --version
# Expected: v18.0.0 or higher

# Check npm version
npm --version
# Expected: 9.0.0 or higher

# Check Docker is running
docker --version
docker ps
# Expected: Docker version info and running containers list

# Check Git
git --version
# Expected: git version 2.x.x
```

---

## Installation Methods

### Method 1: One-Command Setup (Recommended)

Fastest way to get started:

```bash
# Clone repository
git clone <your-repo-url>
cd billing-engine

# Install dependencies
npm install

# Start everything (PostgreSQL + Kafka + API)
npm start
```

**What this does**:
1. Installs all npm dependencies
2. Starts PostgreSQL via Docker Compose
3. Starts Kafka via Docker Compose
4. Waits for services to be ready (~30 seconds)
5. Runs database migrations
6. Starts the NestJS application in development mode

**Expected Output**:
```
✓ PostgreSQL is ready
✓ Kafka is ready
✓ Database migrations completed
✓ Billing Engine API running on port 3000
✓ Swagger documentation available at http://localhost:3000/api/docs
```

---

### Method 2: Step-by-Step Installation

For more control over the installation process:

#### Step 1: Clone Repository

```bash
git clone <your-repo-url>
cd billing-engine
```

#### Step 2: Install Dependencies

```bash
npm install
```

This installs:
- NestJS framework and dependencies
- TypeORM for database access
- KafkaJS for event sourcing
- Testing utilities (Jest, Supertest)
- Development tools (ESLint, Prettier, TypeScript)

**Installation Time**: 1-2 minutes (depending on network speed)

#### Step 3: Start Infrastructure Services

```bash
npm run env:start
```

This starts:
- **PostgreSQL** on port 5432
- **Kafka** on port 9092

**Wait Time**: 20-30 seconds for Kafka to fully initialize

**Verify Services**:
```bash
npm run env:status

# Expected output:
# billing-engine-postgres-1    Up    5432/tcp
# billing-engine-kafka-1       Up    9092/tcp
```

#### Step 4: Run Database Migrations

```bash
npm run migration:run
```

This creates:
- `currencies` table
- `accounts` table
- `transactions` table
- `account_projections` table (CQRS read model)
- `transaction_projections` table (CQRS read model)
- `audit_logs` table
- All necessary indexes and constraints

**Expected Output**:
```
✓ Migration InitialDoubleEntrySchema1765110800000 has been executed successfully
✓ Migration AddAccountProjections1765125360863 has been executed successfully
✓ Migration AddTransactionProjections1765127268345 has been executed successfully
✓ Migration AddCompensationFieldsToTransactionProjections1765132090408 has been executed successfully
```

#### Step 5: Start Application

```bash
npm run dev
```

Starts NestJS in development mode with hot reload.

**Expected Output**:
```
[Nest] 12345  - 12/09/2025, 12:00:00 PM     LOG [NestFactory] Starting Nest application...
[Nest] 12345  - 12/09/2025, 12:00:00 PM     LOG [InstanceLoader] AppModule dependencies initialized +150ms
[Nest] 12345  - 12/09/2025, 12:00:00 PM     LOG [RoutesResolver] AccountController {/api/v1/accounts}: +5ms
[Nest] 12345  - 12/09/2025, 12:00:00 PM     LOG [RoutesResolver] TransactionController {/api/v1/transactions}: +2ms
[Nest] 12345  - 12/09/2025, 12:00:00 PM     LOG [Bootstrap] ✅ Kafka producer connected
[Nest] 12345  - 12/09/2025, 12:00:00 PM     LOG [Bootstrap] ✅ Billing Engine API running on port 3000
[Nest] 12345  - 12/09/2025, 12:00:00 PM     LOG [Bootstrap] ✅ Swagger documentation available at http://localhost:3000/api/docs
```

---

### Method 3: Production-like Setup (Staging)

Run the application in a containerized environment:

```bash
# Build and start all services (API + PostgreSQL + Kafka)
npm run start:staging

# Runs in background (detached mode)
npm run start:staging:detached

# View logs
npm run logs:staging

# Stop services
npm run stop:staging
```

**Use Case**: Testing deployment configuration locally.

---

## Verification

### 1. Health Check

```bash
curl http://localhost:3000/health
```

**Expected Response**:
```json
{"status":"ok"}
```

### 2. List Currencies

```bash
curl http://localhost:3000/api/v1/currencies
```

**Expected Response**:
```json
[
  {
    "code": "USD",
    "name": "US Dollar",
    "type": "fiat",
    "precision": 2,
    "isActive": true
  },
  {
    "code": "EUR",
    "name": "Euro",
    "type": "fiat",
    "precision": 2,
    "isActive": true
  }
]
```

### 3. View API Documentation

Open in browser:
```
http://localhost:3000/api/docs
```

Should display Swagger UI with all endpoints.

### 4. Check Logs

```bash
# View infrastructure logs
npm run env:logs

# Or specific service
docker logs billing-engine-postgres-1
docker logs billing-engine-kafka-1
```

---

## Configuration

### Environment Variables

The application supports configuration via environment variables:

#### Database Configuration

```bash
DB_HOST=localhost              # PostgreSQL host
DB_PORT=5432                   # PostgreSQL port
DB_USERNAME=postgres           # Database username
DB_PASSWORD=postgres           # Database password
DB_DATABASE=billing_engine     # Database name
DB_SSL=false                   # Enable SSL connection
```

#### Kafka Configuration

```bash
KAFKA_BROKERS=localhost:9092   # Kafka brokers (comma-separated)
KAFKA_CLIENT_ID=billing-engine # Kafka client identifier
KAFKA_GROUP_ID=billing-consumers # Consumer group ID
```

#### Application Configuration

```bash
PORT=3000                      # HTTP port
NODE_ENV=development           # Environment (development/production)
LOG_LEVEL=info                 # Logging level (debug/info/warn/error)
```

### Configuration File

Create `.env` file in project root (optional):

```bash
# .env
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=billing_engine
KAFKA_BROKERS=localhost:9092
NODE_ENV=development
```

**Note**: The application works without `.env` file using defaults.

---

## Troubleshooting

### Common Issues

#### Issue 1: Port Already in Use

**Symptom**: Error `Port 3000 is already in use`

**Solution**:
```bash
# Find process using port 3000
lsof -ti:3000

# Kill the process
lsof -ti:3000 | xargs kill -9

# Or use a different port
PORT=3001 npm start
```

#### Issue 2: Docker Not Running

**Symptom**: `Cannot connect to Docker daemon`

**Solution**:
1. Start Docker Desktop
2. Wait for Docker to fully start
3. Verify: `docker ps`
4. Retry: `npm run env:start`

#### Issue 3: PostgreSQL Connection Failed

**Symptom**: `Connection to database failed`

**Check Status**:
```bash
docker ps | grep postgres
```

**View Logs**:
```bash
docker logs billing-engine-postgres-1
```

**Solution**:
```bash
# Restart PostgreSQL
npm run env:stop
npm run env:start

# If still failing, clean and restart
npm run env:clean
npm run env:start
npm run migration:run
```

#### Issue 4: Kafka Not Ready

**Symptom**: `Kafka connection timeout` or `Failed to connect to Kafka`

**Cause**: Kafka takes 20-30 seconds to fully initialize.

**Solution**:
```bash
# Wait longer and check logs
docker logs billing-engine-kafka-1

# If errors persist, restart
npm run env:stop
npm run env:clean
npm run env:start
```

**Kafka Log Indicators**:
- ✅ `[KafkaServer id=0] started` - Kafka is ready
- ❌ `Connection to node -1 failed` - Still initializing

#### Issue 5: Migration Errors

**Symptom**: `Migration failed` or `Table already exists`

**Solution**:
```bash
# Check migration status
npm run migration:show

# Revert last migration
npm run migration:revert

# Or reset database completely (⚠️ deletes all data)
npm run env:clean
npm run env:start
npm run migration:run
```

#### Issue 6: Missing Dependencies

**Symptom**: `Cannot find module 'xxx'`

**Solution**:
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Or clear npm cache first
npm cache clean --force
npm install
```

#### Issue 7: TypeScript Compilation Errors

**Symptom**: `Type error: ...` during startup

**Solution**:
```bash
# Run type check
npm run type-check

# Fix errors shown
# Or rebuild
npm run build
```

---

## Development Setup

### IDE Configuration

#### VS Code

Recommended extensions:
- ESLint
- Prettier
- TypeScript and JavaScript Language Features
- Docker

Settings (`.vscode/settings.json`):
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

#### WebStorm/IntelliJ IDEA

- Enable ESLint: `Preferences → Languages & Frameworks → JavaScript → Code Quality Tools → ESLint`
- Enable Prettier: `Preferences → Languages & Frameworks → JavaScript → Prettier`
- Enable format on save

### Git Hooks

Pre-commit hooks are automatically installed via Husky:

**What runs on commit**:
- ESLint (auto-fixes issues)
- Prettier (formats code)

**To bypass** (not recommended):
```bash
git commit --no-verify -m "message"
```

---

## Useful Commands Reference

### Infrastructure Management

```bash
npm run env:start       # Start PostgreSQL and Kafka
npm run env:stop        # Stop services
npm run env:clean       # Stop and remove volumes (⚠️ deletes data)
npm run env:status      # Check service status
npm run env:logs        # View service logs
npm run env:ui          # Start with debugging UI (Kafka UI, pgAdmin)
```

### Application

```bash
npm start               # Start everything (infrastructure + app)
npm run dev             # Start app only (dev mode with hot reload)
npm run dev:debug       # Start with Node.js debugger
npm run build           # Build for production
npm run prod            # Run production build
```

### Database

```bash
npm run migration:run       # Run pending migrations
npm run migration:revert    # Revert last migration
npm run migration:show      # Show migration status
npm run migration:generate  # Generate new migration
```

### Testing

```bash
npm test                # Run all tests
npm run test:watch      # Run tests in watch mode
npm run test:cov        # Run tests with coverage
npm run test:e2e        # Run E2E tests
npm run test:parallel   # Run tests in parallel (faster)
```

### Code Quality

```bash
npm run lint            # Run ESLint with auto-fix
npm run lint:check      # Check without fixing
npm run format          # Format code with Prettier
npm run type-check      # TypeScript type checking
```

---

## Uninstallation

### Stop Services

```bash
npm run env:stop
```

### Remove All Data

```bash
# Remove Docker volumes (PostgreSQL data, Kafka logs)
npm run env:clean

# Or manually
docker-compose down -v
```

### Remove Application

```bash
# Delete project directory
cd ..
rm -rf billing-engine
```

---

## Next Steps

After successful installation:

1. **Try the API**: [Getting Started Guide](../../GETTING_STARTED.md)
2. **Explore Architecture**: [System Design](../architecture/system-design.md)
3. **Read API Docs**: [REST API Reference](../api/rest-api.md)
4. **Configure**: [Configuration Guide](./configuration.md)
5. **Run Tests**: [Testing Guide](../development/testing.md)

---

## Getting Help

### Check Logs

```bash
# Application logs (shown in terminal)
npm run dev

# Infrastructure logs
npm run env:logs

# Specific service
docker logs billing-engine-postgres-1
docker logs billing-engine-kafka-1
```

### Common Log Patterns

**✅ Success Indicators**:
- `Billing Engine API running on port 3000`
- `Kafka producer connected`
- `PostgreSQL is ready`

**❌ Error Indicators**:
- `Connection refused`
- `ECONNREFUSED`
- `Migration failed`
- `Port already in use`

### Community Support

- Check existing GitHub issues
- Review documentation at `/docs`
- Open new issue with:
  - Error message
  - Steps to reproduce
  - System information (OS, Node version)
  - Relevant logs

---

**Congratulations!** 🎉 You've successfully installed the Billing Engine. Start exploring with the [Getting Started Guide](../../GETTING_STARTED.md)!


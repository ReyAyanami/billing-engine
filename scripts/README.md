# Billing Engine - Scripts Directory

This directory contains all operational scripts for managing the Billing Engine infrastructure and development workflow.

## Directory Structure

```
scripts/
├── start.sh              # Main startup script (starts all services)
├── stop.sh               # Stop all services (preserves data)
├── setup/                # Initial setup and configuration scripts
│   ├── create-topics.sh  # Create Kafka topics for event sourcing
│   └── reset.sh          # Complete reset (removes all data)
├── dev/                  # Development utility scripts
│   ├── logs.sh           # View service logs
│   └── status.sh         # Check service status
├── test/                 # Testing scripts
│   ├── run-e2e.sh                # Run all E2E tests
│   ├── run-e2e-individually.sh   # Run E2E tests one by one
│   └── reset-and-test.sh         # Reset environment and run tests
└── utils/                # Utility and diagnostic scripts
    └── diagnose-kafka.sh # Kafka diagnostic tool
```

## Quick Start

### 1. Start All Services

```bash
./scripts/start.sh
```

This starts:
- PostgreSQL database
- Kafka cluster (3 brokers)
- Zookeeper
- Schema Registry
- Kafka UI
- Prometheus
- Grafana

### 2. Create Kafka Topics

```bash
./scripts/setup/create-topics.sh
```

Creates all required event sourcing topics with proper configuration.

### 3. Run E2E Tests

```bash
./scripts/test/run-e2e.sh
```

## Main Scripts

### `start.sh`
**Purpose:** Start all required services for the billing engine.

**What it does:**
- Checks if Docker is running
- Starts all services using docker-compose
- Waits for services to be healthy
- Displays access information and next steps
- Optionally opens Kafka UI in browser

**Usage:**
```bash
./scripts/start.sh
```

**Access Points After Startup:**
- PostgreSQL: `localhost:5432` (postgres/postgres)
- Kafka Brokers: `localhost:9092`, `localhost:9093`, `localhost:9094`
- Kafka UI: http://localhost:8080
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3000 (admin/admin)

---

### `stop.sh`
**Purpose:** Gracefully stop all services while preserving data.

**What it does:**
- Stops all Docker containers
- Keeps all volumes intact (data is preserved)

**Usage:**
```bash
./scripts/stop.sh
```

**Note:** To start again, just run `./scripts/start.sh`

## Setup Scripts

### `setup/create-topics.sh`
**Purpose:** Create all Kafka topics required for event sourcing.

**Topics Created:**
- `billing.account.events` (10 partitions) - Account aggregate events
- `billing.transaction.events` (10 partitions) - Transaction aggregate events
- `billing.saga.events` (5 partitions) - Saga coordination events
- `billing.dead-letter` (1 partition) - Failed events for manual review

**Configuration:**
- Replication Factor: 3
- Min In-Sync Replicas: 2
- Retention: Infinite (-1)
- Compression: LZ4
- Cleanup Policy: Compact + Delete

**Usage:**
```bash
./scripts/setup/create-topics.sh
```

**Prerequisites:** Kafka cluster must be running

---

### `setup/reset.sh`
**Purpose:** Complete environment reset (⚠️ DESTRUCTIVE ⚠️)

**What it does:**
- Stops all services
- Removes ALL Docker volumes
- Deletes all data (PostgreSQL, Kafka, monitoring data)

**Usage:**
```bash
./scripts/setup/reset.sh
```

**⚠️ WARNING:** This is irreversible! All data will be lost.

**When to use:**
- Starting fresh
- Fixing corrupted state
- Before running tests in clean environment

## Development Scripts

### `dev/logs.sh`
**Purpose:** Convenient log viewer for any service.

**Usage:**
```bash
./scripts/dev/logs.sh <service> [options]

# Examples:
./scripts/dev/logs.sh kafka-1 -f          # Follow Kafka broker 1 logs
./scripts/dev/logs.sh postgres --tail 50  # Last 50 lines of PostgreSQL
./scripts/dev/logs.sh all -f              # Follow all service logs
```

**Available Services:**
- `postgres` - PostgreSQL database
- `kafka-1`, `kafka-2`, `kafka-3` - Kafka brokers
- `kafka-all` - All Kafka brokers
- `zookeeper` - Zookeeper
- `schema-registry` - Schema Registry
- `kafka-ui` - Kafka UI
- `prometheus` - Prometheus
- `grafana` - Grafana
- `all` - All services

**Options:**
- `-f, --follow` - Follow log output (live tail)
- `--tail N` - Show last N lines (default: 100)

---

### `dev/status.sh`
**Purpose:** Check status of all services.

**What it shows:**
- Docker status
- Service health status
- Running vs total services count
- Port bindings

**Usage:**
```bash
./scripts/dev/status.sh
```

## Testing Scripts

### `test/run-e2e.sh`
**Purpose:** Run the complete E2E test suite.

**What it does:**
- Checks if services are running (offers to start if not)
- Runs all E2E tests using Jest
- Reports results

**Usage:**
```bash
./scripts/test/run-e2e.sh
```

**Prerequisites:** All services must be running with topics created

---

### `test/run-e2e-individually.sh`
**Purpose:** Run each E2E test file individually to ensure isolation.

**What it does:**
- Runs each test file separately
- Provides detailed pass/fail report
- Useful for debugging test interference

**Usage:**
```bash
./scripts/test/run-e2e-individually.sh
```

**When to use:**
- Tests pass individually but fail when run together
- Debugging test isolation issues
- Verifying test independence

---

### `test/reset-and-test.sh`
**Purpose:** Complete reset followed by E2E tests (clean environment test).

**What it does:**
1. Stops and removes all services and volumes
2. Starts fresh services
3. Creates Kafka topics
4. Waits for stabilization
5. Runs complete E2E test suite

**Usage:**
```bash
./scripts/test/reset-and-test.sh
```

**When to use:**
- Ensuring tests pass in fresh environment
- CI/CD pipeline testing
- Debugging state-dependent failures

## Utility Scripts

### `utils/diagnose-kafka.sh`
**Purpose:** Kafka diagnostic tool for troubleshooting.

**What it checks:**
- InvalidReceiveException errors in logs
- Broker connectivity (all 3 brokers)
- Available topics
- Active consumer groups
- Service health

**Usage:**
```bash
./scripts/utils/diagnose-kafka.sh
```

**When to use:**
- Troubleshooting Kafka errors
- Verifying broker health
- Debugging connectivity issues

## Typical Workflows

### First-Time Setup
```bash
# 1. Start all services
./scripts/start.sh

# 2. Create Kafka topics
./scripts/setup/create-topics.sh

# 3. Run database migrations
npm run migration:run

# 4. Start the application
npm run start:dev
```

### Daily Development
```bash
# Start services (if stopped)
./scripts/start.sh

# Check status
./scripts/dev/status.sh

# View logs while developing
./scripts/dev/logs.sh kafka-1 -f

# Run tests
./scripts/test/run-e2e.sh
```

### Testing Workflow
```bash
# Run all tests
./scripts/test/run-e2e.sh

# Run tests individually (for debugging)
./scripts/test/run-e2e-individually.sh

# Test in clean environment
./scripts/test/reset-and-test.sh
```

### Troubleshooting
```bash
# Check service status
./scripts/dev/status.sh

# View specific service logs
./scripts/dev/logs.sh kafka-1 --tail 100

# Diagnose Kafka issues
./scripts/utils/diagnose-kafka.sh

# Complete reset if needed
./scripts/setup/reset.sh
./scripts/start.sh
./scripts/setup/create-topics.sh
```

## Environment Requirements

- **Docker:** Docker Desktop must be running
- **Docker Compose:** Version 3.8 or higher
- **Node.js:** For running the application and tests
- **Ports:** Ensure the following ports are available:
  - 5432 (PostgreSQL)
  - 9092, 9093, 9094 (Kafka brokers)
  - 2181 (Zookeeper)
  - 8081 (Schema Registry)
  - 8080 (Kafka UI)
  - 9090 (Prometheus)
  - 3000 (Grafana)

## Best Practices

1. **Always check status first:** Run `./scripts/dev/status.sh` before starting services
2. **Use reset sparingly:** Only reset when absolutely necessary, as it deletes all data
3. **Monitor logs during development:** Use `./scripts/dev/logs.sh` with `-f` flag
4. **Run individual tests for debugging:** Use `run-e2e-individually.sh` when troubleshooting
5. **Clean state for important tests:** Use `reset-and-test.sh` before critical testing

## Troubleshooting

### Services won't start
```bash
# Check Docker is running
docker info

# Check port availability
lsof -i :5432  # PostgreSQL
lsof -i :9092  # Kafka

# View logs for specific service
./scripts/dev/logs.sh <service> --tail 100

# Complete reset
./scripts/setup/reset.sh
./scripts/start.sh
```

### Kafka errors
```bash
# Run diagnostics
./scripts/utils/diagnose-kafka.sh

# View Kafka logs
./scripts/dev/logs.sh kafka-all -f

# Recreate topics
./scripts/setup/reset.sh
./scripts/start.sh
./scripts/setup/create-topics.sh
```

### Tests failing
```bash
# Ensure services are running
./scripts/dev/status.sh

# Run tests individually
./scripts/test/run-e2e-individually.sh

# Try in clean environment
./scripts/test/reset-and-test.sh
```

## Contributing

When adding new scripts:
1. Place them in the appropriate directory
2. Make them executable: `chmod +x script-name.sh`
3. Add proper documentation header
4. Update this README
5. Test in clean environment

## Related Documentation

- [Quick Start Guide](../QUICK_START.md)
- [Testing Guide](../docs/TESTING_GUIDE.md)
- [Kafka Error Analysis](../docs/KAFKA_ERROR_ROOT_CAUSE_ANALYSIS.md)
- [Architecture Documentation](../ARCHITECTURE.md)


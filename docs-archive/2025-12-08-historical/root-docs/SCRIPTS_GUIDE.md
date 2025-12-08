# Billing Engine - Scripts Guide

Quick reference guide for all operational scripts.

## 🚀 Quick Commands

```bash
# Start everything
./scripts/start.sh

# Create Kafka topics
./scripts/setup/create-topics.sh

# Run migrations
npm run migration:run

# Start app
npm run start:dev

# Run tests
./scripts/test/run-e2e.sh
```

## 📁 Script Organization

```
scripts/
├── start.sh                       # ⭐ Main entry point - starts all services
├── stop.sh                        # Stop all services (preserves data)
│
├── setup/                         # Initial setup and configuration
│   ├── create-topics.sh          # Create Kafka topics
│   └── reset.sh                  # ⚠️ Complete reset (deletes all data)
│
├── dev/                           # Development utilities
│   ├── logs.sh                   # View service logs
│   └── status.sh                 # Check service status
│
├── test/                          # Testing workflows
│   ├── run-e2e.sh                # Run all E2E tests
│   ├── run-e2e-individually.sh   # Run tests one by one
│   └── reset-and-test.sh         # Reset + test (clean state)
│
└── utils/                         # Diagnostic tools
    └── diagnose-kafka.sh         # Kafka troubleshooting

```

## 🎯 Common Workflows

### First Time Setup

```bash
# 1. Start infrastructure
./scripts/start.sh

# 2. Wait for services (30 seconds)
# 3. Create topics
./scripts/setup/create-topics.sh

# 4. Run migrations
npm install
npm run migration:run

# 5. Start app
npm run start:dev
```

### Daily Development

```bash
# Start (if stopped)
./scripts/start.sh

# Check status
./scripts/dev/status.sh

# View logs
./scripts/dev/logs.sh kafka-1 -f

# Run tests
./scripts/test/run-e2e.sh

# Stop when done
./scripts/stop.sh
```

### Testing

```bash
# Quick test
./scripts/test/run-e2e.sh

# Debug test isolation
./scripts/test/run-e2e-individually.sh

# Clean environment test
./scripts/test/reset-and-test.sh
```

### Troubleshooting

```bash
# Check what's running
./scripts/dev/status.sh

# View logs
./scripts/dev/logs.sh <service> -f

# Kafka diagnostics
./scripts/utils/diagnose-kafka.sh

# Nuclear option (deletes all data!)
./scripts/setup/reset.sh
./scripts/start.sh
./scripts/setup/create-topics.sh
```

## 📊 Service Access Points

| Service | Port | URL/Connection |
|---------|------|----------------|
| **PostgreSQL** | 5432 | `localhost:5432` (postgres/postgres) |
| **Kafka Broker 1** | 9092 | `localhost:9092` |
| **Kafka Broker 2** | 9093 | `localhost:9093` |
| **Kafka Broker 3** | 9094 | `localhost:9094` |
| **Kafka UI** | 8080 | http://localhost:8080 |
| **Schema Registry** | 8081 | http://localhost:8081 |
| **Prometheus** | 9090 | http://localhost:9090 |
| **Grafana** | 3000 | http://localhost:3000 (admin/admin) |

## 🔍 Script Details

### Main Scripts

#### `start.sh`
- Starts all services (PostgreSQL, Kafka, monitoring)
- Performs health checks
- Shows access information
- Optionally opens Kafka UI

#### `stop.sh`
- Gracefully stops all services
- Preserves all data (volumes remain intact)

### Setup Scripts

#### `setup/create-topics.sh`
Creates event sourcing topics:
- `billing.account.events` (10 partitions)
- `billing.transaction.events` (10 partitions)
- `billing.saga.events` (5 partitions)
- `billing.dead-letter` (1 partition)

#### `setup/reset.sh` ⚠️
**DESTRUCTIVE**: Removes all data
- Stops all services
- Deletes all Docker volumes
- Use before clean test runs

### Development Scripts

#### `dev/status.sh`
Shows:
- Docker status
- Running services count
- Service health
- Port bindings

#### `dev/logs.sh <service> [options]`
View logs for any service:
```bash
./scripts/dev/logs.sh kafka-1 -f
./scripts/dev/logs.sh postgres --tail 50
./scripts/dev/logs.sh all -f
```

Available services:
- `postgres`, `zookeeper`, `schema-registry`
- `kafka-1`, `kafka-2`, `kafka-3`, `kafka-all`
- `kafka-ui`, `prometheus`, `grafana`
- `all`

### Testing Scripts

#### `test/run-e2e.sh`
- Checks if services are running
- Runs complete E2E test suite
- Reports results

#### `test/run-e2e-individually.sh`
- Runs each test file separately
- Shows detailed pass/fail report
- Useful for debugging test interference

#### `test/reset-and-test.sh`
Complete workflow:
1. Reset environment (delete all data)
2. Start fresh services
3. Create topics
4. Wait for stability
5. Run E2E tests

### Utility Scripts

#### `utils/diagnose-kafka.sh`
Comprehensive Kafka diagnostics:
- Checks for errors in logs
- Tests broker connectivity
- Lists topics and consumer groups
- Provides troubleshooting recommendations

## 💡 Tips

1. **Always start from project root**: All scripts are designed to run from the project root directory
2. **Check status first**: Run `./scripts/dev/status.sh` before starting services
3. **Use logs for debugging**: `./scripts/dev/logs.sh` is your friend
4. **Test in clean state**: Use `./scripts/test/reset-and-test.sh` for reliable test results
5. **Stop, don't reset**: Use `./scripts/stop.sh` to preserve data between sessions

## 🆘 Quick Troubleshooting

| Problem | Command |
|---------|---------|
| Services won't start | `docker info` (check Docker is running) |
| Port conflict | `lsof -i :<port>` then `kill <PID>` |
| Service unhealthy | `./scripts/dev/logs.sh <service> --tail 100` |
| Kafka errors | `./scripts/utils/diagnose-kafka.sh` |
| Everything broken | `./scripts/setup/reset.sh` |

## 📚 Related Documentation

- [scripts/README.md](scripts/README.md) - Detailed script documentation
- [QUICK_START.md](QUICK_START.md) - Getting started guide
- [infrastructure/kafka/README.md](infrastructure/kafka/README.md) - Kafka cluster details
- [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md) - Testing guide

---

**Quick Reference Card:**
```bash
./scripts/start.sh                    # Start everything
./scripts/stop.sh                     # Stop everything
./scripts/setup/create-topics.sh      # Create Kafka topics
./scripts/setup/reset.sh              # Reset all (delete data)
./scripts/dev/status.sh               # Check status
./scripts/dev/logs.sh <service> -f    # View logs
./scripts/test/run-e2e.sh             # Run tests
./scripts/utils/diagnose-kafka.sh     # Diagnose Kafka
```

**Happy coding! 🚀**


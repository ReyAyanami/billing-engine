# Docker Setup

## Overview

The billing engine uses Docker Compose to orchestrate local development infrastructure. This guide explains the Docker setup, configuration, and common operations.

---

## Architecture

```
docker-compose.yml
├── postgres      (PostgreSQL 16)
├── kafka         (Apache Kafka 3.7 with KRaft)
├── init          (Initialization container)
└── kafka-ui      (Optional: Kafka debugging UI)
```

**Note**: Application runs on host (via `npm run dev`), not in Docker.

---

## Services

### PostgreSQL

**Image**: `postgres:16-alpine`  
**Container**: `billing_db`  
**Port**: `5432:5432`

```yaml
postgres:
  image: postgres:16-alpine
  container_name: billing_db
  environment:
    POSTGRES_USER: postgres
    POSTGRES_PASSWORD: postgres
    POSTGRES_DB: billing_engine
  ports:
    - "5432:5432"
  volumes:
    - postgres_data:/var/lib/postgresql/data
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U postgres"]
    interval: 5s
    timeout: 3s
    retries: 5
```

**Purpose**:
- Store account/transaction projections
- Read models for queries
- ACID-compliant storage

**Access**:
```bash
# Connect via psql
docker exec -it billing_db psql -U postgres -d billing_engine

# Or from host
psql -h localhost -U postgres -d billing_engine
```

---

### Kafka

**Image**: `apache/kafka:3.7.0`  
**Container**: `billing_kafka`  
**Port**: `9092:9092`

```yaml
kafka:
  image: apache/kafka:3.7.0
  container_name: billing_kafka
  ports:
    - "9092:9092"
  environment:
    # KRaft mode (no Zookeeper!)
    KAFKA_NODE_ID: 1
    KAFKA_PROCESS_ROLES: broker,controller
    KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
    KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
    KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
    
    # Topic defaults
    KAFKA_NUM_PARTITIONS: 3
    KAFKA_AUTO_CREATE_TOPICS_ENABLE: 'true'
    
    # Retention
    KAFKA_LOG_RETENTION_HOURS: 24  # 1 day for local dev
    KAFKA_MESSAGE_MAX_BYTES: 1048576  # 1MB
  volumes:
    - kafka_data:/var/lib/kafka/data
```

**Purpose**:
- Event store (immutable event log)
- Message broker for CQRS
- Durable event persistence

**Key Features**:
- **KRaft mode**: No Zookeeper needed (simpler setup)
- **Auto-create topics**: Topics created on first use
- **3 partitions**: Parallel processing
- **24-hour retention**: Short retention for local dev

**Access**:
```bash
# List topics
docker exec -it billing_kafka kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --list

# Consume events
docker exec -it billing_kafka kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic billing-engine.account.events \
  --from-beginning
```

---

### Init Container

**Image**: `node:18-alpine`  
**Container**: `billing_init`  
**Purpose**: One-time initialization

```yaml
init:
  image: node:18-alpine
  container_name: billing_init
  depends_on:
    postgres:
      condition: service_healthy
    kafka:
      condition: service_healthy
  command: /bin/sh -c "chmod +x /app/init-services.sh && /app/init-services.sh"
  restart: "no"
```

**What it does**:
1. Waits for PostgreSQL and Kafka to be healthy
2. Runs `scripts/init-services.sh`:
   - Installs npm dependencies
   - Runs database migrations
   - Creates Kafka topics
3. Exits (doesn't stay running)

**Manual trigger**:
```bash
docker-compose up init
```

---

### Kafka UI (Optional)

**Image**: `provectuslabs/kafka-ui:latest`  
**Container**: `billing_kafka_ui`  
**Port**: `8080:8080`  
**Profile**: `debug` (not started by default)

```yaml
kafka-ui:
  image: provectuslabs/kafka-ui:latest
  container_name: billing_kafka_ui
  ports:
    - "8080:8080"
  profiles: ["debug"]
```

**Start with**:
```bash
docker-compose --profile debug up -d
```

**Access**:
```
http://localhost:8080
```

**Features**:
- Browse topics and messages
- View consumer groups
- Monitor lag
- Inspect schemas

---

## Volumes

### Persistent Storage

```yaml
volumes:
  postgres_data:      # PostgreSQL database files
  kafka_data:         # Kafka logs and data
  init_node_modules:  # Cached npm packages for init
```

**Location**:
```bash
# List volumes
docker volume ls | grep billing

# Inspect volume
docker volume inspect billing-engine_postgres_data

# Typical path (Linux)
/var/lib/docker/volumes/billing-engine_postgres_data/_data
```

### Clean Volumes

```bash
# Stop and remove volumes (⚠️ deletes all data)
docker-compose down -v

# Or remove specific volume
docker volume rm billing-engine_postgres_data
```

---

## Networking

### Docker Network

All services communicate via `billing-engine_default` network (auto-created):

```bash
# List networks
docker network ls | grep billing

# Inspect network
docker network inspect billing-engine_default
```

### Service Discovery

Services can reach each other by container name:

```yaml
# From init container
DB_HOST: postgres     # Not localhost!
KAFKA_BROKERS: kafka:9092
```

**From host**:
```bash
# Use localhost
DB_HOST=localhost
KAFKA_BROKERS=localhost:9092
```

---

## Health Checks

### PostgreSQL Health Check

```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U postgres"]
  interval: 5s
  timeout: 3s
  retries: 5
  start_period: 10s
```

**Check manually**:
```bash
docker exec billing_db pg_isready -U postgres
```

### Kafka Health Check

```yaml
healthcheck:
  test: ["CMD-SHELL", "kafka-broker-api-versions.sh --bootstrap-server localhost:9092 || exit 1"]
  interval: 10s
  timeout: 5s
  retries: 10
  start_period: 30s
```

**Check manually**:
```bash
docker exec billing_kafka kafka-broker-api-versions.sh \
  --bootstrap-server localhost:9092
```

---

## Common Operations

### Start Services

```bash
# Start all (detached)
docker-compose up -d

# Or with npm script
npm run env:start

# Start with logs (foreground)
docker-compose up

# Start specific service
docker-compose up -d postgres
```

### Stop Services

```bash
# Stop all
docker-compose stop

# Or with npm script
npm run env:stop

# Stop and remove containers
docker-compose down

# Stop and remove volumes (⚠️ deletes data)
docker-compose down -v
```

### View Logs

```bash
# All services
docker-compose logs

# Follow logs
docker-compose logs -f

# Specific service
docker-compose logs -f kafka

# Or with npm script
npm run env:logs

# Last 100 lines
docker-compose logs --tail=100
```

### Restart Services

```bash
# Restart all
docker-compose restart

# Or with npm script
npm run env:restart

# Restart specific service
docker-compose restart kafka
```

### Check Status

```bash
# List running containers
docker-compose ps

# Or standard docker
docker ps | grep billing

# Check health
docker inspect billing_db --format='{{.State.Health.Status}}'
```

---

## Troubleshooting

### Services Won't Start

```bash
# Check logs
docker-compose logs

# Check specific service
docker-compose logs postgres
docker-compose logs kafka

# Restart Docker daemon
# (macOS: Docker Desktop → Restart)

# Clean and rebuild
docker-compose down -v
docker-compose up -d
```

### Port Already in Use

```bash
# Error: port 5432 already in use

# Find process
lsof -i :5432

# Kill process
kill -9 $(lsof -ti :5432)

# Or change port in docker-compose.yml
ports:
  - "5433:5432"  # Use 5433 on host
```

### Kafka Not Ready

```bash
# Kafka takes ~30 seconds to start

# Check health
docker exec billing_kafka kafka-broker-api-versions.sh \
  --bootstrap-server localhost:9092

# View logs
docker logs billing_kafka

# Restart if stuck
docker restart billing_kafka
```

### Init Container Fails

```bash
# View init logs
docker logs billing_init

# Common issues:
# - Postgres not ready → Wait longer
# - Kafka not ready → Wait longer
# - Migration error → Check migration files

# Re-run init
docker-compose up init
```

### Out of Disk Space

```bash
# Check disk usage
docker system df

# Clean unused resources
docker system prune -a

# Remove unused volumes
docker volume prune

# Remove specific volume
docker volume rm billing-engine_kafka_data
```

---

## Configuration

### Environment Variables

Override defaults via `.env`:

```bash
# .env
POSTGRES_USER=myuser
POSTGRES_PASSWORD=mypass
POSTGRES_DB=mydb
KAFKA_LOG_RETENTION_HOURS=168  # 7 days
```

Then reference in `docker-compose.yml`:

```yaml
environment:
  POSTGRES_USER: ${POSTGRES_USER:-postgres}
  POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
```

### Resource Limits

Add resource constraints:

```yaml
services:
  postgres:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
```

---

## Production vs Development

### Current Setup (Development)

- Single Kafka broker
- No authentication
- Short retention (24 hours)
- Auto-create topics
- No TLS/SSL
- Minimal resource limits

### Production Would Need

- **Kafka cluster** (3+ brokers)
- **Authentication** (SASL/SSL)
- **Long retention** (years)
- **Explicit topic creation** (no auto-create)
- **TLS encryption**
- **Monitoring** (Prometheus, Grafana)
- **Backup strategies**
- **High availability** (replication)
- **Resource limits** (CPU, memory)
- **Secrets management** (not plain text)

**This project intentionally uses simplified dev setup.**

---

## Alternative: docker-compose.staging.yml

For running the app in Docker (not just infrastructure):

```bash
# Use staging compose file
docker-compose -f docker-compose.staging.yml up -d

# Includes:
# - postgres
# - kafka
# - app (NestJS in Docker)
```

See `docker-compose.staging.yml` for details.

---

## Best Practices

### 1. Use Health Checks

```yaml
healthcheck:
  test: ["CMD", "pg_isready"]
  interval: 10s
  timeout: 5s
  retries: 3
```

**Why**: Ensures dependent services wait for readiness.

### 2. Use Volumes for Data

```yaml
volumes:
  - postgres_data:/var/lib/postgresql/data
```

**Why**: Data persists across container restarts.

### 3. Use Named Containers

```yaml
container_name: billing_db
```

**Why**: Easier to reference in commands.

### 4. Use Profiles for Optional Services

```yaml
profiles: ["debug"]
```

**Why**: Don't start unnecessary services by default.

### 5. Pin Image Versions

```yaml
image: postgres:16-alpine  # Not 'latest'
```

**Why**: Reproducible builds, avoid breaking changes.

---

## Related Documentation

- [Kafka Setup](./kafka.md) - Kafka configuration details
- [Infrastructure Overview](./README.md) - All services
- [Installation Guide](../guides/installation.md) - Getting started
- [Local Development](../development/local-setup.md) - Development workflow


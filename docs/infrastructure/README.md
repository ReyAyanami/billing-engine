# Infrastructure

## Overview

Infrastructure documentation for the billing engine's supporting services: PostgreSQL, Kafka (with KRaft), and Docker Compose orchestration.

---

## Components

### [Docker Compose](./docker.md)
Local development environment setup.
- Multi-container orchestration
- Service configuration
- Networking
- Volume management
- Common operations

### [Kafka](./kafka.md)
Event store and message broker.
- Topic configuration
- Event persistence
- Consumer groups
- Monitoring and debugging
- Performance tuning

### PostgreSQL
Relational database for projections.
- Schema design
- Migrations
- Indexing
- Query optimization
- Backup strategies

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                Application                      │
│              (NestJS / Node.js)                 │
└────────────┬────────────────────┬───────────────┘
             │                    │
             │                    │
             ▼                    ▼
     ┌──────────────┐     ┌──────────────┐
     │  PostgreSQL  │     │    Kafka     │
     │              │     │  (KRaft)     │
     │  Projections │     │ Event Store  │
     │  Read Models │     │  (Events)    │
     └──────────────┘     └──────────────┘
```

---

## Service Details

### PostgreSQL

**Purpose**: Store read models (projections)

**Port**: `5432` (host) → `5432` (container)

**Features**:
- Account projections
- Transaction projections
- Indexing for fast queries
- ACID compliance
- Pessimistic locking

**Access**:
```bash
docker exec -it billing-engine-postgres psql -U postgres -d billing_engine
```

---

### Kafka

**Purpose**: Event store (immutable event log)

**Ports**:
- `9092` (internal)
- `29092` (external/host)

**Features**:
- Durable event persistence
- Ordered event streams
- Long-term retention (10 years)
- Partition-based scaling
- At-least-once delivery

**Topics**:
- `billing-engine.account.events`
- `billing-engine.transaction.events`

**Access**:
```bash
docker exec -it billing-engine-kafka kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --list
```

---

## Quick Commands

### Start/Stop Services

```bash
# Start all
npm run env:start

# Stop all
npm run env:stop

# Restart
npm run env:restart

# View logs
npm run env:logs

# Follow logs for specific service
docker logs -f billing-engine-kafka
```

### Health Checks

```bash
# Check all containers
docker ps

# PostgreSQL health
docker exec billing-engine-postgres pg_isready -U postgres

# Kafka health
docker exec billing-engine-kafka kafka-broker-api-versions.sh \
  --bootstrap-server localhost:9092
```

### Data Management

```bash
# Backup PostgreSQL
docker exec billing-engine-postgres pg_dump -U postgres billing_engine > backup.sql

# Restore PostgreSQL
docker exec -i billing-engine-postgres psql -U postgres billing_engine < backup.sql

# Clean all data (⚠️ destructive)
npm run env:clean
```

---

## Resource Requirements

### Minimum

| Service | CPU | Memory | Disk |
|---------|-----|--------|------|
| PostgreSQL | 0.5 | 512 MB | 1 GB |
| Kafka (KRaft) | 0.5 | 1 GB | 2 GB |
| **Total** | **1** | **~1.5 GB** | **3 GB** |

### Recommended

| Service | CPU | Memory | Disk |
|---------|-----|--------|------|
| PostgreSQL | 1 | 1 GB | 5 GB |
| Kafka (KRaft) | 1 | 2 GB | 10 GB |
| **Total** | **2** | **~3 GB** | **15 GB** |

---

## Network

### Docker Network

All services run in `billing-engine-network`:

```yaml
networks:
  billing-engine-network:
    driver: bridge
```

**Service hostnames**:
- `postgres` (from within Docker network)
- `localhost:5432` (from host)
- `kafka` (from within Docker network)
- `localhost:29092` (from host)

### Port Mapping

| Service | Internal Port | External Port |
|---------|---------------|---------------|
| PostgreSQL | 5432 | 5432 |
| Kafka | 9092 | 9092 |
| Application | 3000 | 3000 |

---

## Volumes

Persistent data storage:

```yaml
volumes:
  postgres-data:     # PostgreSQL data
  kafka-data:        # Kafka logs/data (KRaft metadata)
```

**Location**: Docker managed volumes

**View**:
```bash
docker volume ls
docker volume inspect billing-engine_postgres-data
```

**Clean** (⚠️ deletes all data):
```bash
docker-compose down -v
```

---

## Environment Variables

Configure via `.env`:

```bash
# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=billing_engine

# Kafka
KAFKA_BROKERS=localhost:29092
KAFKA_CLIENT_ID=billing-engine
```

---

## Production Considerations

**⚠️ This setup is for LOCAL DEVELOPMENT ONLY**

For production, you would need:

### Security
- Authentication (PostgreSQL users, Kafka SASL)
- Encryption (TLS/SSL)
- Network isolation
- Firewall rules
- Secrets management

### High Availability
- PostgreSQL replication (master-slave)
- Kafka cluster (multiple brokers with KRaft quorum)
- Load balancing
- Failover mechanisms

### Monitoring
- Metrics (Prometheus)
- Logging (ELK stack)
- Alerting (PagerDuty)
- Health checks
- Performance monitoring

### Backup & Recovery
- Automated backups
- Point-in-time recovery
- Disaster recovery plan
- Data retention policies

### Scaling
- Horizontal scaling (more brokers/replicas)
- Partitioning strategies
- Connection pooling
- Resource limits

**This project intentionally omits these for simplicity.**

---

## Troubleshooting

### Services Not Starting

```bash
# Check Docker daemon
docker info

# Check logs
docker-compose logs

# Restart services
docker-compose restart

# Clean and rebuild
docker-compose down -v
docker-compose up -d
```

### Out of Disk Space

```bash
# Check disk usage
docker system df

# Clean unused resources
docker system prune -a

# Remove volumes (⚠️ deletes data)
docker volume prune
```

### Port Conflicts

```bash
# Check what's using port
lsof -i :5432
lsof -i :29092

# Change ports in docker-compose.yml
ports:
  - "5433:5432"  # Use 5433 on host instead
```

---

## Related Documentation

- [Docker Setup](./docker.md) - Detailed Docker configuration
- [Kafka Setup](./kafka.md) - Kafka deep dive
- [Installation Guide](../guides/installation.md) - Getting started
- [Local Development](../development/local-setup.md) - Development workflow


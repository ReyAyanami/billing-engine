# Scriptless Startup Architecture

This document explains how the automated startup system works under the hood.

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     npm start                                │
│                         │                                    │
│                         ▼                                    │
│              docker-compose up --build                       │
└─────────────────────────────────────────────────────────────┘
                          │
          ┌───────────────┴───────────────┐
          │                               │
          ▼                               ▼
┌──────────────────┐            ┌──────────────────┐
│   PostgreSQL     │            │      Kafka       │
│   Container      │            │   Container      │
│                  │            │   (KRaft mode)   │
│  Health Check:   │            │  Health Check:   │
│  pg_isready      │            │  broker api      │
└────────┬─────────┘            └────────┬─────────┘
         │                               │
         │    Wait for healthy status    │
         └───────────────┬───────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │  Init Container     │
              │  (runs once)        │
              │                     │
              │  1. Wait for        │
              │     services        │
              │  2. Create Kafka    │
              │     topics          │
              │  3. Run database    │
              │     migrations      │
              │  4. Exit success    │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │   App Container     │
              │  (billing-engine)   │
              │                     │
              │  • NestJS app       │
              │  • REST API         │
              │  • Swagger docs     │
              │  • Health endpoint  │
              └─────────────────────┘
```

## 🔄 Startup Sequence

### Phase 1: Infrastructure Startup
```
Time: 0s
├─ Docker Compose reads configuration
├─ Pulls/builds images if needed
└─ Starts postgres and kafka containers in parallel

Time: 5-30s
├─ PostgreSQL initializes database
│  └─ Health check: pg_isready every 5s
├─ Kafka initializes KRaft mode
│  └─ Health check: broker-api every 10s
└─ Both must report healthy before proceeding
```

### Phase 2: Initialization
```
Time: 30-45s
├─ Init container starts (depends_on healthy services)
├─ Installs dependencies (cached after first run)
├─ Creates Kafka topics:
│  ├─ billing.account.events (3 partitions)
│  ├─ billing.transaction.events (3 partitions)
│  ├─ billing.saga.events (3 partitions)
│  └─ billing.dead-letter (1 partition)
├─ Runs TypeORM migrations
│  ├─ Creates tables
│  ├─ Applies schema changes
│  └─ Inserts seed data (currencies)
└─ Exits with success (condition: service_completed_successfully)
```

### Phase 3: Application Startup
```
Time: 45-60s
├─ App container starts (depends_on init completed)
├─ Loads environment variables
├─ Connects to PostgreSQL
├─ Connects to Kafka
├─ Initializes NestJS modules
├─ Sets up API endpoints
├─ Generates Swagger documentation
└─ Listens on port 3000

Time: 60s+
└─ System ready for requests! 🎉
```

## 🎯 Key Design Decisions

### 1. Health Check Based Dependencies

**Why**: Ensures services are truly ready, not just started.

```yaml
depends_on:
  postgres:
    condition: service_healthy  # ← Not just 'started'
```

**Benefits**:
- No race conditions
- Reliable startup order
- Automatic retries

### 2. Separate Init Container

**Why**: Separation of concerns - setup vs. runtime.

**Benefits**:
- Initialization runs exactly once
- App container stays clean
- Easy to debug initialization issues
- Can restart app without re-init

### 3. Volume Caching

**Why**: Speed up repeated startups.

```yaml
volumes:
  - init_node_modules:/app/node_modules  # ← Cached!
```

**Benefits**:
- First start: 2-3 minutes
- Subsequent starts: 30 seconds
- No need to reinstall dependencies

### 4. Docker Socket Mounting

**Why**: Init container needs to create Kafka topics via kafka container.

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

**Benefits**:
- Can execute commands in kafka container
- No need to install Kafka tools in init
- Simpler maintenance

### 5. Automatic Topic Creation

**Why**: Kafka's auto-create doesn't allow custom configuration.

**Approach**: Script creates topics with proper settings:
- Partitions for parallelism
- Retention for event sourcing
- Cleanup policy for efficiency

## 🔧 Components

### docker-compose.yml

**Services**:
1. `postgres` - Database with health check
2. `kafka` - Event streaming with health check
3. `init` - One-time initialization
4. `app` - Main application
5. `kafka-ui` - Optional debug UI (profile: debug)

**Networks**: Default bridge (all services can communicate)

**Volumes**: 
- `postgres_data` - Persists database
- `kafka_data` - Persists Kafka logs
- `init_node_modules` - Caches npm packages

### Dockerfile

**Multi-stage build**:
1. **Builder stage**: Installs all deps, compiles TypeScript
2. **Production stage**: Only runtime deps, compiled code

**Benefits**:
- Smaller final image
- Faster deployments
- Better security (no dev dependencies)

### init-services.sh

**Responsibilities**:
1. Wait for services (with timeout)
2. Create Kafka topics (idempotent)
3. Run migrations (idempotent)
4. Report success/failure

**Idempotency**: Can run multiple times safely
- Topics: `--if-not-exists`
- Migrations: TypeORM tracks applied migrations

## 📊 State Machine

```
[Start]
   │
   ▼
[Infrastructure Starting]
   │
   ├─ PostgreSQL Starting ─→ Health Checks ─→ Ready
   │
   └─ Kafka Starting ─→ Health Checks ─→ Ready
   │
   ▼
[Both Ready] ─→ [Init Running]
   │
   ├─ Create Topics (idempotent)
   │
   └─ Run Migrations (idempotent)
   │
   ▼
[Init Complete] ─→ [App Starting]
   │
   └─ App Initialization ─→ Listening
   │
   ▼
[System Ready] ✅
```

## 🛡️ Error Handling

### Service Health Check Failure
```
Retries: Configured per service (5-10 retries)
Interval: 5-10 seconds
Action: Container restarts automatically
Recovery: Exponential backoff
```

### Init Container Failure
```
Behavior: Does not restart (restart: "no")
App: Won't start (depends on init success)
Recovery: Manual - check logs, fix issue, restart
Debug: docker-compose logs init
```

### App Container Failure
```
Behavior: Restarts automatically (restart: unless-stopped)
Recovery: Automatic with backoff
Persistence: Data preserved in volumes
```

## 🎛️ Configuration

### Environment Variables

**PostgreSQL**:
```yaml
POSTGRES_USER: postgres
POSTGRES_PASSWORD: postgres
POSTGRES_DB: billing_engine
```

**Kafka**:
```yaml
KAFKA_BROKERS: kafka:9092
# Full KRaft configuration in docker-compose.yml
```

**Application**:
```yaml
DB_HOST: postgres
DB_PORT: 5432
PORT: 3000
NODE_ENV: development
```

### Customization Points

1. **Port Mappings**: Change `ports:` section
2. **Resource Limits**: Add `deploy: resources:`
3. **Health Checks**: Adjust intervals/timeouts
4. **Topic Configuration**: Modify `init-services.sh`
5. **Migration Behavior**: Edit migration scripts

## 🔍 Observability

### Logs

**View all logs**:
```bash
npm run logs:all
```

**View specific service**:
```bash
docker-compose logs postgres
docker-compose logs kafka
docker-compose logs init
docker-compose logs app
```

**Follow logs**:
```bash
docker-compose logs -f app
```

### Status

**Check services**:
```bash
npm run status
```

**Output shows**:
- Container name
- Status (Up/Down/Exited)
- Ports exposed
- Health status

### Health Endpoints

**Application**:
```bash
curl http://localhost:3000/api/v1/currencies
```

**PostgreSQL**:
```bash
docker exec billing_db pg_isready -U postgres
```

**Kafka**:
```bash
docker exec billing_kafka kafka-broker-api-versions.sh \
  --bootstrap-server localhost:9092
```

## 🚀 Optimization Tips

### Development
```bash
# Keep infrastructure running, develop locally
docker-compose up postgres kafka -d
npm run dev  # Fast hot reload
```

### CI/CD
```yaml
# Use pre-built images
services:
  app:
    image: billing-engine:${VERSION}  # Pre-built
```

### Production
```yaml
# Add resource limits
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
    reservations:
      cpus: '1'
      memory: 1G
```

## 📚 Technical Details

### Docker Compose Version
- Uses: `3.8`
- Features: health checks, depends_on conditions, profiles

### Health Check Format
```yaml
healthcheck:
  test: ["CMD-SHELL", "command"]
  interval: 10s        # Check every 10s
  timeout: 5s          # Command timeout
  retries: 10          # Try 10 times
  start_period: 30s    # Grace period
```

### Init Container Pattern
- Common in Kubernetes (init containers)
- Adapted for Docker Compose
- Ensures proper ordering

### Volume Types
- **Named volumes**: Managed by Docker (`postgres_data`)
- **Bind mounts**: Map host files (`.:/app/src`)
- **Anonymous volumes**: One-time use

## 🎓 Learning Resources

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Health Check Reference](https://docs.docker.com/engine/reference/builder/#healthcheck)
- [Init Containers (K8s pattern)](https://kubernetes.io/docs/concepts/workloads/pods/init-containers/)
- [Multi-stage Builds](https://docs.docker.com/build/building/multi-stage/)

---

**Architecture Version**: 1.0  
**Last Updated**: December 2025


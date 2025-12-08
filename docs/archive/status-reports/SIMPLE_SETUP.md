# 🚀 Simple Local Development Setup

## What You Have

**Single Kafka broker (KRaft mode)** - No Zookeeper!
- Fast: 10 second startup
- Light: ~1GB RAM
- Simple: 2 containers total

---

## Quick Start

```bash
# Start everything
./scripts/dev/start-env.sh

# Stop (keeps data)
./scripts/dev/stop-env.sh

# Reset (fresh start, removes all data)
./scripts/dev/reset-env.sh
```

Or use docker-compose directly:

```bash
# Start
docker-compose up -d

# Stop
docker-compose down

# Reset (clean slate)
docker-compose down -v && docker-compose up -d
```

---

## What's Running

```bash
docker-compose ps
```

You'll see:
- **billing_db** - PostgreSQL on port 5432
- **billing_kafka** - Kafka on port 9092

---

## Common Tasks

### View Logs
```bash
docker-compose logs -f
docker-compose logs -f kafka  # Just Kafka
```

### Kafka UI (for debugging)
```bash
# Start with Kafka UI
docker-compose --profile debug up -d

# Access at http://localhost:8080
```

### Clean Everything
```bash
docker-compose down -v
docker system prune -af --volumes
```

---

## Environment Variables

Update `.env` if you have one:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=billing_engine

# Kafka (single broker)
KAFKA_BROKERS=localhost:9092
```

---

## Tests Don't Need Kafka!

Tests use `InMemoryEventStore` (configured in `test/app-test.module.ts`):

```bash
# These work WITHOUT Kafka:
npm test                 # Unit tests
npm run test:e2e:new     # E2E tests (once we fix them)
```

Only start Kafka when:
- Running the app: `npm run start:dev`
- Testing Kafka integration specifically

---

## Troubleshooting

### Port 9092 in use
```bash
./scripts/dev/reset-env.sh
```

### Kafka won't start
```bash
docker logs billing_kafka
# Usually fixed by: docker-compose down -v && docker-compose up -d
```

### PostgreSQL issues
```bash
docker exec billing_db pg_isready -U postgres
```

---

## Why This Setup?

**Old setup:**
- 7 containers (Zookeeper + 3 Kafka brokers + extras)
- ~4GB RAM
- 2-3 minutes startup
- Complex for local development

**New setup:**
- 2 containers (PostgreSQL + Kafka)
- ~1GB RAM
- 10 seconds startup
- Perfect for local development

---

**Simple, Fast, Local!** 🎉


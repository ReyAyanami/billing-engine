# Quick Start Guide

This guide will help you get the billing engine up and running in under 5 minutes.

## Prerequisites

- Docker Desktop installed and running
- Node.js 18+ installed (optional for scriptless startup)
- Basic command-line knowledge

## ⚡ Scriptless Startup (Recommended - Fully Automated!)

> **New!** No scripts to remember. Everything starts automatically.

### Two Approaches: Choose What Works Best

**Approach 1: Combined (One Command)**
```bash
npm start
# Starts infrastructure + runs app locally with hot reload
```

**Approach 2: Separate (More Control)**
```bash
npm run env:start    # Start infrastructure (PostgreSQL, Kafka)
npm run dev          # Run app locally with hot reload
```

Both approaches automatically:
✅ Start PostgreSQL  
✅ Start Kafka  
✅ Create Kafka topics  
✅ Run database migrations  
✅ Ready for your app!

### Verify It's Running

```bash
curl http://localhost:3000/api/v1/currencies
```

You should see a list of supported currencies.

### View Logs

```bash
npm run env:logs    # Infrastructure logs
# App logs appear in your terminal where you ran npm run dev
```

### Stop Everything

```bash
npm run env:stop    # Stop infrastructure
# Ctrl+C to stop app
```

📖 **[Read the full Scriptless Startup Guide](./SCRIPTLESS_STARTUP.md)** for more details.

---

## 🚀 Staging/Production Deployment

For staging or production where everything runs in Docker:

```bash
npm run start:staging           # Interactive with logs
npm run start:staging:detached  # Background mode
```

---

## Alternative: Manual Script Method

If you prefer to run scripts manually:

### 1. Start All Services

```bash
# Start PostgreSQL, Kafka cluster, and monitoring tools
./scripts/start.sh
```

This starts all required infrastructure:
- PostgreSQL database
- Kafka cluster (3 brokers)
- Zookeeper
- Schema Registry
- Kafka UI (http://localhost:8080)
- Prometheus & Grafana

### 2. Create Kafka Topics

```bash
# Create event sourcing topics
./scripts/setup/create-topics.sh
```

### 3. Run Database Migrations

```bash
npm install
npm run migration:run
```

### 4. Start the Application

```bash
npm run dev  # Local development with hot reload
```

### 5. Verify It's Running

```bash
curl http://localhost:3000/api/v1/currencies
```

You should see a list of supported currencies.

## Alternative: Minimal Setup (Database Only)

If you just want to test the database without full orchestration:

1. **Start the database**
```bash
docker-compose up -d postgres
```

2. **Install dependencies**
```bash
npm install
```

3. **Start the application**
```bash
npm run dev
```

4. **Verify it's running**
```bash
curl http://localhost:3000/api/v1/currencies
```

## Alternative: Manual Setup (No Docker)

1. **Create PostgreSQL database**
```sql
CREATE DATABASE billing_engine;
```

2. **Create .env file**
```bash
cat > .env << EOF
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=billing_engine
PORT=3000
NODE_ENV=development
EOF
```

3. **Install and start**
```bash
npm install
npm run dev
```

## Your First Transaction

### 1. Create an account
```bash
curl -X POST http://localhost:3000/api/v1/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "ownerId": "user_001",
    "ownerType": "user",
    "currency": "USD"
  }'
```

Save the `id` from the response (we'll call it `ACCOUNT_ID`).

### 2. Add funds
```bash
curl -X POST http://localhost:3000/api/v1/transactions/topup \
  -H "Content-Type: application/json" \
  -d '{
    "idempotencyKey": "'$(uuidgen)'",
    "accountId": "ACCOUNT_ID",
    "amount": "100.00",
    "currency": "USD",
    "reference": "Initial deposit"
  }'
```

### 3. Check balance
```bash
curl http://localhost:3000/api/v1/accounts/ACCOUNT_ID/balance
```

You should see:
```json
{
  "balance": "100.00",
  "currency": "USD",
  "status": "active"
}
```

## Next Steps

### Try a Transfer

1. Create a second account
2. Transfer funds between accounts:

```bash
curl -X POST http://localhost:3000/api/v1/transactions/transfer \
  -H "Content-Type: application/json" \
  -d '{
    "idempotencyKey": "'$(uuidgen)'",
    "sourceAccountId": "ACCOUNT_1_ID",
    "destinationAccountId": "ACCOUNT_2_ID",
    "amount": "25.00",
    "currency": "USD",
    "reference": "Payment to friend"
  }'
```

### View Transaction History

```bash
curl "http://localhost:3000/api/v1/transactions?accountId=ACCOUNT_ID&limit=10"
```

## Testing

Run the test suite:

```bash
# Unit tests
npm test

# E2E tests (requires all services running)
./scripts/test/run-e2e.sh

# Run tests individually (for debugging)
./scripts/test/run-e2e-individually.sh

# Reset environment and test (clean state)
./scripts/test/reset-and-test.sh

# Coverage report
npm run test:cov
```

## Common Issues

### Services Won't Start
```bash
# Check Docker is running
docker info

# Check service status
./scripts/dev/status.sh

# View logs
./scripts/dev/logs.sh postgres -f
./scripts/dev/logs.sh kafka-1 -f
```

### Database Connection Failed
- Make sure PostgreSQL is running: `./scripts/dev/status.sh`
- Check .env file has correct credentials
- Test connection: `psql -h localhost -U postgres -d billing_engine`

### Port Already in Use
- Change PORT in .env file
- Or stop the process: `lsof -ti:3000 | xargs kill`

### Kafka Issues
```bash
# Run diagnostics
./scripts/utils/diagnose-kafka.sh

# View Kafka logs
./scripts/dev/logs.sh kafka-all -f
```

### Need a Clean Start
```bash
# Complete reset (deletes all data!)
./scripts/setup/reset.sh

# Start fresh
./scripts/start.sh
./scripts/setup/create-topics.sh
npm run migration:run
```

## Useful Commands

```bash
# Check all services status
./scripts/dev/status.sh

# View logs for any service
./scripts/dev/logs.sh <service> -f
# Examples: postgres, kafka-1, kafka-all, zookeeper

# Stop all services (preserves data)
./scripts/stop.sh

# Start all services
./scripts/start.sh

# Access PostgreSQL CLI
docker exec -it billing_engine_db psql -U postgres -d billing_engine

# Complete cleanup (removes all data)
./scripts/setup/reset.sh
```

## API Testing with Postman/Thunder Client

Import this collection to test all endpoints:

1. GET http://localhost:3000/api/v1/currencies
2. POST http://localhost:3000/api/v1/accounts
3. POST http://localhost:3000/api/v1/transactions/topup
4. POST http://localhost:3000/api/v1/transactions/withdraw
5. POST http://localhost:3000/api/v1/transactions/transfer
6. GET http://localhost:3000/api/v1/transactions?accountId={{accountId}}

## Development Tips

- Hot reload is enabled in dev mode
- Check logs in the console for detailed information
- Use different idempotency keys for each request
- All amounts are stored as strings to preserve precision
- UUIDs are used for all IDs

## Need Help?

- **Scripts Documentation**: [scripts/README.md](./scripts/README.md) - All available scripts and workflows
- **Detailed Docs**: [README.md](./README.md) - Complete documentation
- **Architecture**: [ARCHITECTURE.md](./ARCHITECTURE.md) - System design details
- **Requirements**: [REQUIREMENTS.md](./REQUIREMENTS.md) - Complete specifications
- **Kafka Setup**: [infrastructure/kafka/README.md](./infrastructure/kafka/README.md) - Kafka cluster details
- **Testing Guide**: [docs/TESTING_GUIDE.md](./docs/TESTING_GUIDE.md) - Testing documentation

## Ready for Production?

Before deploying to production:

1. ✅ Set `NODE_ENV=production`
2. ✅ Disable TypeORM synchronize
3. ✅ Add authentication (JWT/API keys)
4. ✅ Configure CORS properly
5. ✅ Set up monitoring and logging
6. ✅ Enable SSL for database connections
7. ✅ Set up database backups
8. ✅ Configure rate limiting
9. ✅ Review security settings
10. ✅ Load test the application

Happy coding! 🚀


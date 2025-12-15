# Getting Started with Billing Engine

Welcome! This guide will help you set up and run the Billing Engine in under 10 minutes.

> 🎓 **Note**: This is an educational project demonstrating CQRS, Event Sourcing, and Double-Entry Bookkeeping patterns. It's not production-ready software.

---

## Prerequisites

Before you begin, ensure you have:

- ✅ **Docker Desktop** 4.0+ ([Download](https://www.docker.com/products/docker-desktop))
- ✅ **Node.js** 18+ ([Download](https://nodejs.org/))
- ✅ **Git** ([Download](https://git-scm.com/))
- ✅ **5-10 minutes** of time

### System Requirements
- 2GB RAM minimum
- 5GB free disk space
- macOS, Linux, or Windows (with WSL2)

---

## Installation

### Step 1: Clone the Repository

```bash
git clone <your-repo-url>
cd billing-engine
```

### Step 2: Install Dependencies

```bash
npm install
```

This will install all required packages including:
- NestJS framework
- TypeORM for database access
- KafkaJS for event sourcing
- Testing utilities

### Step 3: Start Everything

```bash
npm start
```

This single command will:
1. Start PostgreSQL (port 5432)
2. Start Kafka (port 9092)
3. Wait for services to be ready
4. Run database migrations
5. Start the application (port 3000)

**Expected output:**
```
✓ PostgreSQL is ready
✓ Kafka is ready
✓ Migrations complete
✓ Billing Engine API running on port 3000
✓ Swagger documentation available at http://localhost:3000/api/docs
```

### Step 4: Verify Setup

Open a new terminal and test the API:

```bash
# Health check
curl http://localhost:3000/health

# Expected: {"status":"ok"}
```

```bash
# List available currencies
curl http://localhost:3000/api/v1/currencies

# Expected: [{"code":"USD","name":"US Dollar",...}, ...]
```

**🎉 Success!** Your billing engine is now running.

---

## Your First Workflow

Let's walk through a complete billing workflow: creating accounts, adding funds, and transferring money.

### 1. Create Two User Accounts

First, create an account for Alice:

```bash
curl -X POST http://localhost:3000/api/v1/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "ownerId": "alice",
    "ownerType": "user",
    "currency": "USD",
    "type": "USER"
  }'
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "ownerId": "alice",
  "ownerType": "user",
  "currency": "USD",
  "balance": "0",
  "status": "active",
  "type": "USER",
  "createdAt": "2025-12-09T12:00:00.000Z"
}
```

**💡 Save Alice's account ID** (the `id` field) - you'll need it for the next steps.

Now create an account for Bob:

```bash
curl -X POST http://localhost:3000/api/v1/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "ownerId": "bob",
    "ownerType": "user",
    "currency": "USD",
    "type": "USER"
  }'
```

**💡 Save Bob's account ID** as well.

### 2. Create an External Account (Bank)

External accounts represent banks, payment gateways, or other external systems:

```bash
curl -X POST http://localhost:3000/api/v1/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "ownerId": "bank-001",
    "ownerType": "system",
    "currency": "USD",
    "type": "EXTERNAL"
  }'
```

**💡 Save the external account ID** too.

### 3. Top-up Alice's Account

Add funds to Alice's account from the external bank:

```bash
curl -X POST http://localhost:3000/api/v1/transactions/topup \
  -H "Content-Type: application/json" \
  -d '{
    "idempotencyKey": "topup-alice-001",
    "destinationAccountId": "<alice-account-id>",
    "sourceAccountId": "<external-account-id>",
    "amount": "1000.00",
    "currency": "USD",
    "reference": "Initial deposit"
  }'
```

**Response:**
```json
{
  "transactionId": "660e8400-e29b-41d4-a716-446655440001",
  "status": "pending"
}
```

**⏱️ Why "pending"?** This system uses eventual consistency. The transaction is processed asynchronously through event sourcing.

### 4. Check Transaction Status

Poll the transaction endpoint to see when it completes (usually < 100ms):

```bash
curl http://localhost:3000/api/v1/transactions/660e8400-e29b-41d4-a716-446655440001
```

**Response when complete:**
```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "type": "topup",
  "status": "completed",
  "accountId": "550e8400-e29b-41d4-a716-446655440000",
  "amount": "1000.00",
  "currency": "USD",
  "reference": "Initial deposit",
  "createdAt": "2025-12-09T12:01:00.000Z",
  "completedAt": "2025-12-09T12:01:00.050Z"
}
```

### 5. Verify Alice's Balance

```bash
curl http://localhost:3000/api/v1/accounts/<alice-account-id>/balance
```

**Response:**
```json
{
  "balance": "1000.00",
  "currency": "USD",
  "status": "active"
}
```

**✅ Success!** Alice now has $1,000 in her account.

### 6. Transfer Money from Alice to Bob

Now let's transfer $250 from Alice to Bob:

```bash
curl -X POST http://localhost:3000/api/v1/transactions/transfer \
  -H "Content-Type: application/json" \
  -d '{
    "idempotencyKey": "transfer-alice-to-bob-001",
    "sourceAccountId": "<alice-account-id>",
    "destinationAccountId": "<bob-account-id>",
    "amount": "250.00",
    "currency": "USD",
    "reference": "Payment for services"
  }'
```

**Response:**
```json
{
  "sourceTransactionId": "770e8400-e29b-41d4-a716-446655440002",
  "destinationTransactionId": "770e8400-e29b-41d4-a716-446655440003",
  "status": "pending"
}
```

### 7. Verify Final Balances

Check Alice's balance:
```bash
curl http://localhost:3000/api/v1/accounts/<alice-account-id>/balance
# Expected: { "balance": "750.00", ... }
```

Check Bob's balance:
```bash
curl http://localhost:3000/api/v1/accounts/<bob-account-id>/balance
# Expected: { "balance": "250.00", ... }
```

**🎉 Congratulations!** You've successfully:
- ✅ Created three accounts (Alice, Bob, and a bank)
- ✅ Topped up Alice's account with $1,000
- ✅ Transferred $250 from Alice to Bob
- ✅ Verified balances using double-entry bookkeeping

---

## Exploring the API

### Interactive API Documentation

Open your browser to explore all available endpoints:

```
http://localhost:3000/api/docs
```

The Swagger UI provides:
- 📖 Complete API reference
- 🎮 Interactive "Try it out" feature
- 📋 Request/response examples
- 🔍 Schema definitions

### Available Operations

| Operation | Endpoint | Description |
|-----------|----------|-------------|
| Top-up | `POST /api/v1/transactions/topup` | Add funds from external source |
| Withdrawal | `POST /api/v1/transactions/withdraw` | Remove funds to external destination |
| Transfer | `POST /api/v1/transactions/transfer` | Move funds between accounts |
| Payment | `POST /api/v1/transactions/payment` | Customer-to-merchant payment |
| Refund | `POST /api/v1/transactions/refund` | Reverse a previous payment |

For detailed API documentation, see [API Reference](./docs/api/rest-api.md).

---

## Understanding the Architecture

### What Just Happened?

When you transferred money from Alice to Bob, here's what happened behind the scenes:

1. **Command Received**: REST API receives `TransferCommand`
2. **Validation**: System validates accounts exist, have sufficient balance, and matching currencies
3. **Saga Started**: Transaction saga coordinates the two-sided operation
4. **Events Published**: 
   - `TransferRequested` event published to Kafka
   - Two `BalanceChanged` events (one debit, one credit)
   - `TransferCompleted` event
5. **Projections Updated**: Event handlers update read models (account and transaction projections)
6. **Response Returned**: API returns transaction IDs

### Key Concepts

#### CQRS (Command Query Responsibility Segregation)
- **Commands** (Write): `TopupCommand`, `TransferCommand`, etc.
- **Queries** (Read): `GetAccountQuery`, `GetTransactionQuery`, etc.
- **Benefit**: Optimized read and write models

#### Event Sourcing
- All changes captured as events in Kafka
- Complete audit trail: every balance change is recorded
- Events can be replayed to rebuild state

#### Double-Entry Bookkeeping
- Every transaction has two sides (debit and credit)
- Balances always reconcile
- Financial accuracy guaranteed

Want to learn more? See [Architecture Documentation](./docs/architecture/system-design.md).

---

## Real-Time Events (SSE)

Subscribe to live account updates using Server-Sent Events:

```javascript
// In your browser console or Node.js
const eventSource = new EventSource('http://localhost:3000/api/v1/events/accounts/<alice-account-id>');

eventSource.addEventListener('balance.changed', (event) => {
  const data = JSON.parse(event.data);
  console.log('Balance updated:', data);
});
```

Now any balance changes on Alice's account will appear in real-time!

Learn more in [Events API Documentation](./docs/api/events.md).

---

## Testing Idempotency

Try submitting the same transaction twice:

```bash
# First request
curl -X POST http://localhost:3000/api/v1/transactions/topup \
  -H "Content-Type: application/json" \
  -d '{
    "idempotencyKey": "duplicate-test-001",
    "destinationAccountId": "<alice-account-id>",
    "sourceAccountId": "<external-account-id>",
    "amount": "100.00",
    "currency": "USD"
  }'

# Second request (same idempotency key)
curl -X POST http://localhost:3000/api/v1/transactions/topup \
  -H "Content-Type: application/json" \
  -d '{
    "idempotencyKey": "duplicate-test-001",
    "destinationAccountId": "<alice-account-id>",
    "sourceAccountId": "<external-account-id>",
    "amount": "100.00",
    "currency": "USD"
  }'
```

**Result**: The second request will fail with a `409 Conflict` error, preventing duplicate transactions.

---

## Common Commands

### Managing Infrastructure

```bash
# Stop all services
npm run env:stop

# Start services only (without the app)
npm run env:start

# View service logs
npm run env:logs

# Check service status
npm run env:status

# Clean up (removes data volumes)
npm run env:clean
```

### Development

```bash
# Run in development mode with hot reload
npm run dev

# Run with debugger
npm run dev:debug

# Run tests
npm test

# Run tests with coverage
npm run test:cov
```

### Database Migrations

```bash
# Run pending migrations
npm run migration:run

# Revert last migration
npm run migration:revert

# Show migration status
npm run migration:show
```

---

## Troubleshooting

### Port Already in Use

If you see "Port 3000 already in use":

```bash
# Find and kill the process
lsof -ti:3000 | xargs kill -9
```

Or change the port:
```bash
PORT=3001 npm start
```

### Docker Services Not Starting

```bash
# Check Docker is running
docker ps

# If not, start Docker Desktop and try again
npm run env:start
```

### PostgreSQL Connection Failed

```bash
# Check PostgreSQL container
docker ps | grep postgres

# View logs
docker logs billing-engine-postgres-1

# Restart services
npm run env:stop
npm run env:clean
npm run env:start
```

### Kafka Not Ready

Kafka takes 20-30 seconds to fully start. Wait a bit and try again:

```bash
# Check Kafka logs
docker logs billing-engine-kafka-1
```

### Migration Errors

```bash
# Reset database (⚠️ deletes all data)
npm run env:clean
npm run env:start
npm run migration:run
```

---

## Next Steps

Now that you're up and running, explore further:

### 📚 Learn the Concepts
- [System Architecture](./docs/architecture/system-design.md) - Understand how it all fits together
- [CQRS Pattern](./docs/architecture/cqrs-pattern.md) - Learn about command/query separation
- [Event Sourcing](./docs/architecture/event-sourcing.md) - Discover the event store
- [Double-Entry Bookkeeping](./docs/architecture/double-entry.md) - Financial accuracy explained

### 🔧 Development
- [Local Development Setup](./docs/development/local-setup.md) - Configure your dev environment
- [Testing Guide](./docs/development/testing.md) - Write and run tests
- [Debugging Guide](./docs/development/debugging.md) - Debug like a pro

### 📖 API Deep Dive
- [REST API Reference](./docs/api/rest-api.md) - Complete API documentation
- [Account API](./docs/api/accounts.md) - Account management endpoints
- [Transaction API](./docs/api/transactions.md) - All transaction operations

### 🎓 Understanding WHY
- [Project Philosophy](./PROJECT_PHILOSOPHY.md) - Why this project exists and what it teaches

---

## Getting Help

- 📖 Check the [documentation](./docs/README.md)
- 🐛 Review [common issues](./docs/guides/troubleshooting.md)
- 💬 Open an issue on GitHub
- 📧 Ask questions in discussions

Remember: This is a learning project. Questions and discussions help everyone learn!

---

**Ready to dive deeper?** Check out the [architecture documentation](./docs/architecture/system-design.md) to understand how CQRS, Event Sourcing, and Double-Entry Bookkeeping work together! 🚀


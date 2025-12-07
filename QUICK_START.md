# Quick Start Guide

This guide will help you get the billing engine up and running in under 5 minutes.

## Prerequisites

- Docker installed (easiest way)
- OR Node.js 18+ and PostgreSQL 14+

## Option 1: Quick Start with Docker (Recommended)

1. **Start the database**
```bash
docker-compose up -d
```

2. **Install dependencies**
```bash
npm install
```

3. **Start the application**
```bash
npm run start:dev
```

4. **Verify it's running**
```bash
curl http://localhost:3000/api/v1/currencies
```

You should see a list of supported currencies.

## Option 2: Manual Setup

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
npm run start:dev
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

# E2E tests (requires database to be running)
npm run test:e2e

# Coverage report
npm run test:cov
```

## Common Issues

### Database Connection Failed
- Make sure PostgreSQL is running: `docker-compose ps`
- Check .env file has correct credentials
- Test connection: `psql -h localhost -U postgres -d billing_engine`

### Port Already in Use
- Change PORT in .env file
- Or stop the process using port 3000: `lsof -ti:3000 | xargs kill`

### TypeORM Synchronize Not Working
- Drop and recreate the database:
```bash
docker-compose down -v
docker-compose up -d
```

## Useful Commands

```bash
# View logs
docker-compose logs -f postgres

# Access PostgreSQL CLI
docker exec -it billing_engine_db psql -U postgres -d billing_engine

# Restart everything
docker-compose restart

# Clean up
docker-compose down -v
npm run build
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

- Check [README.md](./README.md) for detailed documentation
- Review [ARCHITECTURE.md](./ARCHITECTURE.md) for system design
- See [REQUIREMENTS.md](./REQUIREMENTS.md) for complete specifications

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


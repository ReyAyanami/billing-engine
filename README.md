# Billing Engine

A production-grade billing system demonstrating best practices in financial transaction management. Built with NestJS, TypeORM, and PostgreSQL.

> **🎯 Version 2.0 - Double-Entry Bookkeeping System**  
> This engine implements true double-entry bookkeeping where every transaction has both a source and destination account, ensuring complete auditability and compliance with accounting standards.  
> 📖 [Learn about the double-entry design](./docs/DOUBLE_ENTRY_DESIGN.md) | ⚠️ [Breaking changes from v1](./docs/BREAKING_CHANGES_V2.md)

## 📋 Overview

This billing engine provides both HTTP REST APIs and programmatic interfaces for managing financial transactions. It's designed to be embedded in larger systems that require billing capabilities.

All financial operations follow double-entry accounting principles:
- **Top-ups**: External Account → User Account  
- **Withdrawals**: User Account → External Account  
- **Transfers**: User Account A → User Account B  
- **Refunds**: Destination Account → Source Account (reversal)

## ✨ Features

### Core Functionality
- ✅ **Account Management**: Create and manage accounts with three types:
  - **USER**: End-user accounts with balance limits
  - **EXTERNAL**: External services (banks, payment gateways)
  - **SYSTEM**: Internal accounts (fees, reserves)
- ✅ **Top-up**: Add funds from external sources to user accounts
- ✅ **Withdrawal**: Send funds from user accounts to external destinations
- ✅ **Transfers**: Move funds between accounts atomically
- ✅ **Payments**: Process payments with metadata support
- ✅ **Refunds**: Full or partial refunds of transactions (automatic reversal)
- ✅ **Multi-Currency**: Support for fiat (USD, EUR, GBP) and non-fiat currencies (BTC, ETH, Points)
- ✅ **Balance Limits**: Optional min/max balance enforcement on user accounts

### Non-Functional Features
- 🔒 **ACID Compliance**: All transactions use database transactions with pessimistic locking
- 📝 **Auditability**: Complete audit trail for all operations
- 🔄 **Idempotency**: Duplicate transaction prevention using idempotency keys
- ⚡ **Performance**: Optimized with strategic indexing and connection pooling
- 🛡️ **Error Handling**: Comprehensive error handling with meaningful error messages
- 🧪 **Test Coverage**: Unit tests and E2E tests for core functionality

## 🏗️ Architecture

### High-Level Structure
```
┌─────────────────┐
│   HTTP REST API │
└────────┬────────┘
         │
┌────────▼────────┐
│  Service Layer  │
│  - Transaction  │
│  - Account      │
│  - Audit        │
└────────┬────────┘
         │
┌────────▼────────┐
│  Data Layer     │
│  - PostgreSQL   │
└─────────────────┘
```

### Key Design Principles
- **True Double-Entry Bookkeeping**: Every transaction records both source and destination, with complete balance tracking on both sides
- **Three Account Types**: User, External, and System accounts for proper financial modeling
- **Pessimistic Locking**: Prevents race conditions in concurrent transactions
- **Deterministic Lock Ordering**: Accounts locked in sorted order to prevent deadlocks
- **Complete Auditability**: Full balance history for every account in every transaction
- **Immutable Audit Log**: Append-only audit trail for compliance

## 📚 Documentation

For detailed documentation, see:
- **Core Documentation:**
  - [REQUIREMENTS.md](./REQUIREMENTS.md) - Complete requirements specification
  - [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture and design
  - [DATA_MODEL.md](./DATA_MODEL.md) - Database schema and data structures
- **Design Documentation:**
  - [DOUBLE_ENTRY_DESIGN.md](./docs/DOUBLE_ENTRY_DESIGN.md) - Double-entry bookkeeping implementation
  - [FOREIGN_KEYS.md](./docs/FOREIGN_KEYS.md) - Foreign key design decisions
  - [BREAKING_CHANGES_V2.md](./docs/BREAKING_CHANGES_V2.md) - Migration guide from v1 to v2
- **Development:**
  - [QUICK_START.md](./QUICK_START.md) - Quick start guide
  - [src/migrations/README.md](./src/migrations/README.md) - Database migrations guide

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- PostgreSQL 14+
- Docker (optional, for easy database setup)

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd billing-engine
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up PostgreSQL database**

Using Docker:
```bash
docker-compose up -d
```

Or manually create a database:
```sql
CREATE DATABASE billing_engine;
```

4. **Configure environment variables**

Create a `.env` file in the root directory:
```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=billing_engine
DB_SSL=false

PORT=3000
NODE_ENV=development
```

5. **Run database migrations**

For production or if you want to use migrations in development:
```bash
# Run migrations
npm run migration:run

# For development with auto-sync (default)
# Just start the app, schema will be created automatically
```

To use migrations in development, set `USE_MIGRATIONS=true` in your `.env` file.

6. **Start the application**
```bash
# Development mode with hot reload
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

The API will be available at `http://localhost:3000`

## 🧪 Testing

```bash
# Unit tests
npm run test

# E2E tests (requires running database)
npm run test:e2e

# Test coverage
npm run test:cov
```

## 🗄️ Database Migrations

### Available Migration Commands

```bash
# Run all pending migrations
npm run migration:run

# Revert the last migration
npm run migration:revert

# Show migration status
npm run migration:show

# Generate a new migration from entity changes
npm run migration:generate -- src/migrations/MigrationName

# Create an empty migration
npm run migration:create -- src/migrations/MigrationName
```

### Migration Modes

**Development (default):**
- Uses `synchronize: true` - schema auto-updates
- No migrations needed unless you set `USE_MIGRATIONS=true`

**Production:**
- Uses migrations automatically
- `synchronize` is disabled for safety
- Migrations run on application startup

### Initial Schema

The project includes an initial migration that creates:
- All 4 tables (currencies, accounts, transactions, audit_logs)
- All indexes and constraints
- Default currency data (USD, EUR, GBP, BTC, ETH, POINTS)

For more details, see [src/migrations/README.md](./src/migrations/README.md)

## 📖 API Usage Examples

### Create an Account
```bash
curl -X POST http://localhost:3000/api/v1/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "ownerId": "user_123",
    "ownerType": "user",
    "currency": "USD",
    "metadata": {
      "accountName": "Primary Account"
    }
  }'
```

Response:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "ownerId": "user_123",
  "ownerType": "user",
  "currency": "USD",
  "balance": "0",
  "status": "active",
  "createdAt": "2025-12-07T10:00:00.000Z"
}
```

### Top-up an Account
```bash
curl -X POST http://localhost:3000/api/v1/transactions/topup \
  -H "Content-Type: application/json" \
  -d '{
    "idempotencyKey": "550e8400-e29b-41d4-a716-446655440001",
    "accountId": "550e8400-e29b-41d4-a716-446655440000",
    "amount": "1000.00",
    "currency": "USD",
    "reference": "Initial deposit"
  }'
```

Response:
```json
{
  "transactionId": "660e8400-e29b-41d4-a716-446655440002",
  "accountId": "550e8400-e29b-41d4-a716-446655440000",
  "amount": "1000",
  "currency": "USD",
  "balanceAfter": "1000",
  "status": "completed",
  "createdAt": "2025-12-07T10:05:00.000Z"
}
```

### Transfer Between Accounts
```bash
curl -X POST http://localhost:3000/api/v1/transactions/transfer \
  -H "Content-Type: application/json" \
  -d '{
    "idempotencyKey": "770e8400-e29b-41d4-a716-446655440003",
    "sourceAccountId": "550e8400-e29b-41d4-a716-446655440000",
    "destinationAccountId": "880e8400-e29b-41d4-a716-446655440004",
    "amount": "250.00",
    "currency": "USD",
    "reference": "Payment for services"
  }'
```

### Get Account Balance
```bash
curl http://localhost:3000/api/v1/accounts/550e8400-e29b-41d4-a716-446655440000/balance
```

Response:
```json
{
  "balance": "750.00",
  "currency": "USD",
  "status": "active"
}
```

### Get Transaction History
```bash
curl "http://localhost:3000/api/v1/transactions?accountId=550e8400-e29b-41d4-a716-446655440000&limit=10"
```

## 🔌 Programmatic API Usage

The billing engine can also be used programmatically within your NestJS application:

```typescript
import { TransactionService } from './modules/transaction/transaction.service';
import { AccountService } from './modules/account/account.service';

@Injectable()
export class YourService {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly accountService: AccountService,
  ) {}

  async processPayment(userId: string, amount: string) {
    // Create account if needed
    const account = await this.accountService.create(
      {
        ownerId: userId,
        ownerType: 'user',
        currency: 'USD',
      },
      context,
    );

    // Process top-up
    const result = await this.transactionService.topup(
      {
        idempotencyKey: generateUUID(),
        accountId: account.id,
        amount,
        currency: 'USD',
        reference: 'Payment processed',
      },
      context,
    );

    return result;
  }
}
```

## 📊 API Endpoints

### Account Management
- `POST /api/v1/accounts` - Create account
- `GET /api/v1/accounts/:id` - Get account details
- `GET /api/v1/accounts?ownerId=&ownerType=` - Get accounts by owner
- `GET /api/v1/accounts/:id/balance` - Get account balance
- `PATCH /api/v1/accounts/:id/status` - Update account status

### Transactions
- `POST /api/v1/transactions/topup` - Top-up account
- `POST /api/v1/transactions/withdraw` - Withdraw from account
- `POST /api/v1/transactions/transfer` - Transfer between accounts
- `POST /api/v1/transactions/refund` - Refund a transaction
- `GET /api/v1/transactions/:id` - Get transaction details
- `GET /api/v1/transactions?accountId=` - Get transaction history

### Currency
- `GET /api/v1/currencies` - List supported currencies
- `GET /api/v1/currencies/:code` - Get currency details

## 🛡️ Error Handling

All errors follow a consistent format:

```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Account balance is insufficient for this operation",
    "details": {
      "accountId": "550e8400-e29b-41d4-a716-446655440000",
      "requestedAmount": "1000.00",
      "availableBalance": "500.00"
    },
    "timestamp": "2025-12-07T10:00:00.000Z"
  }
}
```

Common error codes:
- `ACCOUNT_NOT_FOUND` - Account doesn't exist
- `INSUFFICIENT_BALANCE` - Not enough funds
- `INVALID_CURRENCY` - Currency not supported or inactive
- `CURRENCY_MISMATCH` - Transaction currency doesn't match account
- `DUPLICATE_TRANSACTION` - Idempotency key already used
- `ACCOUNT_INACTIVE` - Account is suspended or closed
- `INVALID_OPERATION` - Operation not allowed

## 🔐 Security Considerations

- ✅ Input validation using class-validator
- ✅ SQL injection prevention via TypeORM parameterized queries
- ✅ CORS enabled (configure for production)
- ✅ Decimal precision handling for financial calculations
- ⚠️ Authentication/Authorization not implemented (add JWT or API keys for production)

## 📈 Performance

- Optimized database queries with strategic indexing
- Connection pooling for PostgreSQL
- Pessimistic locking only on critical sections
- Efficient balance calculations using Decimal.js

Expected performance:
- Simple operations (topup, withdrawal): < 100ms (p95)
- Complex operations (transfers): < 200ms (p95)
- Throughput: 1000+ transactions/second (with proper infrastructure)

## 🧰 Technology Stack

- **Framework**: NestJS 11
- **Language**: TypeScript 5
- **Database**: PostgreSQL 14+
- **ORM**: TypeORM
- **Validation**: class-validator, class-transformer
- **Testing**: Jest, Supertest
- **Decimal Math**: decimal.js

## 🤝 Contributing

This is a demonstration project. Feel free to fork and modify for your needs.

## 📝 License

UNLICENSED - This is a demonstration project for educational purposes.

## 🎯 Future Enhancements

- [ ] Authentication & Authorization (JWT, API Keys)
- [ ] Multi-currency conversion with exchange rates
- [ ] Scheduled reconciliation jobs
- [ ] Advanced reporting and analytics
- [ ] Event sourcing with event store
- [ ] Message queue integration for async processing
- [ ] Rate limiting and throttling
- [ ] Webhook notifications
- [ ] GraphQL API
- [ ] Admin dashboard

## 📧 Support

For questions or issues, please open an issue in the repository.

---

Built with ❤️ using NestJS

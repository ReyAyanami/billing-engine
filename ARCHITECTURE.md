# Billing System Architecture

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        API Layer                             │
│  ┌────────────────┐              ┌────────────────┐         │
│  │ HTTP REST API  │              │ Programmatic   │         │
│  │  (Controllers) │              │   API (Direct) │         │
│  └────────┬───────┘              └────────┬───────┘         │
└───────────┼──────────────────────────────┼─────────────────┘
            │                              │
            └──────────────┬───────────────┘
                          │
┌─────────────────────────┼─────────────────────────────────┐
│                   Service Layer                            │
│  ┌─────────────────────┴──────────────────────────┐       │
│  │          Transaction Coordinator Service        │       │
│  │  (Orchestrates operations, ensures consistency) │       │
│  └──────────┬─────────────────┬──────────┬────────┘       │
│             │                 │          │                 │
│  ┌──────────▼──────┐ ┌────────▼─────┐  ┌▼────────────┐   │
│  │ Account Service │ │  Transaction │  │    Audit    │   │
│  │                 │ │   Service    │  │   Service   │   │
│  └──────────┬──────┘ └────────┬─────┘  └┬────────────┘   │
└────────────┼───────────────────┼─────────┼─────────────────┘
             │                   │         │
┌────────────┼───────────────────┼─────────┼─────────────────┐
│            │   Data Layer      │         │                 │
│  ┌─────────▼────────┐ ┌────────▼─────┐  ┌▼────────────┐   │
│  │  Account Entity  │ │ Transaction  │  │  Audit Log  │   │
│  │   (PostgreSQL)   │ │    Entity    │  │   Entity    │   │
│  └──────────────────┘ └──────────────┘  └─────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## 2. Module Structure

### 2.1 Core Modules

#### AccountModule
- **Responsibility**: Account lifecycle management
- **Services**: AccountService
- **Controllers**: AccountController (HTTP API)
- **Entities**: Account
- **Key Operations**:
  - Create account
  - Get account details
  - Update account status
  - Check balance

#### TransactionModule
- **Responsibility**: Transaction processing and management
- **Services**: TransactionService
- **Controllers**: TransactionController (HTTP API)
- **Entities**: Transaction
- **Key Operations**:
  - Top-up
  - Withdrawal
  - Transfer
  - Payment
  - Refund
  - Cancel
  - Get transaction history

#### AuditModule
- **Responsibility**: Audit logging and compliance
- **Services**: AuditService
- **Controllers**: AuditController (read-only queries)
- **Entities**: AuditLog
- **Key Operations**:
  - Log operation
  - Query audit trail
  - Export audit logs

#### CurrencyModule
- **Responsibility**: Currency configuration and validation
- **Services**: CurrencyService
- **Entities**: Currency (configuration)
- **Key Operations**:
  - Validate currency
  - Get currency precision
  - List supported currencies

### 2.2 Supporting Modules

#### DatabaseModule
- Database configuration
- Connection management
- Transaction management

#### ConfigModule
- Environment configuration
- Feature flags
- System parameters

## 3. Data Flow Patterns

### 3.1 Simple Operation (Top-up)

```
Client Request
    │
    ▼
Controller (validation, auth)
    │
    ▼
TransactionService
    │
    ├──► AuditService.log("OPERATION_STARTED")
    │
    ├──► AccountService.findAndLock(accountId)
    │
    ├──► Validate business rules
    │
    ├──► Create transaction record (PENDING)
    │
    ├──► Update account balance
    │
    ├──► Update transaction status (COMPLETED)
    │
    ├──► AuditService.log("OPERATION_COMPLETED")
    │
    └──► Commit transaction
    │
    ▼
Response to Client
```

### 3.2 Complex Operation (Transfer)

```
Client Request
    │
    ▼
Controller
    │
    ▼
TransactionService.transfer()
    │
    ├──► AuditService.log("TRANSFER_STARTED")
    │
    ├──► BEGIN DATABASE TRANSACTION
    │    │
    │    ├──► AccountService.findAndLock(sourceAccountId)
    │    │
    │    ├──► AccountService.findAndLock(destAccountId)
    │    │
    │    ├──► Validate business rules
    │    │
    │    ├──► Create debit transaction (PENDING)
    │    │
    │    ├──► Create credit transaction (PENDING)
    │    │
    │    ├──► Update source account balance
    │    │
    │    ├──► Update destination account balance
    │    │
    │    ├──► Update both transactions (COMPLETED)
    │    │
    │    └──► COMMIT
    │
    ├──► AuditService.log("TRANSFER_COMPLETED")
    │
    ▼
Response with both transaction IDs
```

## 4. Database Schema

### 4.1 Tables

#### accounts
```sql
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id VARCHAR(255) NOT NULL,
    owner_type VARCHAR(50) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    balance DECIMAL(20, 8) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 1,
    
    CONSTRAINT balance_non_negative CHECK (balance >= 0),
    INDEX idx_accounts_owner (owner_id, owner_type),
    INDEX idx_accounts_status (status),
    INDEX idx_accounts_created_at (created_at)
);
```

#### transactions
```sql
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key UUID UNIQUE NOT NULL,
    type VARCHAR(50) NOT NULL,
    account_id UUID NOT NULL REFERENCES accounts(id),
    counterparty_account_id UUID REFERENCES accounts(id),
    amount DECIMAL(20, 8) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    balance_before DECIMAL(20, 8) NOT NULL,
    balance_after DECIMAL(20, 8) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    reference VARCHAR(500),
    metadata JSONB,
    parent_transaction_id UUID REFERENCES transactions(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP,
    
    CONSTRAINT amount_positive CHECK (amount > 0),
    INDEX idx_transactions_account (account_id),
    INDEX idx_transactions_idempotency (idempotency_key),
    INDEX idx_transactions_status (status),
    INDEX idx_transactions_created_at (created_at),
    INDEX idx_transactions_parent (parent_transaction_id)
);
```

#### audit_logs
```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    operation VARCHAR(50) NOT NULL,
    actor_id VARCHAR(255),
    actor_type VARCHAR(50),
    changes JSONB NOT NULL,
    correlation_id UUID NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    
    INDEX idx_audit_logs_entity (entity_type, entity_id),
    INDEX idx_audit_logs_correlation (correlation_id),
    INDEX idx_audit_logs_timestamp (timestamp),
    INDEX idx_audit_logs_operation (operation)
);
```

#### currencies
```sql
CREATE TABLE currencies (
    code VARCHAR(10) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL, -- 'fiat' or 'non-fiat'
    precision INTEGER NOT NULL DEFAULT 2,
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB,
    
    INDEX idx_currencies_type (type),
    INDEX idx_currencies_active (is_active)
);
```

### 4.2 Isolation Levels

- **READ COMMITTED** for read operations
- **SERIALIZABLE** for critical write operations (transfers)
- **Row-level locking** using SELECT FOR UPDATE for account modifications

## 5. Error Handling Strategy

### 5.1 Error Types

```typescript
class BillingError extends Error {
  constructor(
    public code: string,
    public message: string,
    public httpStatus: number
  ) {}
}

// Specific error types
- AccountNotFoundError
- InsufficientBalanceError
- InvalidCurrencyError
- InvalidOperationError
- DuplicateTransactionError
- AccountInactiveError
- TransactionNotFoundError
```

### 5.2 Error Response Format

```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Account balance is insufficient for this operation",
    "details": {
      "account_id": "123e4567-e89b-12d3-a456-426614174000",
      "requested_amount": 100.00,
      "available_balance": 50.00
    },
    "timestamp": "2025-12-07T10:00:00Z",
    "correlation_id": "abc-123-def"
  }
}
```

## 6. Transaction Isolation Strategy

### 6.1 Pessimistic Locking
- Use for account balance updates
- SELECT FOR UPDATE to prevent race conditions
- Lock accounts in consistent order (by ID) to prevent deadlocks

### 6.2 Idempotency
- Client provides idempotency key (UUID)
- Store key with transaction
- Return existing transaction if duplicate key detected
- TTL: 24 hours for idempotency key storage

### 6.3 Retry Logic
- Automatic retry for deadlock situations (max 3 attempts)
- Exponential backoff for transient failures
- No retry for business logic errors

## 7. Performance Optimizations

### 7.1 Database Level
- **Indexing**: All foreign keys and frequently queried fields
- **Connection Pooling**: 20-50 connections per instance
- **Prepared Statements**: Query plan caching
- **Partitioning**: Transaction table by date (for future scalability)

### 7.2 Application Level
- **Caching**: Account status, currency configurations (Redis optional)
- **Batch Operations**: Bulk inserts for audit logs
- **Lazy Loading**: Metadata and related entities
- **Pagination**: Default limit of 50 items

### 7.3 Monitoring
- Query performance metrics
- Transaction duration tracking
- Error rate monitoring
- Balance reconciliation jobs

## 8. API Design

### 8.1 REST Endpoints

```
POST   /api/v1/accounts              - Create account
GET    /api/v1/accounts/:id          - Get account details
PATCH  /api/v1/accounts/:id/status   - Update account status
GET    /api/v1/accounts/:id/balance  - Get balance

POST   /api/v1/transactions/topup    - Top-up account
POST   /api/v1/transactions/withdraw - Withdraw from account
POST   /api/v1/transactions/transfer - Transfer between accounts
POST   /api/v1/transactions/payment  - Process payment
POST   /api/v1/transactions/refund   - Refund transaction
POST   /api/v1/transactions/:id/cancel - Cancel transaction
GET    /api/v1/transactions/:id      - Get transaction details
GET    /api/v1/transactions          - List transactions (paginated)

GET    /api/v1/audit-logs            - Query audit logs
GET    /api/v1/audit-logs/:id        - Get specific audit log

GET    /api/v1/currencies            - List supported currencies
GET    /api/v1/currencies/:code      - Get currency details
```

### 8.2 Request/Response Examples

#### Create Account
```
POST /api/v1/accounts
{
  "owner_id": "user_12345",
  "owner_type": "user",
  "currency": "USD",
  "metadata": {
    "account_name": "Primary Account"
  }
}

Response: 201 Created
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "owner_id": "user_12345",
  "owner_type": "user",
  "currency": "USD",
  "balance": "0.00",
  "status": "active",
  "created_at": "2025-12-07T10:00:00Z"
}
```

#### Top-up
```
POST /api/v1/transactions/topup
{
  "idempotency_key": "abc-123-def",
  "account_id": "123e4567-e89b-12d3-a456-426614174000",
  "amount": "100.00",
  "currency": "USD",
  "reference": "Initial deposit"
}

Response: 201 Created
{
  "transaction_id": "456e7890-e89b-12d3-a456-426614174000",
  "type": "topup",
  "account_id": "123e4567-e89b-12d3-a456-426614174000",
  "amount": "100.00",
  "currency": "USD",
  "balance_after": "100.00",
  "status": "completed",
  "created_at": "2025-12-07T10:05:00Z"
}
```

## 9. Deployment Architecture

### 9.1 Components
- **API Instances**: Multiple stateless instances behind load balancer
- **Database**: PostgreSQL primary + read replicas
- **Cache** (optional): Redis for session and configuration caching
- **Monitoring**: Prometheus + Grafana
- **Logging**: ELK stack or CloudWatch

### 9.2 Scalability
- Horizontal scaling of API instances
- Database read replicas for queries
- Database sharding by account range (future)
- Async processing queue for heavy operations (future)

## 10. Security Considerations

### 10.1 Authentication
- API Key authentication for service-to-service
- JWT tokens for user requests
- Rate limiting per API key/user

### 10.2 Authorization
- Account ownership verification
- Role-based permissions
- Audit trail of all access

### 10.3 Data Security
- Encryption at rest (database level)
- Encryption in transit (TLS)
- Sensitive data masking in logs
- Input validation and sanitization

## 11. Testing Strategy

### 11.1 Unit Tests
- Service logic in isolation
- Business rule validation
- Error handling

### 11.2 Integration Tests
- Database operations
- Transaction rollback scenarios
- Concurrent operation handling

### 11.3 E2E Tests
- Complete user flows
- API endpoint testing
- Error scenarios

### 11.4 Performance Tests
- Load testing (JMeter, k6)
- Stress testing
- Endurance testing

## 12. Monitoring and Observability

### 12.1 Metrics
- Request rate and latency
- Error rates by type
- Database connection pool usage
- Transaction success/failure rates
- Balance reconciliation status

### 12.2 Logging
- Structured JSON logs
- Correlation IDs for request tracing
- Log levels: DEBUG, INFO, WARN, ERROR
- No sensitive data in logs

### 12.3 Alerting
- High error rates
- Slow response times
- Database connection issues
- Balance inconsistencies


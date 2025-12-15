# REST API Reference

## Overview

The Billing Engine provides a RESTful HTTP API for managing accounts, processing transactions, and querying data. This document covers API conventions, error handling, and general usage patterns.

> 📖 **Interactive Documentation**: Visit `http://localhost:3000/api/docs` for Swagger UI with live testing capabilities.

---

## Base URL

```
http://localhost:3000/api/v1
```

**Versioning**: API is versioned in the URL path (`/api/v1/`). Future versions will use `/api/v2/`, etc.

---

## Authentication

⚠️ **Not Yet Implemented**: This educational project doesn't include authentication.

**For Production**, you would add:
- JWT tokens in `Authorization: Bearer <token>` header
- API keys for service-to-service communication
- OAuth 2.0 for third-party integrations

---

## Request Format

### Content Type

All requests with a body must use JSON:

```
Content-Type: application/json
```

### Request Headers

```http
Content-Type: application/json
Accept: application/json
```

**Optional (but recommended)**:
```http
X-Correlation-ID: <uuid>  # For request tracing
```

If not provided, the API will generate one automatically.

---

## Response Format

### Success Response

All successful responses return JSON:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "ownerId": "user_123",
  "ownerType": "user",
  "currency": "USD",
  "balance": "100.50",
  "status": "active",
  "type": "USER",
  "createdAt": "2025-12-09T12:00:00.000Z",
  "updatedAt": "2025-12-09T12:00:00.000Z"
}
```

### Error Response

All errors follow a consistent format:

```json
{
  "statusCode": 404,
  "message": "Account not found",
  "error": "Not Found",
  "timestamp": "2025-12-09T12:00:00.000Z",
  "path": "/api/v1/accounts/550e8400-e29b-41d4-a716-446655440000",
  "correlationId": "c0rr-e1at-10n-1d"
}
```

**Error Fields**:
- `statusCode` - HTTP status code
- `message` - Human-readable error message
- `error` - Error type
- `timestamp` - When error occurred
- `path` - Request path that caused error
- `correlationId` - Trace ID for debugging

---

## HTTP Status Codes

### Success Codes

| Code | Meaning | Usage |
|------|---------|-------|
| 200 | OK | Successful GET, PATCH |
| 201 | Created | Successful POST (resource created) |
| 204 | No Content | Successful DELETE (not used currently) |

### Client Error Codes

| Code | Meaning | Usage |
|------|---------|-------|
| 400 | Bad Request | Invalid input, validation failed |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate transaction (idempotency key already used) |
| 422 | Unprocessable Entity | Business rule violation |

### Server Error Codes

| Code | Meaning | Usage |
|------|---------|-------|
| 500 | Internal Server Error | Unexpected server error |
| 503 | Service Unavailable | Service temporarily unavailable |

---

## Common Error Codes

### Application-Specific Errors

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| `ACCOUNT_NOT_FOUND` | 404 | Account ID doesn't exist |
| `INSUFFICIENT_BALANCE` | 400 | Account balance too low |
| `INVALID_CURRENCY` | 400 | Currency not supported |
| `CURRENCY_MISMATCH` | 400 | Currency doesn't match account |
| `DUPLICATE_TRANSACTION` | 409 | Idempotency key already used |
| `ACCOUNT_INACTIVE` | 400 | Account is suspended or closed |
| `INVALID_OPERATION` | 400 | Operation not allowed |
| `INVALID_AMOUNT` | 400 | Amount must be positive |
| `SAME_ACCOUNT_TRANSFER` | 400 | Cannot transfer to same account |
| `TRANSACTION_NOT_FOUND` | 404 | Transaction ID doesn't exist |

### Example Error Responses

**Account Not Found**:
```json
{
  "statusCode": 404,
  "message": "Account with ID 550e8400-e29b-41d4-a716-446655440000 not found",
  "error": "Not Found",
  "timestamp": "2025-12-09T12:00:00.000Z",
  "path": "/api/v1/accounts/550e8400-e29b-41d4-a716-446655440000"
}
```

**Insufficient Balance**:
```json
{
  "statusCode": 400,
  "message": "Insufficient balance: current 50.00, attempting to withdraw 100.00",
  "error": "Bad Request",
  "timestamp": "2025-12-09T12:00:00.000Z",
  "path": "/api/v1/transactions/withdraw"
}
```

**Duplicate Transaction**:
```json
{
  "statusCode": 409,
  "message": "Transaction with idempotency key 'key-123' already exists (ID: tx-uuid)",
  "error": "Conflict",
  "timestamp": "2025-12-09T12:00:00.000Z",
  "path": "/api/v1/transactions/topup"
}
```

---

## Idempotency

Financial operations must be **idempotent** (safe to retry).

### Idempotency Key

All write operations accept an `idempotencyKey` field:

```json
{
  "idempotencyKey": "550e8400-e29b-41d4-a716-446655440000",
  "destinationAccountId": "...",
  "amount": "100.00",
  "currency": "USD"
}
```

**How it Works**:
1. Client generates UUID for the operation
2. API checks if key already exists
3. If exists: Returns `409 Conflict` with existing transaction ID
4. If new: Processes transaction and stores key

**Best Practice**:
```typescript
// Generate once, store with request
const idempotencyKey = uuidv4();

try {
  await api.topup({ idempotencyKey, ...data });
} catch (error) {
  if (error.status === 409) {
    // Already processed, safe to ignore or retrieve existing
    console.log('Transaction already exists:', error.transactionId);
  } else {
    // Real error, handle appropriately
    throw error;
  }
}
```

---

## Eventual Consistency

This API uses **CQRS with Event Sourcing**, which means:

### Async Processing

Most write operations return immediately with `"status": "pending"`:

```json
{
  "transactionId": "tx-uuid",
  "status": "pending"
}
```

### Polling for Completion

Client must poll to check status:

```typescript
// 1. Submit transaction
const { transactionId } = await api.topup(data);

// 2. Poll until complete
let status = 'pending';
while (status === 'pending') {
  await sleep(100);  // Wait 100ms
  
  const tx = await api.getTransaction(transactionId);
  status = tx.status;
  
  if (status === 'completed') {
    console.log('Success!');
    break;
  }
  
  if (status === 'failed') {
    console.log('Failed:', tx.failureReason);
    break;
  }
}
```

**Typical Completion Time**: 50-200ms

### Why Async?

- **Pro**: Higher throughput (don't block on processing)
- **Pro**: Better for distributed systems
- **Pro**: Natural fit with event sourcing
- **Con**: More complex client code
- **Alternative**: Synchronous processing (simpler, slower)

---

## Pagination

Query endpoints support pagination:

### Query Parameters

```
?limit=50&offset=0
```

**Parameters**:
- `limit` - Number of results per page (default: 50, max: 100)
- `offset` - Number of results to skip (default: 0)

### Example Request

```bash
GET /api/v1/transactions?accountId=<id>&limit=20&offset=40
```

### Example Response

```json
{
  "data": [
    { "id": "...", "type": "topup", ... },
    { "id": "...", "type": "transfer", ... }
  ],
  "pagination": {
    "total": 150,
    "limit": 20,
    "offset": 40,
    "hasMore": true
  }
}
```

**Note**: Current implementation doesn't include pagination metadata in all responses (simplified).

---

## Filtering

Some endpoints support filtering:

### Account Filtering

```
GET /api/v1/accounts?ownerId=user_123&ownerType=user
```

### Transaction Filtering

```
GET /api/v1/transactions?accountId=<uuid>&status=completed
```

**Available Filters**:
- `accountId` - Filter by account
- `status` - Filter by status (pending, completed, failed)
- `type` - Filter by type (topup, withdrawal, transfer)

---

## Correlation ID

Every request can include a correlation ID for distributed tracing:

### Request Header

```http
X-Correlation-ID: c0rr-e1at-10n-1d
```

### Response

The correlation ID is included in all responses:

```json
{
  "correlationId": "c0rr-e1at-10n-1d",
  ...
}
```

### Usage

```typescript
const correlationId = uuidv4();

// Use same ID for related requests
await api.createAccount(data, { 
  headers: { 'X-Correlation-ID': correlationId } 
});

await api.topup(data, { 
  headers: { 'X-Correlation-ID': correlationId } 
});
```

**Benefit**: Track related operations across logs and events.

---

## Rate Limiting

⚠️ **Not Yet Implemented**: This educational project doesn't include rate limiting.

**For Production**, you would add:
- Per-user rate limits (e.g., 100 requests/minute)
- IP-based rate limits
- Endpoint-specific limits
- Response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## API Endpoints Overview

### Accounts

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/accounts` | Create account |
| GET | `/api/v1/accounts/:id` | Get account by ID |
| GET | `/api/v1/accounts` | List accounts by owner |
| GET | `/api/v1/accounts/:id/balance` | Get account balance |
| PATCH | `/api/v1/accounts/:id/status` | Update account status |

[Detailed Account API Documentation →](./accounts.md)

### Transactions

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/transactions/topup` | Add funds (external → user) |
| POST | `/api/v1/transactions/withdraw` | Remove funds (user → external) |
| POST | `/api/v1/transactions/transfer` | Transfer funds (user → user) |
| POST | `/api/v1/transactions/payment` | Process payment (user → merchant) |
| POST | `/api/v1/transactions/refund` | Refund payment |
| GET | `/api/v1/transactions/:id` | Get transaction by ID |
| GET | `/api/v1/transactions` | List transactions by account |

[Detailed Transaction API Documentation →](./transactions.md)

### Currencies

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/currencies` | List all currencies |
| GET | `/api/v1/currencies/:code` | Get currency by code |

[Detailed Currency API Documentation →](./currencies.md)

### Events (SSE)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/events/accounts/:id` | Subscribe to account events |
| GET | `/api/v1/events/transactions/:id` | Subscribe to transaction events |

[Detailed Events API Documentation →](./events.md)

---

## Example Workflows

### Workflow 1: Create Account and Top-up

```bash
# 1. Create account
curl -X POST http://localhost:3000/api/v1/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "ownerId": "user_123",
    "ownerType": "user",
    "currency": "USD",
    "type": "USER"
  }'

# Response: { "id": "account-uuid", ... }

# 2. Top-up account
curl -X POST http://localhost:3000/api/v1/transactions/topup \
  -H "Content-Type: application/json" \
  -d '{
    "idempotencyKey": "unique-key-001",
    "destinationAccountId": "account-uuid",
    "sourceAccountId": "external-bank",
    "amount": "1000.00",
    "currency": "USD"
  }'

# Response: { "transactionId": "tx-uuid", "status": "pending" }

# 3. Check transaction status
curl http://localhost:3000/api/v1/transactions/tx-uuid

# Response: { "id": "tx-uuid", "status": "completed", ... }

# 4. Verify balance
curl http://localhost:3000/api/v1/accounts/account-uuid/balance

# Response: { "balance": "1000.00", "currency": "USD", "status": "active" }
```

### Workflow 2: Transfer Between Users

```bash
# Transfer from Alice to Bob
curl -X POST http://localhost:3000/api/v1/transactions/transfer \
  -H "Content-Type: application/json" \
  -d '{
    "idempotencyKey": "transfer-001",
    "sourceAccountId": "alice-account-uuid",
    "destinationAccountId": "bob-account-uuid",
    "amount": "50.00",
    "currency": "USD",
    "reference": "Payment for lunch"
  }'

# Response: { 
#   "sourceTransactionId": "tx-1",
#   "destinationTransactionId": "tx-2",
#   "status": "pending"
# }
```

---

## Best Practices

### 1. Always Use Idempotency Keys

```typescript
// ✅ Good: Generate idempotency key
const idempotencyKey = uuidv4();
await api.topup({ idempotencyKey, ...data });

// ❌ Bad: No idempotency key (risky on retry)
await api.topup(data);
```

### 2. Handle Eventual Consistency

```typescript
// ✅ Good: Poll for completion
const { transactionId } = await api.topup(data);
await pollUntilComplete(transactionId);

// ❌ Bad: Assume immediate completion
const { transactionId } = await api.topup(data);
// Balance might not be updated yet!
```

### 3. Use Correlation IDs

```typescript
// ✅ Good: Track related operations
const correlationId = uuidv4();
await api.createAccount(data, { correlationId });
await api.topup(data, { correlationId });

// All operations linked in logs
```

### 4. Handle All Error Types

```typescript
try {
  await api.transfer(data);
} catch (error) {
  if (error.status === 400 && error.code === 'INSUFFICIENT_BALANCE') {
    showError('Not enough funds');
  } else if (error.status === 409) {
    showError('Transaction already processed');
  } else {
    showError('Unexpected error');
    logError(error);
  }
}
```

---

## Testing with cURL

### Create Account

```bash
curl -X POST http://localhost:3000/api/v1/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "ownerId": "test_user",
    "ownerType": "user",
    "currency": "USD",
    "type": "USER"
  }'
```

### Top-up Account

```bash
curl -X POST http://localhost:3000/api/v1/transactions/topup \
  -H "Content-Type: application/json" \
  -d '{
    "idempotencyKey": "'$(uuidgen)'",
    "destinationAccountId": "YOUR_ACCOUNT_ID",
    "sourceAccountId": "external-001",
    "amount": "100.00",
    "currency": "USD"
  }'
```

---

## Related Documentation

- [Account API](./accounts.md) - Account management endpoints
- [Transaction API](./transactions.md) - Transaction processing endpoints
- [Currency API](./currencies.md) - Currency configuration
- [Events API](./events.md) - Real-time event streaming

---

**Next**: Explore [Account API](./accounts.md) →


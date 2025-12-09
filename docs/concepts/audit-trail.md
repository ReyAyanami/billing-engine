# Audit Trail and Compliance

## Overview

An audit trail provides a complete, immutable history of all financial operations. Essential for compliance, debugging, dispute resolution, and regulatory requirements.

This billing engine uses **event sourcing** as its audit trail mechanism.

---

## Why Audit Trail Matters

### Compliance Requirements

Financial systems must maintain records for:
- **Regulatory compliance** (SOX, PCI-DSS, GDPR)
- **Tax audits** (IRS, VAT authorities)
- **Financial reporting** (balance reconciliation)
- **Dispute resolution** (customer complaints)
- **Fraud investigation** (suspicious activity)

### Questions an Audit Trail Answers

```
❓ "What was the account balance on March 15th?"
✅ Replay events up to that date

❓ "Who made this transaction?"
✅ Check correlationId and metadata

❓ "Why did this balance change?"
✅ Examine BalanceChanged event's 'reason' field

❓ "Has this account been compromised?"
✅ Review all AccountStatusChanged events

❓ "Can we prove this refund was processed?"
✅ Show RefundCompleted event with timestamp
```

---

## Event Sourcing as Audit Trail

### Immutable Event Log

Every state change is recorded as an event:

```typescript
// Account created
{
  "eventType": "AccountCreated",
  "aggregateId": "acc-uuid",
  "timestamp": "2025-01-01T10:00:00Z",
  "data": {
    "ownerId": "user_123",
    "currency": "USD",
    "type": "USER"
  }
}

// Balance changed
{
  "eventType": "BalanceChanged",
  "aggregateId": "acc-uuid",
  "timestamp": "2025-01-01T10:05:00Z",
  "data": {
    "previousBalance": "0.00",
    "newBalance": "100.00",
    "changeAmount": "100.00",
    "changeType": "CREDIT",
    "reason": "Topup from bank"
  }
}

// Status changed
{
  "eventType": "AccountStatusChanged",
  "aggregateId": "acc-uuid",
  "timestamp": "2025-01-01T11:00:00Z",
  "data": {
    "previousStatus": "active",
    "newStatus": "suspended",
    "reason": "Fraud investigation"
  }
}
```

**Characteristics**:
- ✅ **Immutable**: Events never modified or deleted
- ✅ **Ordered**: Sequential by timestamp and version
- ✅ **Complete**: Every change captured
- ✅ **Traceable**: Correlation IDs link related events

---

## Stored in Kafka

### Event Persistence

All events are persisted in Kafka topics:

```
Topic: billing-engine.account.events
Partition 0:
  Offset 0: AccountCreated (acc-001)
  Offset 1: BalanceChanged (acc-001)
  Offset 2: AccountCreated (acc-002)
  Offset 3: BalanceChanged (acc-001)
  ...
```

**Benefits**:
- **Durable**: Kafka guarantees persistence
- **Ordered**: Per-partition ordering
- **Replayable**: Can replay from any offset
- **Scalable**: Distributed across brokers
- **Long-term retention**: Configure retention (e.g., 10 years)

### Kafka Configuration

```typescript
// In kafka.service.ts
const kafkaConfig = {
  retentionMs: 10 * 365 * 24 * 60 * 60 * 1000,  // 10 years
  cleanupPolicy: 'compact',  // Keep latest per key
  // Events never deleted!
};
```

---

## Querying the Audit Trail

### 1. Get All Events for an Account

```typescript
// Load account aggregate (replays all events)
const aggregate = await eventStore.loadAggregate(
  'AccountAggregate',
  accountId
);

// Access events
const events = aggregate.getUncommittedEvents();
```

### 2. Query by Time Range

```sql
-- Query event projections (PostgreSQL)
SELECT *
FROM account_events
WHERE aggregate_id = 'acc-uuid'
  AND timestamp BETWEEN '2025-01-01' AND '2025-01-31'
ORDER BY timestamp ASC;
```

### 3. Query by Event Type

```sql
-- Find all balance changes
SELECT *
FROM account_events
WHERE event_type = 'BalanceChanged'
  AND aggregate_id = 'acc-uuid';
```

### 4. Track Transaction Flow

```sql
-- Find all events for a transaction
SELECT *
FROM events
WHERE correlation_id = 'corr-uuid'
ORDER BY timestamp ASC;

-- Shows complete saga:
-- 1. TransferRequested
-- 2. BalanceChanged (source account)
-- 3. BalanceChanged (dest account)
-- 4. TransferCompleted
```

---

## Point-in-Time Balance

### Reconstruct Historical Balance

Replay events up to a specific date:

```typescript
async function getBalanceAtDate(
  accountId: string,
  date: Date
): Promise<string> {
  // Load all events up to date
  const events = await eventStore.getEventsUntil(accountId, date);
  
  // Replay to reconstruct state
  const aggregate = new AccountAggregate();
  for (const event of events) {
    aggregate.applyEvent(event);
  }
  
  return aggregate.getBalance();
}

// Example usage
const balance = await getBalanceAtDate(
  'acc-uuid',
  new Date('2025-03-15T23:59:59Z')
);
// Returns: "1234.56"
```

**Use Cases**:
- Month-end reconciliation
- Historical reports
- Dispute investigation
- Regulatory audits

---

## Compliance Features

### 1. Who, What, When, Why

Every event captures:

```typescript
interface AuditEvent {
  // WHO
  ownerId: string;           // Account owner
  correlationId: string;     // Request/user tracking
  
  // WHAT
  eventType: string;         // BalanceChanged
  data: Record<string, any>; // Details of change
  
  // WHEN
  timestamp: string;         // ISO 8601
  aggregateVersion: number;  // Sequence number
  
  // WHY (in event data)
  reason: string;            // "Topup", "Transfer", etc.
}
```

### 2. Tamper-Proof

Events are **append-only**:

```typescript
// ✓ ALLOWED: Add new event
await eventStore.appendEvent(event);

// ✗ FORBIDDEN: Modify existing event
// No API for updating/deleting events

// ✗ FORBIDDEN: Backdating events
// Timestamp generated by system, not client
```

### 3. Complete Chain of Custody

Transaction saga with correlation ID:

```
correlationId: "corr-123"

Event 1: TransferRequested (time: 10:00:00.000)
  - sourceAccountId: acc-001
  - destinationAccountId: acc-002
  - amount: $50

Event 2: BalanceChanged (time: 10:00:00.050)
  - accountId: acc-001
  - changeAmount: -$50
  - correlationId: "corr-123"

Event 3: BalanceChanged (time: 10:00:00.100)
  - accountId: acc-002
  - changeAmount: +$50
  - correlationId: "corr-123"

Event 4: TransferCompleted (time: 10:00:00.150)
  - status: completed
  - correlationId: "corr-123"
```

**Trace the entire flow** using `correlationId`.

---

## Balance Verification

### Verify Current Balance

Ensure projection matches event history:

```typescript
async function verifyBalance(accountId: string): Promise<boolean> {
  // Get current balance from projection (read model)
  const projection = await accountRepo.findOne({ id: accountId });
  const projectedBalance = projection.balance;
  
  // Replay events to calculate actual balance
  const events = await eventStore.getEvents(accountId);
  const actualBalance = replayEvents(events);
  
  // Compare
  if (projectedBalance !== actualBalance) {
    console.error('Balance mismatch!', {
      projected: projectedBalance,
      actual: actualBalance
    });
    return false;
  }
  
  return true;
}
```

**Use Cases**:
- Nightly reconciliation
- Detect corruption
- Verify projection integrity

### Verify Transaction Balance

Double-entry bookkeeping validation:

```typescript
async function verifyTransaction(transactionId: string): Promise<boolean> {
  const events = await getTransactionEvents(transactionId);
  
  // Sum all balance changes
  let sum = 0;
  for (const event of events) {
    if (event.eventType === 'BalanceChanged') {
      sum += parseFloat(event.data.changeAmount);
    }
  }
  
  // Sum must be zero (double-entry)
  if (sum !== 0) {
    console.error('Double-entry violation!', { sum });
    return false;
  }
  
  return true;
}
```

---

## Regulatory Reports

### Monthly Statement

Generate account statement for any period:

```typescript
async function generateStatement(
  accountId: string,
  startDate: Date,
  endDate: Date
): Promise<Statement> {
  const events = await eventStore.getEventsBetween(
    accountId,
    startDate,
    endDate
  );
  
  const statement = {
    accountId,
    period: { start: startDate, end: endDate },
    openingBalance: await getBalanceAtDate(accountId, startDate),
    closingBalance: await getBalanceAtDate(accountId, endDate),
    transactions: []
  };
  
  for (const event of events) {
    if (event.eventType === 'BalanceChanged') {
      statement.transactions.push({
        date: event.timestamp,
        description: event.data.reason,
        amount: event.data.changeAmount,
        balance: event.data.newBalance
      });
    }
  }
  
  return statement;
}
```

**Output**:
```
Account Statement: acc-uuid
Period: 2025-01-01 to 2025-01-31

Opening Balance: $0.00

Transactions:
2025-01-05  Topup from bank        +$100.00   $100.00
2025-01-10  Transfer to Alice       -$50.00    $50.00
2025-01-15  Payment to Merchant     -$20.00    $30.00
2025-01-20  Refund from Merchant    +$20.00    $50.00

Closing Balance: $50.00
```

### Transaction History Export

Export for compliance:

```typescript
async function exportTransactionHistory(
  startDate: Date,
  endDate: Date,
  format: 'csv' | 'json'
): Promise<string> {
  const events = await eventStore.getAllEvents(startDate, endDate);
  
  // Format as CSV/JSON
  return formatEvents(events, format);
}

// Usage
const csv = await exportTransactionHistory(
  new Date('2025-01-01'),
  new Date('2025-12-31'),
  'csv'
);
// Save to file for auditor
```

---

## GDPR Considerations

### Right to Access

Users can request their data:

```typescript
async function exportUserData(userId: string): Promise<object> {
  // Get all accounts owned by user
  const accounts = await getAccountsByOwner(userId);
  
  // Get all events for each account
  const data = {
    userId,
    accounts: []
  };
  
  for (const account of accounts) {
    const events = await eventStore.getEvents(account.id);
    data.accounts.push({
      accountId: account.id,
      balance: account.balance,
      history: events
    });
  }
  
  return data;
}
```

### Right to Erasure

**Challenge**: Events are immutable!

**Solutions** (not implemented in study project):
1. **Anonymization**: Replace personal data with pseudonyms
2. **Crypto-shredding**: Encrypt events, delete key
3. **Retention policies**: Archive old events offline

**Note**: Financial records often exempt from deletion (legal hold).

---

## Debugging with Audit Trail

### Investigate Balance Discrepancy

```typescript
// Customer claims: "My balance is wrong"

// 1. Get current balance
const account = await getAccount(accountId);
console.log('Current balance:', account.balance);

// 2. Replay events to verify
const events = await eventStore.getEvents(accountId);
console.log('Event count:', events.length);

// 3. Examine recent changes
const recent = events.slice(-10);
for (const event of recent) {
  console.log(`${event.timestamp}: ${event.eventType}`, event.data);
}

// 4. Identify suspicious event
// Example: BalanceChanged with unusual reason
```

### Track Failed Transaction

```typescript
// Customer claims: "My transfer failed but money is missing"

// 1. Find transaction events
const events = await getEventsByCorrelationId(correlationId);

// 2. Analyze saga flow
for (const event of events) {
  console.log(`${event.timestamp}: ${event.eventType}`);
}

// Expected:
// TransferRequested
// BalanceChanged (source: -$50) ✓
// BalanceChanged (dest: +$50) ✗ Missing!
// TransactionFailed
// BalanceChanged (source: +$50) ← Compensation

// Conclusion: Transfer compensated correctly
```

---

## Best Practices

### 1. Always Include Reason

```typescript
// ✓ GOOD: Explains why balance changed
aggregate.changeBalance({
  changeAmount: '100.00',
  changeType: 'CREDIT',
  reason: 'Topup from Bank of America checking ****1234'
});

// ✗ BAD: No context
aggregate.changeBalance({
  changeAmount: '100.00',
  changeType: 'CREDIT'
});
```

### 2. Use Correlation IDs

```typescript
// ✓ GOOD: Link related events
const correlationId = uuidv4();
await createTransaction({ ...params, correlationId });

// ✗ BAD: No tracing
await createTransaction({ ...params });
```

### 3. Include Metadata

```typescript
// ✓ GOOD: Rich context
event.metadata = {
  userId: 'user_123',
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0...',
  requestId: 'req-uuid'
};

// ✗ BAD: Minimal context
event.metadata = {};
```

### 4. Never Delete Events

```typescript
// ✓ GOOD: Mark as obsolete
event.metadata.obsolete = true;
event.metadata.reason = 'Superseded by newer event';

// ✗ BAD: Delete
await eventStore.deleteEvent(eventId);  // Don't do this!
```

---

## Summary

| Feature | Implementation | Benefit |
|---------|---------------|---------|
| **Immutable Events** | Kafka append-only | Tamper-proof |
| **Complete History** | All state changes captured | Full audit trail |
| **Replay Capability** | Event sourcing | Point-in-time queries |
| **Correlation Tracking** | correlationId | Transaction tracing |
| **Long Retention** | Kafka 10-year retention | Regulatory compliance |

**Key Insight**: Event sourcing provides audit trail "for free"—it's not an add-on, it's the foundation.

---

## Related Documentation

- [Event Sourcing](../architecture/event-sourcing.md) - Technical implementation
- [CQRS Pattern](../architecture/cqrs-pattern.md) - Command/event flow
- [Account Module](../modules/account.md) - Account events
- [Transaction Module](../modules/transaction.md) - Transaction events


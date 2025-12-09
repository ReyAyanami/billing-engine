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
    "signedAmount": "100.00",
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

Topics are created with retention settings:

```bash
# In scripts/init-services.sh
kafka-topics.sh --create \
  --topic "billing.account.events" \
  --partitions 3 \
  --replication-factor 1 \
  --config retention.ms=-1 \               # Unlimited retention (never delete)
  --config cleanup.policy=compact,delete   # Compact + delete policy
```

**Configuration**:
- `retention.ms=-1`: Unlimited retention (events never expire)
- `cleanup.policy=compact,delete`: Keep latest per key + allow deletion
- Events are effectively permanent for audit trail

---

## Querying the Audit Trail

### 1. Get All Events for an Account

```typescript
// Retrieve all events from the event store
const events = await eventStore.getEvents(
  'AccountAggregate',
  accountId
);

// Events returned in chronological order
// Use these to replay state or audit history
```

### 2. Filter Events by Time Range

```typescript
// Get all events and filter by time range
const allEvents = await eventStore.getEvents('AccountAggregate', accountId);

const startDate = new Date('2025-01-01');
const endDate = new Date('2025-01-31');

const filteredEvents = allEvents.filter(event => {
  const eventDate = new Date(event.timestamp);
  return eventDate >= startDate && eventDate <= endDate;
});
```

### 3. Filter by Event Type

```typescript
// Get all events and filter by type
const allEvents = await eventStore.getEvents('AccountAggregate', accountId);

const balanceChanges = allEvents.filter(
  event => event.eventType === 'BalanceChanged'
);

// Each balance change event contains:
// - amount, previousBalance, newBalance, reason
```

### 4. Track Transaction Flow with Correlation ID

```typescript
// Get events for all related aggregates
const accountEvents = await eventStore.getEvents('AccountAggregate', sourceAccountId);
const transactionEvents = await eventStore.getEvents('TransactionAggregate', transactionId);

// Filter by correlation ID to trace the complete flow
const correlationId = 'corr-uuid';
const relatedEvents = [...accountEvents, ...transactionEvents]
  .filter(event => event.correlationId === correlationId)
  .sort((a, b) => a.timestamp - b.timestamp);

// Shows complete saga:
// 1. TransferRequested
// 2. BalanceChanged (source account)
// 3. BalanceChanged (destination account)
// 4. TransferCompleted
```

---

## Point-in-Time Balance

### Reconstruct Historical Balance

Replay events up to a specific date:

```typescript
async function getBalanceAtDate(
  accountId: string,
  targetDate: Date
): Promise<string> {
  // Load all events for the account
  const allEvents = await eventStore.getEvents('Account', accountId);
  
  // Filter events up to the target date
  const eventsUntilDate = allEvents.filter(event => {
    return new Date(event.timestamp) <= targetDate;
  });
  
  if (eventsUntilDate.length === 0) {
    return '0'; // Account didn't exist yet
  }
  
  // Reconstruct aggregate from filtered events
  const aggregate = AccountAggregate.fromEvents(eventsUntilDate);
  
  return aggregate.getBalance().toString();
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
  - changeAmount: $50 (always positive)
  - changeType: DEBIT
  - signedAmount: -$50
  - correlationId: "corr-123"

Event 3: BalanceChanged (time: 10:00:00.100)
  - accountId: acc-002
  - changeAmount: $50 (always positive)
  - changeType: CREDIT
  - signedAmount: +$50
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
async function verifyBalance(
  accountId: string,
  accountRepo: Repository<Account>,
  eventStore: IEventStore
): Promise<boolean> {
  // Get current balance from projection (read model)
  const projection = await accountRepo.findOne({ where: { id: accountId } });
  if (!projection) {
    throw new Error('Account not found');
  }
  const projectedBalance = projection.balance;
  
  // Replay events to calculate actual balance
  const events = await eventStore.getEvents('Account', accountId);
  const aggregate = AccountAggregate.fromEvents(events);
  const actualBalance = aggregate.getBalance().toString();
  
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
async function verifyTransaction(
  sourceAccountId: string,
  destAccountId: string,
  correlationId: string,
  eventStore: IEventStore
): Promise<boolean> {
  // Get events for both accounts involved in the transaction
  const sourceEvents = await eventStore.getEvents('Account', sourceAccountId);
  const destEvents = await eventStore.getEvents('Account', destAccountId);
  
  // Filter by correlation ID to get transaction-specific events
  const relatedEvents = [...sourceEvents, ...destEvents]
    .filter(e => e.correlationId === correlationId && e.eventType === 'BalanceChanged');
  
  // Sum all balance changes using Decimal.js for precision (should be zero for double-entry)
  // signedAmount is already signed (positive for CREDIT, negative for DEBIT)
  let sum = new Decimal(0);
  for (const event of relatedEvents) {
    const signedAmount = new Decimal(event.data.signedAmount);
    sum = sum.plus(signedAmount);
  }
  
  // Sum must be exactly zero (double-entry)
  if (!sum.isZero()) {
    console.error('Double-entry violation!', { sum: sum.toString(), correlationId });
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
  endDate: Date,
  eventStore: IEventStore
): Promise<Statement> {
  // Get all events and filter by date range
  const allEvents = await eventStore.getEvents('Account', accountId);
  const eventsInPeriod = allEvents.filter(event => {
    const eventDate = new Date(event.timestamp);
    return eventDate >= startDate && eventDate <= endDate;
  });
  
  const statement = {
    accountId,
    period: { start: startDate, end: endDate },
    openingBalance: await getBalanceAtDate(accountId, startDate, eventStore),
    closingBalance: await getBalanceAtDate(accountId, endDate, eventStore),
    transactions: []
  };
  
  for (const event of eventsInPeriod) {
    if (event.eventType === 'BalanceChanged') {
      statement.transactions.push({
        date: event.timestamp,
        description: event.data.reason,
        amount: event.data.signedAmount,  // Already signed (+ for CREDIT, - for DEBIT)
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
  accountId: string,
  startDate: Date,
  endDate: Date,
  eventStore: IEventStore,
  format: 'csv' | 'json'
): Promise<string> {
  // Get all events for the account
  const allEvents = await eventStore.getEvents('Account', accountId);
  
  // Filter by date range
  const filteredEvents = allEvents.filter(event => {
    const eventDate = new Date(event.timestamp);
    return eventDate >= startDate && eventDate <= endDate;
  });
  
  // Format as CSV/JSON
  if (format === 'json') {
    return JSON.stringify(filteredEvents, null, 2);
  } else {
    // Simple CSV format
    const header = 'timestamp,eventType,amount,balance,reason\n';
    const rows = filteredEvents
      .filter(e => e.eventType === 'BalanceChanged')
      .map(e => `${e.timestamp},${e.eventType},${e.data.signedAmount},${e.data.newBalance},${e.data.reason}`)
      .join('\n');
    return header + rows;
  }
}

// Usage
const csv = await exportTransactionHistory(
  'acc-uuid',
  new Date('2025-01-01'),
  new Date('2025-12-31'),
  eventStore,
  'csv'
);
// Save to file for auditor
```

---

## GDPR Considerations

### Right to Access

Users can request their data:

```typescript
async function exportUserData(
  userId: string,
  accountService: AccountService,
  eventStore: IEventStore
): Promise<object> {
  // Get all accounts owned by user
  const accounts = await accountService.findByOwner(userId, 'user');
  
  // Get all events for each account
  const data = {
    userId,
    accounts: []
  };
  
  for (const account of accounts) {
    const events = await eventStore.getEvents('Account', account.id);
    data.accounts.push({
      accountId: account.id,
      balance: account.balance,
      currency: account.currency,
      status: account.status,
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

// 1. Get current balance from projection
const account = await accountService.findById(accountId);
console.log('Current balance:', account.balance);

// 2. Replay events to verify
const events = await eventStore.getEvents('Account', accountId);
console.log('Event count:', events.length);

const aggregate = AccountAggregate.fromEvents(events);
const replayedBalance = aggregate.getBalance().toString();
console.log('Replayed balance:', replayedBalance);

// 3. Compare
if (account.balance !== replayedBalance) {
  console.error('MISMATCH! Projection is out of sync');
}

// 4. Examine recent changes
const recent = events.slice(-10);
for (const event of recent) {
  console.log(`${event.timestamp}: ${event.eventType}`, event.data);
}

// 5. Identify suspicious event
// Example: BalanceChanged with unusual reason
```

### Track Failed Transaction

```typescript
// Customer claims: "My transfer failed but money is missing"

// 1. Find transaction events by correlation ID
const sourceEvents = await eventStore.getEvents('Account', sourceAccountId);
const destEvents = await eventStore.getEvents('Account', destAccountId);
const transactionEvents = await eventStore.getEvents('Transaction', transactionId);

// Combine and filter by correlation ID
const allEvents = [...sourceEvents, ...destEvents, ...transactionEvents]
  .filter(e => e.correlationId === correlationId)
  .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

// 2. Analyze saga flow
for (const event of allEvents) {
  console.log(`${event.timestamp}: ${event.eventType}`, event.data);
}

// Expected output for compensated transfer:
// TransferRequested
// BalanceChanged (source: -$50) ✓
// BalanceChanged (dest: +$50) ✗ Failed!
// TransactionFailed
// BalanceChanged (source: +$50) ← Compensation

// Conclusion: Transfer compensated correctly, money restored
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


# Server-Sent Events (SSE) API

## Overview

The Events API provides real-time event streaming using Server-Sent Events (SSE). Subscribe to account or transaction events to receive live updates without polling.

**Base Path**: `/api/v1/events`

---

## Why SSE?

**Problem with Polling**:
```typescript
// Inefficient: Poll every 100ms
while (true) {
  const tx = await getTransaction(id);
  if (tx.status === 'completed') break;
  await sleep(100);
}
```

**Solution with SSE**:
```typescript
// Efficient: Receive notification when status changes
const eventSource = new EventSource(`/api/v1/events/transactions/${id}`);
eventSource.addEventListener('TransactionCompleted', (event) => {
  console.log('Transaction completed!', event.data);
});
```

**Benefits**:
- Real-time updates
- Lower server load (no polling)
- Standard browser API
- Automatic reconnection

---

## Endpoints

### Subscribe to Account Events

Stream real-time events for a specific account.

```http
GET /api/v1/events/accounts/:accountId
```

#### Path Parameters

- `accountId` (required) - Account UUID

#### Response: text/event-stream

```
event: BalanceChanged
data: {"type":"BalanceChanged","accountId":"acc-uuid","timestamp":"2025-12-09T12:00:00.000Z","payload":{...}}

event: AccountStatusChanged  
data: {"type":"AccountStatusChanged","accountId":"acc-uuid","timestamp":"2025-12-09T12:00:01.000Z","payload":{...}}
```

#### Event Types

- `AccountCreated` - Account was created
- `BalanceChanged` - Balance updated
- `AccountStatusChanged` - Status changed
- `AccountLimitsChanged` - Balance limits modified

#### Browser Example

```javascript
const eventSource = new EventSource(
  'http://localhost:3000/api/v1/events/accounts/550e8400-e29b-41d4-a716-446655440000'
);

eventSource.addEventListener('BalanceChanged', (event) => {
  const data = JSON.parse(event.data);
  console.log('Balance changed:', data.payload);
  
  // Update UI
  updateBalanceDisplay(data.payload.newBalance);
});

eventSource.addEventListener('AccountStatusChanged', (event) => {
  const data = JSON.parse(event.data);
  console.log('Status changed:', data.payload.newStatus);
});

// Clean up when done
eventSource.close();
```

---

### Subscribe to Transaction Events

Stream real-time events for a specific transaction.

```http
GET /api/v1/events/transactions/:transactionId
```

#### Path Parameters

- `transactionId` (required) - Transaction UUID

#### Response: text/event-stream

```
event: TopupRequested
data: {"type":"TopupRequested","transactionId":"tx-uuid","timestamp":"...","payload":{...}}

event: BalanceChanged
data: {"type":"BalanceChanged","transactionId":"tx-uuid","timestamp":"...","payload":{...}}

event: TopupCompleted
data: {"type":"TopupCompleted","transactionId":"tx-uuid","timestamp":"...","payload":{...}}
```

#### Event Types

Transaction lifecycle events:
- `TopupRequested`, `TopupCompleted`
- `WithdrawalRequested`, `WithdrawalCompleted`
- `TransferRequested`, `TransferCompleted`
- `PaymentRequested`, `PaymentCompleted`
- `RefundRequested`, `RefundCompleted`
- `TransactionFailed`
- `TransactionCompensated`

Balance events:
- `BalanceChanged` (for involved accounts)

#### Browser Example

```javascript
const eventSource = new EventSource(
  'http://localhost:3000/api/v1/events/transactions/tx-uuid'
);

eventSource.addEventListener('TopupCompleted', (event) => {
  const data = JSON.parse(event.data);
  console.log('Transaction completed!');
  
  // Update UI
  showSuccess('Top-up successful');
  refreshBalance();
});

eventSource.addEventListener('TransactionFailed', (event) => {
  const data = JSON.parse(event.data);
  console.log('Transaction failed:', data.payload.reason);
  
  // Update UI
  showError(data.payload.reason);
});
```

---

### Subscribe to All Events

Stream all system events (admin/debugging use).

```http
GET /api/v1/events/stream
```

#### Response: text/event-stream

```
event: AccountCreated
data: {...}

event: BalanceChanged
data: {...}

event: TransferCompleted
data: {...}
```

**Use Cases**:
- Admin dashboards
- System monitoring
- Debugging
- Audit logging

---

## Event Structure

### Message Format

```typescript
interface MessageEvent {
  data: {
    type: string;              // Event type
    timestamp: string;         // ISO 8601
    accountId?: string;        // For account events
    transactionId?: string;    // For transaction events
    payload: {
      // Event-specific data
      eventType: string;
      aggregateId: string;
      aggregateVersion: number;
      correlationId: string;
      data: Record<string, unknown>;
    }
  }
}
```

### Example: BalanceChanged

```json
{
  "data": {
    "type": "BalanceChanged",
    "timestamp": "2025-12-09T12:00:00.000Z",
    "accountId": "acc-uuid",
    "payload": {
      "eventType": "BalanceChanged",
      "aggregateId": "acc-uuid",
      "aggregateVersion": 5,
      "timestamp": "2025-12-09T12:00:00.000Z",
      "correlationId": "corr-uuid",
      "data": {
        "previousBalance": "100.00",
        "newBalance": "150.00",
        "changeAmount": "50.00",
        "changeType": "CREDIT",
        "reason": "Topup"
      }
    }
  }
}
```

---

## Client Libraries

### JavaScript/Browser

```javascript
const eventSource = new EventSource('/api/v1/events/accounts/' + accountId);

eventSource.onopen = () => {
  console.log('Connected');
};

eventSource.addEventListener('BalanceChanged', (event) => {
  const data = JSON.parse(event.data);
  handleBalanceChange(data);
});

eventSource.onerror = (error) => {
  console.error('Connection error:', error);
  // EventSource automatically reconnects
};

// Close when done
eventSource.close();
```

### Node.js

```typescript
import EventSource from 'eventsource';

const eventSource = new EventSource(
  'http://localhost:3000/api/v1/events/accounts/' + accountId
);

eventSource.addEventListener('BalanceChanged', (event) => {
  const data = JSON.parse(event.data);
  console.log('Balance:', data.payload.data.newBalance);
});
```

### React Hook

```typescript
function useAccountEvents(accountId: string) {
  const [balance, setBalance] = useState<string>('0');
  
  useEffect(() => {
    const eventSource = new EventSource(
      `/api/v1/events/accounts/${accountId}`
    );
    
    eventSource.addEventListener('BalanceChanged', (event) => {
      const data = JSON.parse(event.data);
      setBalance(data.payload.data.newBalance);
    });
    
    return () => eventSource.close();
  }, [accountId]);
  
  return { balance };
}

// Usage
function AccountBalance({ accountId }) {
  const { balance } = useAccountEvents(accountId);
  return <div>Balance: ${balance}</div>;
}
```

---

## Connection Management

### Automatic Reconnection

EventSource automatically reconnects on connection loss:

```javascript
eventSource.onerror = (error) => {
  if (eventSource.readyState === EventSource.CONNECTING) {
    console.log('Reconnecting...');
  } else {
    console.error('Connection error:', error);
  }
};
```

### Connection States

```typescript
EventSource.CONNECTING = 0  // Connecting
EventSource.OPEN = 1        // Connected
EventSource.CLOSED = 2      // Closed (manual)
```

### Manual Close

```javascript
// Close connection when component unmounts
eventSource.close();
```

---

## Use Cases

### 1. Live Balance Display

```javascript
const eventSource = new EventSource(`/api/v1/events/accounts/${accountId}`);

eventSource.addEventListener('BalanceChanged', (event) => {
  const data = JSON.parse(event.data);
  document.getElementById('balance').textContent = data.payload.data.newBalance;
});
```

### 2. Transaction Status Updates

```javascript
const eventSource = new EventSource(`/api/v1/events/transactions/${txId}`);

eventSource.addEventListener('TopupCompleted', (event) => {
  showNotification('Top-up successful!');
  refreshBalance();
  eventSource.close();  // Close after completion
});

eventSource.addEventListener('TransactionFailed', (event) => {
  const data = JSON.parse(event.data);
  showError('Top-up failed: ' + data.payload.data.reason);
  eventSource.close();
});
```

### 3. Admin Dashboard

```javascript
const eventSource = new EventSource('/api/v1/events/stream');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  addToActivityLog(data.type, data.timestamp);
};
```

---

## Testing with SSE

### E2E Testing

```typescript
it('should receive BalanceChanged event', async (done) => {
  const EventSource = (await import('eventsource')).default;
  
  const eventSource = new EventSource(
    `http://localhost:3000/api/v1/events/accounts/${accountId}`
  );
  
  eventSource.addEventListener('BalanceChanged', (event) => {
    const data = JSON.parse(event.data);
    expect(data.type).toBe('BalanceChanged');
    eventSource.close();
    done();
  });
  
  // Trigger event
  await topup({ accountId, amount: '100.00' });
});
```

---

## Limitations

### Browser Limits

- Maximum 6 concurrent SSE connections per domain
- HTTP/1.1 only (use HTTP/2 for more connections)

### Network

- Long-lived connections require load balancer support
- May need sticky sessions for load balancing

### Not Implemented

This educational project simplifies:
- No authentication (anyone can subscribe)
- No Last-Event-ID for resume after disconnect
- No heartbeat/keep-alive mechanism
- No backpressure handling

---

## Related Documentation

- [REST API Overview](./rest-api.md) - General API conventions
- [Transaction API](./transactions.md) - Transaction operations
- [Account API](./accounts.md) - Account operations


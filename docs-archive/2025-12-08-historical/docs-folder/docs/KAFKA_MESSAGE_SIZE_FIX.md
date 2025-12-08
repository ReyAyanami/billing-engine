# Kafka Message Size Issue - Fix Documentation

## Issue Summary

**Date**: December 7, 2025  
**Severity**: High  
**Status**: Fixed

### Error Details

```
[2025-12-07 19:38:28,860] WARN [SocketServer listenerType=ZK_BROKER, nodeId=1] 
Unexpected error from /172.19.0.3 (channelId=172.19.0.5:9092-172.19.0.3:45900-1036); closing connection

org.apache.kafka.common.network.InvalidReceiveException: Invalid receive (size = 1195725856 larger than 104857600)
```

### Root Cause

1. **Large Message**: Application attempted to send a ~1.14 GB (1,195,725,856 bytes) message to Kafka
2. **Broker Limit**: Kafka broker's maximum receive buffer was set to 100 MB (104,857,600 bytes)
3. **No Validation**: Application had no validation to prevent oversized messages from being sent
4. **Missing Configuration**: Producer did not have explicit message size limits configured

### Potential Causes of Oversized Messages

This type of issue typically occurs when:
- Large objects are accidentally included in event metadata
- Circular references in JavaScript objects causing massive JSON serialization
- Bulk data being sent in a single event instead of being batched properly
- Deep nested objects with excessive data
- Array fields containing thousands of items

## Impact Assessment

### What Was Affected

1. **Event Publishing**: Events failed to publish to Kafka
2. **Kafka Connections**: Broker closed connections due to invalid messages
3. **Data Integrity**: Potential event loss if not retried properly
4. **Application Functionality**: Transaction processing could be disrupted

### Affected Components

- ✅ Kafka Event Store (`KafkaEventStore`)
- ✅ Kafka Producer Configuration (`KafkaService`)
- ✅ Kafka Broker Configuration (all 3 brokers)
- ✅ Event Publishing Pipeline

## Solution Implemented

### 1. Event Size Validation (Application Layer)

**File**: `src/cqrs/kafka/kafka-event-store.ts`

Added `validateMessageSize()` method that:
- **Hard Limit**: Rejects messages > 10 MB with descriptive error
- **Warning Threshold**: Logs warning for messages > 1 MB
- **Debug Information**: Logs event sample for debugging large messages
- **Error Context**: Provides event type, aggregate ID, and event ID in error messages

```typescript
// Hard limit: 10 MB per message
// Warning: 1 MB per message
```

**Benefits**:
- Fails fast with clear error messages
- Helps developers identify problematic events
- Prevents broker rejection
- Provides debugging information

### 2. Producer Configuration (Application Layer)

**File**: `src/cqrs/kafka/kafka.service.ts`

Updated producer with documentation about message size enforcement:
```typescript
// Message size limits are enforced at:
// 1. Application layer: KafkaEventStore.validateMessageSize() (10 MB limit)
// 2. Broker level: KAFKA_MESSAGE_MAX_BYTES (10 MB limit)
// 3. Socket level: KAFKA_SOCKET_REQUEST_MAX_BYTES (100 MB for batching)
```

**Benefits**:
- Clear documentation of where limits are enforced
- Multi-layer protection against oversized messages
- Fail-fast approach with detailed error messages

### 3. Broker Configuration (Infrastructure Layer)

**File**: `infrastructure/kafka/docker-compose.yml`

Added to all 3 Kafka brokers:
```yaml
# Maximum message size the broker will accept
KAFKA_MESSAGE_MAX_BYTES: 10485760  # 10 MB

# Maximum size of a request (batch of messages)
KAFKA_REPLICA_FETCH_MAX_BYTES: 10485760  # 10 MB

# Socket receive buffer for network requests
KAFKA_SOCKET_REQUEST_MAX_BYTES: 104857600  # 100 MB (for batching)
```

**Benefits**:
- Consistent limits across all brokers
- Allows for message batching while preventing individual oversized messages
- Clear error messages when limits are exceeded

## Configuration Rationale

### Why 10 MB Limit?

1. **Best Practice**: Kafka recommends keeping messages under 1 MB
2. **Performance**: Smaller messages = better throughput and lower latency
3. **Memory**: Large messages consume more broker memory
4. **Replication**: Smaller messages replicate faster across brokers
5. **Event Sourcing**: Events should represent state changes, not bulk data

### Why 100 MB Socket Buffer?

- Allows batching multiple messages in a single request
- Provides headroom for headers, compression overhead
- Standard Kafka configuration for high-throughput scenarios

## Testing the Fix

### 1. Restart Kafka Cluster

```bash
cd infrastructure/kafka
docker-compose down
docker-compose up -d
```

Wait for all brokers to be healthy:
```bash
docker-compose ps
docker-compose logs -f kafka-1
```

### 2. Test with Normal Events

```bash
# Create an account (small event)
curl -X POST http://localhost:3000/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "ownerId": "user-123",
    "ownerType": "individual",
    "accountType": "standard",
    "currency": "USD"
  }'
```

Expected: Success ✅

### 3. Test Size Validation (Warning)

Create an event with moderately large metadata (1-10 MB):

```typescript
// This will log a warning but succeed
await commandBus.execute(new CreateAccountCommand({
  // ... normal fields ...
  metadata: {
    // Large but within limits
    largeField: 'x'.repeat(2 * 1024 * 1024) // 2 MB
  }
}));
```

Expected: Warning logged, event published ⚠️

### 4. Test Size Validation (Error)

Try to create an event with excessive data (> 10 MB):

```typescript
// This will throw an error
await commandBus.execute(new CreateAccountCommand({
  // ... normal fields ...
  metadata: {
    // Too large
    hugeField: 'x'.repeat(15 * 1024 * 1024) // 15 MB
  }
}));
```

Expected: Error thrown, event NOT published ❌

## Monitoring & Alerts

### What to Monitor

1. **Large Event Warnings**
   - Search logs for: `⚠️ Large event detected`
   - Investigate events consistently > 1 MB

2. **Message Size Errors**
   - Search logs for: `Event message size`
   - These indicate bugs in event construction

3. **Kafka Connection Errors**
   - Monitor Kafka logs for: `InvalidReceiveException`
   - Should not occur after fix

### Log Queries

```bash
# Find large event warnings
docker-compose logs billing-api | grep "Large event detected"

# Find message size errors
docker-compose logs billing-api | grep "exceeds maximum allowed size"

# Check Kafka broker errors
docker-compose logs kafka-1 | grep "InvalidReceiveException"
```

### Grafana Dashboard Queries

If using Prometheus/Grafana:

```promql
# Count of large events (> 1MB)
sum(rate(kafka_producer_large_message_warnings_total[5m]))

# Count of rejected oversized events
sum(rate(kafka_producer_message_size_errors_total[5m]))
```

## Prevention Guidelines

### For Developers

1. **Keep Events Small**
   - Events should represent state changes, not bulk data
   - Typical event: < 10 KB
   - Large event: > 100 KB (investigate why)

2. **Avoid Large Metadata**
   ```typescript
   // ❌ BAD: Including large objects in metadata
   metadata: {
     fullUserProfile: await fetchUserProfile(), // Could be huge
     allTransactions: await fetchTransactions(), // Definitely huge
   }

   // ✅ GOOD: Only include references
   metadata: {
     userId: user.id,
     transactionCount: transactions.length,
   }
   ```

3. **Use References, Not Embedded Data**
   ```typescript
   // ❌ BAD: Embedding full related entities
   event = {
     account: fullAccountObject, // Includes all fields
     transactions: allTransactions, // Could be thousands
   }

   // ✅ GOOD: Only include IDs
   event = {
     accountId: account.id,
     transactionIds: transactions.map(t => t.id),
   }
   ```

4. **Be Careful with Arrays**
   ```typescript
   // ❌ BAD: Unbounded arrays
   compensationActions: [...] // Could have 1000s of items

   // ✅ GOOD: Reference or limit size
   compensationActionIds: [...] // Max 100 items
   ```

5. **Test Event Size**
   ```typescript
   const eventJson = JSON.stringify(event.toJSON());
   const sizeInMB = Buffer.byteLength(eventJson) / (1024 * 1024);
   console.log(`Event size: ${sizeInMB.toFixed(2)} MB`);
   ```

### Code Review Checklist

- [ ] Event contains only necessary data
- [ ] Metadata is small (< 10 KB typically)
- [ ] Arrays are bounded in size
- [ ] No circular references
- [ ] No embedded full entities (use IDs instead)
- [ ] Consider if data should be in a separate service

## Rollback Plan

If issues arise after deployment:

### Option 1: Increase Limits (Temporary)

```yaml
# In docker-compose.yml, increase to 50MB
KAFKA_MESSAGE_MAX_BYTES: 52428800

# In kafka.service.ts, increase to 50MB
maxMessageBytes: 50 * 1024 * 1024
```

Then restart:
```bash
cd infrastructure/kafka
docker-compose restart kafka-1 kafka-2 kafka-3
npm run build
pm2 restart billing-api
```

### Option 2: Disable Validation (Emergency)

```typescript
// In kafka-event-store.ts, temporarily comment out validation
// this.validateMessageSize(serializedEvent, event, aggregateId);
```

**⚠️ WARNING**: Only use in emergency. Find and fix root cause ASAP.

## Related Issues

- None (first occurrence)

## References

- [Kafka Message Size Configuration](https://kafka.apache.org/documentation/#brokerconfigs_message.max.bytes)
- [KafkaJS Producer Configuration](https://kafka.js.org/docs/producing#options)
- [Event Sourcing Best Practices](https://martinfowler.com/eaaDev/EventSourcing.html)

## Lessons Learned

1. **Validate Early**: Always validate message sizes before sending to Kafka
2. **Configure Limits**: Set explicit limits at all layers (app, producer, broker)
3. **Monitor Proactively**: Watch for size warnings before they become errors
4. **Design Events Carefully**: Events should be minimal representations of state changes

---

**Status**: ✅ Fixed and Deployed  
**Next Review**: Monitor for 1 week, then consider this resolved


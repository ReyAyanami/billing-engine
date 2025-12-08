# Kafka Message Size Issue - Summary

## ⚠️ Issue Detected

**Error Message**:
```
org.apache.kafka.common.network.InvalidReceiveException: Invalid receive 
(size = 1195725856 larger than 104857600)
```

**Translation**: Someone tried to send a ~1.14 GB message to Kafka, which exceeded the broker's 100 MB limit.

---

## 🔍 Root Cause Analysis

### What Happened
1. Application attempted to publish an event with ~1.14 GB of data to Kafka
2. Kafka broker rejected it (exceeded 100 MB receive buffer limit)
3. Connection was closed, event was lost
4. No validation existed to prevent this

### Why This Happened
- **No Size Validation**: Application didn't validate event sizes before publishing
- **No Producer Limits**: Producer didn't have explicit size constraints
- **Misconfigured Broker**: Broker had default limits that weren't appropriate

### Likely Causes of Oversized Message
Common scenarios that cause GB-sized messages:
- ❌ Large objects accidentally included in event metadata
- ❌ Circular references causing infinite JSON serialization
- ❌ Entire database result sets embedded in events
- ❌ Arrays with thousands of items
- ❌ Deep nested objects with excessive data

---

## ✅ Solution Implemented

### 1. Application-Layer Validation ✓

**File**: `src/cqrs/kafka/kafka-event-store.ts`

Added `validateMessageSize()` method that:
- **Hard Limit**: Rejects messages > 10 MB with detailed error
- **Warning**: Logs warning for messages > 1 MB
- **Debug Info**: Logs event sample for troubleshooting
- **Context**: Includes event type, aggregate ID, and event ID

```typescript
// Example error message:
Event message size (15.23 MB) exceeds maximum allowed size (10 MB). 
Event type: AccountCreated, Aggregate ID: abc-123, Event ID: xyz-456.
This usually indicates a bug where too much data is being included in the event.
```

### 2. Broker Configuration ✓

**File**: `infrastructure/kafka/docker-compose.yml`

Updated all 3 Kafka brokers with:
```yaml
KAFKA_MESSAGE_MAX_BYTES: 10485760          # 10 MB per message
KAFKA_REPLICA_FETCH_MAX_BYTES: 10485760    # 10 MB for replication
KAFKA_SOCKET_REQUEST_MAX_BYTES: 104857600  # 100 MB for batching
```

### 3. Documentation ✓

Created comprehensive documentation:
- `docs/KAFKA_MESSAGE_SIZE_FIX.md` - Detailed technical guide
- Updated `infrastructure/kafka/README.md` - Troubleshooting section
- This summary document

---

## 📊 Impact Assessment

### What Was Affected
- ✅ **Event Publishing**: Now validated before sending
- ✅ **Kafka Brokers**: Now configured with appropriate limits
- ✅ **Application**: Will fail fast with clear errors
- ✅ **Developers**: Will get warnings for large events (> 1 MB)

### What Could Have Been Affected (Before Fix)
- ❌ Transaction processing failures
- ❌ Account balance updates lost
- ❌ Event sourcing data loss
- ❌ Kafka connection instability

---

## 🚀 Next Steps

### 1. Restart Kafka Cluster (Required)

```bash
cd infrastructure/kafka
docker-compose down
docker-compose up -d

# Wait for brokers to be healthy
docker-compose ps
```

### 2. Restart Application (Required)

```bash
# The application has been rebuilt successfully
npm run build  # ✅ Already done

# Restart your application
pm2 restart billing-api
# OR
npm run start:prod
```

### 3. Monitor for Issues

```bash
# Watch for large event warnings
docker logs -f billing-api 2>&1 | grep "Large event detected"

# Watch for size errors
docker logs -f billing-api 2>&1 | grep "exceeds maximum allowed size"

# Check Kafka broker logs
cd infrastructure/kafka
docker-compose logs -f kafka-1 | grep "InvalidReceiveException"
```

### 4. Investigate Root Cause

The ~1.14 GB message indicates a serious bug in the application. After deploying this fix:

1. **Check Application Logs**: Look for the error message showing which event type was too large
2. **Review Recent Changes**: What code was deployed before this error started?
3. **Check Metadata Usage**: Are we accidentally including large objects in event metadata?
4. **Test Scenarios**: Try to reproduce the scenario that caused the large event

---

## 📋 Prevention Guidelines

### For Developers

**DO**:
- ✅ Keep events small (< 100 KB typically)
- ✅ Use references (IDs) instead of full objects
- ✅ Validate metadata size before creating events
- ✅ Test event serialization size in unit tests

**DON'T**:
- ❌ Include full user profiles in metadata
- ❌ Embed arrays with unbounded size
- ❌ Add circular references
- ❌ Put bulk data in single events

### Code Review Checklist

When reviewing event-related code:
- [ ] Event contains only necessary data
- [ ] Metadata is minimal (< 10 KB)
- [ ] Arrays are bounded
- [ ] No circular references
- [ ] No full entity embeddings

---

## 🔧 Rollback Plan

If issues arise after deployment:

### Option 1: Increase Limits Temporarily

```yaml
# In docker-compose.yml
KAFKA_MESSAGE_MAX_BYTES: 52428800  # 50 MB
```

```typescript
// In kafka-event-store.ts
const MAX_MESSAGE_SIZE_MB = 50;  // Temporarily increase
```

### Option 2: Disable Validation (Emergency Only)

```typescript
// In kafka-event-store.ts - comment out validation
// this.validateMessageSize(serializedEvent, event, aggregateId);
```

⚠️ **WARNING**: Only for emergencies. Fix root cause immediately.

---

## 📈 Monitoring

### Key Metrics to Watch

1. **Large Event Warnings** (> 1 MB)
   - Should be rare
   - Investigate if frequent

2. **Size Errors** (> 10 MB)
   - Should never happen in normal operation
   - Indicates bugs that need immediate fixing

3. **Kafka Connection Errors**
   - Should not see `InvalidReceiveException` anymore
   - If you do, limits may need adjustment

### Log Queries

```bash
# Count large events in last hour
docker logs billing-api --since 1h 2>&1 | grep "Large event detected" | wc -l

# Find which event types are large
docker logs billing-api 2>&1 | grep "Large event detected" | grep -oP "(?<=): \w+" | sort | uniq -c

# Check for any size errors
docker logs billing-api 2>&1 | grep "exceeds maximum allowed size"
```

---

## 📚 Additional Resources

- **Detailed Fix Documentation**: `docs/KAFKA_MESSAGE_SIZE_FIX.md`
- **Kafka README**: `infrastructure/kafka/README.md`
- **Event Sourcing Best Practices**: `docs/adr/0007-async-event-sourcing-kafka.md`

---

## ✅ Status

- [x] Issue identified and analyzed
- [x] Application-layer validation implemented
- [x] Broker configuration updated
- [x] Documentation created
- [x] Build successful
- [ ] **Kafka cluster restarted** (action required)
- [ ] **Application restarted** (action required)
- [ ] **Root cause identified** (investigation needed)

---

**Date**: December 7, 2025  
**Fixed By**: AI Assistant  
**Status**: Ready for deployment - requires restart  
**Follow-up**: Investigate what caused the 1.14 GB message


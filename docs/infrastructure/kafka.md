# Kafka Setup

## Overview

Kafka serves as the **event store** for the billing engine, providing durable, ordered, and replayable event persistence. This guide covers Kafka configuration, topics, operations, and debugging.

---

## Why Kafka?

### Event Store Requirements

An event store needs:
- ✅ **Durability**: Events never lost
- ✅ **Ordering**: Events processed in sequence
- ✅ **Immutability**: Events never modified
- ✅ **Replayability**: Can replay from any point
- ✅ **Scalability**: Handle high throughput

**Kafka provides all of these.**

### Alternatives Considered

| Solution | Pros | Cons |
|----------|------|------|
| **Kafka** ✓ | Durable, scalable, industry standard | Complex setup |
| PostgreSQL | Simple, ACID | Not designed for event streaming |
| EventStore | Purpose-built | Less common, smaller ecosystem |
| Redis Streams | Fast | Not durable enough |

**Kafka chosen for**: Durability + Scalability + Ecosystem

---

## Architecture

### KRaft Mode (No Zookeeper!)

This project uses **Kafka 3.7+ with KRaft**:

```
┌─────────────────────┐
│   Kafka Broker      │
│   (KRaft mode)      │
│                     │
│  ┌───────────────┐  │
│  │  Controller   │  │  ← Built-in (no Zookeeper!)
│  └───────────────┘  │
│                     │
│  ┌───────────────┐  │
│  │    Broker     │  │  ← Stores events
│  └───────────────┘  │
└─────────────────────┘
```

**Benefits**:
- Simpler setup (one less service)
- Faster startup
- Better performance
- Future of Kafka (Zookeeper deprecated)

---

## Topics

### Topic Structure

```
billing-engine.{aggregate}.events
```

**Examples**:
- `billing-engine.account.events`
- `billing-engine.transaction.events`

### Topic Configuration

```typescript
// Created by init script
const topics = [
  {
    topic: 'billing-engine.account.events',
    numPartitions: 3,
    replicationFactor: 1,
    configEntries: [
      { name: 'retention.ms', value: '31536000000' },  // 1 year
      { name: 'cleanup.policy', value: 'compact' },
      { name: 'max.message.bytes', value: '10485760' }  // 10 MB
    ]
  },
  {
    topic: 'billing-engine.transaction.events',
    numPartitions: 3,
    replicationFactor: 1,
    configEntries: [
      { name: 'retention.ms', value: '31536000000' },
      { name: 'cleanup.policy', value: 'compact' },
      { name: 'max.message.bytes', value: '10485760' }
    ]
  }
];
```

**Key Settings**:
- **Partitions**: 3 (parallel processing)
- **Replication**: 1 (single broker, dev only)
- **Retention**: 1 year (for local dev; production would be longer)
- **Cleanup**: Compact (keep latest per key)
- **Max message**: 10 MB

---

## Partitioning

### Partition Strategy

Events partitioned by **aggregate ID**:

```typescript
// In KafkaEventStore
await producer.send({
  topic: 'billing-engine.account.events',
  messages: [{
    key: accountId,  // Partition key
    value: JSON.stringify(event)
  }]
});
```

**Result**: All events for an account go to the same partition.

### Why Partition by Aggregate ID?

```
Account A events → Partition 0
Account B events → Partition 1  
Account C events → Partition 0
Account D events → Partition 2
```

**Benefits**:
- ✅ **Ordering guaranteed** per account
- ✅ **Parallel processing** across accounts
- ✅ **Load balancing** (accounts distributed)

**Trade-off**: Hot accounts (high activity) can bottleneck a partition.

---

## Producer Configuration

### Idempotent Producer

```typescript
// In kafka.service.ts
this.producer = this.kafka.producer({
  allowAutoTopicCreation: false,
  idempotent: true,  // Exactly-once semantics
  maxInFlightRequests: 5,
  transactionalId: `${clientId}-producer`
});
```

**Idempotent**: Prevents duplicate events if network retry occurs.

### Message Size Limits

```typescript
// Application-level validation (10 MB)
const MAX_MESSAGE_SIZE = 10 * 1024 * 1024;

if (messageSize > MAX_MESSAGE_SIZE) {
  throw new Error(`Event too large: ${messageSize} bytes`);
}
```

**Layers**:
1. Application: 10 MB (enforced in code)
2. Broker: 10 MB (`max.message.bytes`)
3. Socket: 100 MB (`socket.request.max.bytes`)

---

## Consumer Configuration

### Consumer Groups

```typescript
const consumer = kafka.consumer({
  groupId: 'billing-engine-projections',
  sessionTimeout: 30000,
  heartbeatInterval: 3000
});

await consumer.subscribe({
  topics: [
    'billing-engine.account.events',
    'billing-engine.transaction.events'
  ],
  fromBeginning: true  // Replay all events on first start
});
```

**Consumer Groups**:
- `billing-engine-projections`: Updates PostgreSQL projections
- `billing-engine-sagas`: Processes saga events

### Offset Management

```typescript
await consumer.run({
  eachMessage: async ({ topic, partition, message }) => {
    // Process event
    await handleEvent(message);
    
    // Commit offset (auto-committed by default)
  }
});
```

**Auto-commit**: Enabled (commits every 5 seconds)

---

## Event Format

### Message Structure

```json
{
  "key": "acc-550e8400-e29b-41d4-a716-446655440000",
  "value": {
    "eventType": "BalanceChanged",
    "aggregateId": "acc-550e8400-e29b-41d4-a716-446655440000",
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
  },
  "headers": {
    "eventType": "BalanceChanged",
    "aggregateType": "Account"
  }
}
```

**Key**: Aggregate ID (for partitioning)  
**Value**: Full event payload (JSON)  
**Headers**: Metadata for filtering

---

## Operations

### List Topics

```bash
docker exec -it billing_kafka kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --list
```

**Output**:
```
billing-engine.account.events
billing-engine.transaction.events
```

### Describe Topic

```bash
docker exec -it billing_kafka kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --describe \
  --topic billing-engine.account.events
```

**Output**:
```
Topic: billing-engine.account.events
PartitionCount: 3
ReplicationFactor: 1
Configs: retention.ms=31536000000,cleanup.policy=compact

Partition: 0  Leader: 1  Replicas: 1  Isr: 1
Partition: 1  Leader: 1  Replicas: 1  Isr: 1
Partition: 2  Leader: 1  Replicas: 1  Isr: 1
```

### Consume Events

```bash
# From beginning
docker exec -it billing_kafka kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic billing-engine.account.events \
  --from-beginning

# With keys
docker exec -it billing_kafka kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic billing-engine.account.events \
  --property print.key=true \
  --property key.separator=": "

# With timestamps
docker exec -it billing_kafka kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic billing-engine.account.events \
  --property print.timestamp=true \
  --property print.offset=true
```

### Consumer Groups

```bash
# List consumer groups
docker exec -it billing_kafka kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --list

# Describe group
docker exec -it billing_kafka kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --describe \
  --group billing-engine-projections
```

**Output**:
```
GROUP                          TOPIC                              PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG
billing-engine-projections     billing-engine.account.events      0          150             150             0
billing-engine-projections     billing-engine.account.events      1          200             200             0
billing-engine-projections     billing-engine.account.events      2          175             175             0
```

**LAG**: Number of unprocessed messages (should be 0 or low)

### Reset Consumer Group

```bash
# Reset to earliest (replay all events)
docker exec -it billing_kafka kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --group billing-engine-projections \
  --reset-offsets \
  --to-earliest \
  --all-topics \
  --execute

# Reset to specific offset
docker exec -it billing_kafka kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --group billing-engine-projections \
  --reset-offsets \
  --to-offset 100 \
  --topic billing-engine.account.events:0 \
  --execute
```

---

## Monitoring

### Check Broker Health

```bash
docker exec -it billing_kafka kafka-broker-api-versions.sh \
  --bootstrap-server localhost:9092
```

### View Logs

```bash
# Kafka logs
docker logs -f billing_kafka

# Filter for errors
docker logs billing_kafka 2>&1 | grep ERROR
```

### Kafka UI (Optional)

Start Kafka UI:

```bash
docker-compose --profile debug up -d kafka-ui
```

Open browser:
```
http://localhost:8080
```

**Features**:
- Browse topics and messages
- View consumer groups and lag
- Inspect configurations
- Monitor performance

---

## Performance Tuning

### Producer Tuning

```typescript
// Batch settings
const producer = kafka.producer({
  compression: CompressionTypes.GZIP,  // Compress messages
  batch: {
    size: 16384,  // 16 KB batch size
    maxBytes: 1048576  // 1 MB max batch
  },
  linger: 10  // Wait 10ms to batch messages
});
```

**Trade-offs**:
- Higher batch size = better throughput, higher latency
- Compression = less network, more CPU

### Consumer Tuning

```typescript
const consumer = kafka.consumer({
  groupId: 'billing-engine-projections',
  maxBytesPerPartition: 1048576,  // 1 MB per partition
  sessionTimeout: 30000,
  heartbeatInterval: 3000
});
```

### Topic Tuning

```bash
# Increase partitions (more parallelism)
docker exec -it billing_kafka kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --alter \
  --topic billing-engine.account.events \
  --partitions 6

# Increase retention
docker exec -it billing_kafka kafka-configs.sh \
  --bootstrap-server localhost:9092 \
  --entity-type topics \
  --entity-name billing-engine.account.events \
  --alter \
  --add-config retention.ms=315360000000  # 10 years
```

---

## Troubleshooting

### Kafka Not Starting

```bash
# Check logs
docker logs billing_kafka

# Common issues:
# - Port conflict (9092 in use)
# - Out of memory
# - Corrupted data directory

# Solution: Clean and restart
docker-compose down -v
docker-compose up -d
```

### Consumer Lag

```bash
# Check lag
docker exec -it billing_kafka kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --describe \
  --group billing-engine-projections

# If LAG is high:
# 1. Check consumer is running
# 2. Check for errors in consumer logs
# 3. Increase partitions for parallelism
# 4. Optimize consumer processing
```

### Message Too Large

```
Error: MessageSizeTooLarge
```

**Solutions**:
1. Reduce event payload size
2. Increase `max.message.bytes`:

```bash
docker exec -it billing_kafka kafka-configs.sh \
  --bootstrap-server localhost:9092 \
  --entity-type topics \
  --entity-name billing-engine.account.events \
  --alter \
  --add-config max.message.bytes=20971520  # 20 MB
```

### Topic Not Found

```
Error: Topic 'billing-engine.account.events' does not exist
```

**Solution**: Run init script or create manually:

```bash
docker exec -it billing_kafka kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --create \
  --topic billing-engine.account.events \
  --partitions 3 \
  --replication-factor 1
```

---

## Production Considerations

### Current Setup (Development)

- Single broker
- No authentication
- No encryption
- 1-year retention
- 1 replication factor
- Auto-create topics disabled

### Production Would Need

**High Availability**:
- 3+ brokers
- Replication factor: 3
- Min in-sync replicas: 2

**Security**:
- SASL authentication
- TLS encryption
- ACLs (access control)

**Monitoring**:
- Prometheus metrics
- Grafana dashboards
- Alerting (lag, errors)

**Backup**:
- MirrorMaker 2 (replication)
- S3 archival
- Disaster recovery plan

**Retention**:
- 10+ years (regulatory)
- Tiered storage (S3)

**Performance**:
- More partitions (10-100)
- Dedicated hardware
- Tuned OS settings

**This project intentionally uses simplified dev setup.**

---

## Best Practices

### 1. Use Aggregate ID as Key

```typescript
// ✓ GOOD: Ensures ordering per aggregate
await producer.send({
  messages: [{
    key: aggregateId,
    value: JSON.stringify(event)
  }]
});

// ✗ BAD: Random partitioning, no ordering
await producer.send({
  messages: [{
    value: JSON.stringify(event)
  }]
});
```

### 2. Enable Idempotence

```typescript
// ✓ GOOD: Prevents duplicates
const producer = kafka.producer({
  idempotent: true
});
```

### 3. Handle Deserialization Errors

```typescript
try {
  const event = JSON.parse(message.value.toString());
  await handleEvent(event);
} catch (error) {
  logger.error('Failed to process event', error);
  // Send to dead letter queue
  await sendToDeadLetterQueue(message);
}
```

### 4. Monitor Consumer Lag

```bash
# Regular checks
docker exec -it billing_kafka kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --describe \
  --group billing-engine-projections
```

### 5. Use Compression

```typescript
const producer = kafka.producer({
  compression: CompressionTypes.GZIP
});
```

---

## Summary

| Aspect | Configuration |
|--------|---------------|
| **Mode** | KRaft (no Zookeeper) |
| **Brokers** | 1 (dev), 3+ (prod) |
| **Topics** | `billing-engine.{aggregate}.events` |
| **Partitions** | 3 per topic |
| **Replication** | 1 (dev), 3 (prod) |
| **Retention** | 1 year (dev), 10+ years (prod) |
| **Partitioning** | By aggregate ID |
| **Producer** | Idempotent, compressed |
| **Consumer** | Auto-commit, from beginning |

**Key Insight**: Kafka provides durable, ordered, replayable event storage—perfect for event sourcing.

---

## Related Documentation

- [Event Sourcing](../architecture/event-sourcing.md) - How events are used
- [Docker Setup](./docker.md) - Docker Compose configuration
- [Infrastructure Overview](./README.md) - All services
- [CQRS Pattern](../architecture/cqrs-pattern.md) - Command/event flow


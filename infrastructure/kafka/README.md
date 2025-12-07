# Kafka Infrastructure for Billing Engine

Event-driven billing engine infrastructure using Apache Kafka for event sourcing and async processing.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Kafka Cluster (3 Brokers)                │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │ Kafka-1  │    │ Kafka-2  │    │ Kafka-3  │              │
│  │ :9092    │    │ :9093    │    │ :9094    │              │
│  └──────────┘    └──────────┘    └──────────┘              │
│           Replication Factor: 3, Min ISR: 2                 │
└─────────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            │               │               │
   ┌────────▼────────┐  ┌──▼──────┐  ┌────▼────────┐
   │ Schema Registry │  │ Kafka UI│  │ Prometheus  │
   │     :8081       │  │  :8080  │  │    :9090    │
   └─────────────────┘  └─────────┘  └──────┬──────┘
                                             │
                                      ┌──────▼──────┐
                                      │   Grafana   │
                                      │    :3000    │
                                      └─────────────┘
```

## 📦 Components

### Kafka Cluster
- **3 Brokers**: High availability with replication
- **Zookeeper**: Cluster coordination
- **Replication Factor**: 3 (all data replicated 3 times)
- **Min ISR**: 2 (minimum in-sync replicas)
- **Retention**: Indefinite (for event sourcing)

### Topics
1. **billing.account.events** (10 partitions)
   - Account created, balance changed, status updated
   
2. **billing.transaction.events** (10 partitions)
   - Topup, withdrawal, transfer, refund events
   
3. **billing.saga.events** (5 partitions)
   - Saga orchestration for complex workflows
   
4. **billing.dead-letter** (1 partition)
   - Failed events for manual review

### Schema Registry
- **Port**: 8081
- **Purpose**: Schema validation and evolution
- **Compatibility**: Forward compatible

### Kafka UI
- **Port**: 8080
- **Purpose**: Visual cluster management
- **Features**: Topic browsing, consumer groups, messages

### Monitoring
- **Prometheus**: Metrics collection (:9090)
- **Grafana**: Dashboards and visualization (:3000)

## 🚀 Quick Start

### 1. Start the Cluster

```bash
cd infrastructure/kafka

# Start all services
docker-compose up -d

# Wait for cluster to be healthy (2-3 minutes)
docker-compose ps

# Check health
docker-compose logs -f kafka-1
```

### 2. Create Topics

```bash
# Make script executable
chmod +x create-topics.sh

# Create all topics
./create-topics.sh
```

### 3. Verify Setup

```bash
# Check Kafka UI
open http://localhost:8080

# Check Prometheus
open http://localhost:9090

# Check Grafana
open http://localhost:3000
# Login: admin / admin
```

## 🔧 Management Commands

### Cluster Management

```bash
# Start cluster
docker-compose up -d

# Stop cluster
docker-compose stop

# Restart cluster
docker-compose restart

# View logs
docker-compose logs -f [service-name]

# Check status
docker-compose ps
```

### Topic Operations

```bash
# List all topics
docker exec billing-kafka-1 kafka-topics --list \
  --bootstrap-server localhost:9092

# Describe topic
docker exec billing-kafka-1 kafka-topics --describe \
  --bootstrap-server localhost:9092 \
  --topic billing.account.events

# Get topic configuration
docker exec billing-kafka-1 kafka-configs --describe \
  --bootstrap-server localhost:9092 \
  --entity-type topics \
  --entity-name billing.account.events

# Delete topic (use with caution!)
docker exec billing-kafka-1 kafka-topics --delete \
  --bootstrap-server localhost:9092 \
  --topic billing.test.events
```

### Producer/Consumer Testing

```bash
# Produce test message
docker exec -it billing-kafka-1 kafka-console-producer \
  --bootstrap-server localhost:9092 \
  --topic billing.account.events \
  --property "key.separator=:" \
  --property "parse.key=true"

# Then type: test-key:{"event":"test"}

# Consume messages
docker exec -it billing-kafka-1 kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic billing.account.events \
  --from-beginning \
  --property print.key=true \
  --property print.timestamp=true
```

### Consumer Group Management

```bash
# List consumer groups
docker exec billing-kafka-1 kafka-consumer-groups --list \
  --bootstrap-server localhost:9092

# Describe consumer group
docker exec billing-kafka-1 kafka-consumer-groups --describe \
  --bootstrap-server localhost:9092 \
  --group billing-api-consumers

# Reset consumer group offset
docker exec billing-kafka-1 kafka-consumer-groups --reset-offsets \
  --bootstrap-server localhost:9092 \
  --group billing-api-consumers \
  --topic billing.account.events \
  --to-earliest \
  --execute
```

## 🔍 Monitoring

### Kafka UI (Port 8080)
- **Topics**: Browse topics, partitions, messages
- **Consumers**: View consumer groups, lag
- **Brokers**: Cluster health, broker details
- **Schema Registry**: View and manage schemas

### Prometheus (Port 9090)
- **Targets**: Check scrape targets health
- **Graph**: Query metrics (e.g., `kafka_server_brokertopicmetrics_messagesin_total`)
- **Alerts**: Configure alert rules

### Grafana (Port 3000)
- **Default Login**: admin / admin
- **Dashboards**: Import Kafka dashboards
- **Data Source**: Prometheus (already configured)

#### Import Kafka Dashboards:
1. Go to Dashboards → Import
2. Use dashboard IDs:
   - `7589` - Kafka Overview
   - `12460` - Kafka Consumer Lag
   - `11962` - Kafka Topics

## 🧹 Cleanup

### Stop and Remove Containers

```bash
# Stop services
docker-compose stop

# Remove containers
docker-compose down

# Remove containers AND volumes (deletes all data!)
docker-compose down -v

# Remove everything including networks
docker-compose down -v --remove-orphans
```

### Prune Docker Resources

```bash
# Remove unused containers
docker container prune -f

# Remove unused volumes
docker volume prune -f

# Remove unused networks
docker network prune -f

# Remove everything (use with caution!)
docker system prune -a --volumes -f
```

## 🚨 Troubleshooting

### Issue: Kafka won't start

```bash
# Check if ports are in use
lsof -i :9092
lsof -i :9093
lsof -i :9094

# Kill processes using the ports
kill -9 <PID>

# Or use different ports in docker-compose.yml
```

### Issue: Cluster is unhealthy

```bash
# Check individual broker logs
docker-compose logs kafka-1
docker-compose logs kafka-2
docker-compose logs kafka-3

# Check Zookeeper
docker-compose logs zookeeper

# Restart unhealthy broker
docker-compose restart kafka-1
```

### Issue: Cannot connect to cluster

```bash
# Test connectivity from host
docker exec billing-kafka-1 kafka-broker-api-versions \
  --bootstrap-server localhost:9092

# Test from inside container
docker exec -it billing-kafka-1 bash
kafka-broker-api-versions --bootstrap-server kafka-1:19092
```

### Issue: Schema Registry not working

```bash
# Test Schema Registry
curl http://localhost:8081/subjects

# Check logs
docker-compose logs schema-registry

# Restart
docker-compose restart schema-registry
```

### Issue: High disk usage

```bash
# Check disk usage by container
docker system df -v

# Check Kafka data volumes
docker volume inspect kafka-1-data
docker volume inspect kafka-2-data
docker volume inspect kafka-3-data

# Clear old segments (set retention)
docker exec billing-kafka-1 kafka-configs --alter \
  --bootstrap-server localhost:9092 \
  --entity-type topics \
  --entity-name billing.test.events \
  --add-config retention.ms=86400000  # 1 day
```

## 📊 Performance Tuning

### For Development
Current settings are optimized for local development:
- 3 brokers for HA testing
- Replication factor 3
- Min ISR 2

### For Production
Recommended changes:
- Increase broker memory
- Use dedicated disks (SSD)
- Tune OS parameters (file descriptors, network)
- Enable encryption (SSL/TLS)
- Configure authentication (SASL)
- Set up monitoring alerts

## 🔐 Security

### Development (Current)
- No authentication
- No encryption
- Open network

### Production (Recommended)
```yaml
# Add to docker-compose.yml
environment:
  KAFKA_SECURITY_PROTOCOL: SASL_SSL
  KAFKA_SASL_MECHANISM: SCRAM-SHA-512
  KAFKA_SSL_KEYSTORE_LOCATION: /etc/kafka/secrets/keystore.jks
  KAFKA_SSL_TRUSTSTORE_LOCATION: /etc/kafka/secrets/truststore.jks
```

## 📚 Resources

- [Kafka Documentation](https://kafka.apache.org/documentation/)
- [KafkaJS](https://kafka.js.org/)
- [Confluent Platform](https://docs.confluent.io/)
- [Schema Registry API](https://docs.confluent.io/platform/current/schema-registry/develop/api.html)

## 🎯 Next Steps

After infrastructure is running:
1. Install NestJS CQRS packages
2. Create base classes (DomainEvent, Command, Query)
3. Implement Kafka event store
4. Publish first event
5. Verify in Kafka UI

See: [Week 1 Kickoff Guide](../../docs/WEEK_1_KICKOFF.md)

---

**Status**: Production-ready for local development  
**Environment**: Docker Compose  
**Cluster Size**: 3 brokers  
**Monitoring**: Prometheus + Grafana  
**Management**: Kafka UI


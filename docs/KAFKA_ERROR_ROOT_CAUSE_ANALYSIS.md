# Kafka InvalidReceiveException - Root Cause Analysis

## 🔍 The Suspicious Number

The error shows:
```
size = 1195725856 larger than 104857600
```

Let's decode `1195725856`:
```
1195725856 in hexadecimal = 0x47455420
0x47 = 'G'
0x45 = 'E' 
0x54 = 'T'
0x20 = ' ' (space)

Result: "GET "
```

**🚨 SMOKING GUN**: This is the beginning of an HTTP GET request!

## Root Cause: HTTP Requests to Kafka Port

### What's Happening

When Kafka receives data on its port, it reads the first 4 bytes as an integer representing the message size. If someone sends an HTTP request like:

```
GET / HTTP/1.1
Host: kafka
```

Kafka interprets "GET " as the size field, which translates to 1,195,725,856 bytes (1.14 GB).

### This is NOT About Message Size Limits

While we fixed the message size limits (which is still valuable), **the actual issue is likely HTTP requests being sent to Kafka ports (9092, 9093, 9094)**.

## Potential Sources of HTTP Requests

### 1. ✅ Health Checks (Your Config is OK)

**Checked your docker-compose.yml:**
```yaml
# ✅ Correct - uses Kafka protocol
kafka-1 healthcheck: kafka-broker-api-versions --bootstrap-server localhost:9092

# ✅ Correct - uses netcat for Zookeeper
zookeeper healthcheck: nc -z localhost 2181

# ✅ Correct - HTTP to correct ports
schema-registry: curl http://localhost:8081/  # Port 8081, not Kafka
kafka-ui: wget http://localhost:8080          # Port 8080, not Kafka
```

**Verdict**: Your health checks are properly configured ✅

### 2. ❓ External Monitoring Tools

Common culprits:
- **Kubernetes liveness/readiness probes** using HTTP
- **Load balancer health checks** (AWS ALB, nginx, HAProxy)
- **Monitoring systems** (Datadog, New Relic, etc.)
- **API Gateway health checks**
- **Service mesh probes** (Istio, Linkerd)

### 3. ❓ Manual Testing

Someone might have run:
```bash
# ❌ WRONG - This sends HTTP to Kafka port
curl http://localhost:9092

# ❌ WRONG
wget http://localhost:9092

# ✅ CORRECT - Test Kafka connectivity
docker exec billing-kafka-1 kafka-broker-api-versions --bootstrap-server localhost:9092
```

### 4. ❓ Misconfigured Application

Application trying to connect to Kafka using HTTP client instead of Kafka client:
```typescript
// ❌ WRONG
axios.get('http://localhost:9092')

// ✅ CORRECT  
kafkaClient.connect({ brokers: ['localhost:9092'] })
```

## Can Zookeeper Cause This?

### Short Answer: No

**Zookeeper's Role:**
- Cluster coordination and metadata management
- Leader election
- Configuration storage
- Does NOT handle message routing or size validation

**Your Zookeeper Config:**
```yaml
ZOOKEEPER_CLIENT_PORT: 2181
ZOOKEEPER_TICK_TIME: 2000
```

✅ Configuration is correct and unrelated to the Kafka port error.

### When Zookeeper WOULD Cause Issues:

1. **Wrong Zookeeper address**: Kafka couldn't start
2. **Zookeeper down**: Cluster instability, but not `InvalidReceiveException`
3. **Network partition**: Leader election issues, not protocol errors

**Verdict**: Zookeeper cannot cause `InvalidReceiveException` ❌

## Other Kafka Misconfigurations to Check

### 1. Listener Configuration ⚠️

**Your Current Config:**
```yaml
KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092,PLAINTEXT_INTERNAL://kafka-1:19092
KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,PLAINTEXT_INTERNAL:PLAINTEXT
```

**Potential Issues:**
- If client connects to wrong listener, connection fails (but doesn't cause InvalidReceiveException)
- Using `localhost` is fine for Docker on same host

**Verdict**: Your listener config is correct ✅

### 2. Security Protocol Mismatch ⚠️

**Example Misconfiguration:**
```yaml
# Broker expects SSL
KAFKA_SECURITY_PROTOCOL: SSL

# But client connects with PLAINTEXT
```

**Result**: Kafka misinterprets SSL handshake as message data, causing size errors.

**Your Config:**
```yaml
KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,PLAINTEXT_INTERNAL:PLAINTEXT
```

**Verdict**: All using PLAINTEXT consistently ✅

### 3. Port Conflicts ⚠️

If another service is running on 9092/9093/9094 and accepting HTTP requests:

```bash
# Check what's listening on Kafka ports
sudo lsof -i :9092
sudo lsof -i :9093
sudo lsof -i :9094
```

Expected: Only Kafka containers should be listed.

## How to Find the Culprit

### 1. Check Kafka Logs for Client IP

```bash
docker logs billing-kafka-1 2>&1 | grep "InvalidReceiveException" -B 5
```

Look for the IP address in the log:
```
Unexpected error from /172.19.0.3 (channelId=...)
```

Then identify what container/service has that IP:
```bash
docker network inspect billing-network | grep -A 3 "172.19.0.3"
```

### 2. Monitor Network Traffic

```bash
# Install tcpdump in Kafka container
docker exec -it billing-kafka-1 bash
apt-get update && apt-get install -y tcpdump

# Capture traffic on port 9092
tcpdump -i any -A 'port 9092' | grep -i "GET\|POST\|HTTP"
```

If you see HTTP requests, you found the source!

### 3. Check Application Logs

Search your application logs for:
```bash
# Look for HTTP requests to Kafka ports
grep -r "9092\|9093\|9094" /var/log/your-app/ | grep -i "http\|curl\|wget"
```

### 4. Check Prometheus Configuration

```bash
# Check if Prometheus is trying to scrape Kafka ports as HTTP
cat infrastructure/kafka/prometheus.yml | grep "9092\|9093\|9094"
```

### 5. Check for Load Balancers / API Gateways

If running in cloud/k8s:
```bash
# AWS ALB health check targets
aws elbv2 describe-target-health --target-group-arn <arn>

# Kubernetes service/ingress configs
kubectl get svc -A | grep 909[2-4]
kubectl get ingress -A -o yaml | grep 909[2-4]
```

## Immediate Diagnostic Steps

Run these commands **now** to identify the source:

### Step 1: Identify the Source IP
```bash
docker logs billing-kafka-1 --since 1h 2>&1 | grep "InvalidReceiveException" -B 10
```

### Step 2: Find What Has That IP
```bash
# Get the IP from the log (e.g., 172.19.0.3)
docker network inspect billing-network | jq '.[].Containers[] | select(.IPv4Address | contains("172.19.0.3"))'
```

### Step 3: Check if HTTP Requests are Ongoing
```bash
# Monitor for new HTTP requests
docker exec billing-kafka-1 timeout 30 tcpdump -i any -A 'port 9092' 2>/dev/null | head -100
```

## Solutions

### If External Monitoring Tool
```yaml
# Configure monitoring to use proper Kafka health check
# Example for Kubernetes:
livenessProbe:
  tcpSocket:
    port: 9092
  # NOT httpGet!
```

### If Load Balancer
```bash
# Change health check from HTTP to TCP
# AWS ALB example:
aws elbv2 modify-target-group \
  --target-group-arn <arn> \
  --health-check-protocol TCP \
  --health-check-port 9092
```

### If Manual Testing
```bash
# Document correct commands for team
# ❌ NEVER: curl http://localhost:9092
# ✅ ALWAYS: Use Kafka tools or clients
```

## Prevention

### 1. Network Segmentation
```yaml
# In production, restrict Kafka ports to only necessary services
networks:
  kafka-network:
    internal: true  # No external access
  application-network:
    # Only app can reach Kafka
```

### 2. Add Firewall Rules
```bash
# Only allow Kafka protocol on Kafka ports
iptables -A INPUT -p tcp --dport 9092 -m string --algo bm --string "GET" -j DROP
```

### 3. Monitoring Alert
```yaml
# Alert on InvalidReceiveException
- alert: KafkaProtocolError
  expr: increase(kafka_server_socket_invalid_receive_total[5m]) > 0
  annotations:
    summary: "Kafka receiving non-Kafka protocol requests"
```

## Summary

| Potential Cause | Can Cause This Error? | Your Status |
|-----------------|----------------------|-------------|
| Oversized application messages | ✅ Yes | ✅ Fixed |
| HTTP requests to Kafka port | ✅ Yes | ❓ Needs investigation |
| Zookeeper misconfiguration | ❌ No | N/A |
| Listener misconfiguration | ⚠️ Rarely | ✅ Correct |
| Security protocol mismatch | ⚠️ Possibly | ✅ Correct |
| Health check misconfiguration | ✅ Yes | ✅ Correct |
| External monitoring tools | ✅ Yes | ❓ Unknown |
| Port conflicts | ⚠️ Rarely | ❓ Needs check |

## Recommended Action Plan

1. **Run diagnostics above** to find the HTTP request source
2. **Keep the message size fixes** (still valuable protection)
3. **Fix the HTTP request source** once identified
4. **Monitor for 24 hours** to ensure it's resolved
5. **Document the root cause** for team awareness

---

**Most Likely Culprit**: External monitoring tool or load balancer sending HTTP health checks to Kafka ports.

**Next Step**: Run the diagnostic commands to identify the exact source.


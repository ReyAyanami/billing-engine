#!/bin/bash

# Diagnostic script to find HTTP requests being sent to Kafka ports
# This helps identify the source of InvalidReceiveException errors

set -e

echo "═══════════════════════════════════════════════════════════"
echo "  Kafka HTTP Request Diagnostic Tool"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Check for InvalidReceiveException in logs
echo "📋 Step 1: Checking Kafka logs for InvalidReceiveException..."
echo ""

ERRORS_FOUND=0

for BROKER in billing-kafka-1 billing-kafka-2 billing-kafka-3; do
  echo "Checking ${BROKER}..."
  
  ERROR_COUNT=$(docker logs ${BROKER} --since 24h 2>&1 | grep -c "InvalidReceiveException" || true)
  
  if [ $ERROR_COUNT -gt 0 ]; then
    echo -e "${RED}✗ Found ${ERROR_COUNT} InvalidReceiveException error(s) in ${BROKER}${NC}"
    ERRORS_FOUND=$((ERRORS_FOUND + ERROR_COUNT))
    
    # Extract last occurrence with context
    echo ""
    echo "Last occurrence:"
    docker logs ${BROKER} --since 24h 2>&1 | grep "InvalidReceiveException" -B 5 | tail -20
    echo ""
  else
    echo -e "${GREEN}✓ No errors found in ${BROKER}${NC}"
  fi
done

echo ""
echo "Total errors found: ${ERRORS_FOUND}"
echo ""

if [ $ERRORS_FOUND -eq 0 ]; then
  echo -e "${GREEN}✓ No InvalidReceiveException errors found in the last 24 hours!${NC}"
  echo ""
  echo "If you saw this error before, it may have been:"
  echo "  1. A one-time occurrence (e.g., manual curl test)"
  echo "  2. Fixed by recent configuration changes"
  echo "  3. Older than 24 hours (check with: docker logs billing-kafka-1 | grep InvalidReceiveException)"
  exit 0
fi

# 2. Extract source IP addresses from errors
echo "═══════════════════════════════════════════════════════════"
echo "📍 Step 2: Identifying source IP addresses..."
echo ""

SOURCE_IPS=$(docker logs billing-kafka-1 --since 24h 2>&1 | \
  grep "InvalidReceiveException" -B 5 | \
  grep -oP '(?<=from /)[0-9.]+' | \
  sort -u)

if [ -z "$SOURCE_IPS" ]; then
  echo -e "${YELLOW}⚠ Could not extract source IP addresses from logs${NC}"
  echo ""
else
  echo "Found requests from these IP addresses:"
  echo "$SOURCE_IPS"
  echo ""
fi

# 3. Identify containers/services with those IPs
echo "═══════════════════════════════════════════════════════════"
echo "🔍 Step 3: Identifying containers with those IPs..."
echo ""

for IP in $SOURCE_IPS; do
  echo "Looking up IP: ${IP}"
  
  CONTAINER_INFO=$(docker network inspect billing-network 2>/dev/null | \
    jq -r --arg ip "$IP" '.[] | .Containers[] | select(.IPv4Address | contains($ip)) | "\(.Name) (\(.IPv4Address))"' || true)
  
  if [ -n "$CONTAINER_INFO" ]; then
    echo -e "${YELLOW}→ Container: ${CONTAINER_INFO}${NC}"
  else
    echo -e "${YELLOW}→ Unknown (external host or container not in billing-network)${NC}"
  fi
  echo ""
done

# 4. Check if any process is sending HTTP to Kafka ports
echo "═══════════════════════════════════════════════════════════"
echo "🌐 Step 4: Checking for active HTTP requests to Kafka ports..."
echo ""

echo "Monitoring Kafka ports for 10 seconds..."
echo "(Will capture any HTTP requests)"
echo ""

# Try to capture HTTP requests (requires tcpdump in container)
CAPTURED=false

for BROKER in billing-kafka-1; do
  echo "Monitoring ${BROKER} port 9092..."
  
  # Check if tcpdump is available
  if docker exec ${BROKER} which tcpdump >/dev/null 2>&1; then
    HTTP_CAPTURED=$(docker exec ${BROKER} timeout 10 tcpdump -i any -A 'port 9092' 2>/dev/null | \
      grep -i "GET \|POST \|HTTP" | head -5 || true)
    
    if [ -n "$HTTP_CAPTURED" ]; then
      echo -e "${RED}✗ HTTP requests detected!${NC}"
      echo "$HTTP_CAPTURED"
      CAPTURED=true
    else
      echo -e "${GREEN}✓ No HTTP requests detected in monitoring period${NC}"
    fi
  else
    echo -e "${YELLOW}⚠ tcpdump not available in container (cannot monitor live traffic)${NC}"
    echo "  To install: docker exec ${BROKER} bash -c 'apt-get update && apt-get install -y tcpdump'"
  fi
  echo ""
  break  # Only check first broker
done

# 5. Check common sources of HTTP requests
echo "═══════════════════════════════════════════════════════════"
echo "🔎 Step 5: Checking common HTTP request sources..."
echo ""

# Check Prometheus config
echo "Checking Prometheus configuration..."
if [ -f "prometheus.yml" ]; then
  PROM_KAFKA=$(grep -n "909[2-4]" prometheus.yml || true)
  if [ -n "$PROM_KAFKA" ]; then
    echo -e "${YELLOW}⚠ Found Kafka ports in prometheus.yml:${NC}"
    echo "$PROM_KAFKA"
    echo ""
  else
    echo -e "${GREEN}✓ Prometheus not scraping Kafka ports${NC}"
    echo ""
  fi
else
  echo "prometheus.yml not found in current directory"
  echo ""
fi

# Check docker-compose health checks
echo "Checking docker-compose.yml health checks..."
HEALTHCHECK_ISSUES=$(grep -A 2 "healthcheck:" ../docker-compose.yml 2>/dev/null | \
  grep -E "curl|wget.*909[2-4]" || true)

if [ -n "$HEALTHCHECK_ISSUES" ]; then
  echo -e "${RED}✗ Found HTTP health checks on Kafka ports:${NC}"
  echo "$HEALTHCHECK_ISSUES"
  echo ""
else
  echo -e "${GREEN}✓ No HTTP health checks on Kafka ports${NC}"
  echo ""
fi

# 6. Summary and recommendations
echo "═══════════════════════════════════════════════════════════"
echo "📊 Summary and Recommendations"
echo "═══════════════════════════════════════════════════════════"
echo ""

if [ $ERRORS_FOUND -gt 0 ]; then
  echo -e "${RED}Issues Found: ${ERRORS_FOUND} InvalidReceiveException error(s)${NC}"
  echo ""
  echo "Possible causes:"
  echo "  1. External monitoring tool sending HTTP health checks"
  echo "  2. Load balancer with HTTP health check configured"
  echo "  3. Someone manually testing with curl/wget"
  echo "  4. Application code using HTTP client instead of Kafka client"
  echo ""
  echo "Next steps:"
  echo "  1. Review the source IPs identified above"
  echo "  2. Check your monitoring/load balancer configurations"
  echo "  3. Ensure all services use Kafka protocol, not HTTP"
  echo "  4. Run: docker logs <container-name> to investigate further"
  echo ""
  echo "Correct way to test Kafka:"
  echo "  docker exec billing-kafka-1 kafka-broker-api-versions --bootstrap-server localhost:9092"
  echo ""
  echo "See: docs/KAFKA_ERROR_ROOT_CAUSE_ANALYSIS.md for detailed guidance"
else
  echo -e "${GREEN}✓ No recent issues detected${NC}"
  echo ""
  echo "The InvalidReceiveException error is not currently occurring."
  echo "It may have been a one-time event or already resolved."
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Diagnostic complete"
echo "═══════════════════════════════════════════════════════════"


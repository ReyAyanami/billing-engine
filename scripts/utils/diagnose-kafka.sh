#!/bin/bash

# Billing Engine - Kafka Diagnostics
# Diagnostic tool to identify HTTP requests being sent to Kafka ports
# Helps troubleshoot InvalidReceiveException errors

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║        Billing Engine - Kafka Diagnostic Tool                  ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

cd "$ROOT_DIR"

# Check if Kafka is running
if ! docker ps | grep -q "billing-kafka-1"; then
  echo -e "${RED}❌ Kafka services are not running${NC}"
  echo ""
  echo "Start services with: ./scripts/start.sh"
  exit 1
fi

echo -e "${GREEN}✅ Kafka services are running${NC}"
echo ""

# 1. Check for InvalidReceiveException in logs
echo "═══════════════════════════════════════════════════════════════"
echo "  Step 1: Checking Kafka logs for errors"
echo "═══════════════════════════════════════════════════════════════"
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
echo "Total errors found in last 24h: ${ERRORS_FOUND}"
echo ""

if [ $ERRORS_FOUND -eq 0 ]; then
  echo -e "${GREEN}✅ No InvalidReceiveException errors found!${NC}"
  echo ""
  echo "If you saw this error before, it may have been:"
  echo "  • A one-time occurrence (e.g., manual curl test)"
  echo "  • Fixed by recent configuration changes"
  echo "  • Older than 24 hours"
  echo ""
  echo "To check older logs:"
  echo "  docker logs billing-kafka-1 | grep InvalidReceiveException"
  echo ""
fi

# 2. Check broker connectivity
echo "═══════════════════════════════════════════════════════════════"
echo "  Step 2: Testing broker connectivity"
echo "═══════════════════════════════════════════════════════════════"
echo ""

for PORT in 9092 9093 9094; do
  echo "Testing broker on port ${PORT}..."
  if docker exec billing-kafka-1 kafka-broker-api-versions --bootstrap-server localhost:${PORT} > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Broker on port ${PORT} is responding${NC}"
  else
    echo -e "${RED}✗ Broker on port ${PORT} is not responding${NC}"
  fi
done

echo ""

# 3. List topics
echo "═══════════════════════════════════════════════════════════════"
echo "  Step 3: Listing Kafka topics"
echo "═══════════════════════════════════════════════════════════════"
echo ""

echo "Billing Engine topics:"
docker exec billing-kafka-1 kafka-topics --list \
  --bootstrap-server localhost:9092 \
  | grep "^billing\." || echo -e "${YELLOW}  No billing topics found${NC}"

echo ""

# 4. Check consumer groups
echo "═══════════════════════════════════════════════════════════════"
echo "  Step 4: Checking consumer groups"
echo "═══════════════════════════════════════════════════════════════"
echo ""

CONSUMER_GROUPS=$(docker exec billing-kafka-1 kafka-consumer-groups --list \
  --bootstrap-server localhost:9092 2>/dev/null || true)

if [ -n "$CONSUMER_GROUPS" ]; then
  echo "Active consumer groups:"
  echo "$CONSUMER_GROUPS"
else
  echo -e "${YELLOW}No consumer groups found${NC}"
fi

echo ""

# 5. Summary and recommendations
echo "═══════════════════════════════════════════════════════════════"
echo "  Summary"
echo "═══════════════════════════════════════════════════════════════"
echo ""

if [ $ERRORS_FOUND -gt 0 ]; then
  echo -e "${RED}❌ Issues detected: ${ERRORS_FOUND} error(s)${NC}"
  echo ""
  echo "Possible causes:"
  echo "  • External monitoring tool sending HTTP health checks"
  echo "  • Load balancer with HTTP health check configured"
  echo "  • Manual testing with curl/wget"
  echo "  • Application using HTTP client instead of Kafka client"
  echo ""
  echo "Recommendations:"
  echo "  1. Review source IPs in error logs"
  echo "  2. Check monitoring/load balancer configurations"
  echo "  3. Ensure all services use Kafka protocol, not HTTP"
  echo ""
  echo "Correct way to test Kafka:"
  echo "  docker exec billing-kafka-1 kafka-broker-api-versions --bootstrap-server localhost:9092"
  echo ""
  echo "📖 See docs/KAFKA_ERROR_ROOT_CAUSE_ANALYSIS.md for detailed guidance"
else
  echo -e "${GREEN}✅ All checks passed!${NC}"
  echo ""
  echo "Kafka cluster is healthy and operational."
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Diagnostic complete"
echo "═══════════════════════════════════════════════════════════════"
echo ""


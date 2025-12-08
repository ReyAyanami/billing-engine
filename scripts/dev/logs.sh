#!/bin/bash

# Billing Engine - Log Viewer
# Convenient script to view logs for different services

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$ROOT_DIR"

# Display usage if no argument provided
if [ $# -eq 0 ]; then
  echo "╔════════════════════════════════════════════════════════════════╗"
  echo "║          Billing Engine - Service Log Viewer                   ║"
  echo "╚════════════════════════════════════════════════════════════════╝"
  echo ""
  echo "Usage: $0 <service> [options]"
  echo ""
  echo "Available services:"
  echo "  • postgres          - PostgreSQL database"
  echo "  • kafka-1           - Kafka broker 1"
  echo "  • kafka-2           - Kafka broker 2"
  echo "  • kafka-3           - Kafka broker 3"
  echo "  • kafka-all         - All Kafka brokers"
  echo "  • zookeeper         - Zookeeper"
  echo "  • schema-registry   - Schema Registry"
  echo "  • kafka-ui          - Kafka UI"
  echo "  • prometheus        - Prometheus"
  echo "  • grafana           - Grafana"
  echo "  • all               - All services"
  echo ""
  echo "Options:"
  echo "  -f, --follow        Follow log output (live tail)"
  echo "  --tail N            Show last N lines (default: 100)"
  echo ""
  echo "Examples:"
  echo "  $0 kafka-1 -f                  # Follow Kafka broker 1 logs"
  echo "  $0 postgres --tail 50          # Show last 50 lines of PostgreSQL"
  echo "  $0 all -f                      # Follow all service logs"
  echo ""
  exit 1
fi

SERVICE=$1
shift

# Map service aliases to container names
case $SERVICE in
  postgres)
    docker-compose logs "$@" postgres
    ;;
  kafka-1)
    docker-compose logs "$@" kafka-1
    ;;
  kafka-2)
    docker-compose logs "$@" kafka-2
    ;;
  kafka-3)
    docker-compose logs "$@" kafka-3
    ;;
  kafka-all)
    docker-compose logs "$@" kafka-1 kafka-2 kafka-3
    ;;
  zookeeper)
    docker-compose logs "$@" zookeeper
    ;;
  schema-registry)
    docker-compose logs "$@" schema-registry
    ;;
  kafka-ui)
    docker-compose logs "$@" kafka-ui
    ;;
  prometheus)
    docker-compose logs "$@" prometheus
    ;;
  grafana)
    docker-compose logs "$@" grafana
    ;;
  all)
    docker-compose logs "$@"
    ;;
  *)
    echo "❌ Unknown service: $SERVICE"
    echo ""
    echo "Run '$0' without arguments to see available services"
    exit 1
    ;;
esac


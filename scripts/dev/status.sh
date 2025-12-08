#!/bin/bash

# Billing Engine - Service Status Checker
# Shows the current status of all services

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║          Billing Engine - Service Status                       ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

cd "$ROOT_DIR"

# Check Docker
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker is not running"
  exit 1
fi

echo "✅ Docker is running"
echo ""

# Show service status
echo "📊 Service Status:"
echo ""
docker-compose ps

echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""

# Count running services
RUNNING=$(docker-compose ps | grep "Up" | wc -l | tr -d ' ')
TOTAL=$(docker-compose ps | tail -n +2 | wc -l | tr -d ' ')

echo "Running services: $RUNNING / $TOTAL"
echo ""

# Show port bindings
echo "🌐 Port Bindings:"
echo ""
docker-compose ps --format "table {{.Name}}\t{{.Ports}}" | grep -v "^NAME" || true

echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "📋 Quick Actions:"
echo "  • View logs:       ./scripts/dev/logs.sh <service>"
echo "  • Stop services:   ./scripts/stop.sh"
echo "  • Start services:  ./scripts/start.sh"
echo "  • Reset services:  ./scripts/setup/reset.sh"
echo ""


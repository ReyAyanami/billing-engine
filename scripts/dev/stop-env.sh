#!/bin/bash

# Stop Development Environment
# Stops all services but keeps data

echo "🛑 Stopping Development Environment..."
echo ""

docker-compose down

echo ""
echo "✅ Environment Stopped!"
echo "💾 Data volumes preserved (use reset-env.sh to clean)"
echo ""


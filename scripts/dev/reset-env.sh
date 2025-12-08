#!/bin/bash

# Reset Development Environment
# Tears down everything and starts fresh

set -e

echo "🔄 Resetting Development Environment..."
echo ""

# Stop and remove everything
echo "📋 Stopping all containers..."
docker-compose down -v
echo "   ✅ Containers stopped and volumes removed"
echo ""

# Optional: Clean up Docker system
read -p "🗑️  Clean Docker system (remove unused images/volumes)? [y/N]: " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    docker system prune -f
    echo "   ✅ Docker system cleaned"
    echo ""
fi

# Start fresh
echo "🚀 Starting fresh environment..."
docker-compose up -d
echo ""

# Wait for health checks
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check status
echo ""
echo "✅ Environment Reset Complete!"
echo ""
echo "📊 Current Status:"
docker-compose ps
echo ""

echo "🎯 Ready to:"
echo "   npm run start:dev    # Start the app"
echo "   npm run test:e2e:new # Run tests"
echo ""


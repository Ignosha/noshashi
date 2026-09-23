#!/bin/bash
# IGNOSHASHI Production Startup Script
set -e

echo "🚀 Starting IGNOSHASHI in production mode..."

# Check for .env
if [ ! -f .env ]; then
  echo "❌ .env file not found. Copy .env.example to .env and configure it."
  exit 1
fi

# Install dependencies if needed
if [ ! -d node_modules ]; then
  echo "📦 Installing dependencies..."
  npm install --production
fi

# Create backups directory
mkdir -p backups

# Start with PM2
if command -v pm2 &> /dev/null; then
  echo "🔄 Starting with PM2..."
  pm2 start server.js --name ignoshashi --watch
  pm2 save
  echo "✅ IGNOSHASHI is running (PM2)"
  echo "   - View logs: pm2 logs ignoshashi"
  echo "   - Stop: pm2 stop ignoshashi"
  echo "   - Restart: pm2 restart ignoshashi"
else
  echo "⚠️  PM2 not found. Install with: npm install -g pm2"
  echo "🔄 Starting directly..."
  node server.js
fi

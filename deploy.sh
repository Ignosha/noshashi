#!/bin/bash
# IGNOSHASHI — One-click deploy to common VPS providers
set -e

echo "🚀 IGNOSHASHI Production Deploy"
echo "================================"

# Check OS
if [ ! -f /etc/os-release ]; then
  echo "❌ This script must run on a Linux server"
  exit 1
fi

echo "📋 Step 1/6: Installing system dependencies..."
sudo apt-get update -qq
sudo apt-get install -y -qq nodejs npm git > /dev/null 2>&1
echo "✅ Node.js: $(node --version)"
echo "✅ npm: $(npm --version)"

echo ""
echo "📋 Step 2/6: Installing PM2..."
sudo npm install -g pm2 > /dev/null 2>&1
echo "✅ PM2 installed"

echo ""
echo "📋 Step 3/6: Setting up application..."
APP_DIR="/opt/ignoshashi"
if [ ! -d "$APP_DIR" ]; then
  echo "📁 Creating app directory: $APP_DIR"
  sudo mkdir -p "$APP_DIR"
  sudo chown $USER:$USER "$APP_DIR"
fi

# If running from git repo
if [ -d .git ]; then
  echo "📦 Deploying from Git..."
  cp -r . "$APP_DIR/"
else
  echo "📦 Copying current directory..."
  cp -r . "$APP_DIR/"
fi

cd "$APP_DIR"

echo ""
echo "📋 Step 4/6: Installing dependencies..."
npm install --production

echo ""
echo "📋 Step 5/6: Setting up environment..."
if [ ! -f .env ]; then
  echo "⚠️  No .env file found. Creating from template..."
  cp .env.example .env 2>/dev/null || echo "⚠️  No .env.example found. Create .env manually."
fi

echo ""
echo "📋 Step 6/6: Creating backups directory..."
mkdir -p backups

echo ""
echo "🔄 Starting IGNOSHASHI with PM2..."
pm2 delete ignoshashi 2>/dev/null || true
pm2 start server.js --name ignoshashi --watch
pm2 save
pm2 startup

echo ""
echo "✅ Deployment complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Status:  pm2 status"
echo "📜 Logs:    pm2 logs ignoshashi"
echo "🔄 Restart: pm2 restart ignoshashi"
echo "⏹️  Stop:    pm2 stop ignoshashi"
echo ""
echo "🌐 App:     http://$(curl -s ifconfig.me):3000"
echo "🏥 Health:  http://$(curl -s ifconfig.me):3000/health"
echo ""
echo "⚠️  Don't forget to:"
echo "   1. Edit .env with your fee wallets and mainnet settings"
echo "   2. Fund your fee wallets"
echo "   3. Set up Nginx + SSL (see PRODUCTION.md)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

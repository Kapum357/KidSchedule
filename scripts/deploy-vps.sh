#!/bin/bash
#
# KidSchedule VPS Deployment Script
# Run as root on Ubuntu server
#
# Usage: bash deploy-vps.sh
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DEPLOY_USER="web"
APP_DIR="/opt/kidschedule"
ENV_FILE="/etc/kidschedule/env"
DOMAIN="v1.kidschedule.com"
GIT_REPO="https://github.com/Kapum357/KidSchedule.git"

echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  KidSchedule VPS Deployment Script      ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}ERROR: Please run as root${NC}"
  exit 1
fi

# Function to print step header
step() {
  echo ""
  echo -e "${GREEN}═══════════════════════════════════════════${NC}"
  echo -e "${GREEN} $1${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════${NC}"
}

# Function to check command success
check() {
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ $1${NC}"
  else
    echo -e "${RED}✗ $1 FAILED${NC}"
    exit 1
  fi
}

# Confirm before proceeding
echo -e "${YELLOW}This script will:${NC}"
echo "  1. Create deploy user '$DEPLOY_USER'"
echo "  2. Install Node.js 20 LTS and pnpm"
echo "  3. Clone repository and build application"
echo "  4. Configure systemd service"
echo "  5. Configure Nginx reverse proxy"
echo ""
read -p "Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Deployment cancelled."
  exit 0
fi

# ═══════════════════════════════════════════
# STEP 1: Create Deploy User
# ═══════════════════════════════════════════
step "Step 1: Create Deploy User"

if id "$DEPLOY_USER" &>/dev/null; then
  echo "User '$DEPLOY_USER' already exists"
else
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
  check "Created user '$DEPLOY_USER'"
fi

# Create SSH directory
mkdir -p /home/$DEPLOY_USER/.ssh
chmod 700 /home/$DEPLOY_USER/.ssh
chown -R $DEPLOY_USER:$DEPLOY_USER /home/$DEPLOY_USER/.ssh
check "Created SSH directory"

echo -e "${YELLOW}NOTE: Add your SSH public key to /home/$DEPLOY_USER/.ssh/authorized_keys${NC}"

# ═══════════════════════════════════════════
# STEP 2: Install Dependencies
# ═══════════════════════════════════════════
step "Step 2: Install System Dependencies"

# Update system
apt update && apt upgrade -y
check "Updated system packages"

# Install build tools
apt install -y build-essential python3 python3-pip git curl
check "Installed build tools"

# Install Node.js 20 LTS
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
  check "Installed Node.js"
else
  echo "Node.js already installed: $(node --version)"
fi

# Install pnpm
if ! command -v pnpm &> /dev/null; then
  corepack enable
  corepack prepare pnpm@latest --activate
  check "Installed pnpm"
else
  echo "pnpm already installed: $(pnpm --version)"
fi

# ═══════════════════════════════════════════
# STEP 3: Create Directory Structure
# ═══════════════════════════════════════════
step "Step 3: Create Directory Structure"

mkdir -p $APP_DIR/releases
mkdir -p $APP_DIR/shared
mkdir -p /etc/kidschedule
check "Created application directories"

chown -R $DEPLOY_USER:$DEPLOY_USER $APP_DIR
chown -R $DEPLOY_USER:$DEPLOY_USER /etc/kidschedule
check "Set directory ownership"

# ═══════════════════════════════════════════
# STEP 4: Clone and Build Application
# ═══════════════════════════════════════════
step "Step 4: Clone and Build Application"

RELEASE_DIR="$APP_DIR/releases/$(date +%Y%m%d%H%M)"

# Clone as web user
su - $DEPLOY_USER -c "git clone $GIT_REPO $RELEASE_DIR"
check "Cloned repository"

# Install dependencies
su - $DEPLOY_USER -c "cd $RELEASE_DIR && pnpm install --frozen-lockfile"
check "Installed dependencies"

# Verify bcrypt
if su - $DEPLOY_USER -c "cd $RELEASE_DIR && pnpm list bcrypt" | grep -q "bcrypt"; then
  echo -e "${GREEN}✓ bcrypt is installed${NC}"
else
  echo -e "${RED}✗ bcrypt not found in dependencies${NC}"
  exit 1
fi

# Run lint & type check
echo "Running validation..."
su - $DEPLOY_USER -c "cd $RELEASE_DIR && npx eslint 'app/(auth)' lib/ types/ --max-warnings=0"
check "ESLint validation passed"

su - $DEPLOY_USER -c "cd $RELEASE_DIR && npx tsc --noEmit"
check "TypeScript validation passed"

# ═══════════════════════════════════════════
# STEP 5: Environment Configuration
# ═══════════════════════════════════════════
step "Step 5: Environment Configuration"

if [ ! -f "$ENV_FILE" ]; then
  echo -e "${YELLOW}Creating environment file template...${NC}"
  cat > $ENV_FILE << 'EOF'
# Node Environment
NODE_ENV=production

# Application URL
APP_URL=https://v1.kidschedule.com

# JWT Keys (RS256) - REPLACE WITH YOUR GENERATED KEYS
JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
REPLACE_WITH_YOUR_PRIVATE_KEY
-----END PRIVATE KEY-----"

JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
REPLACE_WITH_YOUR_PUBLIC_KEY
-----END PUBLIC KEY-----"

# Token Configuration
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_DAYS=14

# Database - REPLACE WITH YOUR CONNECTION STRING
DATABASE_URL=postgresql://user:pass@host:5432/kidschedule?sslmode=require

# Email Provider
EMAIL_PROVIDER=console

# SMS Provider
SMS_PROVIDER=console

# Search Backend
SEARCH_BACKEND=memory
EOF

  chmod 600 $ENV_FILE
  chown $DEPLOY_USER:$DEPLOY_USER $ENV_FILE
  
  echo -e "${RED}IMPORTANT: Edit $ENV_FILE with your production values!${NC}"
  echo -e "${RED}Generate JWT keys with: openssl genrsa -out private.pem 2048${NC}"
  echo ""
  read -p "Press Enter after editing environment file..."
fi

# ═══════════════════════════════════════════
# STEP 6: Activate bcrypt in Code
# ═══════════════════════════════════════════
step "Step 6: Enable Production Password Hashing"

HASHER_FILE="$RELEASE_DIR/lib/auth/password-hashing.ts"

# Check if bcrypt is already enabled
if grep -q "const hasBcrypt = true" "$HASHER_FILE"; then
  echo "bcrypt already enabled"
else
  echo "Enabling bcrypt..."
  sed -i 's/const hasBcrypt = false/const hasBcrypt = true/' "$HASHER_FILE"
  check "Enabled bcrypt in password-hashing.ts"
fi

# Uncomment bcrypt implementation
if grep -q 'throw new Error("Bcrypt not installed' "$HASHER_FILE"; then
  echo -e "${YELLOW}WARNING: BcryptPasswordHasher still has placeholder implementation${NC}"
  echo "Manually update lib/auth/password-hashing.ts to use actual bcrypt"
fi

# ═══════════════════════════════════════════
# STEP 7: Build Application
# ═══════════════════════════════════════════
step "Step 7: Build Application"

su - $DEPLOY_USER -c "cd $RELEASE_DIR && pnpm build"
check "Built application"

# Create symlink to current release
ln -sfn $RELEASE_DIR $APP_DIR/current
check "Created symlink to current release"

# ═══════════════════════════════════════════
# STEP 8: Create systemd Service
# ═══════════════════════════════════════════
step "Step 8: Configure systemd Service"

cat > /etc/systemd/system/kidschedule.service << EOF
[Unit]
Description=KidSchedule Next.js Application
After=network.target

[Service]
Type=simple
User=$DEPLOY_USER
Group=$DEPLOY_USER
WorkingDirectory=$APP_DIR/current
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/pnpm start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=kidschedule

# Security hardening
NoNewPrivileges=true
PrivateTmp=true

# Resource limits
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
check "Created systemd service"

systemctl enable kidschedule
check "Enabled kidschedule service"

systemctl start kidschedule
check "Started kidschedule service"

# Wait for service to start
sleep 5

# Check if port 3000 is listening
if ss -tuln | grep -q ":3000 "; then
  echo -e "${GREEN}✓ Application is listening on port 3000${NC}"
else
  echo -e "${RED}✗ Application is NOT listening on port 3000${NC}"
  echo "Check logs with: journalctl -u kidschedule -n 50"
  exit 1
fi

# ═══════════════════════════════════════════
# STEP 9: Configure Nginx
# ═══════════════════════════════════════════
step "Step 9: Configure Nginx Reverse Proxy"

# Check if Nginx is installed
if ! command -v nginx &> /dev/null; then
  echo "Installing Nginx..."
  apt install -y nginx
  check "Installed Nginx"
fi

# Backup existing config if present
if [ -f /etc/nginx/sites-available/kidschedule.conf ]; then
  cp /etc/nginx/sites-available/kidschedule.conf /etc/nginx/sites-available/kidschedule.conf.backup.$(date +%Y%m%d%H%M)
  echo "Backed up existing Nginx config"
fi

# Create Nginx configuration
cat > /etc/nginx/sites-available/kidschedule.conf << 'NGINXEOF'
# Rate limiting zones
limit_req_zone $binary_remote_addr zone=general:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/m;

# Upstream for Next.js
upstream kidschedule_backend {
  server 127.0.0.1:3000 fail_timeout=5s max_fails=3;
  keepalive 32;
}

# HTTP → HTTPS redirect
server {
  listen 80;
  listen [::]:80;
  server_name v1.kidschedule.com;
  
  location /.well-known/acme-challenge/ {
    root /var/www/html;
  }
  
  location / {
    return 308 https://$server_name$request_uri;
  }
}

# HTTPS server
server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  server_name v1.kidschedule.com;
  
  # SSL Configuration
  ssl_certificate /etc/letsencrypt/live/v1.kidschedule.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/v1.kidschedule.com/privkey.pem;
  ssl_trusted_certificate /etc/letsencrypt/live/v1.kidschedule.com/chain.pem;
  
  ssl_protocols TLSv1.3 TLSv1.2;
  ssl_ciphers 'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
  ssl_prefer_server_ciphers off;
  ssl_session_cache shared:SSL:10m;
  ssl_session_timeout 10m;
  ssl_session_tickets off;
  
  ssl_stapling on;
  ssl_stapling_verify on;
  resolver 1.1.1.1 1.0.0.1 valid=300s;
  
  # Security Headers
  add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
  add_header X-Frame-Options "DENY" always;
  add_header X-Content-Type-Options "nosniff" always;
  
  # Logging
  access_log /var/log/nginx/kidschedule_access.log;
  error_log /var/log/nginx/kidschedule_error.log warn;
  
  client_max_body_size 10M;
  
  # Auth routes with strict rate limiting
  location ~ ^/(login|signup|forgot-password) {
    limit_req zone=auth burst=10 nodelay;
    proxy_pass http://kidschedule_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
  }
  
  # Main application
  location / {
    limit_req zone=general burst=20 nodelay;
    proxy_pass http://kidschedule_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
    proxy_read_timeout 60s;
  }
  
  # Static assets
  location /_next/static/ {
    proxy_pass http://kidschedule_backend;
    expires 1y;
    add_header Cache-Control "public, immutable";
  }
}
NGINXEOF

check "Created Nginx configuration"

# Enable site
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/kidschedule.conf /etc/nginx/sites-enabled/
check "Enabled Nginx site"

# Test configuration
nginx -t
check "Nginx configuration is valid"

# Reload Nginx
systemctl reload nginx
check "Reloaded Nginx"

# ═══════════════════════════════════════════
# STEP 10: Verification
# ═══════════════════════════════════════════
step "Step 10: Deployment Verification"

echo "Checking service status..."
systemctl status kidschedule --no-pager | head -n 5

echo ""
echo "Checking port 3000..."
ss -tuln | grep :3000 || echo "WARNING: Port 3000 not listening"

echo ""
echo "Testing localhost..."
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://127.0.0.1:3000/

echo ""
echo "Testing HTTPS..."
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" https://$DOMAIN/

echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN} Deployment Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
echo "Application URL: https://$DOMAIN"
echo ""
echo "Useful commands:"
echo "  View logs: journalctl -u kidschedule -f"
echo "  Restart: systemctl restart kidschedule"
echo "  Status: systemctl status kidschedule"
echo ""
echo -e "${YELLOW}TODO:${NC}"
echo "  1. Edit $ENV_FILE with production JWT keys and DATABASE_URL"
echo "  2. Update lib/auth/password-hashing.ts bcrypt implementation"
echo "  3. Restart service: systemctl restart kidschedule"
echo "  4. Run security verification tests (see PRODUCTION_MIGRATION.md)"
echo ""

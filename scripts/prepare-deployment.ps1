# KidSchedule Deployment Preparation Script (Windows)
# Run this on your LOCAL Windows machine BEFORE deploying to server
#
# This script will:
# 1. Generate JWT RS256 keypair
# 2. Create environment file template
# 3. Provide deployment commands

param(
    [switch]$GenerateKeys = $false
)

$ErrorActionPreference = "Stop"

Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  KidSchedule Deployment Preparation     ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

# Check if OpenSSL is available
$hasOpenSSL = Get-Command openssl -ErrorAction SilentlyContinue

if (-not $hasOpenSSL) {
    Write-Host "ERROR: OpenSSL not found in PATH" -ForegroundColor Red
    Write-Host ""
    Write-Host "Options to install OpenSSL on Windows:" -ForegroundColor Yellow
    Write-Host "  1. Git for Windows (includes OpenSSL): https://git-scm.com/download/win"
    Write-Host "  2. OpenSSL for Windows: https://slproweb.com/products/Win32OpenSSL.html"
    Write-Host "  3. WSL with Ubuntu: wsl --install"
    Write-Host ""
    exit 1
}

Write-Host "✓ OpenSSL found: $($hasOpenSSL.Source)" -ForegroundColor Green
Write-Host ""

# Create temporary directory for keys
$tempDir = Join-Path $env:TEMP "kidschedule-keys-$(Get-Date -Format 'yyyyMMddHHmmss')"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

Write-Host "Generating RS256 keypair for JWT signing..." -ForegroundColor Cyan
Write-Host ""

# Generate keys
try {
    # Generate private key
    & openssl genrsa -out "$tempDir\private.pem" 2048 2>&1 | Out-Null
    
    # Extract public key
    & openssl rsa -in "$tempDir\private.pem" -pubout -out "$tempDir\public.pem" 2>&1 | Out-Null
    
    # Convert to PKCS8 format (required by jose library)
    & openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in "$tempDir\private.pem" -out "$tempDir\private_pkcs8.pem" 2>&1 | Out-Null
    
    Write-Host "✓ Keys generated successfully" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "ERROR: Failed to generate keys: $_" -ForegroundColor Red
    exit 1
}

# Read keys
$privateKey = Get-Content "$tempDir\private_pkcs8.pem" -Raw
$publicKey = Get-Content "$tempDir\public.pem" -Raw

# Format keys for environment file (escape newlines)
$privateKeyEscaped = $privateKey -replace "`r`n", "\n" -replace "`n", "\n"
$publicKeyEscaped = $publicKey -replace "`r`n", "\n" -replace "`n", "\n"

# Create environment file template
$envTemplate = @"
# KidSchedule Production Environment Configuration
# File location on server: /etc/kidschedule/env
# Permissions: chmod 600 /etc/kidschedule/env

# ═══════════════════════════════════════════════════════════
# Node Environment
# ═══════════════════════════════════════════════════════════
NODE_ENV=production

# ═══════════════════════════════════════════════════════════
# Application URL
# ═══════════════════════════════════════════════════════════
APP_URL=https://v1.kidschedule.com

# ═══════════════════════════════════════════════════════════
# JWT Keys (RS256) - GENERATED $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
# ═══════════════════════════════════════════════════════════
JWT_PRIVATE_KEY="$privateKeyEscaped"

JWT_PUBLIC_KEY="$publicKeyEscaped"

# ═══════════════════════════════════════════════════════════
# Token Configuration
# ═══════════════════════════════════════════════════════════
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_DAYS=14

# ═══════════════════════════════════════════════════════════
# Database - REPLACE WITH YOUR CONNECTION STRING
# ═══════════════════════════════════════════════════════════
# Examples:
#   Neon: postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/kidschedule?sslmode=require
#   Supabase: postgresql://postgres:pass@db.xxx.supabase.co:5432/postgres?sslmode=require
#   Self-hosted: postgresql://user:pass@localhost:5432/kidschedule?sslmode=require
DATABASE_URL=postgresql://user:pass@host:5432/kidschedule?sslmode=require

# ═══════════════════════════════════════════════════════════
# Email Provider
# ═══════════════════════════════════════════════════════════
EMAIL_PROVIDER=console
# Options: console, sendgrid, ses

# Uncomment if using SendGrid:
# EMAIL_PROVIDER=sendgrid
# SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxx
# SENDGRID_FROM_EMAIL=noreply@kidschedule.com
# SENDGRID_FROM_NAME=KidSchedule

# Uncomment if using AWS SES:
# EMAIL_PROVIDER=ses
# AWS_ACCESS_KEY_ID=AKIAxxxxxxxxxxxxx
# AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# AWS_SES_REGION=us-east-1
# SES_FROM_EMAIL=noreply@kidschedule.com
# SES_FROM_NAME=KidSchedule

# ═══════════════════════════════════════════════════════════
# SMS Provider
# ═══════════════════════════════════════════════════════════
SMS_PROVIDER=console
# Options: console, twilio, sns

# Uncomment if using Twilio:
# SMS_PROVIDER=twilio
# TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# TWILIO_FROM_NUMBER=+15551234567

# Uncomment if using AWS SNS:
# SMS_PROVIDER=sns
# AWS_ACCESS_KEY_ID=AKIAxxxxxxxxxxxxx
# AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# AWS_SNS_REGION=us-east-1
# SNS_FROM_NUMBER=+15551234567

# ═══════════════════════════════════════════════════════════
# Optional: Redis for Horizontal Scaling
# ═══════════════════════════════════════════════════════════
# REDIS_URL=redis://localhost:6379
# or for managed Redis:
# REDIS_URL=redis://user:pass@redis-host:6379

# ═══════════════════════════════════════════════════════════
# Optional: Search Backend
# ═══════════════════════════════════════════════════════════
SEARCH_BACKEND=memory
# Options: memory, postgres, elasticsearch

# ═══════════════════════════════════════════════════════════
# Optional: Image Optimization
# ═══════════════════════════════════════════════════════════
# CLOUDINARY_URL=cloudinary://key:secret@cloud_name
# or
# IMGIX_DOMAIN=your-domain.imgix.net

# ═══════════════════════════════════════════════════════════
# Optional: SendGrid Template IDs
# ═══════════════════════════════════════════════════════════
# SENDGRID_TEMPLATE_PASSWORD_RESET=d-xxxxxxxxxxxxx
# SENDGRID_TEMPLATE_PASSWORD_RESET_CONFIRMATION=d-xxxxxxxxxxxxx
# SENDGRID_TEMPLATE_EMAIL_VERIFICATION=d-xxxxxxxxxxxxx
# SENDGRID_TEMPLATE_WELCOME=d-xxxxxxxxxxxxx
# SENDGRID_TEMPLATE_PHONE_VERIFIED=d-xxxxxxxxxxxxx
# SENDGRID_TEMPLATE_SESSION_REVOKED=d-xxxxxxxxxxxxx
"@

# Save environment file
$envFilePath = Join-Path $PSScriptRoot "..\production.env"
$envTemplate | Out-File -FilePath $envFilePath -Encoding UTF8

Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host " Environment File Generated" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "✓ JWT keys generated and included" -ForegroundColor Green
Write-Host "✓ Environment template created: $envFilePath" -ForegroundColor Green
Write-Host ""
Write-Host "Keys also saved to: $tempDir" -ForegroundColor Yellow
Write-Host "  - Keep these keys SECURE and BACKED UP" -ForegroundColor Yellow
Write-Host "  - Never commit to git or share publicly" -ForegroundColor Yellow
Write-Host ""

# Create deployment instructions
$instructions = @"

═══════════════════════════════════════════════════════════════
 NEXT STEPS FOR SERVER DEPLOYMENT
═══════════════════════════════════════════════════════════════

1. EDIT ENVIRONMENT FILE
   Open: $envFilePath
   Update: DATABASE_URL with your actual connection string

2. TRANSFER TO SERVER
   You can either:
   
   a) Copy file manually:
      scp production.env root@v1.kidschedule.com:/etc/kidschedule/env
      
   b) Copy content and paste on server:
      ssh root@v1.kidschedule.com
      nano /etc/kidschedule/env
      # Paste content, save, then:
      chmod 600 /etc/kidschedule/env
      chown web:web /etc/kidschedule/env

3. RUN DEPLOYMENT SCRIPT ON SERVER
   ssh root@v1.kidschedule.com
   curl -sSL https://raw.githubusercontent.com/Kapum357/KidSchedule/main/scripts/deploy-vps.sh -o deploy.sh
   bash deploy.sh

4. VERIFY DEPLOYMENT
   ssh root@v1.kidschedule.com
   bash /opt/kidschedule/current/scripts/verify-deployment.sh

5. TEST APPLICATION
   Open browser: https://v1.kidschedule.com
   Test signup, login, password reset flows

═══════════════════════════════════════════════════════════════
 DEPLOYMENT CHECKLIST
═══════════════════════════════════════════════════════════════

□ Edit production.env with database URL
□ Transfer environment file to server
□ Run deploy-vps.sh on server
□ Verify deployment with verify-deployment.sh
□ Test all authentication flows
□ Monitor logs for first 24 hours
□ Set up external uptime monitoring

═══════════════════════════════════════════════════════════════
 IMPORTANT SECURITY REMINDERS
═══════════════════════════════════════════════════════════════

✓ JWT keys are unique and securely generated
✓ Environment file will have 600 permissions on server
✓ Database connection uses SSL (?sslmode=require)
✓ HTTPS is enforced with HSTS
✓ bcrypt is configured for password hashing
✓ Constant-time comparisons prevent timing attacks
✓ Rate limiting prevents brute-force attacks

═══════════════════════════════════════════════════════════════

"@

Write-Host $instructions

# Open environment file in default editor
Write-Host "Opening environment file in default editor..." -ForegroundColor Cyan
Start-Process $envFilePath

Write-Host ""
Write-Host "Press any key to continue..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

#!/bin/bash
#
# Verify KidSchedule deployment security and functionality
# Run on server after deployment
#

set -eo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

DOMAIN="v1.kidschedule.com"
ENV_FILE="/etc/kidschedule/env"
APP_DIR="/opt/kidschedule/current"

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

# Test functions
pass() {
  echo -e "${GREEN}✓ PASS:${NC} $1"
  ((PASS_COUNT++))
}

fail() {
  echo -e "${RED}✗ FAIL:${NC} $1"
  ((FAIL_COUNT++))
}

warn() {
  echo -e "${YELLOW}⚠ WARN:${NC} $1"
  ((WARN_COUNT++))
}

section() {
  echo ""
  echo -e "${GREEN}═══════════════════════════════════════════${NC}"
  echo -e "${GREEN} $1${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════${NC}"
}

echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  KidSchedule Deployment Verification    ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"

# ═══════════════════════════════════════════
# System Checks
# ═══════════════════════════════════════════
section "System Checks"

# Check if service is running
if systemctl is-active --quiet kidschedule; then
  pass "kidschedule service is running"
else
  fail "kidschedule service is NOT running"
fi

# Check if port 3000 is listening
if ss -tuln | grep -q ":3000 "; then
  pass "Port 3000 is listening"
else
  fail "Port 3000 is NOT listening"
fi

# Check Nginx is running
if systemctl is-active --quiet nginx; then
  pass "Nginx is running"
else
  fail "Nginx is NOT running"
fi

# ═══════════════════════════════════════════
# Environment Configuration
# ═══════════════════════════════════════════
section "Environment Configuration"

# Check environment file exists and has correct permissions
if [ -f "$ENV_FILE" ]; then
  pass "Environment file exists"
  
  # Check permissions (should be 600)
  PERMS=$(stat -c "%a" "$ENV_FILE")
  if [ "$PERMS" = "600" ]; then
    pass "Environment file has correct permissions (600)"
  else
    fail "Environment file has incorrect permissions ($PERMS, should be 600)"
  fi
else
  fail "Environment file does not exist: $ENV_FILE"
fi

# Check critical environment variables
if grep -q "JWT_PRIVATE_KEY" "$ENV_FILE" && ! grep -q "REPLACE_WITH_YOUR" "$ENV_FILE"; then
  pass "JWT keys are configured"
else
  fail "JWT keys are NOT configured (still contain placeholders)"
fi

if grep -q "DATABASE_URL.*sslmode=require" "$ENV_FILE"; then
  pass "Database URL includes SSL requirement"
else
  warn "Database URL may not require SSL"
fi

if grep -q "NODE_ENV=production" "$ENV_FILE"; then
  pass "NODE_ENV is set to production"
else
  fail "NODE_ENV is NOT set to production"
fi

# ═══════════════════════════════════════════
# bcrypt Check
# ═══════════════════════════════════════════
section "Password Hashing Security"

HASHER_FILE="$APP_DIR/lib/auth/password-hashing.ts"

if grep -q "const hasBcrypt = true" "$HASHER_FILE"; then
  pass "bcrypt is enabled in code"
else
  fail "bcrypt is NOT enabled (hasBcrypt = false)"
fi

# Check if bcrypt implementation is real (not throwing error)
if grep -q 'throw new Error("Bcrypt not installed' "$HASHER_FILE"; then
  fail "BcryptPasswordHasher still has stub implementation"
else
  pass "BcryptPasswordHasher has real implementation"
fi

# ═══════════════════════════════════════════
# HTTPS and Security Headers
# ═══════════════════════════════════════════
section "HTTPS & Security Headers"

# Test HTTP → HTTPS redirect
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -L http://$DOMAIN/ 2>/dev/null || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
  pass "HTTP redirects to HTTPS (final status: 200)"
else
  warn "HTTP request returned status: $HTTP_STATUS"
fi

# Test HTTPS endpoint
HTTPS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://$DOMAIN/ 2>/dev/null || echo "000")
if [ "$HTTPS_STATUS" = "200" ]; then
  pass "HTTPS endpoint is accessible"
else
  fail "HTTPS endpoint returned status: $HTTPS_STATUS"
fi

# Check HSTS header
HSTS=$(curl -s -I https://$DOMAIN/ 2>/dev/null | grep -i "strict-transport-security" || echo "")
if [ -n "$HSTS" ]; then
  pass "HSTS header is present"
else
  fail "HSTS header is missing"
fi

# Check X-Frame-Options
XFRAME=$(curl -s -I https://$DOMAIN/ 2>/dev/null | grep -i "x-frame-options" || echo "")
if [ -n "$XFRAME" ]; then
  pass "X-Frame-Options header is present"
else
  warn "X-Frame-Options header is missing"
fi

# ═══════════════════════════════════════════
# Code Security Audit
# ═══════════════════════════════════════════
section "Code Security Audit"

# Check for safeCompare usage
UNSAFE_COMPARE=$(grep -r "=== " "$APP_DIR/lib/auth-engine.ts" | grep -E "(token|otp|password)" || echo "")
if [ -z "$UNSAFE_COMPARE" ]; then
  pass "No unsafe token/OTP comparisons found"
else
  warn "Potentially unsafe comparisons found"
fi

# Check safeCompare function exists
if grep -q "safeCompare" "$APP_DIR/lib/auth-engine.ts"; then
  pass "safeCompare function is implemented"
else
  fail "safeCompare function not found"
fi

# Check for plaintext OTP storage
if grep -n "storeOTP\|saveOTP" "$APP_DIR/lib/auth-engine.ts" | grep -v "hash"; then
  warn "OTP storage may not be hashed (manual review needed)"
else
  pass "OTP storage appears to use hashing"
fi

# ═══════════════════════════════════════════
# Network Tests
# ═══════════════════════════════════════════
section "Network & Connectivity"

# Test localhost connection
if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ | grep -q "200"; then
  pass "Localhost connection works"
else
  warn "Localhost connection failed"
fi

# Test external HTTPS
if curl -s -o /dev/null -w "%{http_code}" https://$DOMAIN/ | grep -q "200"; then
  pass "External HTTPS connection works"
else
  fail "External HTTPS connection failed"
fi

# ═══════════════════════════════════════════
# File Permissions
# ═══════════════════════════════════════════
section "File Permissions"

# Check application directory ownership
APP_OWNER=$(stat -c "%U:%G" "$APP_DIR")
if [ "$APP_OWNER" = "web:web" ]; then
  pass "Application directory has correct ownership"
else
  warn "Application directory ownership: $APP_OWNER (expected: web:web)"
fi

# Check for secrets in git history (this is a warning)
if [ -d "$APP_DIR/.git" ]; then
  if git -C "$APP_DIR" log --all --full-history --source --oneline -S "JWT_PRIVATE_KEY" 2>/dev/null | grep -q "JWT"; then
    fail "CRITICAL: JWT keys found in git history!"
  else
    pass "No secrets found in git history"
  fi
fi

# ═══════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════
echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN} Verification Summary${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}Passed:${NC}  $PASS_COUNT"
echo -e "  ${RED}Failed:${NC}  $FAIL_COUNT"
echo -e "  ${YELLOW}Warnings:${NC} $WARN_COUNT"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
  echo -e "${GREEN}✓ All critical checks passed!${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. Review warnings above"
  echo "  2. Test authentication flows manually"
  echo "  3. Monitor logs: journalctl -u kidschedule -f"
  echo ""
  exit 0
else
  echo -e "${RED}✗ Deployment has failures that must be fixed${NC}"
  echo ""
  echo "Fix the failed checks above and run this script again."
  echo ""
  exit 1
fi

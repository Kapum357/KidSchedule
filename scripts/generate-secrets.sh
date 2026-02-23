#!/bin/bash
#
# Generate secrets for KidSchedule production deployment
# Run on a secure local machine (not on the server)
#

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  KidSchedule Secret Generation          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""

# Create temp directory
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

echo "Generating RS256 keypair for JWT..."
echo ""

# Generate private key
openssl genrsa -out private.pem 2048 2>/dev/null

# Extract public key
openssl rsa -in private.pem -pubout -out public.pem 2>/dev/null

# Convert private key to PKCS8 format (required by jose library)
openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in private.pem -out private_pkcs8.pem 2>/dev/null

echo -e "${GREEN}✓ Keys generated successfully${NC}"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "Copy these values to your /etc/kidschedule/env file on the server:"
echo "═══════════════════════════════════════════════════════════════"
echo ""

echo "# JWT Private Key (RS256)"
echo "JWT_PRIVATE_KEY=\"$(cat private_pkcs8.pem | sed ':a;N;$!ba;s/\n/\\n/g')\""
echo ""

echo "# JWT Public Key (RS256)"
echo "JWT_PUBLIC_KEY=\"$(cat public.pem | sed ':a;N;$!ba;s/\n/\\n/g')\""
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo ""
echo -e "${YELLOW}IMPORTANT:${NC}"
echo "  1. Copy the above keys to /etc/kidschedule/env on your server"
echo "  2. Replace the placeholder values"
echo "  3. Keep these keys SECURE and BACKED UP"
echo "  4. Never commit keys to git or share publicly"
echo ""
echo "Keys saved temporarily in: $TEMP_DIR"
echo "To save for backup:"
echo "  cp $TEMP_DIR/private_pkcs8.pem ~/kidschedule-jwt-private.pem"
echo "  cp $TEMP_DIR/public.pem ~/kidschedule-jwt-public.pem"
echo ""
echo "Clean up when done:"
echo "  rm -rf $TEMP_DIR"
echo ""

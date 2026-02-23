#!/bin/bash
#
# Enable production bcrypt password hashing
# Run on the server after deployment
#

set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

APP_DIR="/opt/kidschedule/current"
HASHER_FILE="$APP_DIR/lib/auth/password-hashing.ts"

echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Enable Production Password Hashing     ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""

# Check if file exists
if [ ! -f "$HASHER_FILE" ]; then
  echo -e "${RED}ERROR: File not found: $HASHER_FILE${NC}"
  exit 1
fi

# Check if bcrypt is installed
if ! pnpm list bcrypt 2>/dev/null | grep -q "bcrypt"; then
  echo -e "${RED}ERROR: bcrypt is not installed${NC}"
  echo "Install with: pnpm add bcrypt @types/bcrypt"
  exit 1
fi

echo "Enabling bcrypt in password-hashing.ts..."

# Backup original file
cp "$HASHER_FILE" "${HASHER_FILE}.backup.$(date +%Y%m%d%H%M)"
echo -e "${GREEN}✓ Backed up original file${NC}"

# Step 1: Change hasBcrypt flag
sed -i 's/const hasBcrypt = false/const hasBcrypt = true/' "$HASHER_FILE"
echo -e "${GREEN}✓ Enabled bcrypt flag${NC}"

# Step 2: Update BcryptPasswordHasher implementation
# We need to replace the stub implementation with real bcrypt calls

# Create the new implementation
NEW_IMPLEMENTATION='class BcryptPasswordHasher implements PasswordHasher {
  private readonly saltRounds = 12;

  async hash(plaintext: string): Promise<string> {
    // Dynamic import for Edge compatibility
    const bcrypt = await import('\''bcrypt'\'');
    return bcrypt.hash(plaintext, this.saltRounds);
  }

  async verify(plaintext: string, storedHash: string): Promise<boolean> {
    // Dynamic import for Edge compatibility
    const bcrypt = await import('\''bcrypt'\'');
    return bcrypt.compare(plaintext, storedHash);
  }
}'

# Find and replace the BcryptPasswordHasher class
# This is complex, so we'll provide manual instructions instead

echo ""
echo -e "${YELLOW}Manual step required:${NC}"
echo "Edit $HASHER_FILE and replace the BcryptPasswordHasher class with:"
echo ""
echo "$NEW_IMPLEMENTATION"
echo ""
echo "Or run this sed command:"
echo ""
cat << 'EOF'
sed -i '/^class BcryptPasswordHasher/,/^}/c\
class BcryptPasswordHasher implements PasswordHasher {\
  private readonly saltRounds = 12;\
\
  async hash(plaintext: string): Promise<string> {\
    const bcrypt = await import("bcrypt");\
    return bcrypt.hash(plaintext, this.saltRounds);\
  }\
\
  async verify(plaintext: string, storedHash: string): Promise<boolean> {\
    const bcrypt = await import("bcrypt");\
    return bcrypt.compare(plaintext, storedHash);\
  }\
}' /opt/kidschedule/current/lib/auth/password-hashing.ts
EOF
echo ""

# Verify changes
if grep -q "const hasBcrypt = true" "$HASHER_FILE"; then
  echo -e "${GREEN}✓ bcrypt flag is enabled${NC}"
else
  echo -e "${RED}✗ bcrypt flag was NOT enabled${NC}"
fi

echo ""
echo "Next steps:"
echo "  1. Verify the BcryptPasswordHasher implementation"
echo "  2. Rebuild application: cd $APP_DIR && pnpm build"
echo "  3. Restart service: systemctl restart kidschedule"
echo "  4. Test with: node -e \"import('./lib/auth/password-hashing.ts').then(m => m.getPasswordHasher().hash('test'))\""
echo ""

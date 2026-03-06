# Stripe Billing Environment Variables Quick Reference

Copy this section into your `.env` file and fill in the values from your Stripe Dashboard.

```bash
# ═════════════════════════════════════════════════════════════════
# STRIPE BILLING CONFIGURATION
# ═════════════════════════════════════════════════════════════════

# Secret API Key for server-side operations
# Get from: https://dashboard.stripe.com/apikeys
# Format: sk_test_... (test) or sk_live_... (production)
# REQUIRED: Must be set for billing to work
STRIPE_SECRET_KEY=sk_test_51234567890abcdefghijklmnopqrstuvwxyz

# Publishable Key for client-side code (not used directly, but good to have)
# Get from: https://dashboard.stripe.com/apikeys
# Format: pk_test_... (test) or pk_live_... (production)
STRIPE_PUBLISHABLE_KEY=pk_test_51234567890abcdefghijklmnopqrstuvwxyz

# Webhook Signing Secret for validating webhook authenticity
# Get from: https://dashboard.stripe.com/webhooks
# Click your webhook endpoint → Signing secret → Reveal → Copy
# Format: whsec_test_... (test) or whsec_live_... (production)
# REQUIRED: Must be exact - signing verification will fail if incorrect
STRIPE_WEBHOOK_SECRET=whsec_test_1234567890abcdefghijklmnopqrstuvwxyz

# Price IDs for each plan tier
# Get from: https://dashboard.stripe.com/products
# Click product → Pricing section → Copy the price_... ID
# Format: price_1234567890abcdefghijklmn (always starts with "price_")
# CRITICAL: Must match plan_tiers table stripePriceId column
STRIPE_PRICE_ESSENTIAL=price_1abc2def3ghi4jkl5mno6pqr7stu8vwx9yz0ab1cde
STRIPE_PRICE_PLUS=price_2abc3def4ghi5jkl6mno7pqr8stu9vwx0yz1ab2cde
STRIPE_PRICE_COMPLETE=price_3abc4def5ghi6jkl7mno8pqr9stu0vwx1yz2ab3cde

# Billing Portal Configuration (optional)
# Get from: https://dashboard.stripe.com/settings/billing/portal
# Customize settings → Copy Configuration ID
# Format: bpc_1234567890abcdefghijklmn
# If not set, billing portal still works with default configuration
STRIPE_PORTAL_CONFIGURATION=bpc_1234567890abcdefghijklmnopqrstuvwxyz
```

## Where to Get Each Value

| Variable | Where to Find | Example |
|----------|---------------|---------|
| `STRIPE_SECRET_KEY` | https://dashboard.stripe.com/apikeys | `sk_test_4eC39Hq...` |
| `STRIPE_PUBLISHABLE_KEY` | https://dashboard.stripe.com/apikeys | `pk_test_4eC39Hq...` |
| `STRIPE_WEBHOOK_SECRET` | https://dashboard.stripe.com/webhooks → click endpoint | `whsec_test_4eC39Hq...` |
| `STRIPE_PRICE_ESSENTIAL` | https://dashboard.stripe.com/products → Essential product | `price_1234567890abc` |
| `STRIPE_PRICE_PLUS` | https://dashboard.stripe.com/products → Plus product | `price_0987654321cba` |
| `STRIPE_PRICE_COMPLETE` | https://dashboard.stripe.com/products → Complete product | `price_5555555555555` |
| `STRIPE_PORTAL_CONFIGURATION` | https://dashboard.stripe.com/settings/billing/portal | `bpc_1234567890abc` |

## Required vs Optional

| Variable | Required? | Enabled If | Disables If |
|----------|-----------|-----------|------------|
| `STRIPE_SECRET_KEY` | **YES** | Set | Empty/missing → `STRIPE_ENABLED=false` |
| `STRIPE_PUBLISHABLE_KEY` | No | Set | - |
| `STRIPE_WEBHOOK_SECRET` | **YES** | Set | Missing → webhook validation fails (400) |
| `STRIPE_PRICE_*` | **YES** | Set | Missing → checkout fails with invalid_price_id (400) |
| `STRIPE_PORTAL_CONFIGURATION` | No | Set | Missing → portal uses Stripe default config |

## Quick Validation

After setting `.env`, verify everything is correct:

```bash
# Check all Stripe vars are set
grep "STRIPE" .env | grep -v "^#"

# Should output:
# STRIPE_SECRET_KEY=sk_test_...
# STRIPE_PUBLISHABLE_KEY=pk_test_...
# STRIPE_WEBHOOK_SECRET=whsec_test_...
# STRIPE_PRICE_ESSENTIAL=price_...
# STRIPE_PRICE_PLUS=price_...
# STRIPE_PRICE_COMPLETE=price_...
```

## Test Mode vs Live Mode

### Test Mode (Development)
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...
STRIPE_PRICE_*=price_test_...  (if test prices exist)
```
Use test credit card: `4242 4242 4242 4242`

### Live Mode (Production)
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_live_...
STRIPE_PRICE_*=price_live_...  (live prices from production dashboard)
```
Real credit cards will be charged

## Troubleshooting

**Q: Where do I find my Secret Key?**
A: https://dashboard.stripe.com/apikeys → Scroll down to "Secret key" → Click "Reveal test key"

**Q: Why does checkout fail with "Invalid price ID"?**
A: The `STRIPE_PRICE_*` values don't exist in your Stripe account. Copy them directly from the Stripe Dashboard, don't type them manually.

**Q: How do I know if my webhook secret is correct?**
A: If wrong, you'll see "400 Bad Request" errors in logs when webhooks arrive. Check that `STRIPE_WEBHOOK_SECRET` exactly matches the value in https://dashboard.stripe.com/webhooks

**Q: Can I use the same keys for development and production?**
A: No, use test keys (`sk_test_`, `whsec_test_`) for dev and live keys (`sk_live_`, `whsec_live_`) for production.

**Q: What if I can't find the webhook secret?**
A: https://dashboard.stripe.com/webhooks → Click on your endpoint → Scroll to "Signing secret" → Click "Reveal"

# Stripe Billing Setup Guide

This guide walks you through setting up Stripe billing for KidSchedule production deployment.

## Prerequisites

- Stripe account (create at https://dashboard.stripe.com)
- Admin access to KidSchedule `.env` file
- Access to your application's public URL

## Step 1: Get API Keys

1. Go to https://dashboard.stripe.com/apikeys
2. You'll see two sets of keys:
   - **Test keys** (starts with `sk_test_` and `pk_test_`) — use these for development
   - **Live keys** (starts with `sk_live_` and `pk_live_`) — use these for production

3. Copy the **Secret Key** (the longer one, starts with `sk_`)
4. Add to `.env`:
   ```
   STRIPE_SECRET_KEY=sk_test_your_secret_key_here
   STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
   ```

## Step 2: Create Price IDs for Each Plan

Pricing in Stripe works with Products and Prices. Here's how to set them up:

### Create Products

1. Go to https://dashboard.stripe.com/products
2. Click **+ Add product**
3. For each of your three plans (Essential, Plus, Complete):

   **Example: Essential Plan**
   - Name: `Essential`
   - Description: `Basic family scheduling`
   - Pricing model: `Standard pricing`
   - Price: `$5.99` (for monthly)
   - Billing period: `Monthly`
   - Click **Save product**

4. Repeat for **Plus** ($8.99/month) and **Complete** ($11.99/month)

### Copy Price IDs

After creating each product:

1. Click on the product name
2. Scroll to **Pricing** section
3. You'll see a price listed like `price_1234567890abcdefghijklmn`
4. Click the price row to copy the ID

5. Add to `.env`:
   ```
   STRIPE_PRICE_ESSENTIAL=price_1234567890essential
   STRIPE_PRICE_PLUS=price_1234567890plus
   STRIPE_PRICE_COMPLETE=price_1234567890complete
   ```

**CRITICAL**: These price IDs **must match** the `stripePriceId` in your `plan_tiers` database table. When you seeded the database, the plan_tiers table was populated. Verify they match:

```sql
SELECT id, tier, stripePriceId FROM plan_tiers WHERE is_active = true;
```

Update the database if needed:
```sql
UPDATE plan_tiers SET stripePriceId = 'price_...' WHERE tier = 'essential';
UPDATE plan_tiers SET stripePriceId = 'price_...' WHERE tier = 'plus';
UPDATE plan_tiers SET stripePriceId = 'price_...' WHERE tier = 'complete';
```

## Step 3: Set Up Webhook

Webhooks allow Stripe to notify your app of payment events (checkout completed, payment failed, etc.).

### Create Webhook Endpoint

1. Go to https://dashboard.stripe.com/webhooks
2. Click **+ Add endpoint**
3. Enter your webhook URL:
   ```
   https://yourdomain.com/api/billing/webhook
   ```
   (Replace `yourdomain.com` with your actual domain)

4. For events to send, select:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.finalized`
   - `invoice.paid`
   - `invoice.payment_failed`

5. Click **Add endpoint**

### Copy Webhook Signing Secret

1. Click on your newly created endpoint
2. Scroll down to find **Signing secret**
3. Click **Reveal** to see it
4. Click to copy the secret (starts with `whsec_`)
5. Add to `.env`:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_test_1234567890abcdefghijklmn
   ```

## Step 4: Configure Billing Portal (Optional)

The Billing Portal is where users manage their subscriptions, payment methods, and invoices.

1. Go to https://dashboard.stripe.com/settings/billing/portal
2. Customize these settings:
   - **Customer information**: Allow customers to update their email
   - **Invoices**: Show invoices and allow downloads
   - **Subscription management**: Allow customers to:
     - Update payment method
     - Cancel subscription
     - Change billing frequency (monthly/annual)
   - **Products & prices**: Enable plan changes (upgrades/downgrades)

3. Copy the **Configuration ID** (starts with `bpc_`)
4. Add to `.env` (optional, but recommended for advanced portal features):
   ```
   STRIPE_PORTAL_CONFIGURATION=bpc_1234567890abcdefghijklmn
   ```

## Step 5: Verify Configuration

Before deploying, verify that everything is wired correctly:

### 1. Check `.env` is complete

```bash
grep "STRIPE" .env
```

Should show:
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...
STRIPE_PRICE_ESSENTIAL=price_...
STRIPE_PRICE_PLUS=price_...
STRIPE_PRICE_COMPLETE=price_...
```

### 2. Check database plan_tiers match

```bash
# In psql or your database client
SELECT id, tier, stripePriceId FROM plan_tiers WHERE is_active = true;
```

Verify each row's `stripePriceId` matches your `.env` STRIPE_PRICE_* values.

### 3. Test webhook in development

Use Stripe's webhook testing tool in the dashboard:
1. Go to https://dashboard.stripe.com/webhooks
2. Click your endpoint
3. Scroll to **Events to send**
4. Click **Send test event**
5. Select `checkout.session.completed`
6. Click **Send event**

Check your application logs to verify the webhook was received.

## Step 6: Deploy

1. Deploy `.env` to your production server
2. Deploy the application code
3. Restart the application
4. Verify the billing endpoints work:
   ```bash
   curl https://yourdomain.com/api/billing/plans
   # Should return: { "plans": [...] }
   ```

## Testing Payments

### In Test Mode

Stripe provides test credit card numbers for development:

**Successful payment:**
```
Card: 4242 4242 4242 4242
Expiry: Any future date (e.g., 12/25)
CVC: Any 3 digits (e.g., 123)
```

**Failed payment:**
```
Card: 4000 0000 0000 0002
Expiry: Any future date
CVC: Any 3 digits
```

### Full Checkout Flow Test

1. Navigate to `/settings/billing`
2. Click **Upgrade to a Paid Plan**
3. Click **Choose Plan** on Plus
4. You'll be redirected to Stripe Checkout
5. Enter test card `4242 4242 4242 4242`
6. Click **Pay**
7. You should be redirected to `/billing/success`
8. Check Stripe Dashboard → Customers to see your new customer and subscription

## Troubleshooting

### Webhook not being received

**Problem**: You're not seeing webhook events in your logs

**Solutions**:
1. Verify `STRIPE_WEBHOOK_SECRET` is correct in `.env`
2. Verify webhook endpoint URL is publicly accessible (not localhost)
3. Check application logs for signature verification errors
4. Verify the webhook events are enabled in Stripe Dashboard

### Payment fails with "Invalid price ID"

**Problem**: Checkout creation fails

**Solutions**:
1. Verify `STRIPE_PRICE_ESSENTIAL`, `STRIPE_PRICE_PLUS`, `STRIPE_PRICE_COMPLETE` are set in `.env`
2. Verify price IDs are correct (copy directly from Stripe Dashboard, not transcribed)
3. Verify price IDs exist in your Stripe account in the Dashboard
4. Verify prices are for the correct currency (USD by default)

### Subscription not showing in billing settings

**Problem**: User completes checkout but subscription doesn't appear

**Solutions**:
1. Verify `checkout.session.completed` webhook is being received
2. Check that the webhook handler doesn't have errors (check logs)
3. Verify the Stripe customer was created (`db.stripeCustomers` table)
4. Verify the subscription was created (`db.subscriptions` table)

### "Stripe integration disabled" error

**Problem**: API returns this error

**Solutions**:
1. Verify `STRIPE_SECRET_KEY` is set in `.env`
2. Verify it's not an empty string
3. Verify it starts with `sk_` (not `pk_`)

## Switching from Test to Live

When you're ready to go live:

1. In Stripe Dashboard, switch to **Live** mode (top right)
2. Get your **Live Secret Key** and **Live Publishable Key**
3. Create new Products and Prices in Live mode
4. Get the new Price IDs
5. Update `.env` with live credentials:
   ```
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_PRICE_ESSENTIAL=price_live_...
   # etc.
   ```
6. Create a new webhook endpoint for your production domain
7. Deploy to production

**⚠️ WARNING**: Live keys will process real payments. Make sure to test thoroughly in test mode first.

## Additional Resources

- [Stripe API Documentation](https://stripe.com/docs/api)
- [Stripe Webhook Documentation](https://stripe.com/docs/webhooks)
- [Stripe Checkout Documentation](https://stripe.com/docs/payments/checkout)
- [Stripe Billing Portal](https://stripe.com/docs/billing/billing-portal)

## Support

For Stripe-specific issues, contact Stripe support at https://support.stripe.com

For KidSchedule integration issues, check the logs at `/var/log/kidschedule/` or run `pnpm logs`.

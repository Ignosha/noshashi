# IGNOSHASHI — Stripe Connect Setup Guide

## Step 1: Create a Stripe Account
1. Go to https://dashboard.stripe.com/register
2. Create your account (use your real details — this is where payouts go)
3. Complete account verification (you'll need to provide bank details for payouts)

## Step 2: Enable Stripe Connect (Express Account)
1. In Stripe Dashboard, go to **Settings → Connect settings**
2. Enable **Express** accounts
3. Set your platform fee percentage (we use 2% on deposits + fees)
4. Save your settings

## Step 3: Get Your API Keys
1. Go to https://dashboard.stripe.com/test/apikeys
2. Copy your **Secret key** (`sk_test_...`) and **Publishable key** (`pk_test_...`)
3. Add them to your `.env` file

## Step 4: Get Your Connect Account ID
1. Go to https://dashboard.stripe.com/connect/accounts
2. Click on your account
3. Copy the **Account ID** (starts with `acct_...`)
4. Add it to `.env` as `STRIPE_CONNECT_ACCOUNT_ID`

## Step 5: Set Up Webhook
1. Go to https://dashboard.stripe.com/webhooks
2. Add endpoint: `https://yourdomain.com/api/fund/webhook`
3. Select events: `payment_intent.succeeded`, `payment_intent.payment_failed`
4. Copy the **Webhook secret** (`whsec_...`)
5. Add it to `.env` as `STRIPE_WEBHOOK_SECRET`

## Step 6: Update .env
```env
STRIPE_SECRET_KEY=sk_test_your_actual_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_actual_key_here
STRIPE_CONNECT_ACCOUNT_ID=acct_your_actual_account_id
STRIPE_WEBHOOK_SECRET=whsec_your_actual_webhook_secret
STRIPE_WEBHOOK_URL=https://yourdomain.com/api/fund/webhook
```

## Step 7: Deploy with HTTPS (Required for Stripe)
Stripe requires HTTPS for webhooks. Use nginx + Let's Encrypt:

```bash
# Install nginx
sudo apt install nginx certbot python3-certbot-nginx

# Copy nginx.conf to /etc/nginx/sites-available/ignoshashi
sudo cp nginx.conf /etc/nginx/sites-available/ignoshashi
sudo ln -s /etc/nginx/sites-available/ignoshashi /etc/nginx/sites-enabled/

# Get SSL certificate
sudo certbot --nginx -d yourdomain.com

# Test nginx
sudo nginx -t && sudo systemctl reload nginx
```

## Step 8: Test in Stripe Test Mode
1. Use test keys (`sk_test_...`, `pk_test_...`)
2. Use test card: `4242 4242 4242 4242` (any future expiry, any CVC)
3. Test a deposit: `$10` minimum
4. Check Stripe Dashboard → Payments to see the transaction
5. Check your Connect account balance

## Step 9: Go Live
1. Switch to **Live mode** in Stripe Dashboard
2. Get your live API keys
3. Update `.env` with live keys
4. Update webhook endpoint to production URL
5. Test with a real small transaction

## Fee Flow
```
User deposits $100 via Stripe
  → Stripe collects $100
  → 2% platform fee ($2) routed to your Stripe Connect account
  → $98 credited to user's account
  → You receive $2 automatically
```

## Revenue Sources
1. **Platform fees (2%)** on token creation + trades
2. **Tool sales** ($49-$199 per tool)
3. **Deposit fees** (optional, via Stripe Connect)

All fees automatically route to your Stripe Connect account.

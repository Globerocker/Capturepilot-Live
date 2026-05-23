# Stripe Setup Guide — CapturePilot

## Step 1: Create Product & Price

1. Go to https://dashboard.stripe.com/products
2. Click **"+ Add product"**
3. Fill in:
   - **Name**: `CapturePilot Pro`
   - **Description**: `Government contract matching & intelligence platform`
4. Click **"Add pricing"**:
   - **Price 1 (Monthly)**: $199/month, Recurring, Billing period: Monthly
   - **Price 2 (Yearly)**: $170/month ($2,040/year), Recurring, Billing period: Yearly
5. Save the product
6. **Copy the Price IDs** (they look like `price_1234...`) — you'll need both

## Step 2: Enable 30-Day Free Trial

For each price:
1. Click on the price → Edit
2. Under "Free trial" → Enable → Set to **30 days**
3. Save

Or handle it in code (we already do this in the checkout route):
```
trial_period_days: 30
```

## Step 3: Set Up Webhook

1. Go to https://dashboard.stripe.com/webhooks
2. Click **"+ Add endpoint"**
3. **Endpoint URL**: `https://app.capturepilot.com/api/stripe/webhook`
4. **Events to listen to**:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
5. Click **"Add endpoint"**
6. **Copy the Webhook Signing Secret** (starts with `whsec_...`)

## Step 4: Get API Keys

1. Go to https://dashboard.stripe.com/apikeys
2. Copy:
   - **Publishable key** (starts with `pk_live_...`)
   - **Secret key** (starts with `sk_live_...`)

## Step 5: Give Me These 4 Values

I'll set them in Vercel:

```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_MONTHLY=price_...  (the $199/mo price ID)
STRIPE_PRICE_ID_YEARLY=price_...   (the $170/mo yearly price ID)
```

## Step 6: Test

1. Go to `app.capturepilot.com/billing`
2. Click "Upgrade to Pro"
3. Should open Stripe Checkout with 30-day free trial
4. Use test card: `4242 4242 4242 4242`
5. After checkout → should update `subscription_status` in DB

## How the Trial Works

1. User signs up → `subscription_status = "trialing"`, `trial_ends_at = now + 30 days`
2. User clicks "Upgrade" → Stripe Checkout with `trial_period_days: 30`
3. After 30 days → Stripe auto-charges the card
4. If no card → `subscription_status = "past_due"`
5. We can show "Trial expires in X days" banner

## What's Already Built

- `/api/stripe/checkout` — creates checkout session
- `/api/stripe/webhook` — handles subscription events
- `/api/stripe/portal` — customer portal for managing subscription
- `/billing` page — shows current plan + upgrade button
- `UpgradeBanner` component — shows trial status

## Pricing Recommendation

Your choice of $199/mo ($170/mo yearly) positions us as premium:
- HigherGov: $42/mo (cheapest real competitor)
- SamSearch: $99/mo
- **CapturePilot: $199/mo** (we offer more: Quick Checker, Portal, Admin CRM, AI Proposals)
- GovTribe: $250-1250/mo
- EZGovOpps: $225-500/mo

For the launch, I'd suggest starting with a **free tier** (Quick Checker only) to get volume, then $199/mo for the full platform. The consulting tier ($500-2000/mo) is separate and manual.

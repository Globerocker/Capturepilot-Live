// Creates a 100%-off Stripe coupon + promotion code restricted to the
// founder's email, max 1 redemption — used for testing the FLK $70
// checkout end-to-end without paying real money.
//
// Run: cd /Users/andreschuler/Caturepilot\ 2.0/dashboard && node scripts/create-test-promo-code.mjs
//
// Output: the promo code string to enter at Stripe checkout.

import { config } from 'dotenv';
import Stripe from 'stripe';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env.local') });

if (!process.env.STRIPE_SECRET_KEY) {
    console.error('ERROR: STRIPE_SECRET_KEY not found in .env.local');
    process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2026-02-25.clover',
});

const FOUNDER_EMAIL = 'info@fillcart.de';
const CODE_NAME = `FLKTEST-${Date.now().toString(36).toUpperCase()}`;

console.log(`Creating 100%-off coupon + promo code for ${FOUNDER_EMAIL}...`);

const coupon = await stripe.coupons.create({
    percent_off: 100,
    duration: 'once',
    max_redemptions: 1,
    name: 'FLK Founder E2E Test',
    metadata: { purpose: 'test-buyer-flow', created_by: 'create-test-promo-code.mjs' },
});

console.log(`✓ Coupon created: ${coupon.id} (100% off, 1 use max)`);

const promo = await stripe.promotionCodes.create({
    coupon: coupon.id,
    code: CODE_NAME,
    max_redemptions: 1,
    restrictions: {
        first_time_transaction: false,
    },
    metadata: { allowed_email: FOUNDER_EMAIL },
});

console.log(`✓ Promotion code created: ${promo.code}`);
console.log('');
console.log('─────────────────────────────────────────────────────');
console.log(`  USE THIS CODE AT CHECKOUT: ${promo.code}`);
console.log('─────────────────────────────────────────────────────');
console.log('');
console.log('Next steps:');
console.log('  1. Go to https://www.capturepilot.com/startup-pack');
console.log('  2. Click "Buy" → Stripe checkout opens');
console.log(`  3. Enter promo code: ${promo.code}`);
console.log('  4. Total drops to $0 → click Pay');
console.log('  5. Webhook fires, email auto-sends, ZIP download unlocks');
console.log('');
console.log(`To disable later: stripe coupons delete ${coupon.id}`);

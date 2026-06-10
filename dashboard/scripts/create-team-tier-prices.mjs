// Creates the CapturePilot "Team" tier product + monthly + yearly prices in Stripe
// (live mode), then prints the price IDs to set in Vercel env.
//
// Run: cd dashboard && node scripts/create-team-tier-prices.mjs
//
// Output: STRIPE_PRICE_TEAM_MONTHLY=price_xxx
//         STRIPE_PRICE_TEAM_YEARLY=price_yyy

import { config } from 'dotenv';
import Stripe from 'stripe';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env.stripe-temp') });

if (!process.env.STRIPE_SECRET_KEY) {
    console.error('ERROR: STRIPE_SECRET_KEY not found in .env.stripe-temp');
    process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-06-20',
});

const MONTHLY_PRICE_USD = 299_00; // $299/mo
const YEARLY_PRICE_USD = 287_04 * 12; // 20% annual discount → $2870.40/yr ($239/mo equivalent)

async function main() {
    console.log('Creating CapturePilot Team product…');

    const product = await stripe.products.create({
        name: 'CapturePilot Team',
        description:
            'For teams up to 5. Everything in Pro plus white-label, 500/mo Quick Checker volume, priority support.',
        metadata: { tier: 'team' },
    });
    console.log(`  Product: ${product.id}`);

    console.log('Creating monthly price ($299/mo)…');
    const monthly = await stripe.prices.create({
        product: product.id,
        unit_amount: MONTHLY_PRICE_USD,
        currency: 'usd',
        recurring: { interval: 'month' },
        nickname: 'Team Monthly',
        metadata: { tier: 'team', interval: 'month' },
    });
    console.log(`  Monthly: ${monthly.id}`);

    console.log('Creating yearly price ($2870.40/yr = ~20% off)…');
    const yearly = await stripe.prices.create({
        product: product.id,
        unit_amount: YEARLY_PRICE_USD,
        currency: 'usd',
        recurring: { interval: 'year' },
        nickname: 'Team Yearly',
        metadata: { tier: 'team', interval: 'year' },
    });
    console.log(`  Yearly: ${yearly.id}`);

    console.log('');
    console.log('=== Set these in Vercel env: ===');
    console.log(`STRIPE_PRICE_TEAM_MONTHLY=${monthly.id}`);
    console.log(`STRIPE_PRICE_TEAM_YEARLY=${yearly.id}`);
    console.log('');
    console.log(`Stripe product: ${product.id}`);
    console.log(`Stripe dashboard: https://dashboard.stripe.com/products/${product.id}`);
}

main().catch((e) => {
    console.error('Stripe price creation failed:', e.message);
    process.exit(1);
});

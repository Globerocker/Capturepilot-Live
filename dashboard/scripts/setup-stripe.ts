/**
 * Stripe sandbox setup — creates the products, prices, and beta coupon
 * we need for the CapturePilot launch.
 *
 * USAGE:
 *   1. Get your Stripe TEST mode secret key from
 *      https://dashboard.stripe.com/test/apikeys (must start with `sk_test_`)
 *   2. Run from the dashboard/ directory:
 *      STRIPE_SECRET_KEY=sk_test_... npx tsx scripts/setup-stripe.ts
 *   3. Copy the resulting env vars into Vercel project settings (also test scope first).
 *
 * Idempotent: re-running won't create duplicates — it looks up products by
 * lookup_key first.
 */

import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
    console.error("ERROR: STRIPE_SECRET_KEY env var is required.");
    console.error("Get your TEST key from https://dashboard.stripe.com/test/apikeys");
    process.exit(1);
}
if (!key.startsWith("sk_test_")) {
    console.error("ERROR: This script is for SANDBOX/TEST mode only.");
    console.error("Your key must start with `sk_test_`. Got: " + key.slice(0, 8) + "...");
    process.exit(1);
}

const stripe = new Stripe(key, { apiVersion: "2026-02-25.clover" });

async function findOrCreateProduct(name: string, lookupKey: string, description: string) {
    // List products with metadata.lookup_key matching
    const existing = await stripe.products.search({
        query: `metadata['lookup_key']:'${lookupKey}'`,
    });
    if (existing.data.length > 0) {
        console.log(`✓ Product exists: ${name} (${existing.data[0].id})`);
        return existing.data[0];
    }
    const product = await stripe.products.create({
        name,
        description,
        metadata: { lookup_key: lookupKey },
    });
    console.log(`+ Created product: ${name} (${product.id})`);
    return product;
}

async function findOrCreatePrice(productId: string, lookupKey: string, amount: number, interval: "month" | "year") {
    // Look up by exact lookup_key
    const existing = await stripe.prices.list({
        product: productId,
        active: true,
        limit: 100,
    });
    const found = existing.data.find(p => p.lookup_key === lookupKey);
    if (found) {
        console.log(`✓ Price exists: ${lookupKey} ($${amount / 100}/${interval}) → ${found.id}`);
        return found;
    }
    const price = await stripe.prices.create({
        product: productId,
        currency: "usd",
        unit_amount: amount,
        recurring: { interval },
        lookup_key: lookupKey,
        nickname: lookupKey,
    });
    console.log(`+ Created price: ${lookupKey} ($${amount / 100}/${interval}) → ${price.id}`);
    return price;
}

async function findOrCreateCoupon(id: string, percentOff: number, name: string) {
    try {
        const existing = await stripe.coupons.retrieve(id);
        console.log(`✓ Coupon exists: ${id} (${existing.percent_off}% off forever)`);
        return existing;
    } catch {
        // not found, create
    }
    const coupon = await stripe.coupons.create({
        id,
        percent_off: percentOff,
        duration: "forever",
        name,
        metadata: { source: "beta_program" },
    });
    console.log(`+ Created coupon: ${id} (${percentOff}% off forever)`);
    return coupon;
}

async function findOrCreatePromoCode(couponId: string, code: string) {
    const existing = await stripe.promotionCodes.list({ code, limit: 1 });
    if (existing.data.length > 0) {
        console.log(`✓ Promo code exists: ${code}`);
        return existing.data[0];
    }
    const promo = await stripe.promotionCodes.create({
        promotion: { type: "coupon", coupon: couponId },
        code,
        active: true,
    });
    console.log(`+ Created promo code: ${code} → ${promo.id}`);
    return promo;
}

async function main() {
    console.log("Setting up CapturePilot Stripe sandbox...\n");

    // 1. Pro product
    const proProduct = await findOrCreateProduct(
        "CapturePilot Pro",
        "capturepilot_pro",
        "Federal contracting intelligence platform — unlimited matches, AI proposal drafts, market intelligence, and full opportunity tracking.",
    );

    // 2. Pro Monthly price — $199/mo
    const proMonthly = await findOrCreatePrice(proProduct.id, "pro_monthly", 19900, "month");

    // 3. Pro Yearly price — $1908/yr ($159/mo equivalent)
    const proYearly = await findOrCreatePrice(proProduct.id, "pro_yearly", 190800, "year");

    // 4. Beta locked-in coupon — 25% off forever
    const betaCoupon = await findOrCreateCoupon(
        "BETA25_FOREVER",
        25,
        "Beta Feedback Discount (25% off forever)",
    );

    // 5. Customer-facing promo code
    await findOrCreatePromoCode(betaCoupon.id, "BETA25");

    console.log("\n" + "─".repeat(60));
    console.log("ENV VARS — paste these into Vercel (Test scope first):");
    console.log("─".repeat(60));
    console.log(`STRIPE_PRICE_MONTHLY=${proMonthly.id}`);
    console.log(`STRIPE_PRICE_YEARLY=${proYearly.id}`);
    console.log(`STRIPE_BETA_COUPON_ID=${betaCoupon.id}`);
    console.log(`STRIPE_BETA_PROMO_CODE=BETA25`);
    console.log("─".repeat(60));
    console.log("\nDone. Test the checkout flow with card 4242 4242 4242 4242.");
    console.log("Apply promo BETA25 at checkout to verify the 25% discount.\n");
}

main().catch((e) => {
    console.error("Setup failed:", e);
    process.exit(1);
});

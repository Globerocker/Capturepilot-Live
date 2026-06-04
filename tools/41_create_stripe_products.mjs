#!/usr/bin/env node
/**
 * One-shot script: creates the Stripe Product + Price + Payment-Link objects
 * for the Light + Pro tiers (monthly + annual each = 4 prices, 4 links).
 * Idempotent — products/prices match by `lookup_key`, links match by metadata.tier_key.
 *
 * Updates plan_tiers in Supabase with the resulting price IDs so the
 * checkout route can look them up by tier code.
 *
 * Run:
 *   cd "/Users/andreschuler/Caturepilot 2.0"
 *   node tools/41_create_stripe_products.mjs
 *
 * Requires:
 *   STRIPE_SECRET_KEY              (in dashboard/.env.local or env)
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 *
 * Outputs the price IDs at the end. Add these as Vercel env vars too:
 *   STRIPE_PRICE_LIGHT_MONTHLY
 *   STRIPE_PRICE_LIGHT_YEARLY
 *   STRIPE_PRICE_PRO_MONTHLY
 *   STRIPE_PRICE_PRO_YEARLY
 *
 * (The plan_tiers row stores them too — env vars are a backup so the
 * checkout route doesn't need a DB query on every checkout click.)
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Load dashboard/.env.local manually (we're not running inside Next.js)
const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, "..", "dashboard", ".env.local");
try {
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && !process.env[m[1]]) {
            process.env[m[1]] = m[2].replace(/^"|"$/g, "");
        }
    }
} catch {
    console.warn(`! could not read ${envPath} — relying on shell env`);
}

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!STRIPE_KEY) {
    console.error("✗ STRIPE_SECRET_KEY missing — abort");
    process.exit(1);
}
if (!SUPA_URL || !SUPA_KEY) {
    console.error("✗ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY missing — abort");
    process.exit(1);
}

const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

/* ── Stripe REST helpers (avoid pulling in the SDK for a one-shot script) ── */

async function stripe(method, path, body) {
    const url = `https://api.stripe.com/v1${path}`;
    const init = {
        method,
        headers: {
            Authorization: `Bearer ${STRIPE_KEY}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
    };
    if (body) init.body = new URLSearchParams(body).toString();
    const res = await fetch(url, init);
    const data = await res.json();
    if (!res.ok) {
        throw new Error(`Stripe ${method} ${path} → ${res.status}: ${JSON.stringify(data.error || data)}`);
    }
    return data;
}

async function findPriceByLookupKey(key) {
    const data = await stripe("GET", `/prices?lookup_keys[]=${encodeURIComponent(key)}&active=true&limit=1`);
    return data.data?.[0] || null;
}

/**
 * Deactivate a price (preserves it for past-invoice references but frees the
 * lookup_key for reuse). Stripe doesn't allow updating unit_amount in place.
 */
async function deactivatePrice(priceId) {
    await stripe("POST", `/prices/${priceId}`, { active: "false", "lookup_key": "" });
    console.log(`    ⚠ Deactivated stale price ${priceId} (freed lookup key)`);
}

async function findProductByName(name) {
    // Stripe doesn't search by name well — list all and filter (we have <20).
    const data = await stripe("GET", "/products?limit=100&active=true");
    return data.data?.find(p => p.name === name) || null;
}

async function ensureProduct({ name, description }) {
    const existing = await findProductByName(name);
    if (existing) {
        console.log(`  ↻ Product "${name}" exists (id=${existing.id})`);
        return existing;
    }
    const created = await stripe("POST", "/products", { name, description });
    console.log(`  ✓ Product "${name}" created (id=${created.id})`);
    return created;
}

async function ensurePrice({ product, unitAmount, interval, lookupKey, nickname }) {
    const existing = await findPriceByLookupKey(lookupKey);
    if (existing && existing.product === product && existing.unit_amount === unitAmount) {
        console.log(`  ↻ Price ${lookupKey} exists (id=${existing.id}, $${unitAmount / 100}/${interval})`);
        return existing;
    }
    // Stale price using this lookup key with a different product or amount —
    // deactivate it so we can reuse the lookup key. The old price stays in
    // Stripe (referenced by historic invoices) but is no longer active.
    if (existing) {
        await deactivatePrice(existing.id);
    }
    const body = {
        product,
        unit_amount: String(unitAmount),
        currency: "usd",
        "recurring[interval]": interval,
        lookup_key: lookupKey,
        nickname,
    };
    const created = await stripe("POST", "/prices", body);
    console.log(`  ✓ Price ${lookupKey} created (id=${created.id}, $${unitAmount / 100}/${interval})`);
    return created;
}

/* ─────────────────────────── MAIN ─────────────────────────── */

async function main() {
    console.log("═══ Stripe product/price provisioning — Light + Pro ═══\n");

    // Pull current tier prices from plan_tiers — single source of truth for $.
    const { data: tiers, error } = await sb
        .from("plan_tiers")
        .select("code, label, monthly_usd, yearly_usd")
        .in("code", ["light", "pro"]);
    if (error) {
        console.error("✗ Could not load plan_tiers:", error.message);
        process.exit(1);
    }
    const byCode = Object.fromEntries(tiers.map(t => [t.code, t]));

    if (!byCode.light || !byCode.pro) {
        console.error("✗ plan_tiers missing 'light' or 'pro' rows — run migration 107 first");
        process.exit(1);
    }

    const results = {};

    // ── Light ──
    console.log("─── Light tier ───");
    const lightProduct = await ensureProduct({
        name: "CapturePilot Light",
        description: "Federal opportunities + competitor + partner profiles · 200 matches/day",
    });
    const lightMonthly = await ensurePrice({
        product: lightProduct.id,
        unitAmount: byCode.light.monthly_usd * 100,
        interval: "month",
        lookupKey: "light_monthly",
        nickname: "Light · monthly",
    });
    const lightYearly = await ensurePrice({
        product: lightProduct.id,
        unitAmount: byCode.light.yearly_usd * 100,
        interval: "year",
        lookupKey: "light_yearly",
        nickname: "Light · yearly (save 20%)",
    });
    results.light = { product_id: lightProduct.id, monthly_price_id: lightMonthly.id, yearly_price_id: lightYearly.id };

    // ── Pro ──
    console.log("\n─── Pro tier ───");
    const proProduct = await ensureProduct({
        name: "CapturePilot Pro",
        description: "Federal + state + local (48 states) · AI proposals · AI summaries · export · API · 3 seats",
    });
    const proMonthly = await ensurePrice({
        product: proProduct.id,
        unitAmount: byCode.pro.monthly_usd * 100,
        interval: "month",
        lookupKey: "pro_monthly",
        nickname: "Pro · monthly",
    });
    const proYearly = await ensurePrice({
        product: proProduct.id,
        unitAmount: byCode.pro.yearly_usd * 100,
        interval: "year",
        lookupKey: "pro_yearly",
        nickname: "Pro · yearly (save 20%)",
    });
    results.pro = { product_id: proProduct.id, monthly_price_id: proMonthly.id, yearly_price_id: proYearly.id };

    // ── Payment Links (shareable buy.stripe.com URLs) ──
    // These bypass the in-app checkout entirely. Use them in marketing emails,
    // ads, embedded buttons, anywhere outside the app. Each links to a
    // single price + 14-day trial + redirects to the dashboard on completion.
    console.log("\n─── Payment Links ───");
    const APP_BASE = process.env.NEXT_PUBLIC_APP_URL || "https://app.capturepilot.com";

    async function findPaymentLinkByTierKey(tierKey) {
        // Stripe payment links API doesn't filter on metadata directly, so
        // we list and filter client-side. We have <20 so this is cheap.
        const data = await stripe("GET", "/payment_links?limit=100&active=true");
        return data.data?.find(l => l.metadata?.tier_key === tierKey) || null;
    }

    async function ensurePaymentLink({ priceId, tierKey, label }) {
        const existing = await findPaymentLinkByTierKey(tierKey);
        if (existing && existing.line_items?.data?.[0]?.price?.id === priceId) {
            console.log(`  ↻ Payment Link ${tierKey} exists: ${existing.url}`);
            return existing;
        }
        // Stripe doesn't support updating line_items on a payment link, so
        // if the price changed we deactivate the old link + create new.
        if (existing) {
            await stripe("POST", `/payment_links/${existing.id}`, { active: "false" });
            console.log(`    ⚠ Deactivated stale link ${existing.id}`);
        }
        const body = {
            "line_items[0][price]": priceId,
            "line_items[0][quantity]": "1",
            "after_completion[type]": "redirect",
            "after_completion[redirect][url]": `${APP_BASE}/billing?welcome=1&tier=${tierKey}`,
            "subscription_data[trial_period_days]": "14",
            "metadata[tier_key]": tierKey,
            "metadata[label]": label,
            "allow_promotion_codes": "true",
            "billing_address_collection": "auto",
        };
        const created = await stripe("POST", "/payment_links", body);
        console.log(`  ✓ Payment Link ${tierKey} created: ${created.url}`);
        return created;
    }

    const links = {};
    links.light_monthly = await ensurePaymentLink({ priceId: results.light.monthly_price_id, tierKey: "light_monthly", label: "Light · monthly" });
    links.light_yearly  = await ensurePaymentLink({ priceId: results.light.yearly_price_id,  tierKey: "light_yearly",  label: "Light · yearly" });
    links.pro_monthly   = await ensurePaymentLink({ priceId: results.pro.monthly_price_id,   tierKey: "pro_monthly",   label: "Pro · monthly" });
    links.pro_yearly    = await ensurePaymentLink({ priceId: results.pro.yearly_price_id,    tierKey: "pro_yearly",    label: "Pro · yearly" });

    // ── Persist price IDs back to plan_tiers.limits.stripe_* so the checkout
    //    route can look them up without env-var churn. ──
    console.log("\n─── Persisting to plan_tiers ───");
    for (const [code, ids] of Object.entries(results)) {
        const { error } = await sb
            .from("plan_tiers")
            .update({
                limits: { ...(byCode[code].limits || {}), stripe_product_id: ids.product_id, stripe_price_monthly: ids.monthly_price_id, stripe_price_yearly: ids.yearly_price_id },
            })
            .eq("code", code);
        if (error) console.warn(`  ! could not persist ${code}: ${error.message}`);
        else console.log(`  ✓ ${code} → plan_tiers updated with price IDs`);
    }

    // ── Print env-var summary for Vercel ──
    console.log("\n═══ Vercel env vars to set (optional — DB also stores them) ═══\n");
    console.log(`STRIPE_PRICE_LIGHT_MONTHLY=${results.light.monthly_price_id}`);
    console.log(`STRIPE_PRICE_LIGHT_YEARLY=${results.light.yearly_price_id}`);
    console.log(`STRIPE_PRICE_PRO_MONTHLY=${results.pro.monthly_price_id}`);
    console.log(`STRIPE_PRICE_PRO_YEARLY=${results.pro.yearly_price_id}`);
    console.log("\n═══ Shareable Stripe Payment Links (use in email, ads, marketing) ═══\n");
    console.log(`Light · $39/mo    → ${links.light_monthly.url}`);
    console.log(`Light · $374/yr   → ${links.light_yearly.url}`);
    console.log(`Pro   · $89/mo    → ${links.pro_monthly.url}`);
    console.log(`Pro   · $854/yr   → ${links.pro_yearly.url}`);
    console.log("\nDone.");
}

main().catch(err => {
    console.error("\n✗ ERROR:", err.message);
    process.exit(1);
});

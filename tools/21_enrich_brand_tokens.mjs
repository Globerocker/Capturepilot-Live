#!/usr/bin/env node
// Enrich user_profiles.notes with dembrandt design tokens (logo, colors, typography).
//
// Why this lives in /tools instead of /api: dembrandt is a Playwright-based CLI.
// Playwright bundles Chromium (~120 MB) which exceeds Vercel's 50 MB serverless limit.
// Run this locally or from a long-running worker instead.
//
// Usage:
//   node tools/21_enrich_brand_tokens.mjs --all             # enrich every profile with a website
//   node tools/21_enrich_brand_tokens.mjs <user_profile_id> # enrich one profile
//   node tools/21_enrich_brand_tokens.mjs --website acme.com [profile_id]

import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY env vars.");
    process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY);

function runDembrandt(website) {
    const clean = website.replace(/^https?:\/\//, "").replace(/\/$/, "");
    console.log(`  > dembrandt ${clean} --save-output --json-only`);
    try {
        execSync(`npx --yes dembrandt "${clean}" --save-output --json-only`, {
            cwd: "dashboard",
            stdio: "inherit",
            timeout: 180_000,
        });
    } catch (err) {
        console.error(`  ! dembrandt failed for ${clean}:`, err.message);
        return null;
    }

    // dembrandt writes to dashboard/output/<domain>/<timestamp>.json — grab the newest.
    const outDir = join("dashboard", "output", clean);
    if (!existsSync(outDir)) return null;
    const files = readdirSync(outDir).filter(f => f.endsWith(".json")).sort().reverse();
    if (files.length === 0) return null;
    try {
        return JSON.parse(readFileSync(join(outDir, files[0]), "utf8"));
    } catch {
        return null;
    }
}

function extractTokens(dembrandtOutput) {
    if (!dembrandtOutput || typeof dembrandtOutput !== "object") return null;

    // dembrandt's JSON structure varies — pull out the universally-present fields.
    const colors = dembrandtOutput.colors || dembrandtOutput.palette || {};
    const typography = dembrandtOutput.typography || dembrandtOutput.fonts || {};
    const logos = dembrandtOutput.logos || dembrandtOutput.assets?.logos || [];

    return {
        source: "dembrandt",
        extracted_at: new Date().toISOString(),
        logo: Array.isArray(logos) ? logos[0] : (logos.primary || logos),
        logo_alternates: Array.isArray(logos) ? logos.slice(1) : [],
        colors: {
            primary: colors.primary || colors.brand || null,
            secondary: colors.secondary || null,
            accent: colors.accent || null,
            background: colors.background || null,
            text: colors.text || null,
            palette: colors.palette || colors.all || [],
        },
        typography: {
            heading_font: typography.heading || typography.h1 || null,
            body_font: typography.body || typography.p || null,
            font_families: typography.fontFamilies || typography.families || [],
        },
        spacing: dembrandtOutput.spacing || null,
        radii: dembrandtOutput.radii || dembrandtOutput.borderRadius || null,
    };
}

async function mergeIntoProfile(profileId, brandTokens) {
    const { data } = await db.from("user_profiles").select("notes").eq("id", profileId).single();
    let notesObj = {};
    const prevNotes = data?.notes;
    if (typeof prevNotes === "string") {
        try { notesObj = JSON.parse(prevNotes); } catch { notesObj = {}; }
    } else if (prevNotes && typeof prevNotes === "object") {
        notesObj = prevNotes;
    }
    notesObj.brand_tokens = brandTokens;

    await db.from("user_profiles").update({ notes: JSON.stringify(notesObj) }).eq("id", profileId);
    console.log(`  ✓ saved brand_tokens to profile ${profileId}`);
}

async function processOne(profileId, websiteOverride) {
    const { data: profile, error } = await db.from("user_profiles")
        .select("id, website, company_name")
        .eq("id", profileId)
        .single();
    if (error || !profile) {
        console.error(`profile ${profileId} not found`);
        return;
    }
    const website = websiteOverride || profile.website;
    if (!website) {
        console.warn(`profile ${profileId} (${profile.company_name}) has no website — skipping`);
        return;
    }
    console.log(`\n[${profile.company_name || profile.id}] ${website}`);
    const out = runDembrandt(website);
    const tokens = extractTokens(out);
    if (!tokens) {
        console.warn("  ! no tokens extracted");
        return;
    }
    await mergeIntoProfile(profileId, tokens);
}

async function processAll() {
    const { data } = await db.from("user_profiles")
        .select("id, website, company_name")
        .not("website", "is", null)
        .order("created_at", { ascending: false })
        .limit(200);

    console.log(`Found ${data?.length || 0} profiles with a website.`);
    for (const p of data || []) {
        try {
            await processOne(p.id);
        } catch (err) {
            console.error(`  ! ${p.id}: ${err.message}`);
        }
    }
}

const args = process.argv.slice(2);
(async () => {
    if (args[0] === "--all") {
        await processAll();
    } else if (args[0] === "--website") {
        const website = args[1];
        const profileId = args[2];
        if (!website) { console.error("--website requires a URL"); process.exit(1); }
        if (profileId) {
            await processOne(profileId, website);
        } else {
            const out = runDembrandt(website);
            console.log(JSON.stringify(extractTokens(out), null, 2));
        }
    } else if (args[0]) {
        await processOne(args[0]);
    } else {
        console.log("Usage:");
        console.log("  node tools/21_enrich_brand_tokens.mjs --all");
        console.log("  node tools/21_enrich_brand_tokens.mjs <profile_id>");
        console.log("  node tools/21_enrich_brand_tokens.mjs --website acme.com [profile_id]");
    }
})();

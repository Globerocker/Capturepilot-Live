#!/usr/bin/env node
// Loads ONE city opp from the DB, runs the city extractor (loaded via jiti), prints JSON.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { createJiti } from 'jiti';
import path from 'node:path';

const ROOT = '/Users/andreschuler/Caturepilot 2.0/dashboard';
// Load multiple env files so OPENAI_API_KEY is present even if it only
// lives in .env.vercel.production (which mirrors the deployed env).
for (const f of ['.env.local', '.env.vercel.local', '.env.vercel.production']) {
    config({ path: path.join(ROOT, f), override: false });
}
if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY not set — extractor will return null. Aborting.');
    process.exit(2);
}

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } },
);

// Optional CLI override: `node ... <opp_id>`
const forcedId = process.argv[2];
const { data, error } = forcedId
    ? await sb.from('opportunities')
        .select('id,title,description,agency,naics_code,set_aside_code,response_deadline')
        .eq('id', forcedId)
        .limit(1)
    : await sb.from('opportunities')
        .select('id,title,description,agency,naics_code,set_aside_code,response_deadline')
        .eq('jurisdiction_level', 'city')
        .not('description', 'is', null)
        .gte('response_deadline', new Date().toISOString().slice(0, 10))
        .order('response_deadline', { ascending: true })
        .limit(1);

if (error) { console.error('DB err', error); process.exit(2); }

let opp = (data && data[0]) || null;
if (!opp) {
    const { data: anyData } = await sb
        .from('opportunities')
        .select('id,title,description,agency,naics_code,set_aside_code,response_deadline')
        .eq('jurisdiction_level', 'city')
        .not('description', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(1);
    opp = anyData && anyData[0];
}
if (!opp) { console.error('no city opp found'); process.exit(2); }

console.log('--- OPP ---');
console.log(JSON.stringify(opp, null, 2));

const jiti = createJiti(import.meta.url, { interopDefault: true });
const cityMod = await jiti.import(path.join(ROOT, 'src/lib/structured-requirements/city.ts'));

const start = Date.now();
const result = await cityMod.extractCityRequirements(opp);
const elapsed = Date.now() - start;

console.log('\n--- RESULT (elapsed ' + elapsed + 'ms) ---');
console.log(JSON.stringify(result, null, 2));
console.log('\n--- META ---');
console.log(JSON.stringify(cityMod.__cityExtractorMeta, null, 2));
process.exit(0);

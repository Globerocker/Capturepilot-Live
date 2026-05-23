/**
 * GSA eLibrary — Schedule contract holders ingest.
 *
 * For each known contractor (or top-N by award $), check whether they're
 * on a GSA Schedule and capture the contract number + SIN codes covered.
 *
 * GSA eLibrary URL pattern (HTML, no auth):
 *   https://www.gsaelibrary.gsa.gov/ElibMain/contractsByContractor.do?vendorName=<NAME>
 *
 * The response renders one or more contracts as <a href="contractsByContractNumber.do?contractNumber=...">.
 * Each detail page lists SINs.
 *
 * Because of the HTML-scrape nature, we cap at N contractors per run and
 * focus on those with federal_awards_count > 5 (likely Schedule holders).
 *
 * Used by Partners page: "this firm holds GSA MAS — they can be your
 * teaming prime even without their own SAM cap statement match."
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withCronTelemetry } from "@/lib/cron-telemetry";
import { guardCron } from "@/lib/cron-auth";

export const maxDuration = 300;

function getDb() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

const ELIB_BASE = "https://www.gsaelibrary.gsa.gov/ElibMain";
const UA = "Mozilla/5.0 (compatible; CapturePilotResearch/1.0; +https://capturepilot.com)";

interface ContractStub {
    contractNumber: string;
    schedule: string | null;
    sinCodes: string[];
}

function parseListingHtml(html: string): ContractStub[] {
    const results: ContractStub[] = [];
    // matches each contract anchor with its label
    const re = /<a[^>]*href="contractsByContractNumber\.do\?contractNumber=([^"]+)"[^>]*>([^<]+)<\/a>([\s\S]{0,500})/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const contractNumber = decodeURIComponent(m[1]!).trim();
        const ctx = m[3] || "";
        // Schedule name follows in nearby text
        const schedMatch = ctx.match(/Schedule\s*:?\s*([^<\n]{3,80})/i);
        const sinMatch = [...ctx.matchAll(/SIN\s*([0-9A-Z]+)/gi)].map(x => x[1]!);
        results.push({
            contractNumber,
            schedule: schedMatch?.[1]?.trim() || null,
            sinCodes: sinMatch.slice(0, 8),
        });
    }
    return results;
}

async function lookupContractor(name: string): Promise<ContractStub[]> {
    const url = `${ELIB_BASE}/contractsByContractor.do?vendorName=${encodeURIComponent(name)}`;
    try {
        const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
        if (!res.ok) return [];
        const html = await res.text();
        return parseListingHtml(html);
    } catch { return []; }
}

async function GET_handler(req: NextRequest): Promise<NextResponse> {
    const denied = guardCron(req);
    if (denied) return denied;

    const t0 = Date.now();
    const db = getDb();
    const max = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "40", 10), 200);
    const stats = { contractors_checked: 0, contracts_found: 0, upserted: 0, errors: 0 };

    // Prioritize contractors we haven't checked recently with award history
    const { data: cands, error } = await db
        .from("contractors")
        .select("uei, company_name, state")
        .gt("federal_awards_count", 5)
        .order("federal_awards_count", { ascending: false })
        .limit(max);
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    for (const c of cands || []) {
        if (Date.now() - t0 > 270_000) break;
        const name = (c as { company_name?: string }).company_name;
        const uei = (c as { uei?: string }).uei;
        const state = (c as { state?: string }).state;
        if (!name) continue;
        stats.contractors_checked++;
        const found = await lookupContractor(name);
        if (found.length === 0) continue;
        stats.contracts_found += found.length;
        const rows = found.map(f => ({
            contract_no: f.contractNumber,
            company_name: name,
            uei: uei || null,
            duns: null,
            cage_code: null,
            schedule: f.schedule,
            sin_codes: f.sinCodes,
            naics_codes: [],
            small_business: false,
            certifications: [],
            phone: null,
            email: null,
            website: null,
            address: null,
            state: state || null,
            ceiling_value: null,
            source: "gsa_elibrary",
            last_synced: new Date().toISOString(),
        }));
        const { error: upErr } = await db
            .from("gsa_schedule_holders")
            .upsert(rows, { onConflict: "contract_no,company_name", ignoreDuplicates: false });
        if (upErr) {
            stats.errors++;
            console.warn("GSA upsert err:", upErr.message);
        } else {
            stats.upserted += rows.length;
        }
        // throttle — eLibrary is sensitive to bursts
        await new Promise(r => setTimeout(r, 300));
    }

    return NextResponse.json({ success: true, ...stats, elapsed_ms: Date.now() - t0 });
}

export const GET = withCronTelemetry("/api/cron/ingest_gsa_elibrary", GET_handler);

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";

export const maxDuration = 300;

function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

const SAM_API_KEY = process.env.SAM_API_KEY || "";

/**
 * Contractor-discovery enrichment cron (TypeScript native).
 *
 * NOTE: Previously this route shell-exec'd a Python script (tools/10_enrichment_orchestrator.py).
 * Vercel serverless functions cannot run Python; that made this cron a silent no-op for months.
 *
 * New implementation (no paid APIs required):
 *   1. Pick N oldest active opportunities whose description is still a SAM.gov URL.
 *   2. Fetch the description text from SAM.gov and write it back as plain text.
 *   3. If an incumbent_contractor_name is present but UEI is missing, fuzzy-match the
 *      incumbent against the `contractors` table and attach the UEI.
 *
 * Heavy decision-maker enrichment (Apollo / SerpAPI) still runs as Python from a developer
 * machine (tools/10_enrichment_orchestrator.py). Scheduled Vercel runs only handle the
 * SAM.gov + local database side, which is budget-safe.
 */
export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const db = getSupabase();
    const startTime = Date.now();
    const stats = { processed: 0, descFetched: 0, incumbentsLinked: 0, errors: 0 };

    try {
        const { data: opps, error } = await db
            .from("opportunities")
            .select("id, notice_id, description, incumbent_contractor_name, incumbent_contractor_uei")
            .eq("is_archived", false)
            .like("description", "https://api.sam.gov%")
            .order("posted_date", { ascending: false, nullsFirst: false })
            .limit(40);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (!opps || opps.length === 0) {
            return NextResponse.json({ success: true, message: "Nothing to enrich", ...stats });
        }

        for (const opp of opps) {
            if (Date.now() - startTime > 260_000) break;
            stats.processed++;

            const updates: Record<string, unknown> = {};

            // 1. Fetch description text from SAM
            const descUrl = String(opp.description || "");
            if (descUrl.startsWith("https://api.sam.gov")) {
                try {
                    const r = await fetch(descUrl, {
                        headers: SAM_API_KEY ? { "X-Api-Key": SAM_API_KEY } : {},
                        signal: AbortSignal.timeout(10_000),
                    });
                    if (r.ok) {
                        const html = await r.text();
                        const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 12_000);
                        if (text.length > 100) {
                            updates.description = text;
                            stats.descFetched++;
                        }
                    }
                } catch { stats.errors++; }
            }

            // 2. Incumbent UEI lookup in local contractors table
            if (opp.incumbent_contractor_name && !opp.incumbent_contractor_uei) {
                try {
                    const name = String(opp.incumbent_contractor_name).trim();
                    const needle = name.length > 40 ? name.slice(0, 40) : name;
                    const { data: matches } = await db
                        .from("contractors")
                        .select("uei, legal_business_name")
                        .ilike("legal_business_name", `%${needle}%`)
                        .limit(1);
                    if (matches && matches[0]?.uei) {
                        updates.incumbent_contractor_uei = matches[0].uei;
                        stats.incumbentsLinked++;
                    }
                } catch { stats.errors++; }
            }

            if (Object.keys(updates).length > 0) {
                updates.last_crawled_at = new Date().toISOString();
                await db.from("opportunities").update(updates).eq("id", opp.id);
            }
        }

        return NextResponse.json({ success: true, ...stats });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        return NextResponse.json({ success: false, error: message, ...stats }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 120;

function getDb() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

const VETERAN_KW = ["sdvosb", "vosb", "veteran", "service-disabled"];
const SB_KW = ["small business", "8(a)", "hubzone", "wosb", "women-owned"];
const WOSB_KW = ["wosb", "women-owned", "edwosb"];

/**
 * POST /api/opportunities/search-naics
 * On-demand opportunity search: checks DB first, crawls SAM.gov if insufficient.
 *
 * Body: {
 *   naics_codes: string[],        // required
 *   min_results?: number,         // minimum results before crawling SAM (default 10)
 *   days_back?: number,           // how far back to crawl (default 180)
 *   active_only?: boolean,        // only active/upcoming (default true)
 *   set_aside_filter?: string[],  // optional: ["SDVOSB", "SBA", "WOSB", ...]
 * }
 *
 * Returns: { source: "database" | "sam_crawl" | "combined", opportunities: [...], crawled_count: number }
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            naics_codes,
            min_results = 10,
            days_back = 180,
            active_only = true,
            set_aside_filter,
        } = body;

        if (!naics_codes?.length) {
            return NextResponse.json({ error: "naics_codes required" }, { status: 400 });
        }

        const db = getDb();

        // ─── Step 1: Check internal DB ───────────────────────
        let query = db.from("opportunities")
            .select("notice_id, title, agency, naics_code, set_aside_code, notice_type, response_deadline, estimated_value, place_of_performance_state, status, veteran_relevance_flag, small_business_relevance_flag, wosb_relevance_flag, sources_sought_flag, link")
            .in("naics_code", naics_codes)
            .order("response_deadline", { ascending: false, nullsFirst: false });

        if (active_only) {
            query = query.in("status", ["ACTIVE", "EXPIRING_SOON", "MARKET_RESEARCH", "DISCOVERED"]);
        }

        const { data: dbResults, error: dbErr } = await query.limit(100);
        const dbOpps = dbResults || [];

        // If we have enough results, return immediately
        if (dbOpps.length >= min_results) {
            return NextResponse.json({
                source: "database",
                opportunities: dbOpps,
                total: dbOpps.length,
                crawled_count: 0,
                message: `Found ${dbOpps.length} opportunities in database`,
            });
        }

        // ─── Step 2: Crawl SAM.gov for missing NAICS ────────
        const SAM_API_KEY = process.env.SAM_API_KEY!;
        const now = new Date();
        const fromDate = new Date(now.getTime() - days_back * 86400000);
        const fromStr = `${String(fromDate.getMonth() + 1).padStart(2, "0")}/${String(fromDate.getDate()).padStart(2, "0")}/${fromDate.getFullYear()}`;
        const toStr = `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${now.getFullYear()}`;

        // Pre-load valid FK codes
        const [naicsRes, pscRes] = await Promise.all([
            db.from("naics_codes").select("code"),
            db.from("psc_codes").select("code"),
        ]);
        const validNaics = new Set((naicsRes.data || []).map((r: { code: string }) => r.code));
        const validPsc = new Set((pscRes.data || []).map((r: { code: string }) => r.code));

        let crawledCount = 0;
        const ptypes = ["r", "p", "o", "k"];
        const startTime = Date.now();

        for (const naicsCode of naics_codes) {
            // Time budget: leave 20s for final query
            if (Date.now() - startTime > 90_000) break;

            for (const ptype of ptypes) {
                if (Date.now() - startTime > 90_000) break;

                try {
                    const url = `https://api.sam.gov/opportunities/v2/search?postedFrom=${fromStr}&postedTo=${toStr}&limit=1000&offset=0&ptype=${ptype}&ncode=${naicsCode}`;
                    const res = await fetch(url, {
                        headers: { "X-Api-Key": SAM_API_KEY },
                        signal: AbortSignal.timeout(30000),
                    });

                    if (!res.ok) continue;
                    const data = await res.json();
                    const opps = (data.opportunitiesData || []) as Record<string, unknown>[];
                    if (opps.length === 0) continue;

                    const payload = opps.filter(o => o.noticeId).map(o => {
                        const sa = String(o.typeOfSetAsideDescription || o.typeOfSetAside || "").toLowerCase();
                        const titleLower = String(o.title || "").toLowerCase();
                        const nt = String(o.type || "").toLowerCase();
                        const fpp = String(o.fullParentPathName || "");
                        const parts = fpp.split(".");
                        const nc = String(o.naicsCode || "");
                        const pc = String(o.classificationCode || "");
                        const dl = String(o.responseDeadLine || "");

                        let status = "DISCOVERED";
                        if (nt === "r" || titleLower.includes("sources sought")) {
                            status = dl && new Date(dl) < now ? "INTELLIGENCE" : "MARKET_RESEARCH";
                        } else if (dl) {
                            status = new Date(dl) < now ? "EXPIRED" : "ACTIVE";
                        }

                        return {
                            notice_id: o.noticeId,
                            title: o.title || null,
                            description: o.description || null,
                            agency: parts[0]?.trim() || null,
                            sub_agency: parts[1]?.trim() || null,
                            department: fpp || null,
                            naics_code: nc && validNaics.has(nc) ? nc : null,
                            psc_code: pc && validPsc.has(pc) ? pc : null,
                            set_aside_code: o.typeOfSetAsideDescription || o.typeOfSetAside || null,
                            notice_type: o.type || null,
                            posted_date: o.postedDate ? new Date(String(o.postedDate)).toISOString() : null,
                            response_deadline: o.responseDeadLine ? new Date(String(o.responseDeadLine)).toISOString() : null,
                            solicitation_number: o.solicitationNumber || null,
                            link: o.uiLink || `https://sam.gov/opp/${o.noticeId}/view`,
                            is_archived: status === "EXPIRED",
                            raw_json: o,
                            status,
                            veteran_relevance_flag: VETERAN_KW.some(kw => sa.includes(kw) || titleLower.includes(kw)),
                            small_business_relevance_flag: SB_KW.some(kw => sa.includes(kw)),
                            wosb_relevance_flag: WOSB_KW.some(kw => sa.includes(kw)),
                            sources_sought_flag: nt === "r" || titleLower.includes("sources sought"),
                            last_crawled_at: new Date().toISOString(),
                        };
                    });

                    if (payload.length > 0) {
                        const { error: upsertErr } = await db.from("opportunities").upsert(payload, { onConflict: "notice_id", ignoreDuplicates: false });
                        if (upsertErr) {
                            // Fallback: strip new columns
                            const NEW_COLS = ["status", "veteran_relevance_flag", "small_business_relevance_flag", "wosb_relevance_flag", "sources_sought_flag", "last_crawled_at", "sub_agency", "department"];
                            const stripped = payload.map(row => {
                                const clean: Record<string, unknown> = {};
                                for (const [k, v] of Object.entries(row)) {
                                    if (!NEW_COLS.includes(k)) clean[k] = v;
                                }
                                return clean;
                            });
                            await db.from("opportunities").upsert(stripped, { onConflict: "notice_id", ignoreDuplicates: true });
                        }
                        crawledCount += payload.length;
                    }
                } catch { /* timeout or network error — skip */ }
            }
        }

        // ─── Step 3: Return combined results ─────────────────
        let finalQuery = db.from("opportunities")
            .select("notice_id, title, agency, naics_code, set_aside_code, notice_type, response_deadline, estimated_value, place_of_performance_state, status, veteran_relevance_flag, small_business_relevance_flag, wosb_relevance_flag, sources_sought_flag, link")
            .in("naics_code", naics_codes)
            .order("response_deadline", { ascending: false, nullsFirst: false });

        if (active_only) {
            finalQuery = finalQuery.in("status", ["ACTIVE", "EXPIRING_SOON", "MARKET_RESEARCH", "DISCOVERED"]);
        }

        if (set_aside_filter?.length) {
            // Filter by set-aside keywords
            const orClauses = set_aside_filter.map((sa: string) => `set_aside_code.ilike.%${sa}%`).join(",");
            finalQuery = finalQuery.or(orClauses);
        }

        const { data: finalResults } = await finalQuery.limit(100);

        return NextResponse.json({
            source: crawledCount > 0 ? "combined" : "database",
            opportunities: finalResults || [],
            total: (finalResults || []).length,
            crawled_count: crawledCount,
            message: crawledCount > 0
                ? `Found ${(finalResults || []).length} opportunities (${crawledCount} freshly crawled from SAM.gov)`
                : `Found ${(finalResults || []).length} opportunities in database`,
        });

    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

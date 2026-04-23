import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
    );
}

// Set-aside codes that indicate veteran relevance
const VETERAN_KEYWORDS = ["sdvosb", "vosb", "veteran", "service-disabled"];
const SB_KEYWORDS = ["small business", "8(a)", "hubzone", "wosb", "women-owned", "small disadvantaged"];
const WOSB_KEYWORDS = ["wosb", "women-owned", "woman-owned", "edwosb"];

function detectFlags(op: Record<string, unknown>) {
    const setAside = String(op.typeOfSetAside || op.typeOfSetAsideDescription || "").toLowerCase();
    const title = String(op.title || "").toLowerCase();
    const noticeType = String(op.type || "").toLowerCase();

    const veteran = VETERAN_KEYWORDS.some(kw => setAside.includes(kw) || title.includes(kw));
    const smallBiz = setAside.length > 0 && !setAside.includes("none") && !setAside.includes("total");
    const wosb = WOSB_KEYWORDS.some(kw => setAside.includes(kw) || title.includes(kw));
    const sourcesSought = noticeType === "r" || title.includes("sources sought") || title.includes("rfi") || title.includes("market research");

    return { veteran, smallBiz, wosb, sourcesSought };
}

function computeStatus(op: Record<string, unknown>, ptype: string): string {
    if (ptype === "a") return "AWARDED";
    if (ptype === "f") return "SEARCH_SEED";

    const { sourcesSought } = detectFlags(op);
    const deadlineStr = String(op.responseDeadLine || op.responseDate || "");
    const now = new Date();

    if (sourcesSought || ptype === "r") {
        if (deadlineStr) {
            try { if (new Date(deadlineStr) < now) return "INTELLIGENCE"; } catch { /* ignore */ }
        }
        return "MARKET_RESEARCH";
    }

    if (deadlineStr) {
        try {
            const deadline = new Date(deadlineStr);
            if (deadline < now) return "EXPIRED";
            if (deadline < new Date(now.getTime() + 7 * 86400000)) return "EXPIRING_SOON";
            return "ACTIVE";
        } catch { /* ignore */ }
    }

    return "DISCOVERED";
}

const PTYPE_LABELS: Record<string, string> = {
    r: "Sources Sought",
    p: "Presolicitation",
    o: "Solicitation",
    k: "Combined Synopsis",
};

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const supabase = getSupabase();
        const SAM_API_KEY = process.env.SAM_API_KEY!;
        const startTime = Date.now();
        console.log("Starting SAM Strategic Ingestion (daily)...");

        // Date range: last 7 days — wider window catches backfills +
        // holiday-weekend drift. Upsert key (notice_id) keeps it idempotent
        // so re-seeing a notice does nothing.
        const windowDays = parseInt(req.nextUrl.searchParams.get("days") || "7", 10);
        const toDate = new Date();
        const fromDate = new Date();
        fromDate.setDate(toDate.getDate() - windowDays);
        const fromStr = `${String(fromDate.getMonth() + 1).padStart(2, "0")}/${String(fromDate.getDate()).padStart(2, "0")}/${fromDate.getFullYear()}`;
        const toStr = `${String(toDate.getMonth() + 1).padStart(2, "0")}/${String(toDate.getDate()).padStart(2, "0")}/${toDate.getFullYear()}`;

        console.log(`Date range: ${fromStr} to ${toStr}`);

        // Pre-load valid FK codes
        const [naicsRes, pscRes] = await Promise.all([
            supabase.from("naics_codes").select("code"),
            supabase.from("psc_codes").select("code"),
        ]);
        const validNaics = new Set((naicsRes.data || []).map((r: { code: string }) => r.code));
        const validPsc = new Set((pscRes.data || []).map((r: { code: string }) => r.code));

        const limit = 1000;
        let totalProcessed = 0;
        let totalInserted = 0;
        // r=Sources Sought/RFI, p=Presolicitation, o=Solicitation,
        // k=Combined Synopsis, u=Justification, i=Intent to Bundle,
        // g=Sale of Surplus, s=Special Notice. Broad coverage = more leads.
        const ptypes = ["r", "p", "o", "k", "u", "i", "s"];

        for (const ptype of ptypes) {
            // Check if we're running out of time (leave 30s buffer)
            if (Date.now() - startTime > 250_000) {
                console.log(`Time limit approaching. Stopping after ${ptype}.`);
                break;
            }

            console.log(`Fetching: ${PTYPE_LABELS[ptype]} (${ptype})`);
            let offset = 0;
            let keepFetching = true;

            while (keepFetching) {
                const url = `https://api.sam.gov/opportunities/v2/search?postedFrom=${fromStr}&postedTo=${toStr}&limit=${limit}&offset=${offset}&ptype=${ptype}`;

                const res = await fetch(url, {
                    headers: { "X-Api-Key": SAM_API_KEY },
                });

                if (!res.ok) {
                    console.error(`SAM API Error: ${res.status}`);
                    break;
                }

                const data = await res.json();
                const opps = (data.opportunitiesData || []) as Record<string, unknown>[];

                if (opps.length === 0) {
                    keepFetching = false;
                    break;
                }

                const payload = opps
                    .filter((o) => o.noticeId)
                    .map((o) => {
                        const { veteran, smallBiz, wosb, sourcesSought } = detectFlags(o);
                        const status = computeStatus(o, ptype);
                        const naics = String(o.naicsCode || "");
                        const psc = String(o.classificationCode || "");
                        const award = (o.award && typeof o.award === "object") ? o.award as Record<string, unknown> : null;
                        const awardee = (award?.awardee && typeof award.awardee === "object") ? award.awardee as Record<string, unknown> : null;
                        const pop = (o.placeOfPerformance && typeof o.placeOfPerformance === "object") ? o.placeOfPerformance as Record<string, unknown> : null;
                        const popState = pop?.state && typeof pop.state === "object" ? (pop.state as Record<string, unknown>).code : null;
                        const popCity = pop?.city && typeof pop.city === "object" ? (pop.city as Record<string, unknown>).name : null;

                        return {
                            notice_id: o.noticeId,
                            title: o.title || null,
                            description: o.description || null,
                            agency: o.department || o.subTier || o.agency || null,
                            sub_agency: o.subtierAgency || o.subtier || null,
                            office: o.office || null,
                            organization_code: o.organizationCode || null,
                            naics_code: naics && validNaics.has(naics) ? naics : null,
                            psc_code: psc && validPsc.has(psc) ? psc : null,
                            set_aside_code: o.typeOfSetAsideDescription || o.typeOfSetAside || null,
                            notice_type: o.type || null,
                            posted_date: o.postedDate ? new Date(String(o.postedDate)).toISOString() : null,
                            response_deadline: o.responseDeadLine ? new Date(String(o.responseDeadLine)).toISOString() : null,
                            place_of_performance_state: popState || null,
                            place_of_performance_city: popCity || null,
                            place_of_performance_zip: pop?.zip || null,
                            solicitation_number: o.solicitationNumber || null,
                            award_amount: award?.amount ? Number(award.amount) : null,
                            estimated_value: o.estimatedTotalValue ? Number(o.estimatedTotalValue) : (award?.amount ? Number(award.amount) : null),
                            link: o.uiLink || (o.noticeId ? `https://sam.gov/opp/${o.noticeId}/view` : null),
                            priority_flag: false,
                            is_archived: ["EXPIRED", "ARCHIVED", "DELETED"].includes(status),
                            raw_json: o,
                            // Strategic fields
                            status,
                            veteran_relevance_flag: veteran,
                            small_business_relevance_flag: smallBiz,
                            wosb_relevance_flag: wosb,
                            sources_sought_flag: sourcesSought,
                            last_crawled_at: new Date().toISOString(),
                            retention_protected: status === "AWARDED",
                            retention_reason: status === "AWARDED" ? "award_notice" : null,
                            incumbent_contractor_name: awardee?.name ? String(awardee.name) : undefined,
                        };
                    });

                const { error: dbError } = await supabase
                    .from("opportunities")
                    .upsert(payload, { onConflict: "notice_id", ignoreDuplicates: false });

                if (dbError) {
                    console.error(`DB Error for ${ptype}: ${dbError.message}`);
                    // Try without new columns as fallback (pre-migration compat)
                    const NEW_COLS = ["sub_agency", "office", "estimated_value", "status", "veteran_relevance_flag", "small_business_relevance_flag", "wosb_relevance_flag", "sources_sought_flag", "last_crawled_at", "retention_protected", "retention_reason", "incumbent_contractor_name"];
                    const fallback = payload.map(row => {
                        const clean: Record<string, unknown> = {};
                        for (const [k, v] of Object.entries(row)) {
                            if (!NEW_COLS.includes(k)) clean[k] = v;
                        }
                        return clean;
                    });
                    const { error: fallbackErr } = await supabase.from("opportunities").upsert(fallback, { onConflict: "notice_id", ignoreDuplicates: true });
                    if (fallbackErr) {
                        console.error(`Fallback also failed: ${fallbackErr.message}`);
                        break;
                    }
                }

                totalProcessed += opps.length;
                totalInserted += payload.length;
                offset += limit;

                if (opps.length < limit) keepFetching = false;
            }
        }

        console.log(`Ingestion Complete. Window=${windowDays}d Processed=${totalProcessed} Upserted=${totalInserted}`);
        return NextResponse.json({ success: true, window_days: windowDays, processed: totalProcessed, inserted: totalInserted });

    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Fatal Error";
        console.error("Fatal Ingestion Error:", e);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

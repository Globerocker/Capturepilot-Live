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
    // Dual auth: Vercel cron OR Supabase pg_cron service-key bearer
    // (Vercel's scheduler has silently stopped firing this — pg_cron now backs it up)
    const authHeader = req.headers.get("authorization");
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;
    const expectedCron = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
    const expectedSvc = serviceKey ? `Bearer ${serviceKey}` : null;
    if ((expectedCron || expectedSvc) && authHeader !== expectedCron && authHeader !== expectedSvc) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const supabase = getSupabase();
        // Primary key + optional backup. If the primary returns 401/403 mid-run
        // (revoked / quota exhausted), we swap to the secondary and keep going
        // — silently losing a whole day of opps because one key flipped is the
        // exact failure mode that put us 9 days behind on 2026-05-13.
        const SAM_KEYS = [process.env.SAM_API_KEY, process.env.SAM_API_KEY_2]
            .filter((k): k is string => !!k && k.length > 10);
        if (SAM_KEYS.length === 0) {
            return NextResponse.json({ error: "No SAM_API_KEY configured" }, { status: 500 });
        }
        let activeKeyIdx = 0;
        const startTime = Date.now();
        console.log(`Starting SAM Strategic Ingestion (daily) — ${SAM_KEYS.length} key(s) available...`);

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
        const dbErrors: string[] = [];
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

                let res = await fetch(url, {
                    headers: { "X-Api-Key": SAM_KEYS[activeKeyIdx]! },
                });

                // Auth/quota failure on the active key → try the next available
                // one before giving up on the whole ptype.
                if ((res.status === 401 || res.status === 403 || res.status === 429) && activeKeyIdx < SAM_KEYS.length - 1) {
                    const failed = activeKeyIdx;
                    activeKeyIdx += 1;
                    console.warn(`SAM key #${failed} returned ${res.status} — rotating to key #${activeKeyIdx}`);
                    res = await fetch(url, {
                        headers: { "X-Api-Key": SAM_KEYS[activeKeyIdx]! },
                    });
                }

                if (!res.ok) {
                    // Capture body so we know if it's 403 (quota), 401 (bad key),
                    // 429 (burst), or something else. Previous "Error: 403" was
                    // useless for diagnosis.
                    const body = await res.text().catch(() => "<unreadable>");
                    console.error(`SAM API Error: ${res.status} ${res.statusText} — ptype=${ptype} offset=${offset} key#${activeKeyIdx} body=${body.slice(0, 400)}`);
                    if (res.status === 429 || res.status === 403) {
                        console.error("All SAM keys exhausted or rate-limited. Aborting this ptype.");
                    }
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

                        // SAM.gov's `resourceLinks` is the authoritative attachment
                        // URL list. Previously we stored raw_json but left the
                        // dedicated column empty, which is why deep_enrich and
                        // download_attachments had almost nothing to chew on.
                        const resourceLinks = Array.isArray(o.resourceLinks) ? o.resourceLinks : [];
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
                            resource_links: resourceLinks,
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
                    dbErrors.push(`primary[${ptype}]: ${dbError.message.slice(0, 200)}`);
                    // Try without new columns as fallback (pre-migration compat)
                    const NEW_COLS = ["sub_agency", "office", "estimated_value", "status", "veteran_relevance_flag", "small_business_relevance_flag", "wosb_relevance_flag", "sources_sought_flag", "last_crawled_at", "retention_protected", "retention_reason", "incumbent_contractor_name", "resource_links", "organization_code"];
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
                        dbErrors.push(`fallback[${ptype}]: ${fallbackErr.message.slice(0, 200)}`);
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
        return NextResponse.json({
            success: true,
            window_days: windowDays,
            processed: totalProcessed,
            inserted: totalInserted,
            db_errors: dbErrors.length > 0 ? dbErrors : undefined,
        });

    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Fatal Error";
        console.error("Fatal Ingestion Error:", e);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

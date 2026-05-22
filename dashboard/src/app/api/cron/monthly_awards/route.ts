import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
    );
}

/**
 * Monthly cron: Fetch Award Notices + Forecast from SAM.gov
 * - Award notices: identify winners, update incumbent data, set retention_protected
 * - Forecast notices: early pipeline signals (SEARCH_SEED status)
 * Runs once per month to conserve API budget.
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET) {
        const expectedCron = `Bearer ${process.env.CRON_SECRET}`;
        const expectedSvc = process.env.SUPABASE_SERVICE_KEY ? `Bearer ${process.env.SUPABASE_SERVICE_KEY}` : null;
        if (authHeader !== expectedCron && authHeader !== expectedSvc) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
    }

    try {
        const supabase = getSupabase();
        const SAM_API_KEY = process.env.SAM_API_KEY!;
        console.log("Starting Monthly Awards + Forecast Ingestion...");

        // Date range: last 30 days
        const toDate = new Date();
        const fromDate = new Date();
        fromDate.setDate(toDate.getDate() - 30);
        const fromStr = `${String(fromDate.getMonth() + 1).padStart(2, "0")}/${String(fromDate.getDate()).padStart(2, "0")}/${fromDate.getFullYear()}`;
        const toStr = `${String(toDate.getMonth() + 1).padStart(2, "0")}/${String(toDate.getDate()).padStart(2, "0")}/${toDate.getFullYear()}`;

        const limit = 1000;
        let totalInserted = 0;
        const ptypes = [
            { code: "a", label: "Award Notice", status: "AWARDED" },
            { code: "f", label: "Forecast", status: "SEARCH_SEED" },
        ];

        for (const { code, label, status } of ptypes) {
            console.log(`Fetching: ${label}`);
            let offset = 0;
            let keepFetching = true;

            while (keepFetching) {
                const url = `https://api.sam.gov/opportunities/v2/search?postedFrom=${fromStr}&postedTo=${toStr}&limit=${limit}&offset=${offset}&ptype=${code}`;

                const res = await fetch(url, {
                    headers: { "X-Api-Key": SAM_API_KEY },
                });

                if (!res.ok) {
                    console.error(`SAM API Error for ${label}: ${res.status}`);
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
                        const award = (o.award && typeof o.award === "object") ? o.award as Record<string, unknown> : null;
                        const awardee = (award?.awardee && typeof award.awardee === "object") ? award.awardee as Record<string, unknown> : null;
                        const pop = (o.placeOfPerformance && typeof o.placeOfPerformance === "object") ? o.placeOfPerformance as Record<string, unknown> : null;
                        const popState = pop?.state && typeof pop.state === "object" ? (pop.state as Record<string, unknown>).code : null;

                        return {
                            notice_id: o.noticeId,
                            title: o.title || null,
                            description: o.description || null,
                            agency: o.department || o.subTier || o.agency || null,
                            sub_agency: o.subtierAgency || o.subtier || null,
                            office: o.office || null,
                            naics_code: o.naicsCode || null,
                            psc_code: o.classificationCode || null,
                            set_aside_code: o.typeOfSetAsideDescription || o.typeOfSetAside || null,
                            notice_type: o.type || null,
                            posted_date: o.postedDate ? new Date(String(o.postedDate)).toISOString() : null,
                            response_deadline: o.responseDeadLine ? new Date(String(o.responseDeadLine)).toISOString() : null,
                            place_of_performance_state: popState || null,
                            solicitation_number: o.solicitationNumber || null,
                            award_amount: award?.amount ? Number(award.amount) : null,
                            estimated_value: award?.amount ? Number(award.amount) : null,
                            link: o.uiLink || `https://sam.gov/opp/${o.noticeId}/view`,
                            is_archived: status === "AWARDED",
                            raw_json: o,
                            status,
                            retention_protected: status === "AWARDED",
                            retention_reason: status === "AWARDED" ? "award_notice" : null,
                            incumbent_contractor_name: awardee?.name ? String(awardee.name) : null,
                            incumbent_contractor_uei: awardee?.ueiSAM ? String(awardee.ueiSAM) : null,
                            last_crawled_at: new Date().toISOString(),
                        };
                    });

                // Null out invalid FK codes
                for (const row of payload) {
                    if (!row.naics_code) row.naics_code = null;
                    if (!row.psc_code) row.psc_code = null;
                }

                const { error } = await supabase
                    .from("opportunities")
                    .upsert(payload, { onConflict: "notice_id", ignoreDuplicates: false });

                if (error) {
                    console.error(`DB Error for ${label}:`, error.message);
                    // Fallback: strip new columns (pre-migration compat)
                    const NEW_COLS = ["sub_agency", "office", "estimated_value", "status", "retention_protected", "retention_reason", "incumbent_contractor_name", "incumbent_contractor_uei", "last_crawled_at"];
                    const fallback = payload.map(row => {
                        const clean: Record<string, unknown> = {};
                        for (const [k, v] of Object.entries(row)) {
                            if (!NEW_COLS.includes(k)) clean[k] = v;
                        }
                        return clean;
                    });
                    await supabase.from("opportunities").upsert(fallback, { onConflict: "notice_id", ignoreDuplicates: true });
                }

                totalInserted += payload.length;
                offset += limit;
                if (opps.length < limit) keepFetching = false;
            }
        }

        console.log(`Monthly Awards Complete. Inserted: ${totalInserted}`);
        return NextResponse.json({ success: true, inserted: totalInserted });

    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Fatal Error";
        console.error("Monthly Awards Error:", e);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

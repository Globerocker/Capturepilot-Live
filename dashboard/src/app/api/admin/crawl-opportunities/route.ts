import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";

export const maxDuration = 300;

function getAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

const VETERAN_KEYWORDS = ["sdvosb", "vosb", "veteran", "service-disabled"];
const SB_KEYWORDS = ["small business", "8(a)", "hubzone", "wosb", "women-owned", "small disadvantaged"];
const WOSB_KEYWORDS = ["wosb", "women-owned", "woman-owned", "edwosb"];

/**
 * POST /api/admin/crawl-opportunities
 * On-demand SAM.gov crawl by NAICS codes. Used when onboarding new clients
 * or when admin wants to ensure we have coverage for specific industries.
 *
 * Body: {
 *   naics_codes: string[],     // required: NAICS codes to crawl
 *   days_back?: number,        // optional: how far back (default 90)
 *   user_profile_id?: string,  // optional: log activity for this client
 * }
 */
export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    try {
        const body = await req.json();
        const { naics_codes, days_back = 90, user_profile_id } = body;

        if (!naics_codes || !Array.isArray(naics_codes) || naics_codes.length === 0) {
            return NextResponse.json({ error: "naics_codes array required" }, { status: 400 });
        }

        const admin = getAdmin();
        const SAM_API_KEY = process.env.SAM_API_KEY!;
        const startTime = Date.now();

        // Pre-load valid NAICS/PSC for FK validation
        const [naicsRes, pscRes] = await Promise.all([
            admin.from("naics_codes").select("code"),
            admin.from("psc_codes").select("code"),
        ]);
        const validNaics = new Set((naicsRes.data || []).map((r: { code: string }) => r.code));
        const validPsc = new Set((pscRes.data || []).map((r: { code: string }) => r.code));

        // Date range
        const toDate = new Date();
        const fromDate = new Date();
        fromDate.setDate(toDate.getDate() - days_back);
        const fromStr = `${String(fromDate.getMonth() + 1).padStart(2, "0")}/${String(fromDate.getDate()).padStart(2, "0")}/${fromDate.getFullYear()}`;
        const toStr = `${String(toDate.getMonth() + 1).padStart(2, "0")}/${String(toDate.getDate()).padStart(2, "0")}/${toDate.getFullYear()}`;

        let totalInserted = 0;
        const naicsCounts: Record<string, number> = {};
        const ptypes = ["r", "p", "o", "k"]; // Sources Sought, Presol, Sol, Combined

        for (const naicsCode of naics_codes) {
            // Check time budget (leave 30s buffer for 5min max)
            if (Date.now() - startTime > 250_000) break;

            naicsCounts[naicsCode] = 0;

            for (const ptype of ptypes) {
                if (Date.now() - startTime > 250_000) break;

                let offset = 0;
                while (true) {
                    const url = `https://api.sam.gov/opportunities/v2/search?postedFrom=${fromStr}&postedTo=${toStr}&limit=1000&offset=${offset}&ptype=${ptype}&ncode=${naicsCode}`;

                    const res = await fetch(url, {
                        headers: { "X-Api-Key": SAM_API_KEY },
                        signal: AbortSignal.timeout(30000),
                    });

                    if (!res.ok) break;
                    const data = await res.json();
                    const opps = (data.opportunitiesData || []) as Record<string, unknown>[];
                    if (opps.length === 0) break;

                    const payload = opps.filter(o => o.noticeId).map(o => {
                        const setAside = String(o.typeOfSetAsideDescription || o.typeOfSetAside || "").toLowerCase();
                        const titleLower = String(o.title || "").toLowerCase();
                        const noticeType = String(o.type || "").toLowerCase();
                        const fpp = String(o.fullParentPathName || "");
                        const fppParts = fpp.split(".");
                        const naics = String(o.naicsCode || "");
                        const psc = String(o.classificationCode || "");
                        const deadlineStr = String(o.responseDeadLine || "");
                        const now = new Date();

                        let status = "DISCOVERED";
                        if (noticeType === "r" || titleLower.includes("sources sought")) {
                            status = deadlineStr && new Date(deadlineStr) < now ? "INTELLIGENCE" : "MARKET_RESEARCH";
                        } else if (deadlineStr) {
                            status = new Date(deadlineStr) < now ? "EXPIRED" : "ACTIVE";
                        }

                        return {
                            notice_id: o.noticeId,
                            title: o.title || null,
                            description: o.description || null,
                            agency: fppParts[0]?.trim() || null,
                            sub_agency: fppParts[1]?.trim() || null,
                            office: fppParts.length > 2 ? fppParts[fppParts.length - 1]?.trim() : null,
                            department: fpp || null,
                            naics_code: naics && validNaics.has(naics) ? naics : null,
                            psc_code: psc && validPsc.has(psc) ? psc : null,
                            set_aside_code: o.typeOfSetAsideDescription || o.typeOfSetAside || null,
                            notice_type: o.type || null,
                            posted_date: o.postedDate ? new Date(String(o.postedDate)).toISOString() : null,
                            response_deadline: o.responseDeadLine ? new Date(String(o.responseDeadLine)).toISOString() : null,
                            solicitation_number: o.solicitationNumber || null,
                            link: o.uiLink || `https://sam.gov/opp/${o.noticeId}/view`,
                            is_archived: ["EXPIRED"].includes(status),
                            raw_json: o,
                            status,
                            veteran_relevance_flag: VETERAN_KEYWORDS.some(kw => setAside.includes(kw) || titleLower.includes(kw)),
                            small_business_relevance_flag: SB_KEYWORDS.some(kw => setAside.includes(kw)),
                            wosb_relevance_flag: WOSB_KEYWORDS.some(kw => setAside.includes(kw)),
                            sources_sought_flag: noticeType === "r" || titleLower.includes("sources sought"),
                            last_crawled_at: new Date().toISOString(),
                        };
                    });

                    if (payload.length > 0) {
                        const { error } = await admin
                            .from("opportunities")
                            .upsert(payload, { onConflict: "notice_id", ignoreDuplicates: false });

                        if (error) {
                            // Fallback: strip new columns
                            const NEW_COLS = ["sub_agency", "office", "estimated_value", "status", "veteran_relevance_flag", "small_business_relevance_flag", "wosb_relevance_flag", "sources_sought_flag", "last_crawled_at", "retention_protected", "retention_reason", "department"];
                            const fallback = payload.map(row => {
                                const clean: Record<string, unknown> = {};
                                for (const [k, v] of Object.entries(row)) {
                                    if (!NEW_COLS.includes(k)) clean[k] = v;
                                }
                                return clean;
                            });
                            await admin.from("opportunities").upsert(fallback, { onConflict: "notice_id", ignoreDuplicates: true });
                        }

                        totalInserted += payload.length;
                        naicsCounts[naicsCode] += payload.length;
                    }

                    offset += 1000;
                    if (opps.length < 1000) break;
                }
            }
        }

        // Log activity if client-specific
        if (user_profile_id) {
            await admin.from("client_activity_log").insert({
                user_profile_id,
                action: "naics_crawl",
                description: `Crawled ${totalInserted} opportunities for NAICS: ${naics_codes.join(", ")}`,
                metadata: { naics_codes, naics_counts: naicsCounts, days_back },
            });
        }

        return NextResponse.json({
            success: true,
            total_inserted: totalInserted,
            naics_counts: naicsCounts,
            days_back,
            elapsed_ms: Date.now() - startTime,
        });

    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

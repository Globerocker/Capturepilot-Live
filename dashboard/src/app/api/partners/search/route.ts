import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { protectCrawl } from "@/lib/crawl-protection";

export const maxDuration = 60;

const SAM_ENTITY_ENDPOINT = "https://api.sam.gov/entity-information/v3/entities";
const MAX_FANOUT = 12; // cap the (naics × state) combinations per request

type SamEntity = Record<string, unknown>;

interface PartnerResult {
    uei: string;
    cage_code: string;
    company_name: string;
    dba_name: string;
    state: string;
    city: string;
    naics_codes: string[];
    primary_naics: string;
    certifications: string[];
    website: string;
    registration_status: string;
    expiration_date: string;
    entity_type: string;
    sam_url: string;
    // POC fields — extracted from SAM's pointsOfContact block. The
    // `bulk_enrich_contractors_sam` cron uses the same logic to populate
    // our contractors table; we mirror it here so partners search isn't
    // missing what's already in the underlying SAM response.
    poc_name: string | null;
    poc_title: string | null;
    poc_email: string | null;
    poc_phone: string | null;
    // Cross-reference from our enriched contractors table (when the UEI
    // matches a row we've already deep-enriched). Surfaces past-award
    // count + business summary the partner card can show inline.
    enriched_from_db: boolean;
    past_award_count: number | null;
    capability_summary: string | null;
    // Cached USASpending aggregates (when present in contractors row).
    total_award_volume: number | null;
    last_award_date: string | null;
}

// pointsOfContact shape from SAM v3. Same priority as bulk_enrich cron:
// electronicBusinessPOC first (usually a real human bizdev contact),
// then governmentBusinessPOC (registrar of record), then pastPerformancePOC.
type SamPoc = {
    firstName?: string;
    lastName?: string;
    title?: string;
    email?: string;
    usPhoneNumber?: string;
};
type SamPocBlock = {
    electronicBusinessPOC?: SamPoc;
    governmentBusinessPOC?: SamPoc;
    pastPerformancePOC?: SamPoc;
};

function bestPoc(block: SamPocBlock | undefined): { name: string | null; title: string | null; email: string | null; phone: string | null } {
    const candidates = [
        block?.electronicBusinessPOC,
        block?.governmentBusinessPOC,
        block?.pastPerformancePOC,
    ].filter(Boolean) as SamPoc[];
    for (const p of candidates) {
        const email = (p.email || "").trim();
        if (!email) continue;
        const name = [p.firstName, p.lastName].filter(Boolean).join(" ").trim();
        return { name: name || null, title: p.title || null, email, phone: p.usPhoneNumber || null };
    }
    return { name: null, title: null, email: null, phone: null };
}

/**
 * GET /api/partners/search
 *   ?naics=237110&naics=541330   (repeatable)
 *   &state=TX&state=VA            (repeatable; blank -> nationwide)
 *   &set_aside=SDVOSB
 *   &keyword=acme                 (company-name search)
 *   &limit=30
 *
 * Fans out across (naics × state) up to MAX_FANOUT upstream calls,
 * dedupes by UEI. Uses the X-Api-Key header (per CLAUDE.md: the
 * ?api_key= URL param is deprecated and rejected).
 */
export async function GET(req: NextRequest) {
    // Crawl protection — partners/search is expensive (12 fanout calls to SAM
    // per request) so the limit is tighter than other public endpoints. 20/min/IP
    // is enough for a human user exploring; bulk-scrapers get 429.
    const blocked = await protectCrawl(req, { route: "partners-search", maxPerMin: 20 });
    if (blocked) return blocked;
    // Try all SAM keys. Key 1 + Key 3 are the opportunity-ingest pool (added
    // 2026-06-08); Key 2 is the entity/contractor-scope key. All three share
    // partner-search since /entity-information is what powers the lookup.
    // When ingest hammers its primary quota the search would 502 with
    // "Message throttled out" — exactly what users saw at 2026-05-29.
    const SAM_KEYS = [
        process.env.SAM_API_KEY,
        process.env.SAM_API_KEY_3,
        process.env.SAM_API_KEY_2,
    ].filter((k): k is string => !!k && k.length > 10);
    if (SAM_KEYS.length === 0) {
        return NextResponse.json(
            { error: "SAM API key not configured", partners: [], total: 0 },
            { status: 500 }
        );
    }
    let activeKeyIdx = 0;

    try {
        const { searchParams } = req.nextUrl;

        // Accept repeated params
        const naicsList = searchParams.getAll("naics").map(s => s.trim()).filter(Boolean);
        const stateList = searchParams.getAll("state").map(s => s.trim().toUpperCase()).filter(Boolean);
        const setAside = (searchParams.get("set_aside") || "").trim();
        const keyword = (searchParams.get("keyword") || "").trim();
        const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20"), 1), 100);

        if (naicsList.length === 0 && !keyword) {
            return NextResponse.json(
                { error: "naics or keyword required", partners: [], total: 0 },
                { status: 400 }
            );
        }

        // Build (naics × state) combos. Blank lists collapse to [""] so we still fire one request.
        const naicsAxis = naicsList.length > 0 ? naicsList : [""];
        const stateAxis = stateList.length > 0 ? stateList : [""];

        const combos: Array<{ naics: string; state: string }> = [];
        for (const n of naicsAxis) {
            for (const s of stateAxis) {
                combos.push({ naics: n, state: s });
                if (combos.length >= MAX_FANOUT) break;
            }
            if (combos.length >= MAX_FANOUT) break;
        }

        const saMap: Record<string, string> = {
            // Short tokens from the UI → SAM Entity API sbaBusinessTypeCode.
            // "TRIBAL" maps to "XW" (Tribally Owned Firm); ANC/NHO are separate
            // codes (XS, XT) but we lean on XW as the most common umbrella.
            "8A": "2X", "SDVOSB": "QF", "WOSB": "A2", "HUBZONE": "27",
            "VOSB": "A5", "SDB": "XX", "TRIBAL": "XW",
        };
        const setAsideCode = setAside ? saMap[setAside.toUpperCase()] || "" : "";

        // Fire upstream calls in parallel
        const upstreamErrors: string[] = [];
        const results = await Promise.all(
            combos.map(async ({ naics, state }) => {
                // NOTE: do NOT put api_key into the URL — it's deprecated.
                const params = new URLSearchParams({
                    registrationStatus: "A",
                    purposeOfRegistrationCode: "Z2",
                    // pointsOfContact added so we get emails/phones — previously
                    // dropped from the response, leaving SAM-live cards blank.
                    includeSections: "entityRegistration,coreData,assertions,pointsOfContact",
                    samRegistered: "Yes",
                });
                if (naics) params.set("naicsCode", naics);
                if (state) params.set("physicalAddressProvinceOrStateCode", state);
                if (keyword) params.set("legalBusinessName", keyword);
                if (setAsideCode) params.set("sbaBusinessTypeCode", setAsideCode);

                const url = `${SAM_ENTITY_ENDPOINT}?${params.toString()}`;
                // Try each key in turn on 401/403/429 (quota or auth fail).
                // activeKeyIdx is read at request-time so once one parallel
                // call rotates, subsequent calls start from the working key.
                let lastErr = "";
                let lastStatus = 0;
                let startIdx = activeKeyIdx;
                for (let attempt = 0; attempt < SAM_KEYS.length; attempt++) {
                    const keyIdx = (startIdx + attempt) % SAM_KEYS.length;
                    try {
                        const res = await fetch(url, {
                            headers: { "X-Api-Key": SAM_KEYS[keyIdx] },
                            signal: AbortSignal.timeout(25000),
                        });
                        if (res.ok) {
                            // Promote this key to the new default so the rest
                            // of the fanout doesn't keep eating quota errors.
                            if (keyIdx !== activeKeyIdx) activeKeyIdx = keyIdx;
                            const data = await res.json();
                            return (data.entityData || []) as SamEntity[];
                        }
                        const body = await res.text().catch(() => "");
                        lastErr = body.slice(0, 200);
                        lastStatus = res.status;
                        // Rotate on quota/auth — anything else (400/500) is
                        // unlikely to be fixed by another key, so bail out.
                        if (res.status !== 401 && res.status !== 403 && res.status !== 429) {
                            break;
                        }
                    } catch (err) {
                        lastErr = (err as Error).message;
                        lastStatus = 0;
                    }
                }
                upstreamErrors.push(`SAM ${lastStatus || "ERR"} (naics=${naics || "-"} state=${state || "-"}): ${lastErr}`);
                return [] as SamEntity[];
            })
        );

        // Flatten and dedupe by UEI
        const byUei = new Map<string, PartnerResult>();
        for (const batch of results) {
            for (const entity of batch) {
                const reg = (entity.entityRegistration || {}) as Record<string, unknown>;
                const core = (entity.coreData || {}) as Record<string, unknown>;
                const addr = (core.physicalAddress || {}) as Record<string, unknown>;
                const assertions = (entity.assertions || {}) as Record<string, unknown>;
                const goods = (assertions.goodsAndServices || {}) as Record<string, unknown>;
                const naicsCodes = (goods.naicsList || []) as Array<Record<string, unknown>>;
                const bizTypes = (reg.businessTypes || []) as string[];

                const bizStr = bizTypes.join(" ").toLowerCase();
                const certs: string[] = [];
                if (bizStr.includes("8(a)") || bizStr.includes("2x")) certs.push("8(a)");
                if (bizStr.includes("hubzone") || bizStr.includes("27")) certs.push("HUBZone");
                if (bizStr.includes("sdvosb") || bizStr.includes("qf")) certs.push("SDVOSB");
                if (bizStr.includes("wosb") || bizStr.includes("a2")) certs.push("WOSB");
                if (bizStr.includes("vosb") || bizStr.includes("a5")) certs.push("VOSB");

                const uei = String(reg.ueiSAM || "");
                if (!uei || byUei.has(uei)) continue;

                const poc = bestPoc(entity.pointsOfContact as SamPocBlock | undefined);

                byUei.set(uei, {
                    uei,
                    cage_code: String(reg.cageCode || ""),
                    company_name: String(reg.legalBusinessName || ""),
                    dba_name: String(reg.dbaName || ""),
                    state: String(addr.stateOrProvinceCode || ""),
                    city: String(addr.city || ""),
                    naics_codes: naicsCodes.map(n => String(n.naicsCode || "")).filter(Boolean),
                    primary_naics: String(goods.primaryNaics || ""),
                    certifications: certs,
                    website: String((core.generalInformation as Record<string, unknown>)?.entityURL || ""),
                    registration_status: String(reg.registrationStatus || ""),
                    expiration_date: String(reg.registrationExpirationDate || ""),
                    entity_type: String(reg.entityType || ""),
                    sam_url: `https://sam.gov/search/?q=${encodeURIComponent(uei)}&index=ei`,
                    poc_name: poc.name,
                    poc_title: poc.title,
                    poc_email: poc.email,
                    poc_phone: poc.phone,
                    enriched_from_db: false,
                    past_award_count: null,
                    capability_summary: null,
                    total_award_volume: null,
                    last_award_date: null,
                });

                if (byUei.size >= limit) break;
            }
            if (byUei.size >= limit) break;
        }

        const partners = Array.from(byUei.values()).slice(0, limit);

        // Cross-reference: when a SAM-live UEI matches a row in our
        // contractors table that's been deep-enriched, merge those richer
        // fields in. This is how the same row goes from a barebones SAM
        // record to "we already know this contractor has won 12 contracts
        // and here's their capability summary".
        if (partners.length > 0) {
            try {
                const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
                const supaKey = process.env.SUPABASE_SERVICE_KEY;
                if (supaUrl && supaKey) {
                    const sb = createClient(supaUrl, supaKey, { auth: { persistSession: false } });
                    const ueis = partners.map(p => p.uei);
                    // Pull cached USASpending fields too — populated by
                    // /api/intelligence/recipient-awards on first view of a
                    // contractor. Lets the partner card show "12 past awards"
                    // without a second roundtrip.
                    const { data: enrichedRows } = await sb
                        .from("contractors")
                        .select("uei, email, direct_phone, primary_poc_name, primary_poc_title, business_url, federal_awards_count, total_award_volume, last_award_date")
                        .in("uei", ueis);
                    const byUeiEnriched = new Map<string, Record<string, unknown>>(
                        (enrichedRows || []).map((r: Record<string, unknown>) => [String(r.uei), r]),
                    );
                    for (const p of partners) {
                        const e = byUeiEnriched.get(p.uei);
                        if (!e) continue;
                        p.enriched_from_db = true;
                        if (!p.poc_email && e.email) p.poc_email = String(e.email);
                        if (!p.poc_phone && e.direct_phone) p.poc_phone = String(e.direct_phone);
                        if (!p.poc_name && e.primary_poc_name) p.poc_name = String(e.primary_poc_name);
                        if (!p.poc_title && e.primary_poc_title) p.poc_title = String(e.primary_poc_title);
                        if (!p.website && e.business_url) p.website = String(e.business_url);
                        if (typeof e.federal_awards_count === "number") p.past_award_count = e.federal_awards_count;
                        if (typeof e.total_award_volume === "number") p.total_award_volume = e.total_award_volume;
                        if (e.last_award_date) p.last_award_date = String(e.last_award_date);
                    }
                }
            } catch (e) {
                // Non-fatal — SAM-live data still flows through; we just lose
                // the cross-ref this round. Logged for diagnosis.
                console.warn("[partners/search] DB cross-ref failed:", (e as Error).message);
            }
        }

        // If we got zero rows AND every upstream call failed, surface the first error.
        if (partners.length === 0 && upstreamErrors.length === combos.length && upstreamErrors.length > 0) {
            return NextResponse.json({
                error: "SAM.gov partner search failed for every query.",
                upstream_errors: upstreamErrors.slice(0, 3),
                partners: [],
                total: 0,
            }, { status: 502 });
        }

        return NextResponse.json({
            success: true,
            total: partners.length,
            query: { naics: naicsList, state: stateList, set_aside: setAside, keyword },
            fanout: combos.length,
            upstream_errors: upstreamErrors.length > 0 ? upstreamErrors.slice(0, 3) : undefined,
            partners,
        });

    } catch (e) {
        return NextResponse.json(
            { error: (e as Error).message, partners: [], total: 0 },
            { status: 500 }
        );
    }
}

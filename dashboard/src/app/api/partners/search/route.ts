import { NextRequest, NextResponse } from "next/server";

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
    const SAM_API_KEY = process.env.SAM_API_KEY;
    if (!SAM_API_KEY) {
        return NextResponse.json(
            { error: "SAM API key not configured", partners: [], total: 0 },
            { status: 500 }
        );
    }

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
            "8A": "2X", "SDVOSB": "QF", "WOSB": "A2", "HUBZONE": "27", "VOSB": "A5", "SDB": "XX",
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
                    includeSections: "entityRegistration,coreData,assertions",
                    samRegistered: "Yes",
                });
                if (naics) params.set("naicsCode", naics);
                if (state) params.set("physicalAddressProvinceOrStateCode", state);
                if (keyword) params.set("legalBusinessName", keyword);
                if (setAsideCode) params.set("sbaBusinessTypeCode", setAsideCode);

                const url = `${SAM_ENTITY_ENDPOINT}?${params.toString()}`;
                try {
                    const res = await fetch(url, {
                        headers: { "X-Api-Key": SAM_API_KEY },
                        signal: AbortSignal.timeout(25000),
                    });
                    if (!res.ok) {
                        const body = await res.text().catch(() => "");
                        upstreamErrors.push(`SAM ${res.status} (naics=${naics || "-"} state=${state || "-"}): ${body.slice(0, 200)}`);
                        return [] as SamEntity[];
                    }
                    const data = await res.json();
                    return (data.entityData || []) as SamEntity[];
                } catch (err) {
                    upstreamErrors.push(`SAM request failed (naics=${naics || "-"} state=${state || "-"}): ${(err as Error).message}`);
                    return [] as SamEntity[];
                }
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
                    sam_url: `https://sam.gov/entity/${uei}/coreData`,
                });

                if (byUei.size >= limit) break;
            }
            if (byUei.size >= limit) break;
        }

        const partners = Array.from(byUei.values()).slice(0, limit);

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

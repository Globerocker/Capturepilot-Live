import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

/**
 * GET /api/partners/search?naics=237110&state=TX&set_aside=SDVOSB&limit=20
 * Search for teaming partners using SAM.gov Entity API.
 *
 * Finds companies registered on SAM.gov that match criteria:
 * - Same or similar NAICS codes
 * - Specific certifications (8a, HUBZone, SDVOSB, WOSB)
 * - Geographic location
 * - Active registration
 *
 * Uses the same SAM_API_KEY we already have.
 */
export async function GET(req: NextRequest) {
    const SAM_API_KEY = process.env.SAM_API_KEY;
    if (!SAM_API_KEY) return NextResponse.json({ error: "SAM API key not configured" }, { status: 500 });

    try {
        const { searchParams } = req.nextUrl;
        // Accept repeated params: ?naics=123&naics=456&state=TX&state=CA
        const naicsList = searchParams.getAll("naics").filter(Boolean);
        const stateList = searchParams.getAll("state").filter(Boolean);
        const setAside = searchParams.get("set_aside") || "";
        const keyword = searchParams.get("keyword") || "";
        const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

        if (naicsList.length === 0 && !keyword) {
            return NextResponse.json({ error: "naics or keyword required" }, { status: 400 });
        }

        // Set-aside type mapping (SAM.gov business type codes)
        const saMap: Record<string, string> = {
            "8A": "2X", "SDVOSB": "QF", "WOSB": "A2", "HUBZONE": "27", "VOSB": "A5", "SDB": "XX",
        };

        // SAM.gov Entity API only supports single naicsCodeAny / single physicalAddressStateCode.
        // Fan out across every (naics × state) combination in parallel and merge the results.
        const naicsAxis = naicsList.length ? naicsList : [""];
        const stateAxis = stateList.length ? stateList : [""];

        const buildUrl = (naics: string, state: string): string => {
            const params = new URLSearchParams({
                api_key: SAM_API_KEY,
                registrationStatus: "A",
                purposeOfRegistrationCode: "Z2",
                includeSections: "entityRegistration,coreData,assertions",
            });
            if (naics) params.set("naicsCodeAny", naics);
            if (state) params.set("physicalAddressStateCode", state);
            if (keyword) params.set("legalBusinessName", keyword);
            if (setAside) {
                const code = saMap[setAside.toUpperCase()];
                if (code) params.set("sbaBusinessTypeCode", code);
            }
            return `https://api.sam.gov/entity-information/v3/entities?${params.toString()}`;
        };

        const urls: string[] = [];
        for (const n of naicsAxis) {
            for (const s of stateAxis) urls.push(buildUrl(n, s));
        }
        // Cap total outbound requests to avoid hammering SAM.gov.
        const MAX_REQUESTS = 12;
        const capped = urls.slice(0, MAX_REQUESTS);

        const responses = await Promise.allSettled(
            capped.map(u => fetch(u, { signal: AbortSignal.timeout(30000) })),
        );

        const rawEntities: Array<Record<string, unknown>> = [];
        for (const r of responses) {
            if (r.status !== "fulfilled" || !r.value.ok) continue;
            const data = await r.value.json().catch(() => null);
            if (!data?.entityData) continue;
            for (const e of data.entityData as Array<Record<string, unknown>>) rawEntities.push(e);
        }

        // De-duplicate by UEI, preserve insertion order.
        const seen = new Set<string>();
        const entities: Array<Record<string, unknown>> = [];
        for (const e of rawEntities) {
            const uei = String(((e.entityRegistration || {}) as Record<string, unknown>).ueiSAM || "");
            if (!uei || seen.has(uei)) continue;
            seen.add(uei);
            entities.push(e);
            if (entities.length >= limit) break;
        }

        const partners = entities.map((entity: Record<string, unknown>) => {
            const reg = (entity.entityRegistration || {}) as Record<string, unknown>;
            const core = (entity.coreData || {}) as Record<string, unknown>;
            const addr = (core.physicalAddress || {}) as Record<string, unknown>;
            const assertions = (entity.assertions || {}) as Record<string, unknown>;
            const goods = (assertions.goodsAndServices || {}) as Record<string, unknown>;
            const naicsList = (goods.naicsList || []) as Array<Record<string, unknown>>;
            const bizTypes = (reg.businessTypes || []) as string[];

            // Extract certifications from business types
            const certs: string[] = [];
            const bizStr = bizTypes.join(" ").toLowerCase();
            if (bizStr.includes("8(a)") || bizStr.includes("2x")) certs.push("8(a)");
            if (bizStr.includes("hubzone") || bizStr.includes("27")) certs.push("HUBZone");
            if (bizStr.includes("sdvosb") || bizStr.includes("qf")) certs.push("SDVOSB");
            if (bizStr.includes("wosb") || bizStr.includes("a2")) certs.push("WOSB");
            if (bizStr.includes("vosb") || bizStr.includes("a5")) certs.push("VOSB");

            return {
                uei: String(reg.ueiSAM || ""),
                cage_code: String(reg.cageCode || ""),
                company_name: String(reg.legalBusinessName || ""),
                dba_name: String(reg.dbaName || ""),
                state: String(addr.stateOrProvinceCode || ""),
                city: String(addr.city || ""),
                naics_codes: naicsList.map(n => String(n.naicsCode || "")).filter(Boolean),
                primary_naics: String(goods.primaryNaics || ""),
                certifications: certs,
                website: String((core.generalInformation as Record<string, unknown>)?.entityURL || ""),
                registration_status: String(reg.registrationStatus || ""),
                expiration_date: String(reg.registrationExpirationDate || ""),
                entity_type: String(reg.entityType || ""),
                sam_url: `https://sam.gov/entity/${reg.ueiSAM}/coreData`,
            };
        });

        return NextResponse.json({
            success: true,
            total: partners.length,
            query: { naics: naicsList, state: stateList, set_aside: setAside, keyword },
            partners,
        });

    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

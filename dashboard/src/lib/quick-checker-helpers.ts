// Shared helpers for the Quick Checker pipeline + rescore endpoint.
// Keep the route.ts file lean — extract anything reused across endpoints here.

const SAM_API_KEY = process.env.SAM_API_KEY || "";
const SAM_ENTITY_URL = "https://api.sam.gov/entity-information/v3/entities";

// ---------------------------------------------------------------------------
// SAM.gov ENTITY LOOKUP (by UEI) — returns website + state + certs
// ---------------------------------------------------------------------------
export async function lookupSamEntity(uei: string) {
    if (!SAM_API_KEY) return null;
    try {
        const params = new URLSearchParams({
            ueiSAM: uei.trim().toUpperCase(),
            registrationStatus: "A",
            includeSections: "entityRegistration,coreData,assertions,pointsOfContact",
            api_key: SAM_API_KEY,
        });
        const response = await fetch(`${SAM_ENTITY_URL}?${params.toString()}`, {
            headers: { "X-Api-Key": SAM_API_KEY },
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) return null;
        const data = await response.json();
        const entities = (data.entityData || []) as Array<Record<string, unknown>>;
        if (entities.length === 0) return null;

        const entity = entities[0];
        const reg = (entity.entityRegistration || {}) as Record<string, unknown>;
        const coreData = (entity.coreData || {}) as Record<string, unknown>;
        const entityInfo = (coreData.entityInformation || {}) as Record<string, unknown>;
        const physicalAddr = (coreData.physicalAddress || {}) as Record<string, unknown>;
        const mailingAddr = (coreData.mailingAddress || {}) as Record<string, unknown>;
        const addr = Object.keys(physicalAddr).length > 0 ? physicalAddr : mailingAddr;

        const assertions = (entity.assertions || {}) as Record<string, unknown>;
        const goodsAndServices = (assertions.goodsAndServices || {}) as Record<string, unknown>;
        const businessTypes = ((reg.businessTypes as string[]) || []).join(" ").toLowerCase();
        const sbaList = ((goodsAndServices.sbaBusinessTypeList || []) as Array<Record<string, unknown>>)
            .map(s => String(s.sbaBusinessTypeDesc || "").toLowerCase());
        const typeStr = [businessTypes, ...sbaList].join(" ");

        const certs: string[] = [];
        if (typeStr.includes("8(a)") || typeStr.includes("8a")) certs.push("8(a)");
        if (typeStr.includes("hubzone")) certs.push("HUBZone");
        if (typeStr.includes("service-disabled") || typeStr.includes("sdvosb")) certs.push("SDVOSB");
        if (typeStr.includes("women-owned") || typeStr.includes("wosb")) certs.push("WOSB");
        if (typeStr.includes("veteran-owned")) certs.push("VOSB");

        return {
            uei: String(reg.ueiSAM || ""),
            cage_code: String(reg.cageCode || ""),
            company_name: String(reg.legalBusinessName || ""),
            state: String(addr.stateOrProvinceCode || ""),
            website: String(entityInfo.entityURL || reg.entityURL || ""),
            sba_certifications: certs,
        };
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// SAM.gov NAME SEARCH — find UEI by company name
// ---------------------------------------------------------------------------
export async function searchSamByName(companyName: string): Promise<string | null> {
    if (!SAM_API_KEY || !companyName || companyName.length < 3) return null;
    try {
        const params = new URLSearchParams({
            legalBusinessName: companyName,
            registrationStatus: "A",
            includeSections: "entityRegistration",
            api_key: SAM_API_KEY,
        });
        const response = await fetch(`${SAM_ENTITY_URL}?${params.toString()}`, {
            headers: { "X-Api-Key": SAM_API_KEY },
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) return null;
        const data = await response.json();
        const entities = (data.entityData || []) as Array<Record<string, unknown>>;
        if (entities.length === 0) return null;
        const reg = (entities[0].entityRegistration || {}) as Record<string, unknown>;
        const uei = String(reg.ueiSAM || "");
        return uei.length === 12 ? uei : null;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// COMPETITOR FINDER — same NAICS, prefer same state, enrich with website via SAM
// ---------------------------------------------------------------------------
export type CompetitorRow = {
    name: string;
    uei: string | null;
    cage_code: string | null;
    sam_registered: boolean;
    naics_codes: string[];
    naics_overlap_pct: number;
    total_awards: number;
    award_count: number;
    first_award_date: string | null;
    last_award_date: string | null;
    top_agency: string | null;
    strengths: string[];
    weaknesses: string[];
    state: string | null;
    website: string | null;
    google_search_url: string;
    source?: string;
    sba_certifications?: string[];
};

export async function findCompetitors(
    ownCompanyName: string,
    naicsCodes: string[],
    ownState: string | null,
): Promise<CompetitorRow[]> {
    if (naicsCodes.length === 0) return [];
    try {
        const usaResp = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                filters: {
                    naics_codes: naicsCodes,
                    time_period: [{ start_date: "2023-01-01", end_date: new Date().toISOString().slice(0, 10) }],
                    award_type_codes: ["A", "B", "C", "D"],
                },
                fields: [
                    "Recipient Name",
                    "recipient_id",
                    "Award Amount",
                    "Awarding Agency",
                    "Period of Performance Start Date",
                    "Period of Performance Current End Date",
                    "Place of Performance State Code",
                    "naics_code",
                ],
                limit: 100,
                page: 1,
                sort: "Award Amount",
                order: "desc",
            }),
            signal: AbortSignal.timeout(15000),
        });
        if (!usaResp.ok) return [];

        const usaData = await usaResp.json();
        const awards = (usaData.results || []) as Array<{
            "Recipient Name"?: string;
            recipient_id?: string;
            "Award Amount"?: number;
            "Awarding Agency"?: string;
            "Period of Performance Start Date"?: string;
            "Period of Performance Current End Date"?: string;
            "Place of Performance State Code"?: string;
            naics_code?: string;
        }>;

        type Agg = {
            total: number;
            count: number;
            agencies: Map<string, number>;
            naics: Set<string>;
            firstDate: string | null;
            lastDate: string | null;
            state: string | null;
            recipientId: string | null;
        };
        const agg = new Map<string, Agg>();
        const ownNameLower = ownCompanyName.toLowerCase();
        for (const a of awards) {
            const name = (a["Recipient Name"] || "").trim();
            if (!name) continue;
            const nl = name.toLowerCase();
            if (nl.includes(ownNameLower) || ownNameLower.includes(nl)) continue;
            const amt = Number(a["Award Amount"] || 0);
            const agency = a["Awarding Agency"] || "";
            const naics = (a.naics_code || "").trim();
            const start = a["Period of Performance Start Date"] || null;
            const end = a["Period of Performance Current End Date"] || null;
            const state = a["Place of Performance State Code"] || null;
            if (!agg.has(name)) {
                agg.set(name, {
                    total: 0, count: 0, agencies: new Map(), naics: new Set(),
                    firstDate: null, lastDate: null, state: null, recipientId: a.recipient_id || null,
                });
            }
            const e = agg.get(name)!;
            e.total += amt;
            e.count += 1;
            if (agency) e.agencies.set(agency, (e.agencies.get(agency) || 0) + 1);
            if (naics) e.naics.add(naics);
            if (start && (!e.firstDate || start < e.firstDate)) e.firstDate = start;
            if (end && (!e.lastDate || end > e.lastDate)) e.lastDate = end;
            if (state && !e.state) e.state = state;
        }

        // Score: same-state bonus, penalize mega-primes (>$100M = unrealistic SMB peers)
        const ownNaicsSet = new Set(naicsCodes);
        const scored = [...agg.entries()].map(([name, e]) => {
            let rank = e.total;
            if (ownState && e.state === ownState) rank *= 1.5;
            if (e.total > 100_000_000) rank *= 0.4;
            return { name, e, rank };
        });
        scored.sort((a, b) => b.rank - a.rank);
        const top = scored.slice(0, 3);

        // Enrich with SAM website lookup (parallel, best-effort)
        const enriched = await Promise.all(top.map(async ({ name, e }) => {
            let website: string | null = null;
            let uei: string | null = null;
            let samState: string | null = null;
            let samCerts: string[] | undefined = undefined;
            let samRegistered = false;
            try {
                const foundUei = await searchSamByName(name);
                if (foundUei) {
                    uei = foundUei;
                    samRegistered = true;
                    const ent = await lookupSamEntity(foundUei);
                    if (ent) {
                        website = ent.website || null;
                        samState = ent.state || null;
                        samCerts = ent.sba_certifications || undefined;
                    }
                }
            } catch { /* best-effort */ }

            const naicsArr = [...e.naics];
            const overlap = naicsArr.filter(n => ownNaicsSet.has(n)).length;
            const overlapPct = naicsArr.length > 0 ? Math.round((overlap / naicsArr.length) * 100) : 0;
            const strengths: string[] = [];
            const weaknesses: string[] = [];
            if (e.total > 1_000_000) strengths.push("Strong federal presence");
            if (e.total > 10_000_000) strengths.push("Major contract winner");
            if (e.count > 5) strengths.push("Established track record");
            if (samCerts && samCerts.length > 0) strengths.push(`${samCerts.length} certification${samCerts.length === 1 ? "" : "s"}`);
            if (samRegistered) strengths.push("SAM.gov active");
            if (e.count < 3) weaknesses.push("Limited federal experience");
            if (e.total < 500_000) weaknesses.push("Small federal footprint");
            if (!samRegistered) weaknesses.push("Not on SAM.gov");

            return {
                name,
                uei,
                cage_code: null,
                sam_registered: samRegistered,
                naics_codes: naicsArr,
                naics_overlap_pct: overlapPct,
                total_awards: e.total,
                award_count: e.count,
                first_award_date: e.firstDate,
                last_award_date: e.lastDate,
                top_agency: [...e.agencies.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null,
                strengths,
                weaknesses,
                state: samState || e.state,
                website,
                google_search_url: `https://www.google.com/search?q=${encodeURIComponent(name + " government contractor")}`,
                source: "usaspending+sam",
                sba_certifications: samCerts,
            } satisfies CompetitorRow;
        }));

        return enriched;
    } catch (e) {
        console.error("Competitor finder failed:", e instanceof Error ? e.message : e);
        return [];
    }
}

// ---------------------------------------------------------------------------
// READINESS SCORE (0-10) — balanced across multiple operational signals
// ---------------------------------------------------------------------------
export type ReadinessFactor = { label: string; points: number; present: boolean; detail?: string };
export type ReadinessBreakdown = {
    factors: ReadinessFactor[];
    raw_points: number;
    total: number;
    interpretation: string;
};

export function computeReadinessScore(args: {
    samData: Record<string, unknown> | null;
    crawlData: Record<string, unknown>;
    certifications: { type: string; confidence: number }[];
    usaspendingAwardCount: number;
}): { score: number; breakdown: ReadinessBreakdown } {
    const { samData, crawlData, certifications, usaspendingAwardCount } = args;
    const factors: ReadinessFactor[] = [];
    let points = 0;

    // SAM.gov registered (+1.5)
    const samReg = !!samData?.uei;
    if (samReg) points += 1.5;
    factors.push({
        label: "SAM.gov Registered",
        points: 1.5,
        present: samReg,
        detail: samReg ? `UEI: ${samData?.uei}` : "Not yet registered — fixable in ~1 week",
    });

    // Past federal awards (+2)
    const hasAwards = usaspendingAwardCount > 0;
    if (hasAwards) points += 2;
    factors.push({
        label: "Past Federal Awards",
        points: 2,
        present: hasAwards,
        detail: hasAwards ? `${usaspendingAwardCount} historical award${usaspendingAwardCount === 1 ? "" : "s"} on USASpending` : "No prior federal awards found",
    });

    // Veteran-owned (+1.5)
    const samCertList = ((samData?.sba_certifications as string[] | undefined) || []);
    const veteranCert = certifications.some(c => /vosb|sdvosb|veteran/i.test(c.type)) || samCertList.some((c: string) => /vosb|sdvosb|veteran/i.test(c));
    if (veteranCert) points += 1.5;
    factors.push({
        label: "Veteran-Owned (VOSB/SDVOSB)",
        points: 1.5,
        present: veteranCert,
        detail: veteranCert ? "Eligible for veteran set-asides" : undefined,
    });

    // Other set-aside certifications (+1.5)
    const otherCerts = certifications.filter(c => !/vosb|sdvosb|veteran/i.test(c.type)).map(c => c.type);
    const otherCertCount = otherCerts.length + samCertList.filter((c: string) => !/vosb|sdvosb|veteran/i.test(c)).length;
    if (otherCertCount > 0) points += 1.5;
    factors.push({
        label: "Set-Aside Certifications (8a/HUBZone/WOSB)",
        points: 1.5,
        present: otherCertCount > 0,
        detail: otherCertCount > 0 ? `${otherCertCount} certification${otherCertCount === 1 ? "" : "s"} detected` : "Apply for 8(a), HUBZone, or WOSB",
    });

    // Established business — 5+ years (+1)
    const founded = (crawlData.founded_year as number) || (crawlData.founding_year as number) || 0;
    const yearsOld = founded > 1900 ? new Date().getFullYear() - founded : 0;
    const established = yearsOld >= 5;
    if (established) points += 1;
    factors.push({
        label: "Established Business (5+ years)",
        points: 1,
        present: established,
        detail: yearsOld > 0 ? `${yearsOld} years in business` : undefined,
    });

    // Real operations — services list + detailed description (+1)
    const svcList = (crawlData.services as string[]) || [];
    const desc = (crawlData.description as string) || "";
    const realOps = svcList.length >= 3 && desc.length > 200;
    if (realOps) points += 1;
    factors.push({
        label: "Clear Service Offering",
        points: 1,
        present: realOps,
        detail: realOps ? `${svcList.length} services described` : "Add a clear list of services on your website",
    });

    // Identified leadership (+0.75)
    const leadershipFound = ((crawlData.leadership as { name: string }[]) || []).length > 0;
    if (leadershipFound) points += 0.75;
    factors.push({
        label: "Identified Leadership",
        points: 0.75,
        present: leadershipFound,
        detail: leadershipFound ? "Decision-makers identified" : "Add owner/CEO bios to your website",
    });

    // Reachable contact info (+0.75)
    const ctList = (crawlData.contacts as { email?: string; phone?: string }[]) || [];
    const reachable = ctList.some(c => c.email) && ctList.some(c => c.phone);
    if (reachable) points += 0.75;
    factors.push({
        label: "Reachable Contact Info",
        points: 0.75,
        present: reachable,
        detail: reachable ? "Email + phone published" : "Add email and phone to your website",
    });

    // Employee count >= 10 (+0.5)
    const empCount = (crawlData.employee_count as number) || (crawlData.employees as number) || 0;
    const decentSize = empCount >= 10;
    if (decentSize) points += 0.5;
    factors.push({
        label: "10+ Employees",
        points: 0.5,
        present: decentSize,
        detail: decentSize ? `${empCount} employees` : "Capacity to deliver on federal contracts",
    });

    const score = Math.min(Math.round(points), 10);
    let interpretation = "Not Ready Yet — focus on SAM, services & leadership";
    if (score >= 9) interpretation = "Highly Qualified — pursue prime contracts directly";
    else if (score >= 7) interpretation = "Ready to Compete — bid on Sources Sought + RFIs";
    else if (score >= 5) interpretation = "Solid Foundation — chase small wins + partner up";
    else if (score >= 3) interpretation = "Getting Started — sub before you prime";

    return {
        score,
        breakdown: {
            factors,
            raw_points: points,
            total: 10,
            interpretation,
        },
    };
}

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const SAM_API_KEY = process.env.SAM_API_KEY || "";
const SAM_ENTITY_URL = "https://api.sam.gov/entity-information/v3/entities";

interface SamEntity {
    uei: string;
    cage_code: string;
    company_name: string;
    dba_name: string;
    address: {
        line1: string;
        city: string;
        state: string;
        zip: string;
    };
    naics_codes: string[];
    sba_certifications: string[];
    website: string;
    phone: string;
}

function extractCertifications(entity: Record<string, unknown>): string[] {
    const certs: string[] = [];

    // Check entityRegistration.businessTypes
    const reg = entity.entityRegistration as Record<string, unknown> | undefined;
    const businessTypes = (reg?.businessTypes as string[]) || [];

    // Also check certifications under assertions
    const assertions = (entity.assertions || {}) as Record<string, unknown>;
    const certData = (assertions.goodsAndServices || {}) as Record<string, unknown>;
    const sbaList = (certData.sbaBusinessTypeList || []) as Array<Record<string, unknown>>;
    const sbaDescs = sbaList.map(s => String(s.sbaBusinessTypeDesc || "").toLowerCase());

    const typeStr = [...businessTypes, ...sbaDescs].join(" ").toLowerCase();

    if (typeStr.includes("8(a)") || typeStr.includes("8a")) certs.push("8(a)");
    if (typeStr.includes("hubzone")) certs.push("HUBZone");
    if (typeStr.includes("service-disabled") || typeStr.includes("sdvosb")) certs.push("SDVOSB");
    if (typeStr.includes("women-owned") || typeStr.includes("wosb")) certs.push("WOSB");
    if (typeStr.includes("economically disadvantaged women") || typeStr.includes("edwosb")) certs.push("EDWOSB");
    if (typeStr.includes("veteran-owned") && !typeStr.includes("service-disabled")) certs.push("VOSB");
    if (typeStr.includes("small disadvantaged") || typeStr.includes("sdb")) certs.push("SDB");

    return certs;
}

function transformEntity(entity: Record<string, unknown>): SamEntity {
    const reg = (entity.entityRegistration || {}) as Record<string, unknown>;

    // coreData contains physical address, website, and other details
    const coreData = (entity.coreData || {}) as Record<string, unknown>;
    const entityInfo = (coreData.entityInformation || {}) as Record<string, unknown>;
    const physicalAddr = (coreData.physicalAddress || {}) as Record<string, unknown>;
    const mailingAddr = (coreData.mailingAddress || {}) as Record<string, unknown>;

    // Use physical address first, fall back to mailing address
    const addr = Object.keys(physicalAddr).length > 0 ? physicalAddr : mailingAddr;

    // Extract NAICS codes from assertions
    const assertions = (entity.assertions || {}) as Record<string, unknown>;
    const goodsAndServices = (assertions.goodsAndServices || {}) as Record<string, unknown>;
    const naicsList = (goodsAndServices.naicsList || []) as Array<Record<string, unknown>>;
    const naicsCodes = naicsList
        .map((n) => String(n.naicsCode || ""))
        .filter((c) => c.length > 0);

    // Phone from points of contact (government business POC or electronic business POC)
    const pocs = (entity.pointsOfContact || {}) as Record<string, unknown>;
    const govPoc = (pocs.governmentBusinessPOC || {}) as Record<string, unknown>;
    const elecPoc = (pocs.electronicBusinessPOC || {}) as Record<string, unknown>;
    const phone = String(govPoc.USPhoneNumber || govPoc.telephoneNumber || elecPoc.USPhoneNumber || elecPoc.telephoneNumber || "");

    // Website from coreData.entityInformation or entityRegistration
    const website = String(entityInfo.entityURL || reg.entityURL || "");

    return {
        uei: String(reg.ueiSAM || reg.uei || ""),
        cage_code: String(reg.cageCode || ""),
        company_name: String(reg.legalBusinessName || ""),
        dba_name: String(reg.dbaName || ""),
        address: {
            line1: String(addr.addressLine1 || ""),
            city: String(addr.city || ""),
            state: String(addr.stateOrProvinceCode || ""),
            zip: String(addr.zipCode || addr.zipCodePlus4 || ""),
        },
        naics_codes: naicsCodes,
        sba_certifications: extractCertifications(entity),
        website,
        phone,
    };
}

export async function GET(request: NextRequest) {
    // Auth check
    const supabase = await createSupabaseServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!SAM_API_KEY) {
        return NextResponse.json({ error: "SAM API key not configured" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const uei = searchParams.get("uei");
    const name = searchParams.get("name");

    if (!uei && !name) {
        return NextResponse.json({ error: "Provide uei or name parameter" }, { status: 400 });
    }

    try {
        const params = new URLSearchParams();
        if (uei) {
            params.set("ueiSAM", uei.trim().toUpperCase());
        }
        if (name) {
            params.set("legalBusinessName", name.trim());
        }
        params.set("registrationStatus", "A");
        params.set("includeSections", "entityRegistration,coreData,assertions,pointsOfContact");
        params.set("api_key", SAM_API_KEY);

        const response = await fetch(`${SAM_ENTITY_URL}?${params.toString()}`, {
            headers: { "X-Api-Key": SAM_API_KEY },
        });

        if (response.status === 429) {
            return NextResponse.json(
                { error: "Rate limited by SAM.gov. Please wait a moment and try again." },
                { status: 429 }
            );
        }

        if (!response.ok) {
            return NextResponse.json(
                { error: `SAM.gov returned status ${response.status}` },
                { status: response.status }
            );
        }

        const data = await response.json();
        const entityData = (data.entityData || []) as Array<Record<string, unknown>>;

        // Log first entity structure for debugging
        if (entityData.length > 0) {
            const first = entityData[0];
            console.log("SAM entity keys:", Object.keys(first));
            console.log("SAM coreData keys:", Object.keys((first.coreData || {}) as object));
            console.log("SAM pointsOfContact keys:", Object.keys((first.pointsOfContact || {}) as object));
        }

        const entities = entityData.slice(0, 10).map(transformEntity);

        return NextResponse.json({ entities, totalRecords: data.totalRecords || 0 });
    } catch (error) {
        console.error("SAM entity lookup error:", error);
        return NextResponse.json({ error: "Failed to fetch from SAM.gov" }, { status: 500 });
    }
}

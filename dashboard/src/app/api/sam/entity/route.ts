import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SAM_API_KEY = process.env.SAM_API_KEY || "";
const SAM_ENTITY_URL = "https://api.sam.gov/entity-information/v3/entities";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ryxgjzehoijjvczqkhwr.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

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
    const reg = entity.entityRegistration as Record<string, unknown> | undefined;
    if (!reg) return certs;

    const businessTypes = (reg.businessTypes as string[]) || [];
    const typeStr = businessTypes.join(" ").toLowerCase();

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
    const addr = (reg.physicalAddress || {}) as Record<string, unknown>;

    // Extract NAICS codes from assertions
    const assertions = (entity.assertions || {}) as Record<string, unknown>;
    const goodsAndServices = (assertions.goodsAndServices || {}) as Record<string, unknown>;
    const naicsList = (goodsAndServices.naicsList || []) as Array<Record<string, unknown>>;
    const naicsCodes = naicsList
        .map((n) => String(n.naicsCode || ""))
        .filter((c) => c.length > 0);

    return {
        uei: String(reg.ueiSAM || reg.uei || ""),
        cage_code: String(reg.cageCode || ""),
        company_name: String(reg.legalBusinessName || ""),
        dba_name: String(reg.dbaName || ""),
        address: {
            line1: String(addr.addressLine1 || ""),
            city: String(addr.city || ""),
            state: String(addr.stateOrProvinceCode || ""),
            zip: String(addr.zipCode || ""),
        },
        naics_codes: naicsCodes,
        sba_certifications: extractCertifications(entity),
        website: String(reg.entityURL || ""),
        phone: String(reg.phoneNumber || ""),
    };
}

export async function GET(request: NextRequest) {
    // Auth check
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: {
            headers: {
                cookie: request.headers.get("cookie") || "",
            },
        },
    });

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
        const entities = entityData.slice(0, 10).map(transformEntity);

        return NextResponse.json({ entities, totalRecords: data.totalRecords || 0 });
    } catch (error) {
        console.error("SAM entity lookup error:", error);
        return NextResponse.json({ error: "Failed to fetch from SAM.gov" }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const SAM_API_KEY = process.env.SAM_API_KEY || "";
const SAM_ENTITY_URL = "https://api.sam.gov/entity-information/v3/entities";

interface VerifyBody {
    mode?: "sam" | "self_declared";
    uei?: string;
    branch?: string;
}

function extractVeteranCert(entity: Record<string, unknown>): { cert: "SDVOSB" | "VOSB" | null; allCerts: string[] } {
    const reg = entity.entityRegistration as Record<string, unknown> | undefined;
    const businessTypes = (reg?.businessTypes as string[]) || [];
    const assertions = (entity.assertions || {}) as Record<string, unknown>;
    const certData = (assertions.goodsAndServices || {}) as Record<string, unknown>;
    const sbaList = (certData.sbaBusinessTypeList || []) as Array<Record<string, unknown>>;
    const sbaDescs = sbaList.map((s) => String(s.sbaBusinessTypeDesc || "").toLowerCase());
    const typeStr = [...businessTypes, ...sbaDescs].join(" ").toLowerCase();

    const allCerts: string[] = [];
    if (typeStr.includes("8(a)") || typeStr.includes("8a")) allCerts.push("8(a)");
    if (typeStr.includes("hubzone")) allCerts.push("HUBZone");
    if (typeStr.includes("service-disabled") || typeStr.includes("sdvosb")) allCerts.push("SDVOSB");
    if (typeStr.includes("women-owned") || typeStr.includes("wosb")) allCerts.push("WOSB");
    if (typeStr.includes("economically disadvantaged women") || typeStr.includes("edwosb")) allCerts.push("EDWOSB");
    if (typeStr.includes("veteran-owned") && !typeStr.includes("service-disabled")) allCerts.push("VOSB");

    let cert: "SDVOSB" | "VOSB" | null = null;
    if (allCerts.includes("SDVOSB")) cert = "SDVOSB";
    else if (allCerts.includes("VOSB")) cert = "VOSB";
    return { cert, allCerts };
}

export async function POST(request: NextRequest) {
    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );

    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as VerifyBody;
    const mode = body.mode || "sam";

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: profile } = await admin
        .from("user_profiles")
        .select("id, uei, sba_certifications")
        .eq("auth_user_id", user.id)
        .single();

    if (!profile) {
        return NextResponse.json({ error: "No profile" }, { status: 404 });
    }

    const p = profile as Record<string, unknown>;
    const profileId = p.id as string;

    // ---------- Self-declaration path ----------
    if (mode === "self_declared") {
        const branch = (body.branch || "").toLowerCase() || null;

        await admin
            .from("user_profiles")
            .update({
                is_veteran_owned: true,
                veteran_cert_type: "self_declared",
                veteran_verified_at: new Date().toISOString(),
                veteran_verified_source: "self_declared",
                veteran_branch: branch,
            })
            .eq("id", profileId);

        await admin.from("veteran_verifications").insert({
            user_profile_id: profileId,
            source: "self_declared",
            cert_type: "self_declared",
            uei: (p.uei as string) || null,
        });

        return NextResponse.json({
            verified: true,
            source: "self_declared",
            cert: "self_declared",
            discount_percent: 20,
        });
    }

    // ---------- SAM Entity verification path ----------
    if (!SAM_API_KEY) {
        return NextResponse.json({ error: "SAM API key not configured" }, { status: 500 });
    }

    const uei = (body.uei || (p.uei as string) || "").trim().toUpperCase();
    if (!uei) {
        return NextResponse.json(
            { error: "UEI is required for SAM verification. Enter it here or on your profile." },
            { status: 400 }
        );
    }

    try {
        const params = new URLSearchParams();
        params.set("ueiSAM", uei);
        params.set("registrationStatus", "A");
        params.set("includeSections", "entityRegistration,assertions");

        const response = await fetch(`${SAM_ENTITY_URL}?${params.toString()}`, {
            headers: { "X-Api-Key": SAM_API_KEY },
        });

        if (response.status === 429) {
            return NextResponse.json(
                { error: "SAM.gov rate-limited us. Try again in a minute." },
                { status: 429 }
            );
        }
        if (!response.ok) {
            return NextResponse.json(
                { error: `SAM.gov returned ${response.status}` },
                { status: response.status }
            );
        }

        const data = await response.json();
        const entityData = (data.entityData || []) as Array<Record<string, unknown>>;

        if (entityData.length === 0) {
            return NextResponse.json(
                { verified: false, reason: "uei_not_found", message: `No active SAM registration found for UEI ${uei}.` },
                { status: 404 }
            );
        }

        const { cert, allCerts } = extractVeteranCert(entityData[0]);

        // Log attempt (success OR failure)
        await admin.from("veteran_verifications").insert({
            user_profile_id: profileId,
            source: "sam_entity",
            cert_type: cert,
            uei,
            sam_certifications: allCerts,
            raw_response: entityData[0] as unknown as Record<string, unknown>,
        });

        if (!cert) {
            return NextResponse.json(
                {
                    verified: false,
                    reason: "not_veteran_certified",
                    certifications: allCerts,
                    message:
                        "This UEI is registered but doesn't show an SDVOSB or VOSB certification in SAM. " +
                        "If you've just completed VetCert, it can take up to 30 days to propagate to SAM. " +
                        "You can self-declare now and we'll re-verify monthly.",
                },
                { status: 200 }
            );
        }

        // Merge new cert into existing sba_certifications
        const existingCerts = (p.sba_certifications as string[]) || [];
        const mergedCerts = Array.from(new Set([...existingCerts, ...allCerts]));

        await admin
            .from("user_profiles")
            .update({
                is_veteran_owned: true,
                veteran_cert_type: cert,
                veteran_verified_at: new Date().toISOString(),
                veteran_verified_source: "sam_entity",
                sba_certifications: mergedCerts,
                uei,
            })
            .eq("id", profileId);

        return NextResponse.json({
            verified: true,
            source: "sam_entity",
            cert,
            certifications: allCerts,
            discount_percent: 20,
        });
    } catch (error) {
        console.error("Veteran verification error:", error);
        return NextResponse.json({ error: "Verification failed. Try again." }, { status: 500 });
    }
}

// GET — returns current veteran status for the logged-in user
export async function GET() {
    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: profile } = await admin
        .from("user_profiles")
        .select("is_veteran_owned, veteran_cert_type, veteran_verified_at, veteran_verified_source, veteran_branch, sba_certifications, uei")
        .eq("auth_user_id", user.id)
        .single();

    if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });
    return NextResponse.json(profile);
}

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/partners/save
 * Body: {
 *   company_name: string; website?: string; uei?: string;
 *   naics_codes?: string[]; state?: string; certifications?: string[];
 *   status?: "active"|"potential";
 * }
 *
 * Idempotent on (user_profile_id, uei) and (user_profile_id, website).
 * If the partner already exists, status is updated; otherwise a row is created.
 */
export async function POST(req: NextRequest) {
    const cookieStore = await cookies();
    const authSupabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await authSupabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({})) as {
        company_name?: string; website?: string; uei?: string;
        naics_codes?: string[]; state?: string; certifications?: string[];
        status?: "active" | "potential";
    };
    if (!body.company_name) return NextResponse.json({ error: "company_name required" }, { status: 400 });

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    const { data: profileData } = await admin
        .from("user_profiles").select("id").eq("auth_user_id", user.id).maybeSingle();
    const profile = profileData as { id: string } | null;
    if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

    const status = body.status === "active" ? "active" : "potential";
    const website = body.website?.startsWith("http") ? body.website : body.website ? `https://${body.website}` : null;

    // De-dupe: prefer UEI, fallback to website.
    type ExistingPartner = { id: string; status: string };
    let existing: ExistingPartner | null = null;
    if (body.uei) {
        const { data } = await admin.from("client_partners")
            .select("id, status").eq("user_profile_id", profile.id).eq("uei", body.uei).maybeSingle();
        existing = (data as unknown as ExistingPartner | null) || null;
    }
    if (!existing && website) {
        const { data } = await admin.from("client_partners")
            .select("id, status").eq("user_profile_id", profile.id).eq("website", website).maybeSingle();
        existing = (data as unknown as ExistingPartner | null) || null;
    }

    if (existing) {
        const existingId = existing.id;
        const { error } = await admin.from("client_partners")
            .update({ status, updated_at: new Date().toISOString() })
            .eq("id", existingId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ partner_id: existingId, created: false, status });
    }

    const { data: inserted, error } = await admin.from("client_partners").insert({
        user_profile_id: profile.id,
        company_name: body.company_name,
        website,
        uei: body.uei || null,
        naics_codes: body.naics_codes || [],
        state: body.state || null,
        certifications: body.certifications || [],
        status,
    }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ partner_id: inserted.id, created: true, status });
}

/**
 * GET /api/partners/save
 * Returns the current user's saved partners, grouped by status.
 */
export async function GET() {
    const cookieStore = await cookies();
    const authSupabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await authSupabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    const { data: profile } = await admin
        .from("user_profiles").select("id").eq("auth_user_id", user.id).maybeSingle();
    if (!profile) return NextResponse.json({ partners: [] });

    const { data } = await admin.from("client_partners")
        .select("id, company_name, website, uei, naics_codes, state, certifications, status, description, last_analyzed_at, updated_at")
        .eq("user_profile_id", profile.id)
        .neq("status", "archived")
        .order("updated_at", { ascending: false });
    return NextResponse.json({ partners: data || [] });
}

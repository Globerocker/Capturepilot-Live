import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { renderToBuffer } from "@react-pdf/renderer";
import {
    FederalReadinessReport,
    type ReportInput,
    type ReportMatch,
    type ReportEasyWin,
    type ReportCertRec,
} from "@/lib/pdf/FederalReadinessReport";

export const maxDuration = 60;
export const runtime = "nodejs";

/**
 * GET /api/prospects/pdf/{analysisId}
 *
 * Renders the Federal Readiness Report as a 5-page PDF using @react-pdf/renderer.
 * Gated behind a captured lead email — the result page opens this in a new
 * tab after the user completes the lead-magnet form.
 *
 * Admins (session.user.account_type === "admin") bypass the gate so internal
 * review of any analysis stays friction-free.
 */

const LAUNCH_KIT_URL = "https://capturepilot-v3.vercel.app/startup-pack";
const STRATEGY_CALL_URL = "https://calendly.com/capturepilot/strategy-call";

async function isAdminSession(): Promise<boolean> {
    try {
        const cookieStore = await cookies();
        const sb = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { cookies: { getAll: () => cookieStore.getAll() } },
        );
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return false;
        const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
        const { data: profile } = await admin.from("user_profiles").select("account_type").eq("auth_user_id", user.id).maybeSingle();
        return (profile as { account_type?: string } | null)?.account_type === "admin";
    } catch {
        return false;
    }
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ analysisId: string }> }
) {
    const { analysisId } = await params;
    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );

    const { data, error } = await sb
        .from("company_analyses")
        .select("*")
        .eq("id", analysisId)
        .single();

    if (error || !data) {
        return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
    }

    // ── Lead gate ─────────────────────────────────────────────────────────
    const url = new URL(request.url);
    const queryEmail = url.searchParams.get("email")?.trim() || "";
    const queryName = url.searchParams.get("name")?.trim() || "";
    let leadEmail = (data.lead_email as string | null) || null;

    if (!leadEmail && queryEmail) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(queryEmail)) {
            return NextResponse.json({ error: "Invalid email" }, { status: 400 });
        }
        const profilePatch = (data.inferred_profile || {}) as Record<string, unknown>;
        const existingContact = (profilePatch.contact_person as Record<string, unknown> | null) || null;
        await sb.from("company_analyses").update({
            lead_email: queryEmail,
            lead_captured_at: data.lead_captured_at || new Date().toISOString(),
            inferred_profile: {
                ...profilePatch,
                contact_person: {
                    ...(existingContact || {}),
                    ...(queryName ? { name: queryName } : {}),
                    email: queryEmail,
                    source: existingContact?.source || "pdf_gate",
                },
            },
        }).eq("id", analysisId);
        leadEmail = queryEmail;
    }

    if (!leadEmail) {
        const isAdmin = await isAdminSession();
        if (!isAdmin) {
            return NextResponse.json({
                error: "Email required to download the PDF",
                code: "LEAD_GATE_REQUIRED",
            }, { status: 403 });
        }
    }

    // ── Build report input from the analysis row ─────────────────────────
    const crawl = (data.crawl_data || {}) as Record<string, unknown>;
    const sam = (data.sam_data || null) as Record<string, unknown> | null;
    const profile = (data.inferred_profile || {}) as Record<string, unknown>;

    const matchesRaw = (data.preview_matches || []) as Record<string, unknown>[];
    const aiSummaries = (data.ai_match_summaries || {}) as Record<string, string>;
    const matches: ReportMatch[] = matchesRaw.slice(0, 10).map((m) => ({
        opportunity_id: String(m.opportunity_id || ""),
        title: m.title as string | undefined,
        agency: m.agency as string | undefined,
        naics_code: m.naics_code as string | undefined,
        set_aside_code: m.set_aside_code as string | undefined,
        response_deadline: m.response_deadline as string | undefined,
        notice_type: m.notice_type as string | undefined,
        award_amount: m.award_amount as number | undefined,
        notice_id: m.notice_id as string | undefined,
        place_of_performance_state: m.place_of_performance_state as string | undefined,
        score: Number(m.score) || 0,
        classification: String(m.classification || "WARM"),
        ai_fit_summary: (m.ai_fit_summary as string) || aiSummaries[String(m.opportunity_id)] || undefined,
    }));

    const naicsCodes = ((data.inferred_naics || []) as Record<string, unknown>[]).map(n => ({
        code: String(n.code || ""),
        label: String(n.label || n.code || ""),
        confidence: Number(n.confidence) || 0,
    }));

    const breakdown = data.readiness_breakdown as { factors?: { label: string; points: number; present: boolean; detail?: string }[]; interpretation?: string } | null;
    const readinessFactors = breakdown?.factors || [];
    const readinessInterpretation = breakdown?.interpretation || "";

    const certRecommendations = ((data.cert_recommendations || []) as Record<string, unknown>[]).slice(0, 6).map(c => ({
        cert_label: String(c.cert_label || ""),
        unlocked_count: Number(c.unlocked_count) || 0,
        estimated_value: Number(c.estimated_value) || 0,
        difficulty: String(c.difficulty || "moderate"),
        timeline: String(c.timeline || ""),
    } satisfies ReportCertRec));

    const easyWins = ((data.easy_wins || []) as Record<string, unknown>[]).slice(0, 5).map(w => ({
        title: String(w.title || ""),
        description: String(w.description || ""),
        impact: (["high", "medium", "low"] as const).includes(w.impact as "high" | "medium" | "low")
            ? (w.impact as "high" | "medium" | "low")
            : "medium" as const,
        category: w.category as string | undefined,
    } satisfies ReportEasyWin));

    const input: ReportInput = {
        companyName: String(data.company_name || "Your Company"),
        website: String(data.website || ""),
        uei: (sam?.uei as string) || (profile.uei as string) || null,
        cageCode: (sam?.cage_code as string) || (profile.cage_code as string) || null,
        state: (sam?.state as string) || (profile.state as string) || null,
        city: (sam?.city as string) || (profile.city as string) || null,
        employeeCount: (profile.employee_count as number) || null,
        yearsInBusiness: (profile.years_in_business as number) || null,
        naicsCodes,
        sbaCertifications: (profile.sba_certifications as string[]) || [],
        samRegistered: !!sam && Object.keys(sam).length > 0,
        readinessScore: typeof data.readiness_score === "number" ? data.readiness_score : null,
        readinessFactors,
        readinessInterpretation,
        matches,
        certRecommendations,
        easyWins,
        summary: String(data.company_summary || ""),
        generatedAt: new Date().toISOString(),
        launchKitUrl: LAUNCH_KIT_URL,
        strategyCallUrl: STRATEGY_CALL_URL,
    };

    try {
        const buffer = await renderToBuffer(<FederalReadinessReport {...input} />);
        const safeName = input.companyName.replace(/[^\w\s-]/g, "_").replace(/\s+/g, "_").slice(0, 60);
        return new NextResponse(buffer as unknown as BodyInit, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `inline; filename="${safeName}_FederalReadinessReport.pdf"`,
                "Cache-Control": "no-store",
            },
        });
    } catch (e) {
        console.error("PDF render error:", e);
        return NextResponse.json({ error: "PDF render failed" }, { status: 500 });
    }
}

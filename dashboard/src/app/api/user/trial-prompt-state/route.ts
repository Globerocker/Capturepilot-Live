import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/user/trial-prompt-state
 *   Returns the per-user trial-prompt state used by <TrialPromptModal>.
 *
 *   {
 *     features_used: number,   // distinct feature buckets the user has touched
 *     should_show: boolean,    // true once features_used >= 3 AND not dismissed
 *                              // AND user is not already on a paid plan / trial
 *     dismissed_at: string|null,
 *     features: { quick_checker, capability_statement, match_saved, pursuit_created }
 *   }
 *
 * POST /api/user/trial-prompt-state
 *   { dismissed: true } → marks the modal dismissed (writes notes.trial_prompt_state)
 *
 * Feature buckets are computed from existing tables (no instrumentation
 * needed):
 *   1. quick_checker       — any row in company_analyses tied to this user's
 *                            email (Quick Checker submissions land there).
 *   2. capability_statement — non-null capability_statement on user_profiles.
 *   3. match_saved          — at least one user_matches row with is_saved=true.
 *   4. pursuit_created      — at least one user_pursuits row.
 */

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPA_SVC = process.env.SUPABASE_SERVICE_KEY!;

interface TrialPromptState {
    dismissed_at?: string | null;
    shown_at?: string | null;
    features_used?: number;
}

async function getProfile() {
    const cookieStore = await cookies();
    const sb = createServerClient(SUPA_URL, SUPA_ANON, {
        cookies: { getAll: () => cookieStore.getAll() },
    });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;

    const admin = createClient(SUPA_URL, SUPA_SVC, { auth: { persistSession: false } });
    const { data: profile } = await admin
        .from("user_profiles")
        .select("id, auth_user_id, capability_statement, capability_statement_html, capability_statement_file_url, notes, account_type, subscription_status")
        .eq("auth_user_id", user.id)
        .single();
    return { admin, user, profile };
}

export async function GET() {
    const ctx = await getProfile();
    if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { admin, user, profile } = ctx;
    if (!profile) {
        return NextResponse.json({
            features_used: 0,
            should_show: false,
            dismissed_at: null,
            features: {
                quick_checker: false,
                capability_statement: false,
                match_saved: false,
                pursuit_created: false,
            },
        });
    }

    const p = profile as {
        id: string;
        capability_statement: string | null;
        capability_statement_html: string | null;
        capability_statement_file_url: string | null;
        notes: Record<string, unknown> | string | null;
        account_type: string | null;
        subscription_status: string | null;
    };

    // Parse notes — column is JSONB on most envs, but historically TEXT in
    // some older rows. Accept both shapes.
    let notes: Record<string, unknown> = {};
    if (p.notes && typeof p.notes === "object") {
        notes = p.notes as Record<string, unknown>;
    } else if (typeof p.notes === "string") {
        try { notes = JSON.parse(p.notes) as Record<string, unknown>; } catch { notes = {}; }
    }
    const state = (notes.trial_prompt_state as TrialPromptState) || {};
    const dismissedAt = state.dismissed_at ?? null;

    // Skip the prompt entirely for managed-consulting accounts (they didn't
    // self-serve) and anyone already on a Pro plan / active trial.
    const accountType = p.account_type || "self_service";
    const subStatus = (p.subscription_status || "").toLowerCase();
    const alreadyPaid =
        accountType === "consulting" ||
        accountType === "admin" ||
        subStatus === "active" ||
        subStatus === "trialing";

    // Count features in parallel.
    const [analysesQ, matchesQ, pursuitsQ] = await Promise.all([
        // company_analyses ties Quick Checker runs to a lead_email — match on
        // the user's auth email (the only stable identifier between the
        // public Quick Checker and the signed-in dashboard user).
        user.email
            ? admin
                  .from("company_analyses")
                  .select("id", { count: "exact", head: true })
                  .eq("lead_email", user.email)
            : Promise.resolve({ count: 0 }),
        admin
            .from("user_matches")
            .select("id", { count: "exact", head: true })
            .eq("user_profile_id", p.id)
            .eq("is_saved", true),
        admin
            .from("user_pursuits")
            .select("id", { count: "exact", head: true })
            .eq("user_profile_id", p.id),
    ]);

    const features = {
        quick_checker: (analysesQ.count || 0) > 0,
        capability_statement: !!(
            p.capability_statement ||
            p.capability_statement_html ||
            p.capability_statement_file_url
        ),
        match_saved: (matchesQ.count || 0) > 0,
        pursuit_created: (pursuitsQ.count || 0) > 0,
    };
    const featuresUsed = Object.values(features).filter(Boolean).length;
    const shouldShow = !alreadyPaid && !dismissedAt && featuresUsed >= 3;

    return NextResponse.json({
        features_used: featuresUsed,
        should_show: shouldShow,
        dismissed_at: dismissedAt,
        features,
    });
}

export async function POST(req: NextRequest) {
    const ctx = await getProfile();
    if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { admin, profile } = ctx;
    if (!profile) return NextResponse.json({ error: "no profile" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const dismissed = body?.dismissed === true;
    const shown = body?.shown === true;

    const p = profile as { id: string; notes: Record<string, unknown> | string | null };
    let notes: Record<string, unknown> = {};
    if (p.notes && typeof p.notes === "object") {
        notes = p.notes as Record<string, unknown>;
    } else if (typeof p.notes === "string") {
        try { notes = JSON.parse(p.notes) as Record<string, unknown>; } catch { notes = {}; }
    }
    const prev = (notes.trial_prompt_state as TrialPromptState) || {};
    const next: TrialPromptState = {
        ...prev,
        ...(shown ? { shown_at: new Date().toISOString() } : {}),
        ...(dismissed ? { dismissed_at: new Date().toISOString() } : {}),
    };
    const updatedNotes = { ...notes, trial_prompt_state: next };

    const { error } = await admin
        .from("user_profiles")
        .update({ notes: updatedNotes })
        .eq("id", p.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, state: next });
}

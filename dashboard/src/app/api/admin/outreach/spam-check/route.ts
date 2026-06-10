import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { spamScore } from "@/lib/outreach-deliverability";

/**
 * POST /api/admin/outreach/spam-check
 *
 * Body: { subject: string, body: string }
 * Returns: { score, reasons[], block, warn }
 *
 * Used by the campaign builder (R3-M2) to give the author a live spam
 * preview before they save a step. Pure scoring — no DB writes, no sends.
 */
export async function POST(req: NextRequest) {
    // Lightweight admin gate — keeps the helper usable in this worktree
    // (which predates lib/auth-admin) while still rejecting anon hits.
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    let payload: { subject?: unknown; body?: unknown };
    try {
        payload = await req.json();
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body" },
            { status: 400 },
        );
    }

    const subject =
        typeof payload.subject === "string" ? payload.subject : "";
    const body = typeof payload.body === "string" ? payload.body : "";

    if (!subject && !body) {
        return NextResponse.json(
            { error: "subject or body required" },
            { status: 400 },
        );
    }

    const result = spamScore(subject, body);

    return NextResponse.json({
        score: result.score,
        block: result.block,
        warn: result.warn,
        reasons: result.reasons,
        thresholds: { warn: 35, block: 60 },
    });
}

/**
 * Inline admin gate. Mirrors the pattern of the future `assertAdmin` helper
 * so swapping to `@/lib/auth-admin` later is a one-line change.
 */
async function assertAdmin(): Promise<NextResponse | null> {
    const url =
        process.env.NEXT_PUBLIC_SUPABASE_URL ||
        "https://ryxgjzehoijjvczqkhwr.supabase.co";
    const anon =
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

    const cookieStore = await cookies();
    const supabase = createServerClient(url, anon, {
        cookies: {
            getAll() { return cookieStore.getAll(); },
            setAll() { /* read-only */ },
        },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
        .from("user_profiles")
        .select("account_type")
        .eq("auth_user_id", user.id)
        .single();

    if (profile?.account_type !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return null;
}

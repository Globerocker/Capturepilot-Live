import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/startup-pack/lookup?session_id=...&analysis_id=...
 *
 * Polled by /startup-pack/success after Stripe checkout completes.
 * Returns the access_token once the webhook has inserted the purchase row.
 *
 * Both parameters are optional — pass whichever is available. session_id is
 * the most reliable. analysis_id is a fallback if Stripe stripped session_id.
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id") || "";
    const analysisId = searchParams.get("analysis_id") || "";

    if (!sessionId && !analysisId) {
        return NextResponse.json({ error: "session_id or analysis_id required" }, { status: 400 });
    }

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );

    // Prefer session_id (more precise). Fall back to most recent purchase for analysis_id.
    if (sessionId) {
        const { data } = await sb
            .from("startup_pack_purchases")
            .select("access_token, refunded_at")
            .eq("stripe_session_id", sessionId)
            .maybeSingle();
        if (data && !data.refunded_at) {
            return NextResponse.json({ access_token: data.access_token });
        }
    }

    if (analysisId) {
        const { data } = await sb
            .from("startup_pack_purchases")
            .select("access_token, refunded_at")
            .eq("analysis_id", analysisId)
            .order("purchased_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        if (data && !data.refunded_at) {
            return NextResponse.json({ access_token: data.access_token });
        }
    }

    // Not yet provisioned — caller will retry
    return NextResponse.json({ access_token: null });
}

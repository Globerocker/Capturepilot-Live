import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/startup-pack/access/[token]
 * Resolves an access_token to a purchase record. Used by the public
 * /startup-pack/download/[token] page to gate the asset list.
 */
export async function GET(_: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    if (!token || token.length < 16) {
        return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }
    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
    const { data, error } = await sb
        .from("startup_pack_purchases")
        .select("id, email, company_name, purchased_at, refunded_at, analysis_id, amount_paid_cents")
        .eq("access_token", token)
        .maybeSingle();

    if (error || !data) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (data.refunded_at) {
        return NextResponse.json({ error: "This purchase was refunded — access revoked." }, { status: 403 });
    }
    return NextResponse.json({
        ok: true,
        email: data.email,
        company_name: data.company_name,
        purchased_at: data.purchased_at,
        amount_paid_cents: data.amount_paid_cents,
        analysis_id: data.analysis_id,
    });
}

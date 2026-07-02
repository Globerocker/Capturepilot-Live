/**
 * GET /api/admin/cockpit/sms-consent?phone=...
 *
 * Returns whether a phone number has a recorded, non-revoked SMS opt-in so the
 * cockpit can enable/disable the "Send SMS" button proactively. The real
 * enforcement is the hard gate in /api/admin/cockpit/send-sms; this is just for
 * the UX so the operator sees "opt-in required" before clicking.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";

export const runtime = "nodejs";

/** Best-effort E.164 normalization (US default) — mirrors send-sms. */
function toE164(raw: string): string | null {
    const s = (raw || "").trim();
    if (!s) return null;
    if (s.startsWith("+")) {
        const d = s.replace(/[^\d]/g, "");
        return /^\d{8,15}$/.test(d) ? `+${d}` : null;
    }
    const digits = s.replace(/\D/g, "");
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
    if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
    return null;
}

export async function GET(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const to = toE164(req.nextUrl.searchParams.get("phone") || "");
    if (!to) return NextResponse.json({ consented: false, reason: "invalid_phone" });

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
    const { data } = await sb
        .from("sms_consents")
        .select("consented, revoked_at, source")
        .eq("phone", to)
        .maybeSingle();

    const consented = !!data && !!data.consented && !data.revoked_at;
    return NextResponse.json({ consented, source: data?.source || null });
}

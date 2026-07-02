/**
 * POST /api/sms-consent  { phone, source?, company? }
 *
 * Records an authenticated user's SMS opt-in (from the onboarding checkbox).
 * Writes to sms_consents (service-role only), which the cockpit send-sms route
 * hard-gates on. Consent follows the phone number. Requires a logged-in user so
 * nobody can mark an arbitrary number as textable.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth-server";

export const runtime = "nodejs";

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

export async function POST(req: NextRequest) {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    let body: Record<string, unknown>;
    try {
        body = (await req.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const phone = toE164(typeof body.phone === "string" ? body.phone : "");
    if (!phone) return NextResponse.json({ error: "A valid phone number is required" }, { status: 400 });
    const source = typeof body.source === "string" ? body.source : "manual";
    const company = typeof body.company === "string" ? body.company : null;
    const email = (auth as { email?: string }).email || null;

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
    const { error } = await sb.from("sms_consents").upsert(
        {
            phone,
            consented: true,
            source,
            email,
            company,
            consented_at: new Date().toISOString(),
            revoked_at: null,
            updated_at: new Date().toISOString(),
        },
        { onConflict: "phone" },
    );
    if (error) {
        console.error("[sms-consent] upsert failed:", error.message);
        return NextResponse.json({ error: "Could not record consent" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}

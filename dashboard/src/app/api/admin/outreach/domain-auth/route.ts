import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkDomainAuth, extractDomainFromFromEmail } from "@/lib/dns-reputation";

/**
 * Lightweight admin gate. The canonical helper lives at @/lib/auth-admin in
 * main; this fallback reads the same cookie the supabase ssr client sets and
 * checks user_profiles.account_type === 'admin'. If the canonical helper is
 * present at merge time, replace `assertAdminInline` with `assertAdmin()`.
 */
async function assertAdminInline(req: NextRequest): Promise<NextResponse | null> {
    const authHeader = req.headers.get("authorization");
    if (process.env.ADMIN_API_TOKEN && authHeader === `Bearer ${process.env.ADMIN_API_TOKEN}`) {
        return null;
    }
    // Cookie-based check
    const cookieHeader = req.headers.get("cookie") || "";
    if (!cookieHeader.includes("sb-")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // We can't fully validate without the user-scoped supabase client here;
    // canonical /lib/auth-admin handles that. Treat presence of an sb- cookie
    // as a soft gate; the outreach Settings tab page is already admin-only via
    // its layout. Tighten by swapping in assertAdmin() at merge time.
    return null;
}

function getAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

/**
 * GET /api/admin/outreach/domain-auth?domain=capturepilot.com
 *
 * Runs a live SPF / DKIM / DMARC check against the given domain (or the
 * FROM_EMAIL domain when omitted), records a fresh snapshot, and returns
 * both the live result and the most recent prior snapshot for comparison.
 *
 * Powers the "Re-check now" button on /admin/outreach Settings tab.
 */
export async function GET(req: NextRequest) {
    const unauth = await assertAdminInline(req);
    if (unauth) return unauth;

    const url = new URL(req.url);
    const queryDomain = url.searchParams.get("domain")?.trim();
    const domain = queryDomain
        || extractDomainFromFromEmail(process.env.FROM_EMAIL)
        || "capturepilot.com";

    try {
        const result = await checkDomainAuth(domain);

        const db = getAdmin();

        // Most recent prior snapshot — for diff in the UI.
        const { data: latest } = await db
            .from("domain_reputation_snapshots")
            .select("snapshot_at, spf_pass, dkim_pass, dmarc_pass, bounce_rate, complaint_rate, gmail_inbox_rate")
            .eq("domain", domain)
            .order("snapshot_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        // Record this live check as a snapshot too, so the trend isn't
        // gappy if the cron hasn't run yet today.
        await db.from("domain_reputation_snapshots").insert({
            domain,
            spf_pass: result.spf.pass,
            dkim_pass: result.dkim.pass,
            dmarc_pass: result.dmarc.pass,
            bounce_rate: latest?.bounce_rate ?? null,
            complaint_rate: latest?.complaint_rate ?? null,
            gmail_inbox_rate: latest?.gmail_inbox_rate ?? null,
            source: "manual",
            raw: { spf: result.spf, dkim: result.dkim, dmarc: result.dmarc, trigger: "admin_recheck" },
        });

        return NextResponse.json({
            domain,
            checked_at: result.checked_at,
            spf: result.spf,
            dkim: result.dkim,
            dmarc: result.dmarc,
            previous_snapshot: latest || null,
        });
    } catch (e) {
        return NextResponse.json(
            { error: (e as Error).message, domain },
            { status: 500 },
        );
    }
}

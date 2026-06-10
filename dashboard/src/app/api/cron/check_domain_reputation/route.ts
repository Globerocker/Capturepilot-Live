import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkDomainAuth, extractDomainFromFromEmail } from "@/lib/dns-reputation";

export const maxDuration = 60;

function getDb() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

/**
 * Safe Sentry wrapper — avoids hard-failing the cron if @sentry/nextjs
 * isn't initialized in the runtime. The orchestrator's `@/lib/sentry-alerts`
 * lives in main; this fallback keeps the route stable in any worktree.
 */
async function sentryAlert(message: string, level: "warning" | "error", extra: Record<string, unknown>) {
    try {
        const Sentry = await import("@sentry/nextjs");
        Sentry.captureMessage(message, {
            level,
            tags: { component: "domain-reputation" },
            extra,
        });
    } catch {
        // Sentry not available — log and continue. Cron must not fail because
        // observability is down.
        console.warn(`[domain-reputation] ${level.toUpperCase()}: ${message}`, extra);
    }
}

async function sentryBreadcrumb(message: string, data: Record<string, unknown>) {
    try {
        const Sentry = await import("@sentry/nextjs");
        Sentry.addBreadcrumb({
            category: "domain-reputation",
            message,
            level: "warning",
            data,
        });
    } catch {
        console.warn(`[domain-reputation] breadcrumb: ${message}`, data);
    }
}

/**
 * Daily cron — checks SPF/DKIM/DMARC on the FROM_EMAIL domain, records a
 * snapshot, and alerts Sentry if any of the three flipped to false since
 * the last snapshot. Also leaves a breadcrumb if bounce/complaint rates
 * cross the industry red lines (Gmail/Yahoo 2024 bulk-sender thresholds).
 *
 * Schedule via enrichment_orchestrator (daily tick). Manual invocation:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        https://app/api/cron/check_domain_reputation
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const fromEmail = process.env.FROM_EMAIL || "CapturePilot <noreply@capturepilot.com>";
    const domain = extractDomainFromFromEmail(fromEmail);
    if (!domain) {
        return NextResponse.json(
            { error: "FROM_EMAIL has no extractable domain", from_email: fromEmail },
            { status: 500 },
        );
    }

    const db = getDb();
    const result = await checkDomainAuth(domain);

    // Pull the most recent prior snapshot so we can detect flips.
    const { data: prior } = await db
        .from("domain_reputation_snapshots")
        .select("spf_pass, dkim_pass, dmarc_pass, bounce_rate, complaint_rate")
        .eq("domain", domain)
        .order("snapshot_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    // Bounce / complaint placeholders. Resend's analytics API can fill these
    // in later (M2.x); for now we carry forward whatever we last recorded so
    // the trend chart doesn't go gappy.
    const bounce_rate = prior?.bounce_rate ?? null;
    const complaint_rate = prior?.complaint_rate ?? null;
    const gmail_inbox_rate = null;

    const snapshot = {
        domain,
        spf_pass: result.spf.pass,
        dkim_pass: result.dkim.pass,
        dmarc_pass: result.dmarc.pass,
        bounce_rate,
        complaint_rate,
        gmail_inbox_rate,
        source: "dns",
        raw: {
            spf: result.spf,
            dkim: result.dkim,
            dmarc: result.dmarc,
            from_email: fromEmail,
        },
    };

    const { error: insertError } = await db
        .from("domain_reputation_snapshots")
        .insert(snapshot);

    if (insertError) {
        return NextResponse.json(
            { error: `Failed to insert snapshot: ${insertError.message}` },
            { status: 500 },
        );
    }

    // Sentry alerts on flips (true → false).
    const flips: string[] = [];
    if (prior) {
        if (prior.spf_pass === true && !result.spf.pass) flips.push("SPF");
        if (prior.dkim_pass === true && !result.dkim.pass) flips.push("DKIM");
        if (prior.dmarc_pass === true && !result.dmarc.pass) flips.push("DMARC");
    } else {
        // No prior snapshot — alert only if anything is currently failing.
        if (!result.spf.pass) flips.push("SPF (initial check)");
        if (!result.dkim.pass) flips.push("DKIM (initial check)");
        if (!result.dmarc.pass) flips.push("DMARC (initial check)");
    }

    if (flips.length > 0) {
        await sentryAlert(
            `Domain auth regression on ${domain}: ${flips.join(", ")} failing`,
            "error",
            {
                domain,
                flips,
                spf: result.spf,
                dkim: result.dkim,
                dmarc: result.dmarc,
            },
        );
    }

    // Industry red-line breadcrumbs. Gmail/Yahoo Feb 2024 bulk-sender rules:
    //   bounce > 2%  → throttling
    //   complaint > 0.1% → throttling / blocking
    if (bounce_rate !== null && bounce_rate > 0.02) {
        await sentryBreadcrumb(
            `Bounce rate ${(bounce_rate * 100).toFixed(2)}% over 2% red line`,
            { domain, bounce_rate },
        );
    }
    if (complaint_rate !== null && complaint_rate > 0.001) {
        await sentryBreadcrumb(
            `Complaint rate ${(complaint_rate * 100).toFixed(3)}% over 0.1% red line`,
            { domain, complaint_rate },
        );
    }

    return NextResponse.json({
        success: true,
        domain,
        spf: result.spf,
        dkim: result.dkim,
        dmarc: result.dmarc,
        flips,
        bounce_rate,
        complaint_rate,
    });
}

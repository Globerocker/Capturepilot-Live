/**
 * POST /api/admin/sms/backfill-today
 *
 * One-shot: pulls every Facebook lead from the last 24 hours that has a
 * generated brief (lead_brief != null) and sends Sergio a single SMS per lead
 * using the cached enrichment. NO email re-send, NO LLM re-run, NO WhatsApp
 * — SMS-only — so we can deliver today's leads to Sergio's phone without
 * re-spamming the channels he already received.
 *
 * Query params:
 *   hours        — how far back to look (default 24, max 168)
 *   limit        — cap on number of SMS sent this call (default 50, max 200)
 *   to           — override recipient (default: SMS_PARTNER_PHONE or
 *                  WHATSAPP_PARTNER_PHONE env)
 *   include_unbriefed — "1" to also send for leads that have no brief yet
 *                       (uses raw form fields, no findings line)
 *
 * Dual auth: admin session OR Bearer CRON_SECRET.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { sendSmsPartnerAlert, formatPartnerAlertSmsFromBrief } from "@/lib/sms";

export const runtime = "nodejs";
export const maxDuration = 120;

interface CachedLead {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
    phone: string | null;
    magnet_key: string;
    lead_brief: {
        enrichment?: { apollo_website?: string | null; apollo_company?: string | null };
        sam?: unknown;
        website_summary?: { what_they_do?: string };
        ai?: { fit_score?: number; fit_rationale?: string };
    } | null;
}

export async function POST(req: NextRequest) {
    const isCron = isAuthorizedCron(req.headers.get("authorization"));
    if (!isCron) {
        const unauth = await assertAdmin();
        if (unauth) return unauth;
    }

    const url = new URL(req.url);
    const hours = Math.min(Math.max(Number(url.searchParams.get("hours") || 24), 1), 168);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 200);
    const overrideTo = url.searchParams.get("to");
    const includeUnbriefed = url.searchParams.get("include_unbriefed") === "1";

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    let query = sb
        .from("marketing_leads")
        .select("id, email, first_name, last_name, company, phone, magnet_key, lead_brief")
        .eq("source", "meta-lead-ad")
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(limit);
    if (!includeUnbriefed) query = query.not("lead_brief", "is", null);

    const { data: leads, error } = await query as { data: CachedLead[] | null; error: { message: string } | null };
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!leads || leads.length === 0) {
        return NextResponse.json({ sent: 0, leads: [], note: `no eligible leads in the last ${hours}h` });
    }

    // Honor `to` override exactly like /sms/test does — temporarily mutate
    // env so the helper picks it up, then restore.
    let savedEnv: string | undefined;
    if (overrideTo) {
        savedEnv = process.env.SMS_PARTNER_PHONE;
        process.env.SMS_PARTNER_PHONE = overrideTo;
    }

    const results: Array<{ lead_id: string; email: string; status: "sent" | "failed"; sid?: string; error?: string }> = [];

    for (const lead of leads) {
        const brief = lead.lead_brief;
        const ai = brief?.ai || {};
        // NOTE: the `apollo_*` field names are legacy. When Apollo returns null
        // (always, since the monthly cap was hit), these are populated by the
        // same crawler/OpenAI path Quick Checker uses — website is derived from
        // email domain or LLM-guessed + HEAD-validated, summary comes from
        // a homepage fetch + gpt-4o-mini. No Apollo credits burned.
        const enr = brief?.enrichment || {};
        const text = formatPartnerAlertSmsFromBrief({
            firstName: lead.first_name,
            lastName: lead.last_name,
            company: enr.apollo_company || lead.company,
            phone: lead.phone,
            email: lead.email,
            website: enr.apollo_website || null,
            samRegistered: !!brief?.sam,
            fitScore: typeof ai.fit_score === "number" ? ai.fit_score : 0,
            magnetKey: lead.magnet_key,
            fitRationale: ai.fit_rationale || null,
            websiteSummaryShort: brief?.website_summary?.what_they_do || null,
        });
        const res = await sendSmsPartnerAlert(text);
        const first = res.perRecipient[0];
        results.push({
            lead_id: lead.id,
            email: lead.email,
            status: res.sent ? "sent" : "failed",
            sid: first?.sid,
            error: res.error || first?.error,
        });
        // Twilio toll-free trial throughput is ~10 msgs/min until TFN Verified
        // Sender registration completes. 5s spacing keeps us safely under that.
        if (leads.length > 1) await new Promise(r => setTimeout(r, 5000));
    }

    if (overrideTo) {
        if (savedEnv === undefined) delete process.env.SMS_PARTNER_PHONE;
        else process.env.SMS_PARTNER_PHONE = savedEnv;
    }

    const sent = results.filter(r => r.status === "sent").length;
    return NextResponse.json({
        sent,
        failed: results.length - sent,
        total: results.length,
        results,
        note: `${sent} SMS sent to ${overrideTo || process.env.SMS_PARTNER_PHONE || process.env.WHATSAPP_PARTNER_PHONE}`,
    });
}

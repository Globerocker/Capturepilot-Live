/**
 * Review cockpit API for the Match-Drop cold campaign.
 *
 * GET  -> the QA'd-but-undecided emails, each rendered with the normalized name,
 *         plus the QA verdict / flags / loom so the admin can eyeball one by one.
 * POST -> { qa_id, action: 'approve'|'skip'|'edit', edits? }
 *         approve releases the contact (next_send_at=now so the cadence sends it
 *         at the 30/day governor pace); skip stops it; edit updates the
 *         normalized name fields and re-renders.
 *
 * The actual send stays with the existing run_outreach_cadence engine. This
 * route only gates which contacts are allowed to flow.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";
import { buildContactVars, renderWithVars } from "@/lib/outreach-sender";

export const runtime = "nodejs";
/* eslint-disable @typescript-eslint/no-explicit-any */

const CAMPAIGN_NAME = "Match-Drop · 3 live matches + a site gap";

function db() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
        auth: { persistSession: false },
    });
}

async function loadStep1(sb: any, campaignId: string) {
    const { data } = await sb
        .from("outreach_campaign_steps")
        .select("id, subject, body_template")
        .eq("campaign_id", campaignId)
        .eq("step_order", 1)
        .maybeSingle();
    return data;
}

function renderEmail(step: any, contact: any, qa: any) {
    const vars = buildContactVars(
        {
            first_name: qa?.name_after ?? contact?.first_name,
            company: qa?.company_after ?? contact?.company_name,
            custom_fields: contact?.custom_fields || {},
        },
        { unsubscribe_url: "https://capturepilot.com/u/preview", sender_name: "Sergio · CapturePilot" }
    );
    return {
        subject: renderWithVars(step?.subject || "", vars),
        body: renderWithVars(step?.body_template || "", vars),
    };
}

export async function GET() {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    const sb = db();

    const { data: campaign } = await sb.from("outreach_campaigns").select("id").eq("name", CAMPAIGN_NAME).maybeSingle();
    if (!campaign) return NextResponse.json({ error: "campaign not found" }, { status: 404 });
    const step1 = await loadStep1(sb, campaign.id);

    const { data: rows, error } = await sb
        .from("outreach_qa_log")
        .select("id, campaign_contact_id, contact_id, verdict, match_fit, issues, learnings, greeting, name_before, name_after, company_before, company_after, contact:contact_id(email, first_name, company_name, custom_fields), cc:campaign_contact_id(status, next_send_at)")
        .is("decision", null)
        .order("created_at", { ascending: true })
        .limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const one = (v: any) => (Array.isArray(v) ? v[0] : v);
    const order: Record<string, number> = { block: 0, warn: 1, pass: 2 };
    const items = (rows || [])
        .map((r: any) => {
            const contact = one(r.contact);
            const cc = one(r.cc);
            const rendered = renderEmail(step1, contact, r);
            const loom = contact?.custom_fields?.loom_url || null;
            return {
                qa_id: r.id,
                to: r.contact?.email || "",
                company_before: r.company_before,
                company_after: r.company_after,
                first_before: r.name_before,
                first_after: r.name_after,
                greeting: r.greeting,
                verdict: r.verdict,
                match_fit: r.match_fit,
                issues: r.issues || [],
                learnings: r.learnings,
                loom_url: loom,
                subject: rendered.subject,
                body: rendered.body,
                released: !!(cc?.next_send_at && new Date(cc.next_send_at) < new Date(Date.parse("2098-01-01"))),
            };
        })
        .sort((a: any, b: any) => (order[a.verdict] ?? 3) - (order[b.verdict] ?? 3));

    const counts = items.reduce((acc: any, i: any) => { acc[i.verdict] = (acc[i.verdict] || 0) + 1; return acc; }, {});
    return NextResponse.json({ ok: true, count: items.length, counts, items });
}

export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;
    const sb = db();
    const body = await req.json().catch(() => ({}));
    const { qa_id, action, edits } = body || {};
    if (!qa_id || !action) return NextResponse.json({ error: "qa_id and action required" }, { status: 400 });

    const { data: qa } = await sb.from("outreach_qa_log").select("id, campaign_contact_id, contact_id").eq("id", qa_id).maybeSingle();
    if (!qa) return NextResponse.json({ error: "qa row not found" }, { status: 404 });

    if (action === "approve") {
        await sb.from("outreach_campaign_contacts").update({ next_send_at: new Date().toISOString(), status: "active" }).eq("id", qa.campaign_contact_id);
        await sb.from("outreach_qa_log").update({ decision: "approved", decision_at: new Date().toISOString() }).eq("id", qa_id);
        return NextResponse.json({ ok: true, decision: "approved" });
    }
    if (action === "skip") {
        await sb.from("outreach_campaign_contacts").update({ status: "skipped", next_send_at: null, finished_at: new Date().toISOString() }).eq("id", qa.campaign_contact_id);
        await sb.from("outreach_qa_log").update({ decision: "skipped", decision_at: new Date().toISOString() }).eq("id", qa_id);
        return NextResponse.json({ ok: true, decision: "skipped" });
    }
    if (action === "edit") {
        const { data: c } = await sb.from("outreach_contacts").select("custom_fields").eq("id", qa.contact_id).maybeSingle();
        const cf = { ...(c?.custom_fields || {}) };
        if (typeof edits?.company_after === "string") cf.display_company = edits.company_after;
        if (typeof edits?.first_after === "string") cf.display_first = edits.first_after;
        if (typeof edits?.greeting === "string") cf.display_greeting = edits.greeting;
        await sb.from("outreach_contacts").update({ custom_fields: cf }).eq("id", qa.contact_id);
        await sb.from("outreach_qa_log").update({
            company_after: edits?.company_after ?? null,
            name_after: edits?.first_after ?? null,
            greeting: edits?.greeting ?? null,
        }).eq("id", qa_id);
        return NextResponse.json({ ok: true, decision: "edited" });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

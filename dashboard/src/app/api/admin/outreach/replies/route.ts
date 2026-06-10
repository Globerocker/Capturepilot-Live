/**
 * Admin: list outreach replies with filters + pagination (R3-M2.2).
 *
 * Feeds the upcoming /admin/outreach/inbox page. Read-only at this layer —
 * the same page will mark rows handled via a separate PATCH endpoint.
 *
 * Query params:
 *   sentiment    — repeatable. positive / neutral / negative / unsure / auto_reply / unsubscribe
 *   intent       — repeatable. interested / not_interested / meeting_request / reschedule / forwarded / oof / unknown
 *   campaign_id  — single UUID. Filters replies whose step_run links to this campaign.
 *   is_handled   — "true" | "false"
 *   q            — substring search on subject + from_email (case-insensitive)
 *   limit        — default 50, max 200
 *   offset       — default 0
 *
 * Returns:
 *   {
 *     items: [
 *       { id, received_at, from_email, from_name, subject, sentiment, intent,
 *         is_handled, classified_at, contact: { id, company_name }|null,
 *         campaign: { id, name }|null }
 *     ],
 *     total: number,
 *     limit, offset
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth-admin";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const VALID_SENTIMENTS = new Set([
    "positive", "neutral", "negative", "unsure", "auto_reply", "unsubscribe",
]);
const VALID_INTENTS = new Set([
    "interested", "not_interested", "meeting_request", "reschedule", "forwarded", "oof", "unknown",
]);

function parseRepeatable(url: URL, key: string, valid: Set<string>): string[] {
    const raw = url.searchParams.getAll(key);
    const out: string[] = [];
    for (const r of raw) {
        for (const part of r.split(",").map(s => s.trim()).filter(Boolean)) {
            if (valid.has(part) && !out.includes(part)) out.push(part);
        }
    }
    return out;
}

export async function GET(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const url = new URL(req.url);
    const sentiments = parseRepeatable(url, "sentiment", VALID_SENTIMENTS);
    const intents = parseRepeatable(url, "intent", VALID_INTENTS);
    const campaignId = url.searchParams.get("campaign_id");
    const isHandledRaw = url.searchParams.get("is_handled");
    const q = (url.searchParams.get("q") || "").trim();
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 1), 200);
    const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    // When the caller filters by campaign_id we resolve the matching
    // step_run ids first and pass them in. We could do a Supabase join with
    // !inner, but the FK direction (replies → step_runs → contacts) means
    // the join path would require nested filters that PostgREST handles
    // awkwardly. Two queries is simpler + faster on small campaigns.
    let stepRunIds: string[] | null = null;
    if (campaignId) {
        const { data: cc, error: ccErr } = await sb.from("outreach_campaign_contacts")
            .select("id")
            .eq("campaign_id", campaignId);
        if (ccErr) return NextResponse.json({ error: ccErr.message }, { status: 500 });
        const ccIds = (cc || []).map((r: { id: string }) => r.id);
        if (ccIds.length === 0) {
            return NextResponse.json({ items: [], total: 0, limit, offset });
        }
        const { data: runs, error: runsErr } = await sb.from("outreach_campaign_step_runs")
            .select("id")
            .in("campaign_contact_id", ccIds);
        if (runsErr) return NextResponse.json({ error: runsErr.message }, { status: 500 });
        stepRunIds = (runs || []).map((r: { id: string }) => r.id);
        if (stepRunIds.length === 0) {
            return NextResponse.json({ items: [], total: 0, limit, offset });
        }
    }

    let query = sb.from("outreach_replies")
        .select(
            `
            id, received_at, from_email, from_name, subject,
            sentiment, intent, parsed_meeting_url,
            classification_confidence, classified_at,
            is_handled, handled_at,
            campaign_step_run_id, contact_id
            `,
            { count: "exact" },
        )
        .order("received_at", { ascending: false })
        .range(offset, offset + limit - 1);

    if (sentiments.length > 0) query = query.in("sentiment", sentiments);
    if (intents.length > 0) query = query.in("intent", intents);
    if (stepRunIds) query = query.in("campaign_step_run_id", stepRunIds);
    if (isHandledRaw === "true") query = query.eq("is_handled", true);
    if (isHandledRaw === "false") query = query.eq("is_handled", false);
    if (q) {
        // PostgREST .or() needs comma-separated filters with embedded values
        // — escape % and , so a user-supplied query string can't break out.
        const safeQ = q.replace(/[%,]/g, "");
        query = query.or(`subject.ilike.%${safeQ}%,from_email.ilike.%${safeQ}%`);
    }

    const { data: rows, count, error } = await query as {
        data: Array<{
            id: string;
            received_at: string;
            from_email: string;
            from_name: string | null;
            subject: string | null;
            sentiment: string | null;
            intent: string | null;
            parsed_meeting_url: string | null;
            classification_confidence: number | null;
            classified_at: string | null;
            is_handled: boolean;
            handled_at: string | null;
            campaign_step_run_id: string | null;
            contact_id: string | null;
        }> | null;
        count: number | null;
        error: { message: string } | null;
    };

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Fan out to fetch the campaign + contact summaries in two cheap batches
    // so the UI can render "Replied to Campaign X from Acme Corp" without a
    // second round-trip per row.
    const stepRunRefs = Array.from(new Set((rows || []).map(r => r.campaign_step_run_id).filter((v): v is string => !!v)));
    const contactRefs = Array.from(new Set((rows || []).map(r => r.contact_id).filter((v): v is string => !!v)));

    const campaignByStepRun: Record<string, { id: string; name: string }> = {};
    if (stepRunRefs.length > 0) {
        const { data: stepRuns } = await sb.from("outreach_campaign_step_runs")
            .select("id, campaign_contact_id")
            .in("id", stepRunRefs) as { data: { id: string; campaign_contact_id: string }[] | null };

        const ccIds = Array.from(new Set((stepRuns || []).map(r => r.campaign_contact_id).filter(Boolean)));
        if (ccIds.length > 0) {
            const { data: ccRows } = await sb.from("outreach_campaign_contacts")
                .select("id, campaign_id")
                .in("id", ccIds) as { data: { id: string; campaign_id: string }[] | null };
            const ccToCampaign: Record<string, string> = {};
            for (const cc of ccRows || []) ccToCampaign[cc.id] = cc.campaign_id;

            const campaignIds = Array.from(new Set(Object.values(ccToCampaign)));
            if (campaignIds.length > 0) {
                const { data: camps } = await sb.from("outreach_campaigns")
                    .select("id, name")
                    .in("id", campaignIds) as { data: { id: string; name: string }[] | null };
                const campById: Record<string, { id: string; name: string }> = {};
                for (const c of camps || []) campById[c.id] = c;

                for (const sr of stepRuns || []) {
                    const campId = ccToCampaign[sr.campaign_contact_id];
                    if (campId && campById[campId]) campaignByStepRun[sr.id] = campById[campId];
                }
            }
        }
    }

    const contactById: Record<string, { id: string; company_name: string | null; first_name: string | null; last_name: string | null }> = {};
    if (contactRefs.length > 0) {
        const { data: contacts } = await sb.from("outreach_contacts")
            .select("id, company_name, first_name, last_name")
            .in("id", contactRefs) as { data: { id: string; company_name: string | null; first_name: string | null; last_name: string | null }[] | null };
        for (const c of contacts || []) contactById[c.id] = c;
    }

    const items = (rows || []).map(r => ({
        id: r.id,
        received_at: r.received_at,
        from_email: r.from_email,
        from_name: r.from_name,
        subject: r.subject,
        sentiment: r.sentiment,
        intent: r.intent,
        parsed_meeting_url: r.parsed_meeting_url,
        classification_confidence: r.classification_confidence,
        classified_at: r.classified_at,
        is_handled: r.is_handled,
        handled_at: r.handled_at,
        contact: r.contact_id ? contactById[r.contact_id] || null : null,
        campaign: r.campaign_step_run_id ? campaignByStepRun[r.campaign_step_run_id] || null : null,
    }));

    return NextResponse.json({
        items,
        total: count ?? items.length,
        limit,
        offset,
    });
}

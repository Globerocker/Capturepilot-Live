/**
 * Admin endpoint powering /admin/email-tracking.
 *
 * Returns the last 200 marketing_leads with per-lead engagement: magnet email
 * status (delivered/opened/clicked/bounced) + brief email status. Aggregated
 * in-memory after fetching both tables since Supabase's PostgREST joins don't
 * support `count(*) filter (where ...)` and we want to do this in one round-trip
 * instead of N+1 per-lead lookups.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";

export const runtime = "nodejs";
export const maxDuration = 30;

interface LeadRow {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
    source: string | null;
    magnet_key: string;
    created_at: string;
    apollo_enriched_at: string | null;
    hubspot_contact_id: string | null;
    lead_brief_status: string | null;
    lead_brief_sent_at: string | null;
    magnet_resend_id: string | null;
    brief_resend_id: string | null;
    resend_synced: boolean | null;
}

interface EventRow {
    resend_email_id: string;
    event_type: string;
    occurred_at: string;
}

interface EngagementSummary {
    delivered: boolean;
    opened_count: number;
    last_opened_at: string | null;
    clicked_count: number;
    last_clicked_at: string | null;
    bounced: boolean;
    complained: boolean;
}

function emptyEngagement(): EngagementSummary {
    return {
        delivered: false,
        opened_count: 0,
        last_opened_at: null,
        clicked_count: 0,
        last_clicked_at: null,
        bounced: false,
        complained: false,
    };
}

function foldEvents(rows: EventRow[]): Map<string, EngagementSummary> {
    const map = new Map<string, EngagementSummary>();
    for (const r of rows) {
        let s = map.get(r.resend_email_id);
        if (!s) {
            s = emptyEngagement();
            map.set(r.resend_email_id, s);
        }
        switch (r.event_type) {
            case "delivered":
                s.delivered = true;
                break;
            case "opened":
                s.opened_count += 1;
                if (!s.last_opened_at || r.occurred_at > s.last_opened_at) {
                    s.last_opened_at = r.occurred_at;
                }
                break;
            case "clicked":
                s.clicked_count += 1;
                if (!s.last_clicked_at || r.occurred_at > s.last_clicked_at) {
                    s.last_clicked_at = r.occurred_at;
                }
                break;
            case "bounced":
                s.bounced = true;
                break;
            case "complained":
                s.complained = true;
                break;
        }
    }
    return map;
}

export async function GET(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "200", 10), 500);

    const { data: leadsRaw, error: leadsErr } = await sb
        .from("marketing_leads")
        .select("id, email, first_name, last_name, company, source, magnet_key, created_at, apollo_enriched_at, hubspot_contact_id, lead_brief_status, lead_brief_sent_at, magnet_resend_id, brief_resend_id, resend_synced")
        .order("created_at", { ascending: false })
        .limit(limit);
    if (leadsErr) {
        return NextResponse.json({ error: leadsErr.message }, { status: 500 });
    }
    const leads = (leadsRaw || []) as LeadRow[];

    // Collect every resend id we need engagement for in one batched query.
    const allIds = leads
        .flatMap(l => [l.magnet_resend_id, l.brief_resend_id])
        .filter((x): x is string => Boolean(x));

    let eventsMap = new Map<string, EngagementSummary>();
    if (allIds.length > 0) {
        const { data: events, error: evErr } = await sb
            .from("email_events")
            .select("resend_email_id, event_type, occurred_at")
            .in("resend_email_id", allIds);
        if (evErr) {
            console.warn("[admin/email-tracking] events query failed:", evErr.message);
        } else {
            eventsMap = foldEvents((events || []) as EventRow[]);
        }
    }

    // Headline counters for the KPI tiles at the top of the dashboard.
    const totals = {
        leads: leads.length,
        meta_leads: leads.filter(l => l.source === "meta-lead-ad").length,
        website_leads: leads.filter(l => l.source !== "meta-lead-ad").length,
        briefs_done: leads.filter(l => l.lead_brief_status === "done").length,
        briefs_pending: leads.filter(l => l.lead_brief_status === "pending").length,
        magnet_delivered: 0,
        magnet_opened: 0,
        magnet_clicked: 0,
        brief_delivered: 0,
        brief_opened: 0,
    };

    const rows = leads.map(l => {
        const magnet = (l.magnet_resend_id && eventsMap.get(l.magnet_resend_id)) || emptyEngagement();
        const brief = (l.brief_resend_id && eventsMap.get(l.brief_resend_id)) || emptyEngagement();
        if (magnet.delivered) totals.magnet_delivered += 1;
        if (magnet.opened_count > 0) totals.magnet_opened += 1;
        if (magnet.clicked_count > 0) totals.magnet_clicked += 1;
        if (brief.delivered) totals.brief_delivered += 1;
        if (brief.opened_count > 0) totals.brief_opened += 1;
        return {
            id: l.id,
            email: l.email,
            name: [l.first_name, l.last_name].filter(Boolean).join(" ") || null,
            company: l.company,
            source: l.source,
            magnet_key: l.magnet_key,
            created_at: l.created_at,
            apollo_enriched: Boolean(l.apollo_enriched_at),
            hubspot_id: l.hubspot_contact_id,
            brief_status: l.lead_brief_status,
            brief_sent_at: l.lead_brief_sent_at,
            magnet,
            brief,
        };
    });

    return NextResponse.json({ ok: true, totals, rows });
}

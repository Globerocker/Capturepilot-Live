/**
 * /api/cron/recompute_lead_scores  (R3-M5.1)
 *
 * Hourly recompute of `outreach_lead_scores` for any contact with an
 * engagement event in the last hour. Three jobs in one pass:
 *
 *   1. Pull the affected contact_ids via `recently_engaged_contact_ids(60)`
 *      (the helper lives in migration 153 so the cost stays on the DB side).
 *   2. For each contact, walk its event log + ICP config to compute fresh
 *      engagement + fit + composite scores. Writes back to
 *      `outreach_contacts.engagement_score` and upserts `outreach_lead_scores`.
 *   3. Fire `captureOutreachHighIntent` when the score crosses 80 (previous
 *      score < 80, new score ≥ 80) so sales sees the signal in Sentry → Slack.
 *
 * Wired into the enrichment_orchestrator at every tick (in-process invoke).
 * Scheduling lives there because vercel.json is at the Pro-plan 40-cron
 * ceiling; the orchestrator ferries us instead of adding a 41st entry.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";
import { withCronTelemetry } from "@/lib/cron-telemetry";
import {
    calculateEngagementScore,
    calculateFitScore,
    HIGH_INTENT_THRESHOLD,
    type EngagementEvent,
    type IcpConfig,
} from "@/lib/outreach-engagement-scoring";
import { captureOutreachHighIntent } from "@/lib/sentry-alerts";

export const runtime = "nodejs";
export const maxDuration = 300;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SbAny = SupabaseClient<any, any, any>;

interface ContactRow {
    id: string;
    email: string | null;
    naics_codes: string[] | null;
    state: string | null;
    opted_out_at: string | null;
    revenue?: number | null;
    annual_revenue?: number | null;
    engagement_score: number | null;
}

interface LeadScoreRow {
    contact_id: string;
    fit_score: number | null;
    intent_score: number | null;
    score: number | null;
}

/**
 * Pulls an ICP from `outreach_settings` if present (a tiny key/value table
 * shipped by R3-M3.5). Falls back to a defaults blob if the table is missing
 * or the row isn't there yet. Keeping this lookup soft means M5.1 can ship
 * before M3.5 without a hard dep.
 */
async function loadIcpConfig(sb: SbAny): Promise<IcpConfig> {
    try {
        const { data, error } = await sb
            .from("outreach_settings")
            .select("value")
            .eq("key", "icp_config")
            .maybeSingle();
        if (error || !data?.value) return {};
        // `value` is JSONB on the settings table.
        const v = data.value as Record<string, unknown>;
        return {
            target_naics: Array.isArray(v.target_naics) ? (v.target_naics as string[]) : undefined,
            target_states: Array.isArray(v.target_states) ? (v.target_states as string[]) : undefined,
            revenue_min: typeof v.revenue_min === "number" ? v.revenue_min : undefined,
            revenue_max: typeof v.revenue_max === "number" ? v.revenue_max : undefined,
            weights: (v.weights as IcpConfig["weights"]) || undefined,
        };
    } catch {
        // settings table missing — return empty config.
        return {};
    }
}

async function GET_handler(req: NextRequest): Promise<NextResponse> {
    const denied = guardCron(req);
    if (denied) return denied;

    const url = new URL(req.url);
    const windowMinutes = Math.min(
        Math.max(Number(url.searchParams.get("window_minutes") || 60), 5),
        24 * 60,
    );
    const dryRun = url.searchParams.get("dry_run") === "1";

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    ) as unknown as SbAny;

    // 1. Recently engaged contacts. RPC defined in migration 153.
    const { data: idRows, error: idsErr } = await sb.rpc(
        "recently_engaged_contact_ids",
        { p_window_minutes: windowMinutes },
    );
    if (idsErr) {
        return NextResponse.json(
            { error: `recently_engaged_contact_ids failed: ${idsErr.message}` },
            { status: 500 },
        );
    }
    const contactIds: string[] = (idRows || [])
        .map((r: { contact_id: string }) => r.contact_id)
        .filter(Boolean);

    if (contactIds.length === 0) {
        return NextResponse.json({
            ok: true,
            processed: 0,
            updated: 0,
            high_intent: 0,
            window_minutes: windowMinutes,
        });
    }

    const icp = await loadIcpConfig(sb);

    // 2. Hydrate the contact rows + their existing lead-score rows + the
    //    per-event log in three parallel queries.
    const [contactsRes, scoresRes, eventsRes] = await Promise.all([
        sb.from("outreach_contacts")
            .select("id, email, naics_codes, state, opted_out_at, engagement_score, custom_fields")
            .in("id", contactIds),
        sb.from("outreach_lead_scores")
            .select("contact_id, fit_score, intent_score, score")
            .in("contact_id", contactIds),
        sb.from("outreach_engagement_events")
            .select("contact_id, event_type, captured_at")
            .in("contact_id", contactIds)
            .order("captured_at", { ascending: false })
            .limit(5000),
    ]);

    if (contactsRes.error) {
        return NextResponse.json({ error: contactsRes.error.message }, { status: 500 });
    }

    const contacts = (contactsRes.data as (ContactRow & { custom_fields: Record<string, unknown> | null })[]) || [];
    const priorScores = new Map<string, LeadScoreRow>(
        ((scoresRes.data as LeadScoreRow[]) || []).map(r => [r.contact_id, r]),
    );

    // Group events by contact_id once.
    const eventsByContact = new Map<string, EngagementEvent[]>();
    for (const ev of (eventsRes.data || []) as { contact_id: string; event_type: string; captured_at: string }[]) {
        const list = eventsByContact.get(ev.contact_id) || [];
        list.push({ event_type: ev.event_type as EngagementEvent["event_type"], captured_at: ev.captured_at });
        eventsByContact.set(ev.contact_id, list);
    }

    let updated = 0;
    let highIntent = 0;
    const upserts: Array<{
        contact_id: string;
        score: number;
        fit_score: number;
        intent_score: number;
        updated_at: string;
    }> = [];
    const contactPatches: Array<{ id: string; engagement_score: number }> = [];

    for (const c of contacts) {
        const events = eventsByContact.get(c.id) || [];
        // Pull firmographics off custom_fields when the contact doesn't carry
        // a top-level revenue column (Apollo enrichment lands them here).
        const cf = c.custom_fields || {};
        const revenue = (cf as Record<string, unknown>).revenue ?? (cf as Record<string, unknown>).annual_revenue;
        const engagement = calculateEngagementScore(
            { ...c, revenue: typeof revenue === "number" ? revenue : null },
            events,
        );
        const fit = calculateFitScore(
            { ...c, revenue: typeof revenue === "number" ? revenue : null },
            icp,
        );
        const composite = Math.round((engagement + fit) / 2);

        const prior = priorScores.get(c.id);
        const previousIntent = prior?.intent_score ?? c.engagement_score ?? 0;

        // Skip the write when nothing moved — keeps the cron idle most ticks.
        const intentChanged = engagement !== previousIntent;
        const fitChanged = (prior?.fit_score ?? null) !== fit;
        const compositeChanged = (prior?.score ?? null) !== composite;
        if (!intentChanged && !fitChanged && !compositeChanged) continue;

        upserts.push({
            contact_id: c.id,
            score: composite,
            fit_score: fit,
            intent_score: engagement,
            updated_at: new Date().toISOString(),
        });
        if ((c.engagement_score ?? 0) !== engagement) {
            contactPatches.push({ id: c.id, engagement_score: engagement });
        }
        updated++;

        // High-intent crossing (transition from <80 to ≥80). Only fire on
        // the upward crossing so we don't spam Sentry on every event for an
        // already-hot contact.
        const crossedUp = previousIntent < HIGH_INTENT_THRESHOLD && engagement >= HIGH_INTENT_THRESHOLD;
        if (crossedUp) {
            highIntent++;
            if (!dryRun) {
                captureOutreachHighIntent({
                    contactId: c.id,
                    email: c.email,
                    score: engagement,
                    previousScore: previousIntent,
                    route: "/api/cron/recompute_lead_scores",
                });
            }
        }
    }

    if (!dryRun && upserts.length > 0) {
        // Chunk to keep payloads under Postgrest's row-count comfort zone.
        for (let i = 0; i < upserts.length; i += 500) {
            const chunk = upserts.slice(i, i + 500);
            const { error } = await sb
                .from("outreach_lead_scores")
                .upsert(chunk, { onConflict: "contact_id" });
            if (error) {
                console.error("[recompute_lead_scores] upsert failed:", error.message);
            }
        }
        // Patch back engagement_score on outreach_contacts in parallel chunks.
        for (let i = 0; i < contactPatches.length; i += 200) {
            const chunk = contactPatches.slice(i, i + 200);
            await Promise.all(chunk.map(p => sb
                .from("outreach_contacts")
                .update({
                    engagement_score: p.engagement_score,
                    last_engagement_at: new Date().toISOString(),
                })
                .eq("id", p.id),
            ));
        }
    }

    return NextResponse.json({
        ok: true,
        processed: contacts.length,
        updated,
        high_intent: highIntent,
        window_minutes: windowMinutes,
        dry_run: dryRun,
    });
}

export const GET = withCronTelemetry("/api/cron/recompute_lead_scores", GET_handler);

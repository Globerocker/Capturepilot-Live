/**
 * Cadence runner — advances outreach_campaign_contacts through their
 * outreach_campaign_steps and fires the next email/SMS step via
 * @/lib/outreach-sender.
 *
 * Schedule: this route is NOT wired into vercel.json (Pro plan is at the
 * 40-cron ceiling). Instead it's dispatched by enrichment_orchestrator at
 * every 5-min tick — see TASKS["run_outreach_cadence"] there.
 *
 * Per-run flow:
 *   1. Reap zombie campaign_contacts whose status is "running" past lease.
 *   2. Claim up to 100 ready contacts: (cc.status='active'
 *      AND cc.next_send_at <= now() AND campaign.status='active' AND
 *      send_window respected).
 *   3. For each contact, load the next step (step_order = current_step + 1).
 *   4. Respect skip_if_replied / skip_if_clicked by looking at prior
 *      step_runs for the same contact.
 *   5. Send via outreach-sender (email or sms based on step.channel).
 *   6. On success: advance current_step, compute next_send_at from next
 *      step's delay; reset consecutive_failures.
 *   7. On failure: increment consecutive_failures; >= 3 marks contact failed.
 *   8. When no more steps: status='completed', finished_at=NOW().
 *   9. Update campaign.stats cache at the end.
 *
 * Budget: 270s total (Vercel 300s ceiling, 30s reserved for cleanup).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";
import { withCronTelemetry } from "@/lib/cron-telemetry";
import {
    sendOutreachEmail,
    sendOutreachSMS,
    type ContactForRender,
} from "@/lib/outreach-sender";

export const runtime = "nodejs";
export const maxDuration = 300;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SbAny = SupabaseClient<any, any, any>;

const TOTAL_BUDGET_MS = 270_000;
const BATCH_SIZE = 100;
const FAILURE_THRESHOLD = 3;

interface Campaign {
    id: string;
    name: string;
    status: string;
    sender_email: string | null;
    throttle: Record<string, unknown> | null;
    stats: Record<string, unknown> | null;
    // Migration 168 — when true, the cadence completes a contact the moment
    // they reply, halting all remaining steps.
    stop_on_reply: boolean | null;
}

interface Contact extends ContactForRender {
    id: string;
    email: string | null;
    phone: string | null;
}

interface CampaignContact {
    id: string;
    campaign_id: string;
    contact_id: string;
    status: string;
    current_step: number;
    next_send_at: string | null;
    consecutive_failures: number;
    started_at: string | null;
    finished_at: string | null;
}

interface Step {
    id: string;
    campaign_id: string;
    step_order: number;
    channel: "email" | "sms";
    subject: string | null;
    body_template: string;
    delay_value: number;
    delay_unit: string;
    skip_if_replied: boolean;
    skip_if_clicked: boolean;
    // Migration 168 — per-step send gate. 'always' fires unconditionally;
    // 'if_no_reply' skips when the contact has already replied to this campaign.
    send_condition: "always" | "if_no_reply";
}

// ───────────────────────── Send-window check ─────────────────────────

/**
 * Honor campaign.throttle.send_window_start / send_window_end (24h clock,
 * local to throttle.timezone — defaults to UTC). Returns true if "now" is
 * inside the window or no window is configured.
 */
function isInsideSendWindow(throttle: Record<string, unknown> | null, now: Date): boolean {
    if (!throttle) return true;
    const start = throttle["send_window_start"];
    const end = throttle["send_window_end"];
    if (typeof start !== "number" && typeof end !== "number") return true;
    const tz = (throttle["timezone"] as string) || "UTC";
    let hour: number;
    try {
        const fmt = new Intl.DateTimeFormat("en-US", {
            hour: "2-digit", hour12: false, timeZone: tz,
        });
        const parts = fmt.formatToParts(now);
        const h = parts.find(p => p.type === "hour")?.value;
        hour = h ? parseInt(h, 10) : now.getUTCHours();
        // "24" comes back for midnight in some locales — normalize to 0.
        if (hour === 24) hour = 0;
    } catch {
        hour = now.getUTCHours();
    }
    const lo = typeof start === "number" ? start : 0;
    const hi = typeof end === "number" ? end : 24;
    return hour >= lo && hour < hi;
}

// ───────────────────────── Skip checks ─────────────────────────

async function hasPriorEvent(
    sb: SbAny,
    contactId: string,
    campaignId: string,
    event: "replied" | "clicked",
): Promise<boolean> {
    const column = event === "replied" ? "replied_at" : "clicked_at";
    const { data } = await sb
        .from("outreach_campaign_step_runs")
        .select("id")
        .eq("contact_id", contactId)
        .eq("campaign_id", campaignId)
        .not(column, "is", null)
        .limit(1);
    return Array.isArray(data) && data.length > 0;
}

/**
 * Migration 168 — Reply gate. Returns true when the contact has a row in
 * outreach_replies for this campaign. The inbound webhook stamps replies with
 * a denormalized campaign_id (migration 160) plus the contact_id and the
 * sender's email, so we match on campaign_id AND (contact_id OR from_email)
 * to stay robust across the two campaign-contact schemas in this codebase.
 */
async function hasRepliedToCampaign(
    sb: SbAny,
    campaignId: string,
    contactId: string | null,
    contactEmail: string | null,
): Promise<boolean> {
    const email = (contactEmail || "").trim().toLowerCase();
    if (!contactId && !email) return false;

    let q = sb
        .from("outreach_replies")
        .select("id")
        .eq("campaign_id", campaignId)
        .limit(1);

    if (contactId && email) {
        q = q.or(`contact_id.eq.${contactId},from_email.ilike.${email}`);
    } else if (contactId) {
        q = q.eq("contact_id", contactId);
    } else {
        q = q.ilike("from_email", email);
    }

    const { data } = await q;
    return Array.isArray(data) && data.length > 0;
}

// ───────────────────────── Step advancement ─────────────────────────

function computeNextSendAt(step: Step | null, base: Date): string | null {
    if (!step) return null;
    const v = Math.max(0, step.delay_value || 0);
    const unitMs = step.delay_unit === "days" ? 86_400_000
        : step.delay_unit === "minutes" ? 60_000
        : 3_600_000; // hours (default)
    return new Date(base.getTime() + v * unitMs).toISOString();
}

// ───────────────────────── Per-contact processor ─────────────────────────

async function processContact(
    sb: SbAny,
    cc: CampaignContact,
    contact: Contact,
    campaign: Campaign,
    steps: Step[],
): Promise<"sent" | "skipped" | "failed" | "completed"> {
    const nextStepOrder = (cc.current_step || 0) + 1;
    const step = steps.find(s => s.step_order === nextStepOrder) || null;

    // No more steps — mark completed.
    if (!step) {
        await sb.from("outreach_campaign_contacts").update({
            status: "completed",
            finished_at: new Date().toISOString(),
        }).eq("id", cc.id);
        return "completed";
    }

    // Migration 168 — Reply gating. Resolve "has this contact replied to this
    // campaign?" once (an inbound reply row), then apply both the campaign-level
    // stop-on-reply switch and the per-step send_condition='if_no_reply' gate.
    const stopOnReply = campaign.stop_on_reply !== false; // default on
    const needsReplyCheck =
        stopOnReply
        || step.send_condition === "if_no_reply"
        || step.skip_if_replied;

    const replied = needsReplyCheck
        ? (await hasRepliedToCampaign(sb, cc.campaign_id, cc.contact_id, contact.email ?? null)
            || await hasPriorEvent(sb, cc.contact_id, cc.campaign_id, "replied"))
        : false;

    // Campaign-level: stop the whole sequence once they reply.
    if (stopOnReply && replied) {
        await sb.from("outreach_campaign_contacts").update({
            status: "completed",
            finished_at: new Date().toISOString(),
        }).eq("id", cc.id);
        return "skipped";
    }

    // Per-step: this step only fires if the contact hasn't replied yet.
    // Skip just this step and advance to the next instead of finishing the
    // whole cadence, so later 'always' steps still run.
    if (step.send_condition === "if_no_reply" && replied) {
        const nextStep = steps.find(s => s.step_order === nextStepOrder + 1) || null;
        const nextSendAt = nextStep ? computeNextSendAt(nextStep, new Date()) : null;
        const completed = !nextStep;
        await sb.from("outreach_campaign_contacts").update({
            current_step: nextStepOrder,
            next_send_at: nextSendAt,
            status: completed ? "completed" : "active",
            finished_at: completed ? new Date().toISOString() : null,
            started_at: cc.started_at || new Date().toISOString(),
        }).eq("id", cc.id);
        return "skipped";
    }

    // Honor legacy skip-if-replied / skip-if-clicked guardrails.
    if (step.skip_if_replied && replied) {
        await sb.from("outreach_campaign_contacts").update({
            status: "completed",
            finished_at: new Date().toISOString(),
        }).eq("id", cc.id);
        return "skipped";
    }
    if (step.skip_if_clicked && await hasPriorEvent(sb, cc.contact_id, cc.campaign_id, "clicked")) {
        await sb.from("outreach_campaign_contacts").update({
            status: "completed",
            finished_at: new Date().toISOString(),
        }).eq("id", cc.id);
        return "skipped";
    }

    const fromEmail = campaign.sender_email
        || process.env.FROM_EMAIL
        || "CapturePilot <noreply@capturepilot.com>";

    let result;
    if (step.channel === "sms") {
        result = await sendOutreachSMS({
            to: contact.phone || "",
            body: step.body_template,
            campaignId: campaign.id,
            stepId: step.id,
            contactId: contact.id,
            contact,
        });
    } else {
        result = await sendOutreachEmail({
            to: contact.email || "",
            from: fromEmail,
            replyTo: undefined,
            subject: step.subject || "",
            html: step.body_template,
            campaignId: campaign.id,
            stepId: step.id,
            contactId: contact.id,
            contact,
        });
    }

    // Decide downstream state from the sender's result.
    if (result.ok && (result.status === "sent" || result.status === "suppressed")) {
        // Suppressed counts as "step delivered" — we still advance, otherwise
        // a single bounced address would block the entire cadence forever.
        const nextStep = steps.find(s => s.step_order === nextStepOrder + 1) || null;
        const nextSendAt = nextStep ? computeNextSendAt(nextStep, new Date()) : null;
        const completed = !nextStep;
        await sb.from("outreach_campaign_contacts").update({
            current_step: nextStepOrder,
            next_send_at: nextSendAt,
            consecutive_failures: 0,
            status: completed ? "completed" : "active",
            finished_at: completed ? new Date().toISOString() : null,
            started_at: cc.started_at || new Date().toISOString(),
        }).eq("id", cc.id);
        return result.status === "suppressed" ? "skipped" : "sent";
    }

    // Failure path — bump consecutive_failures, mark failed at threshold.
    const failures = (cc.consecutive_failures || 0) + 1;
    const giveUp = failures >= FAILURE_THRESHOLD;
    await sb.from("outreach_campaign_contacts").update({
        consecutive_failures: failures,
        status: giveUp ? "failed" : "active",
        // Back off 1 hour before next attempt so transient upstream blips
        // don't burn through all 3 attempts in one tick.
        next_send_at: giveUp ? null : new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        finished_at: giveUp ? new Date().toISOString() : null,
    }).eq("id", cc.id);
    return "failed";
}

// ───────────────────────── Stats cache refresh ─────────────────────────

async function updateCampaignStats(sb: SbAny, campaignIds: string[]): Promise<void> {
    if (campaignIds.length === 0) return;
    for (const id of campaignIds) {
        try {
            const [contactStats, runStats] = await Promise.all([
                sb.from("outreach_campaign_contacts")
                    .select("status", { count: "exact" })
                    .eq("campaign_id", id),
                sb.from("outreach_campaign_step_runs")
                    .select("status, clicked_at, replied_at, opened_at", { count: "exact" })
                    .eq("campaign_id", id),
            ]);

            const cRows = (contactStats.data || []) as Array<{ status: string }>;
            const rRows = (runStats.data || []) as Array<{
                status: string;
                clicked_at: string | null;
                replied_at: string | null;
                opened_at: string | null;
            }>;

            const stats = {
                contacts_total: cRows.length,
                contacts_active: cRows.filter(r => r.status === "active").length,
                contacts_completed: cRows.filter(r => r.status === "completed").length,
                contacts_failed: cRows.filter(r => r.status === "failed").length,
                sends_total: rRows.length,
                sends_sent: rRows.filter(r => r.status === "sent").length,
                sends_failed: rRows.filter(r => r.status === "failed").length,
                sends_suppressed: rRows.filter(r => r.status === "suppressed").length,
                opens: rRows.filter(r => r.opened_at).length,
                clicks: rRows.filter(r => r.clicked_at).length,
                replies: rRows.filter(r => r.replied_at).length,
                updated_at: new Date().toISOString(),
            };

            await sb.from("outreach_campaigns")
                .update({ stats })
                .eq("id", id);
        } catch (e) {
            console.error(`[run_outreach_cadence] stats update failed for ${id}:`, e);
        }
    }
}

// ───────────────────────── Main handler ─────────────────────────

async function GET_handler(req: NextRequest): Promise<NextResponse> {
    const denied = guardCron(req);
    if (denied) return denied;

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    const url = new URL(req.url);
    const budget = Math.min(
        Math.max(Number(url.searchParams.get("budget") || TOTAL_BUDGET_MS), 5000),
        290_000,
    );
    const limit = Math.min(
        Math.max(Number(url.searchParams.get("limit") || BATCH_SIZE), 1),
        500,
    );

    const startedAt = Date.now();
    const now = new Date();
    const nowIso = now.toISOString();

    // ---- Load ready contacts ----------------------------------------------
    // Join through campaign so we can filter on campaign.status='active' and
    // surface the throttle column for the send-window check below.
    const { data: ccRaw, error: ccErr } = await sb
        .from("outreach_campaign_contacts")
        .select(`
            id, campaign_id, contact_id, status, current_step,
            next_send_at, consecutive_failures, started_at, finished_at,
            campaign:outreach_campaigns!inner (
                id, name, status, sender_email, throttle, stats, stop_on_reply
            ),
            contact:outreach_contacts!inner (
                id, email, phone, first_name, last_name, company, title, state,
                custom_fields
            )
        `)
        .eq("status", "active")
        .eq("campaign.status", "active")
        .or(`next_send_at.is.null,next_send_at.lte.${nowIso}`)
        .order("next_send_at", { ascending: true, nullsFirst: true })
        .limit(limit);

    if (ccErr) {
        return NextResponse.json({ error: ccErr.message }, { status: 500 });
    }

    type Joined = CampaignContact & {
        campaign: Campaign | Campaign[] | null;
        contact: Contact | Contact[] | null;
    };
    const rows = ((ccRaw || []) as unknown as Joined[]).map(r => ({
        cc: {
            id: r.id,
            campaign_id: r.campaign_id,
            contact_id: r.contact_id,
            status: r.status,
            current_step: r.current_step || 0,
            next_send_at: r.next_send_at,
            consecutive_failures: r.consecutive_failures || 0,
            started_at: r.started_at,
            finished_at: r.finished_at,
        } as CampaignContact,
        campaign: Array.isArray(r.campaign) ? r.campaign[0] : r.campaign,
        contact: Array.isArray(r.contact) ? r.contact[0] : r.contact,
    })).filter(r => r.campaign && r.contact) as Array<{
        cc: CampaignContact;
        campaign: Campaign;
        contact: Contact;
    }>;

    if (rows.length === 0) {
        return NextResponse.json({
            ok: true,
            processed: 0,
            sent: 0,
            failed: 0,
            elapsed_ms: Date.now() - startedAt,
        });
    }

    // ---- Pre-load all steps for the campaigns we'll touch ----------------
    const campaignIds = Array.from(new Set(rows.map(r => r.campaign.id)));
    const { data: stepRows } = await sb
        .from("outreach_campaign_steps")
        .select("id, campaign_id, step_order, channel, subject, body_template, delay_value, delay_unit, skip_if_replied, skip_if_clicked, send_condition")
        .in("campaign_id", campaignIds)
        .order("step_order", { ascending: true });
    const stepsByCampaign = new Map<string, Step[]>();
    for (const s of (stepRows || []) as Step[]) {
        // Normalize the migration-168 gate to a safe default so a null or
        // unexpected value can never mis-gate a send.
        const normalized: Step = {
            ...s,
            send_condition: s.send_condition === "if_no_reply" ? "if_no_reply" : "always",
        };
        const arr = stepsByCampaign.get(s.campaign_id) || [];
        arr.push(normalized);
        stepsByCampaign.set(s.campaign_id, arr);
    }

    let processed = 0;
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    let completed = 0;
    const touchedCampaigns = new Set<string>();

    for (const { cc, campaign, contact } of rows) {
        if (Date.now() - startedAt > budget) break;

        // Send-window: skip silently — the next tick will re-pick this row.
        if (!isInsideSendWindow(campaign.throttle, new Date())) {
            continue;
        }

        const steps = stepsByCampaign.get(campaign.id) || [];
        processed++;
        try {
            const outcome = await processContact(sb, cc, contact, campaign, steps);
            touchedCampaigns.add(campaign.id);
            switch (outcome) {
                case "sent": sent++; break;
                case "failed": failed++; break;
                case "skipped": skipped++; break;
                case "completed": completed++; break;
            }
        } catch (e) {
            failed++;
            const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300);
            console.error(`[run_outreach_cadence] contact=${cc.id} crashed: ${msg}`);
            // Surface as a failure on the contact row so the next tick doesn't
            // retry instantly.
            const failures = (cc.consecutive_failures || 0) + 1;
            const giveUp = failures >= FAILURE_THRESHOLD;
            await sb.from("outreach_campaign_contacts").update({
                consecutive_failures: failures,
                status: giveUp ? "failed" : "active",
                next_send_at: giveUp ? null : new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                finished_at: giveUp ? new Date().toISOString() : null,
            }).eq("id", cc.id);
        }
    }

    // ---- Refresh campaign.stats cache atomically -------------------------
    await updateCampaignStats(sb, Array.from(touchedCampaigns));

    return NextResponse.json({
        ok: true,
        processed,
        sent,
        failed,
        skipped,
        completed,
        campaigns_touched: touchedCampaigns.size,
        elapsed_ms: Date.now() - startedAt,
    });
}

export const GET = withCronTelemetry("/api/cron/run_outreach_cadence", GET_handler);

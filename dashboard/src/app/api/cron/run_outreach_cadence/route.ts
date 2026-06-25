/**
 * Cadence runner — advances outreach_campaign_contacts through their
 * outreach_campaign_steps and fires the next email/SMS step via
 * @/lib/outreach-sender, under the deliverability governor.
 *
 * Schedule: NOT in vercel.json (Pro plan is at the 40-cron ceiling). It's
 * dispatched by enrichment_orchestrator every tick and/or by a VPS systemd
 * timer hitting this route with the CRON_SECRET bearer.
 *
 * Per-run flow:
 *   1. Load the deliverability governor (warm-up ramp, daily + per-domain caps,
 *      batch size, jitter).
 *   2. Claim up to `limit` ready contacts (status='active', next_send_at<=now,
 *      campaign active).
 *   3. For each: load next step; honor reply / skip gates.
 *   4. Pick A or B 50/50 (deterministic per contact+step so retries don't
 *      flip), MX/syntax pre-check, per-domain + daily caps, then send.
 *   5. Advance current_step with a jittered next_send_at; reset failures.
 *   6. Refresh campaign.stats.
 *
 * A/B: every send records its variant ('A'/'B') on the step run so open/click/
 * reply rates can be compared per variant.
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
import { unsubscribeUrl } from "@/lib/outreach/unsubscribe";
import {
    loadGovernor,
    ensureWarmupStart,
    effectiveDailyCap,
    countSentToday,
    domainSentToday,
    isDeliverable,
    pickBatchSize,
    jitter,
    emailDomain,
    type GovernorSettings,
} from "@/lib/outreach/governor";

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
    sender_name: string | null;
    physical_address: string | null;
    throttle: Record<string, unknown> | null;
    stats: Record<string, unknown> | null;
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
    subject_b: string | null;
    body_template: string;
    body_b: string | null;
    delay_value: number;
    delay_unit: string;
    skip_if_replied: boolean;
    skip_if_clicked: boolean;
    send_condition: "always" | "if_no_reply";
}

// Mutable per-tick send budget enforced by the governor.
interface SendBudget {
    enabled: boolean;
    remainingTick: number;
    perDomainCap: number;
    domainCounts: Record<string, number>;
    gov: GovernorSettings;
    warmupStarted: boolean;
}

type Outcome = "sent" | "skipped" | "failed" | "completed" | "deferred" | "invalid";

// ───────────────────────── Send-window check ─────────────────────────

function isInsideSendWindow(throttle: Record<string, unknown> | null, now: Date): boolean {
    if (!throttle) return true;
    const start = throttle["send_window_start"];
    const end = throttle["send_window_end"];
    if (typeof start !== "number" && typeof end !== "number") return true;
    const tz = (throttle["timezone"] as string) || "UTC";
    let hour: number;
    try {
        const fmt = new Intl.DateTimeFormat("en-US", { hour: "2-digit", hour12: false, timeZone: tz });
        const parts = fmt.formatToParts(now);
        const h = parts.find(p => p.type === "hour")?.value;
        hour = h ? parseInt(h, 10) : now.getUTCHours();
        if (hour === 24) hour = 0;
    } catch {
        hour = now.getUTCHours();
    }
    const lo = typeof start === "number" ? start : 0;
    const hi = typeof end === "number" ? end : 24;
    return hour >= lo && hour < hi;
}

// ───────────────────────── A/B variant pick ─────────────────────────

// djb2 — small stable hash so the same (contact, step) always lands on the
// same variant. Keeps a retried step from flipping A↔B mid-sequence.
function stableHash(s: string): number {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h;
}

function pickVariant(step: Step, ccId: string): {
    variant: "A" | "B" | null;
    subject: string;
    body: string;
} {
    const hasB = !!(step.body_b?.trim() || step.subject_b?.trim());
    if (!hasB) {
        return { variant: null, subject: step.subject || "", body: step.body_template };
    }
    // 50/50 split.
    const pickB = stableHash(`${ccId}:${step.id}`) % 2 === 1;
    if (!pickB) {
        return { variant: "A", subject: step.subject || "", body: step.body_template };
    }
    return {
        variant: "B",
        subject: step.subject_b?.trim() || step.subject || "",
        body: step.body_b?.trim() || step.body_template,
    };
}

// ───────────────────────── Skip / reply checks ─────────────────────────

async function hasPriorEvent(
    sb: SbAny,
    campaignContactId: string,
    event: "replied" | "clicked",
): Promise<boolean> {
    const column = event === "replied" ? "replied_at" : "first_click_at";
    const { data } = await sb
        .from("outreach_campaign_step_runs")
        .select("id")
        .eq("campaign_contact_id", campaignContactId)
        .not(column, "is", null)
        .limit(1);
    return Array.isArray(data) && data.length > 0;
}

async function hasRepliedToCampaign(
    sb: SbAny,
    campaignId: string,
    contactId: string | null,
    contactEmail: string | null,
): Promise<boolean> {
    const email = (contactEmail || "").trim().toLowerCase();
    if (!contactId && !email) return false;
    let q = sb.from("outreach_replies").select("id").eq("campaign_id", campaignId).limit(1);
    if (contactId && email) q = q.or(`contact_id.eq.${contactId},from_email.ilike.${email}`);
    else if (contactId) q = q.eq("contact_id", contactId);
    else q = q.ilike("from_email", email);
    const { data } = await q;
    return Array.isArray(data) && data.length > 0;
}

// ───────────────────────── Step advancement ─────────────────────────

function computeNextSendAt(step: Step | null, base: Date, gov: GovernorSettings | null): string | null {
    if (!step) return null;
    const v = Math.max(0, step.delay_value || 0);
    const unitMs = step.delay_unit === "days" ? 86_400_000
        : step.delay_unit === "minutes" ? 60_000
        : 3_600_000;
    const iso = new Date(base.getTime() + v * unitMs).toISOString();
    return gov?.enabled ? jitter(iso, gov) : iso;
}

// ───────────────────────── Per-contact processor ─────────────────────────

async function processContact(
    sb: SbAny,
    cc: CampaignContact,
    contact: Contact,
    campaign: Campaign,
    steps: Step[],
    budget: SendBudget,
): Promise<Outcome> {
    const nextStepOrder = (cc.current_step || 0) + 1;
    const step = steps.find(s => s.step_order === nextStepOrder) || null;
    const gov = budget.enabled ? budget.gov : null;

    if (!step) {
        await sb.from("outreach_campaign_contacts").update({
            status: "completed", finished_at: new Date().toISOString(),
        }).eq("id", cc.id);
        return "completed";
    }

    // Reply gating (campaign stop-on-reply + per-step if_no_reply).
    const stopOnReply = campaign.stop_on_reply !== false;
    const needsReplyCheck = stopOnReply || step.send_condition === "if_no_reply" || step.skip_if_replied;
    const replied = needsReplyCheck
        ? (await hasRepliedToCampaign(sb, cc.campaign_id, cc.contact_id, contact.email ?? null)
            || await hasPriorEvent(sb, cc.id, "replied"))
        : false;

    if (stopOnReply && replied) {
        await sb.from("outreach_campaign_contacts").update({
            status: "completed", finished_at: new Date().toISOString(),
        }).eq("id", cc.id);
        return "skipped";
    }

    if (step.send_condition === "if_no_reply" && replied) {
        const nextStep = steps.find(s => s.step_order === nextStepOrder + 1) || null;
        const nextSendAt = nextStep ? computeNextSendAt(nextStep, new Date(), gov) : null;
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

    if (step.skip_if_replied && replied) {
        await sb.from("outreach_campaign_contacts").update({
            status: "completed", finished_at: new Date().toISOString(),
        }).eq("id", cc.id);
        return "skipped";
    }
    if (step.skip_if_clicked && await hasPriorEvent(sb, cc.id, "clicked")) {
        await sb.from("outreach_campaign_contacts").update({
            status: "completed", finished_at: new Date().toISOString(),
        }).eq("id", cc.id);
        return "skipped";
    }

    const pick = pickVariant(step, cc.id);

    // ── Governor gates (email only) ──────────────────────────────────────
    if (step.channel === "email" && budget.enabled) {
        if (budget.remainingTick <= 0) return "deferred"; // out of budget this tick
        const dom = emailDomain(contact.email || "");
        if (budget.perDomainCap > 0 && (budget.domainCounts[dom] || 0) >= budget.perDomainCap) {
            return "deferred"; // domain capped for today — try next tick
        }
        const deliver = await isDeliverable(contact.email || "");
        if (!deliver.ok) {
            // Permanent: stop retrying an address that can't receive mail.
            await sb.from("outreach_campaign_contacts").update({
                status: "failed",
                finished_at: new Date().toISOString(),
                next_send_at: null,
            }).eq("id", cc.id);
            return "invalid";
        }
    }

    const fromName = campaign.sender_name?.trim();
    const fromEmail = campaign.sender_email
        || process.env.FROM_EMAIL
        || "noreply@capturepilot.com";
    const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

    const vars: Record<string, string> = {
        unsubscribe_url: unsubscribeUrl(contact.email || ""),
        sender_name: fromName || "",
    };

    let result;
    if (step.channel === "sms") {
        result = await sendOutreachSMS({
            to: contact.phone || "",
            body: pick.body,
            campaignContactId: cc.id,
            stepId: step.id,
            contact,
            variant: pick.variant,
            vars,
        });
    } else {
        // CAN-SPAM: ensure a one-click unsubscribe + physical address are
        // present. Templates end with {{unsubscribe_url}}; append a fallback
        // if a step body omitted it, then the mailing address.
        let body = pick.body;
        if (!/\{\{\s*unsubscribe_url\s*\}\}/.test(body)) {
            body += `\n\nUnsubscribe: {{unsubscribe_url}}`;
        }
        const addr = campaign.physical_address?.trim();
        if (addr) body += `\n${addr}`;
        // Replies route to a monitored mailbox (outreach_settings.reply_to),
        // not the from-domain. Optional; a missing setting just omits Reply-To.
        let replyTo: string | undefined;
        try {
            const { data: rt } = await sb.from("outreach_settings").select("value").eq("key", "reply_to").maybeSingle();
            if (typeof rt?.value === "string" && rt.value.includes("@")) replyTo = rt.value;
        } catch { /* reply-to is optional */ }
        result = await sendOutreachEmail({
            to: contact.email || "",
            from,
            replyTo,
            subject: pick.subject,
            html: body,
            campaignContactId: cc.id,
            stepId: step.id,
            contact,
            variant: pick.variant,
            vars,
        });
    }

    if (result.ok && (result.status === "sent" || result.status === "suppressed")) {
        // Consume governor budget on an actual email send.
        if (step.channel === "email" && budget.enabled && result.status === "sent") {
            budget.remainingTick--;
            const dom = emailDomain(contact.email || "");
            budget.domainCounts[dom] = (budget.domainCounts[dom] || 0) + 1;
            if (!budget.warmupStarted) {
                budget.gov = await ensureWarmupStart(sb, budget.gov);
                budget.warmupStarted = true;
            }
        }
        const nextStep = steps.find(s => s.step_order === nextStepOrder + 1) || null;
        const nextSendAt = nextStep ? computeNextSendAt(nextStep, new Date(), gov) : null;
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

    // Failure path.
    const failures = (cc.consecutive_failures || 0) + 1;
    const giveUp = failures >= FAILURE_THRESHOLD;
    await sb.from("outreach_campaign_contacts").update({
        consecutive_failures: failures,
        status: giveUp ? "failed" : "active",
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
                    .select("status")
                    .eq("campaign_id", id),
                sb.from("outreach_campaign_step_runs")
                    .select("status, variant, first_click_at, replied_at, opened_at, campaign_contact:outreach_campaign_contacts!inner(campaign_id)")
                    .eq("campaign_contact.campaign_id", id),
            ]);

            const cRows = (contactStats.data || []) as Array<{ status: string }>;
            const rRows = (runStats.data || []) as Array<{
                status: string;
                variant: string | null;
                first_click_at: string | null;
                replied_at: string | null;
                opened_at: string | null;
            }>;

            const sent = rRows.filter(r => r.status === "sent");
            const variantStat = (v: "A" | "B") => {
                const vs = sent.filter(r => r.variant === v);
                return {
                    sent: vs.length,
                    opens: vs.filter(r => r.opened_at).length,
                    clicks: vs.filter(r => r.first_click_at).length,
                    replies: vs.filter(r => r.replied_at).length,
                };
            };

            const stats = {
                contacts_total: cRows.length,
                contacts_active: cRows.filter(r => r.status === "active").length,
                contacts_completed: cRows.filter(r => r.status === "completed").length,
                contacts_failed: cRows.filter(r => r.status === "failed").length,
                sends_total: rRows.length,
                sends_sent: sent.length,
                sends_failed: rRows.filter(r => r.status === "failed").length,
                sends_suppressed: rRows.filter(r => r.status === "suppressed").length,
                opens: sent.filter(r => r.opened_at).length,
                clicks: sent.filter(r => r.first_click_at).length,
                replies: sent.filter(r => r.replied_at).length,
                variant_a: variantStat("A"),
                variant_b: variantStat("B"),
                updated_at: new Date().toISOString(),
            };

            const denorm = {
                contacts_count: stats.contacts_total,
                sent_count: stats.sends_sent,
                open_count: stats.opens,
                click_count: stats.clicks,
                reply_count: stats.replies,
            };

            await sb.from("outreach_campaigns").update({ stats, ...denorm }).eq("id", id);
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
    const budgetMs = Math.min(Math.max(Number(url.searchParams.get("budget") || TOTAL_BUDGET_MS), 5000), 290_000);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || BATCH_SIZE), 1), 500);

    const startedAt = Date.now();
    const nowIso = new Date().toISOString();

    // ── Governor: compute this tick's email send budget ───────────────────
    const gov = await loadGovernor(sb);
    const sendBudget: SendBudget = {
        enabled: gov.enabled,
        remainingTick: Number.MAX_SAFE_INTEGER,
        perDomainCap: gov.per_domain_daily_cap,
        domainCounts: {},
        gov,
        warmupStarted: !!gov.warmup_start_date,
    };
    if (gov.enabled) {
        const dailyCap = effectiveDailyCap(gov);
        const sentToday = await countSentToday(sb);
        const remainingDaily = Math.max(0, dailyCap - sentToday);
        if (remainingDaily <= 0) {
            return NextResponse.json({
                ok: true, processed: 0, sent: 0, governor: "daily_cap_reached",
                daily_cap: dailyCap, sent_today: sentToday,
                elapsed_ms: Date.now() - startedAt,
            });
        }
        sendBudget.remainingTick = Math.min(remainingDaily, pickBatchSize(gov));
        sendBudget.domainCounts = await domainSentToday(sb);
    }

    // ── Load ready contacts ────────────────────────────────────────────────
    const { data: ccRaw, error: ccErr } = await sb
        .from("outreach_campaign_contacts")
        .select(`
            id, campaign_id, contact_id, status, current_step,
            next_send_at, consecutive_failures, started_at, finished_at,
            campaign:outreach_campaigns!inner (
                id, name, status, sender_email, sender_name, physical_address, throttle, stats, stop_on_reply
            ),
            contact:outreach_contacts!inner (
                id, email, phone, first_name, last_name, company_name, title, state,
                custom_fields
            )
        `)
        .eq("status", "active")
        .eq("campaign.status", "active")
        .or(`next_send_at.is.null,next_send_at.lte.${nowIso}`)
        .order("next_send_at", { ascending: true, nullsFirst: true })
        .limit(limit);

    if (ccErr) return NextResponse.json({ error: ccErr.message }, { status: 500 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type Joined = any;
    const rows = ((ccRaw || []) as Joined[]).map((r: Joined) => {
        const campaign = Array.isArray(r.campaign) ? r.campaign[0] : r.campaign;
        const rawContact = Array.isArray(r.contact) ? r.contact[0] : r.contact;
        const contact: Contact | null = rawContact ? {
            id: rawContact.id,
            email: rawContact.email,
            phone: rawContact.phone,
            first_name: rawContact.first_name,
            last_name: rawContact.last_name,
            company: rawContact.company_name, // map company_name → company for render
            title: rawContact.title,
            state: rawContact.state,
            custom_fields: rawContact.custom_fields,
        } : null;
        return {
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
            campaign: campaign as Campaign,
            contact,
        };
    }).filter(r => r.campaign && r.contact) as Array<{ cc: CampaignContact; campaign: Campaign; contact: Contact }>;

    if (rows.length === 0) {
        return NextResponse.json({ ok: true, processed: 0, sent: 0, failed: 0, elapsed_ms: Date.now() - startedAt });
    }

    // ── Pre-load steps for the campaigns we'll touch ────────────────────────
    const campaignIds = Array.from(new Set(rows.map(r => r.campaign.id)));
    const { data: stepRows } = await sb
        .from("outreach_campaign_steps")
        .select("id, campaign_id, step_order, channel, subject, subject_b, body_template, body_b, delay_value, delay_unit, skip_if_replied, skip_if_clicked, send_condition")
        .in("campaign_id", campaignIds)
        .order("step_order", { ascending: true });
    const stepsByCampaign = new Map<string, Step[]>();
    for (const s of (stepRows || []) as Step[]) {
        const normalized: Step = {
            ...s,
            send_condition: s.send_condition === "if_no_reply" ? "if_no_reply" : "always",
        };
        const arr = stepsByCampaign.get(s.campaign_id) || [];
        arr.push(normalized);
        stepsByCampaign.set(s.campaign_id, arr);
    }

    let processed = 0, sent = 0, failed = 0, skipped = 0, completed = 0, deferred = 0, invalid = 0;
    const touchedCampaigns = new Set<string>();

    for (const { cc, campaign, contact } of rows) {
        if (Date.now() - startedAt > budgetMs) break;
        if (!isInsideSendWindow(campaign.throttle, new Date())) continue;

        const steps = stepsByCampaign.get(campaign.id) || [];
        processed++;
        try {
            const outcome = await processContact(sb, cc, contact, campaign, steps, sendBudget);
            touchedCampaigns.add(campaign.id);
            switch (outcome) {
                case "sent": sent++; break;
                case "failed": failed++; break;
                case "skipped": skipped++; break;
                case "completed": completed++; break;
                case "invalid": invalid++; break;
                case "deferred":
                    deferred++;
                    // Budget exhausted for this tick — stop; rest re-pick next tick.
                    if (sendBudget.enabled && sendBudget.remainingTick <= 0) {
                        processed--; // didn't really process a send
                        break;
                    }
                    break;
            }
            if (outcome === "deferred" && sendBudget.enabled && sendBudget.remainingTick <= 0) break;
        } catch (e) {
            failed++;
            const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300);
            console.error(`[run_outreach_cadence] contact=${cc.id} crashed: ${msg}`);
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

    await updateCampaignStats(sb, Array.from(touchedCampaigns));

    return NextResponse.json({
        ok: true,
        processed, sent, failed, skipped, completed, deferred, invalid,
        campaigns_touched: touchedCampaigns.size,
        governor: sendBudget.enabled
            ? { daily_cap: effectiveDailyCap(gov), remaining_tick: sendBudget.remainingTick }
            : "disabled",
        elapsed_ms: Date.now() - startedAt,
    });
}

export const GET = withCronTelemetry("/api/cron/run_outreach_cadence", GET_handler);

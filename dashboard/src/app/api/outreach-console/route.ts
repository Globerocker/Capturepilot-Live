/**
 * Outreach Console data + mutation API (token-gated, service-key backed).
 * The UI is the static page /outreach-console.html which calls:
 *   GET  /api/outreach-console?token=...&data=1   -> JSON payload
 *   POST /api/outreach-console?token=...          -> { action, ... } mutations
 * GET without data=1 redirects to the static console page.
 *
 * Operates on the REAL outreach tables so edits drive the live cadence + governor.
 * Actions: save_step, add_step, delete_step, save_settings, save_campaign, set_status.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { GOVERNOR_DEFAULTS } from "@/lib/outreach/governor";

export const runtime = "nodejs";
export const maxDuration = 300;
/* eslint-disable @typescript-eslint/no-explicit-any */

const TOKEN = "oc7f3a91c4e2";
const CAMPAIGN_NAME = "Match-Drop · 3 live matches + a site gap";
type SbAny = SupabaseClient<any, any, any>;

function sb(): SbAny {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, { auth: { persistSession: false } });
}

async function loadCampaign(db: SbAny) {
    const { data } = await db.from("outreach_campaigns").select("*").eq("name", CAMPAIGN_NAME).maybeSingle();
    return data;
}

async function buildData(db: SbAny) {
    const campaign = await loadCampaign(db);
    if (!campaign) return { error: "campaign not found — run /api/cron/prepare_match_drop first" };

    const { data: steps } = await db.from("outreach_campaign_steps")
        .select("id, step_order, channel, delay_value, delay_unit, subject, subject_b, body_template, body_b, skip_if_replied, skip_if_clicked, send_condition")
        .eq("campaign_id", campaign.id).order("step_order");

    const { data: govRow } = await db.from("outreach_settings").select("value").eq("key", "send_governor").maybeSingle();
    const governor = { ...GOVERNOR_DEFAULTS, ...((govRow?.value || {}) as any) };

    const { data: ccRows } = await db.from("outreach_campaign_contacts")
        .select("contact:outreach_contacts!inner(id, email, first_name, last_name, company_name, custom_fields, source_id)")
        .eq("campaign_id", campaign.id).limit(1000);
    const leadsRaw = (ccRows || []).map((r: any) => Array.isArray(r.contact) ? r.contact[0] : r.contact).filter(Boolean);

    const ueis = [...new Set(leadsRaw.map((l: any) => l.source_id).filter(Boolean))];
    const matchesByUei = new Map<string, any[]>();
    const noticeIds = new Set<string>();
    for (let i = 0; i < ueis.length; i += 300) {
        const { data } = await db.from("contractors").select("uei, naics_codes, capability_summary_ai")
            .in("uei", ueis.slice(i, i + 300) as string[]);
        for (const c of (data || []) as any[]) {
            const tm = Array.isArray(c.capability_summary_ai?.top_matches) ? c.capability_summary_ai.top_matches : [];
            matchesByUei.set(c.uei, tm.map((m: any) => ({ ...m, _naics: c.naics_codes })));
            tm.forEach((m: any) => { if (m.notice_id) noticeIds.add(m.notice_id); });
        }
    }
    const oppById = new Map<string, any>();
    const nidArr = [...noticeIds];
    for (let i = 0; i < nidArr.length; i += 300) {
        const { data } = await db.from("opportunities")
            .select("notice_id, title, agency, department, naics_code, response_deadline, set_aside_code, place_of_performance_state")
            .in("notice_id", nidArr.slice(i, i + 300));
        for (const o of (data || []) as any[]) oppById.set(o.notice_id, o);
    }

    function reasonFor(m: any, contractorNaics: string[]): string {
        const o = m.notice_id ? oppById.get(m.notice_id) : null;
        const bits: string[] = [];
        const naics = o?.naics_code;
        if (naics && Array.isArray(contractorNaics) && contractorNaics.includes(naics)) bits.push(`NAICS ${naics} matches your registered codes`);
        else if (naics) bits.push(`NAICS ${naics}`);
        if (o?.set_aside_code) bits.push(`${o.set_aside_code} set-aside`);
        if (o?.response_deadline) bits.push(`due ${String(o.response_deadline).slice(0, 10)}`);
        if (!bits.length) bits.push(`scored ${m.pwin}% fit by the Quick Checker model`);
        return bits.join(" · ");
    }

    const leads = leadsRaw.map((l: any) => {
        const tm = matchesByUei.get(l.source_id) || [];
        const matches = tm.slice(0, 3).map((m: any) => {
            const o = m.notice_id ? oppById.get(m.notice_id) : null;
            return {
                title: m.title || o?.title || "Opportunity",
                office: o?.agency || o?.department || m.agency || "—",
                score: m.pwin ?? Math.round((m.score || 0) * 100),
                deadline: o?.response_deadline ? String(o.response_deadline).slice(0, 10) : null,
                reason: reasonFor(m, l.naics_codes || []),
            };
        });
        return {
            id: l.id, email: l.email, first_name: l.first_name, company: l.company_name,
            vars: { first_name: l.first_name || "", last_name: l.last_name || "", company: l.company_name || "", company_name: l.company_name || "", ...(l.custom_fields || {}) },
            matches,
        };
    });

    const { data: runs } = await db.from("outreach_campaign_step_runs")
        .select("sent_at, opened_at, first_click_at, replied_at, campaign_contact:outreach_campaign_contacts!inner(campaign_id)")
        .eq("campaign_contact.campaign_id", campaign.id).eq("status", "sent").limit(20000);
    const byHour: Record<number, { sent: number; opens: number }> = {};
    const byDow: Record<number, { sent: number; opens: number }> = {};
    let sent = 0, opens = 0, clicks = 0, replies = 0;
    for (const r of (runs || []) as any[]) {
        if (!r.sent_at) continue;
        sent++; if (r.opened_at) opens++; if (r.first_click_at) clicks++; if (r.replied_at) replies++;
        const d = new Date(r.sent_at); const h = d.getUTCHours(); const dow = d.getUTCDay();
        byHour[h] = byHour[h] || { sent: 0, opens: 0 }; byHour[h].sent++; if (r.opened_at) byHour[h].opens++;
        byDow[dow] = byDow[dow] || { sent: 0, opens: 0 }; byDow[dow].sent++; if (r.opened_at) byDow[dow].opens++;
    }

    return { campaign, steps: steps || [], governor, leads, analytics: { sent, opens, clicks, replies, byHour, byDow } };
}

export async function GET(req: NextRequest) {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (token !== TOKEN) return new NextResponse("Unauthorized — use the console link with ?token=", { status: 401 });
    if (url.searchParams.get("data") === "1") {
        const r = NextResponse.json(await buildData(sb()));
        r.headers.set("cache-control", "no-store");
        return r;
    }
    return NextResponse.redirect(new URL(`/outreach-console.html?token=${token}`, req.url));
}

export async function POST(req: NextRequest) {
    const url = new URL(req.url);
    if (url.searchParams.get("token") !== TOKEN) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const db = sb();
    const body = await req.json().catch(() => ({} as any));
    const action = body?.action;
    const campaign = await loadCampaign(db);
    if (!campaign) return NextResponse.json({ error: "no campaign" }, { status: 404 });

    try {
        if (action === "save_step") {
            const { error } = await db.from("outreach_campaign_steps").update({
                subject: body.subject ?? null, subject_b: body.subject_b || null,
                body_template: body.body_template ?? "", body_b: body.body_b || null,
                delay_value: Number(body.delay_value) || 0, delay_unit: body.delay_unit || "days",
                skip_if_replied: !!body.skip_if_replied, send_condition: body.send_condition === "if_no_reply" ? "if_no_reply" : "always",
            }).eq("id", body.id).eq("campaign_id", campaign.id);
            if (error) throw error;
        } else if (action === "add_step") {
            const { data: mx } = await db.from("outreach_campaign_steps").select("step_order").eq("campaign_id", campaign.id).order("step_order", { ascending: false }).limit(1);
            const next = ((mx?.[0]?.step_order as number) || 0) + 1;
            const { error } = await db.from("outreach_campaign_steps").insert({
                campaign_id: campaign.id, step_order: next, channel: "email", delay_value: 3, delay_unit: "days",
                subject: "{{company}}", body_template: "Hi {{first_name}},\n\n…\n\n{{sender_name}}\n\n{{unsubscribe_url}}",
                skip_if_replied: true, send_condition: "if_no_reply",
            });
            if (error) throw error;
        } else if (action === "delete_step") {
            const { error } = await db.from("outreach_campaign_steps").delete().eq("id", body.id).eq("campaign_id", campaign.id);
            if (error) throw error;
        } else if (action === "save_settings") {
            const { data: govRow } = await db.from("outreach_settings").select("value").eq("key", "send_governor").maybeSingle();
            const gov = { ...GOVERNOR_DEFAULTS, ...((govRow?.value || {}) as any) };
            gov.daily_cap = Math.max(1, Number(body.daily_cap) || gov.daily_cap);
            gov.per_domain_daily_cap = Math.max(1, Number(body.per_domain_daily_cap) || gov.per_domain_daily_cap);
            gov.warmup_enabled = !!body.warmup_enabled;
            const { error } = await db.from("outreach_settings").upsert({ key: "send_governor", value: gov }, { onConflict: "key" });
            if (error) throw error;
        } else if (action === "save_campaign") {
            const throttle = { ...(campaign.throttle || {}), send_window_start: Number(body.send_window_start), send_window_end: Number(body.send_window_end), timezone: body.timezone || "America/New_York" };
            const { error } = await db.from("outreach_campaigns").update({
                sender_name: body.sender_name || null, sender_email: body.sender_email || null,
                physical_address: body.physical_address || null, stop_on_reply: body.stop_on_reply !== false, throttle,
            }).eq("id", campaign.id);
            if (error) throw error;
        } else if (action === "set_status") {
            const status = ["draft", "active", "paused"].includes(body.status) ? body.status : "draft";
            const { error } = await db.from("outreach_campaigns").update({
                status, started_at: status === "active" && !campaign.started_at ? new Date().toISOString() : campaign.started_at,
            }).eq("id", campaign.id);
            if (error) throw error;
        } else {
            return NextResponse.json({ error: "unknown action" }, { status: 400 });
        }
        return NextResponse.json({ ok: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
    }
}

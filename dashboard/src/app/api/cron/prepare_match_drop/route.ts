/**
 * One-shot: PREPARE the Match-Drop outreach sequence so it's plug-and-play in
 * /admin/outreach — push Start (set campaign status=active) and it runs.
 *
 * Does everything the admin "build segment" flow does, plus campaign + steps +
 * enrollment, in one guarded call (so it can be triggered from the VPS):
 *   1. Pull emailable match_drop contractors (qc_enriched + top_match_count>0).
 *   2. Upsert into outreach_contacts with custom_fields the cadence renders:
 *      {{first_name}} {{company}} {{matches_block}} {{gap_line}} {{gap_hook}}.
 *      gap_line embeds the Loom video matching that contractor's sharpest gap.
 *   3. Create the campaign as DRAFT (nothing sends until the user pushes Start)
 *      + Email 1 (matches + gap + Loom) and Email 2 (day-4 reminder, if no reply).
 *   4. Enroll every contact (status=active under a draft campaign = staged).
 *
 * Idempotent: re-running refreshes contacts + enrolls new ones; never duplicates
 * the campaign or steps. Trigger:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://app.capturepilot.com/api/cron/prepare_match_drop
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";
import { getSegment, emailableFilter } from "@/lib/outreach/segments";
import { formatMatchLine, computeDataGaps, type TopMatch } from "@/lib/outreach/match-drop";
import { LOOM_BY_GAP } from "@/lib/outreach/loom-videos";

export const runtime = "nodejs";
export const maxDuration = 300;

/* eslint-disable @typescript-eslint/no-explicit-any */

const CAMPAIGN_NAME = "Match-Drop · 3 live matches + a site gap";
const MAX = 5000;

const STEP1_SUBJECT = "{{company}} — 3 federal contracts you could actually win";
const STEP1_SUBJECT_B = "found a few live contracts that fit {{company}}";
const STEP1_BODY =
`Hi {{first_name}},

Real quick, and this isn't a mass blast — we actually ran {{company}}'s site through our software before reaching out.

Two things stood out. First, {{gap_line}}

Second, we pulled live federal contracts that line up with what you do:
{{matches_block}}

Our offer is simple: we run the bids, you pay us nothing unless you win. No retainer, nothing upfront.

Want the full list and the detail on these three? Just reply. If not, no hard feelings.

{{sender_name}}

{{unsubscribe_url}}`;

const STEP2_SUBJECT = "following up — {{company}}";
const STEP2_BODY =
`Hi {{first_name}},

Floating this back up in case it got buried. We found live federal contracts that fit {{company}}, and the offer stands — we run the bids, you only pay if you win:
{{matches_block}}

A one-line reply ("send the list") is all it takes. If it's not for you, I won't follow up again.

{{sender_name}}

{{unsubscribe_url}}`;

export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, { auth: { persistSession: false } });
    const seg = getSegment("match_drop");
    if (!seg) return NextResponse.json({ error: "match_drop segment missing" }, { status: 500 });

    // 1. Emailable match-drop contractors.
    const { data: rows, error } = await emailableFilter(
        seg.apply(sb.from("contractors").select(
            "uei, company_name, state, naics_codes, email, primary_poc_email, primary_poc_name, certifications, years_in_business, capability_summary_ai"
        ))
    ).limit(MAX);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const seen = new Set<string>();
    const contacts = (rows || []).map((r: any) => {
        const email = String(r.email || r.primary_poc_email || "").trim().toLowerCase();
        if (!email || seen.has(email)) return null;
        seen.add(email);
        const parts = String(r.primary_poc_name || "").trim().split(/\s+/).filter(Boolean);
        const blob = (r.capability_summary_ai || {}) as any;
        const top = (Array.isArray(blob.top_matches) ? blob.top_matches : []) as TopMatch[];
        const cf: Record<string, unknown> = {};
        if (blob.gap_hook) cf.gap_hook = blob.gap_hook;
        if (top[0]) cf.match_1 = formatMatchLine(top[0]);
        if (top[1]) cf.match_2 = formatMatchLine(top[1]);
        if (top[2]) cf.match_3 = formatMatchLine(top[2]);
        if (top.length) {
            cf.match_count = top.length;
            cf.matches_block = top.slice(0, 3).map(m => `• ${formatMatchLine(m)}`).join("\n");
        }
        // Loom video for the contractor's sharpest gap; fold it into one gap line.
        const { gaps } = computeDataGaps(blob, r);
        const gapKey = gaps[0]?.key;
        const hook = blob.gap_hook || gaps[0]?.hook || "";
        const loom = gapKey ? LOOM_BY_GAP[gapKey] : undefined;
        if (hook) cf.gap_line = loom ? `${hook}. I recorded a 60-second video on exactly what I mean: ${loom.url}` : `${hook}.`;
        if (loom) cf.loom_url = loom.url;
        if (blob.findings_summary) cf.findings_summary = blob.findings_summary;
        return {
            email,
            first_name: parts[0] || null,
            last_name: parts.length > 1 ? parts.slice(1).join(" ") : null,
            company_name: r.company_name || null,
            state: r.state || null,
            naics_codes: Array.isArray(r.naics_codes) ? r.naics_codes : [],
            source: "sam_gov" as const,
            source_id: r.uei || null,
            tags: ["segment:match_drop"],
            custom_fields: Object.keys(cf).length ? cf : null,
        };
    }).filter(Boolean) as any[];

    if (!contacts.length) return NextResponse.json({ ok: true, added: 0, message: "no emailable match_drop contractors" });

    // 2. Upsert contacts (merge so existing rows pick up loom_url + matches_block).
    for (let i = 0; i < contacts.length; i += 500) {
        const { error: upErr } = await sb.from("outreach_contacts")
            .upsert(contacts.slice(i, i + 500), { onConflict: "email", ignoreDuplicates: false });
        if (upErr) return NextResponse.json({ error: `contacts upsert: ${upErr.message}` }, { status: 500 });
    }

    // 3. Resolve ids by email.
    const emails = contacts.map(c => c.email);
    const idByEmail = new Map<string, string>();
    for (let i = 0; i < emails.length; i += 500) {
        const { data } = await sb.from("outreach_contacts").select("id, email").in("email", emails.slice(i, i + 500));
        (data || []).forEach((r: any) => idByEmail.set(r.email, r.id));
    }

    // 4. Campaign (draft) — create once.
    let { data: camp } = await sb.from("outreach_campaigns").select("id, status").eq("name", CAMPAIGN_NAME).maybeSingle();
    if (!camp) {
        const ins = await sb.from("outreach_campaigns").insert({
            name: CAMPAIGN_NAME,
            description: "Highest-intent play: lead with 3 live matches + the one gap on their site (Loom opener). We run the bids; they pay only if they win.",
            channels: ["email"],
            status: "draft",
            sender_name: "CapturePilot",
            stop_on_reply: true,
            unsubscribe_footer: true,
            physical_address: process.env.OUTREACH_PHYSICAL_ADDRESS || "CapturePilot — [physical mailing address required for CAN-SPAM]",
            throttle: { send_window_start: 13, send_window_end: 22, timezone: "America/New_York" },
        }).select("id, status").single();
        if (ins.error) return NextResponse.json({ error: `campaign: ${ins.error.message}` }, { status: 500 });
        camp = ins.data as any;
    }

    // 5. Steps — create once.
    const { data: existingSteps } = await sb.from("outreach_campaign_steps").select("id").eq("campaign_id", camp!.id).limit(1);
    if (!existingSteps?.length) {
        const { error: stepErr } = await sb.from("outreach_campaign_steps").insert([
            { campaign_id: camp!.id, step_order: 1, channel: "email", delay_value: 0, delay_unit: "hours",
              subject: STEP1_SUBJECT, subject_b: STEP1_SUBJECT_B, body_template: STEP1_BODY,
              skip_if_replied: true, send_condition: "always" },
            { campaign_id: camp!.id, step_order: 2, channel: "email", delay_value: 4, delay_unit: "days",
              subject: STEP2_SUBJECT, body_template: STEP2_BODY,
              skip_if_replied: true, send_condition: "if_no_reply" },
        ]);
        if (stepErr) return NextResponse.json({ error: `steps: ${stepErr.message}` }, { status: 500 });
    }

    // 6. Enroll contacts not already in the campaign.
    const ids = [...idByEmail.values()];
    const { data: enrolled } = await sb.from("outreach_campaign_contacts").select("contact_id").eq("campaign_id", camp!.id);
    const already = new Set((enrolled || []).map((r: any) => r.contact_id));
    const toEnroll = ids.filter(id => !already.has(id)).map(id => ({
        campaign_id: camp!.id, contact_id: id, status: "active", current_step: 0, next_send_at: null,
    }));
    for (let i = 0; i < toEnroll.length; i += 500) {
        await sb.from("outreach_campaign_contacts").insert(toEnroll.slice(i, i + 500));
    }

    return NextResponse.json({
        ok: true,
        campaign_id: camp!.id,
        campaign_status: camp!.status,
        contacts_upserted: contacts.length,
        newly_enrolled: toEnroll.length,
        already_enrolled: already.size,
        note: "Campaign is DRAFT — review in /admin/outreach, set sender + physical address, then set status=active to start.",
    });
}

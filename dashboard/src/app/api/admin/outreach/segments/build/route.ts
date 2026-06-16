import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getServiceClient } from "@/lib/admin-auth";
import { getSegment, emailableFilter } from "@/lib/outreach/segments";
import { formatMatchLine, type TopMatch } from "@/lib/outreach/match-drop";

export const dynamic = "force-dynamic";

const MAX = 5000;

/* eslint-disable @typescript-eslint/no-explicit-any */

// POST /api/admin/outreach/segments/build  { key }
// Materializes a segment's emailable contractors into an outreach_contacts +
// outreach_list set, ready to send. Returns how many were added.
export async function POST(req: NextRequest) {
    const { unauth } = await requireAdmin();
    if (unauth) return unauth;

    const body = await req.json().catch(() => null);
    const seg = body?.key ? getSegment(String(body.key)) : undefined;
    if (!seg) return NextResponse.json({ error: "unknown segment" }, { status: 400 });

    const sb = getServiceClient();

    // 1. Pull emailable contractors in the segment.
    const { data: rows, error } = await emailableFilter(
        seg.apply(
            sb.from("contractors").select(
                "uei, company_name, state, naics_codes, email, primary_poc_email, primary_poc_name, capability_summary_ai"
            )
        )
    ).limit(MAX);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const seen = new Set<string>();
    const contacts = (rows || [])
        .map((r: any) => {
            const email = String(r.email || r.primary_poc_email || "").trim().toLowerCase();
            if (!email || seen.has(email)) return null;
            seen.add(email);
            const parts = String(r.primary_poc_name || "").trim().split(/\s+/).filter(Boolean);
            // Carry the Match-Drop hooks into custom_fields so the cadence
            // renderer fills {{match_1}}/{{match_2}}/{{match_3}}/{{gap_hook}}.
            const blob = (r.capability_summary_ai || {}) as Record<string, unknown>;
            const top = (Array.isArray(blob.top_matches) ? blob.top_matches : []) as TopMatch[];
            const custom_fields: Record<string, unknown> = {};
            if (blob.gap_hook) custom_fields.gap_hook = blob.gap_hook;
            if (top[0]) custom_fields.match_1 = formatMatchLine(top[0]);
            if (top[1]) custom_fields.match_2 = formatMatchLine(top[1]);
            if (top[2]) custom_fields.match_3 = formatMatchLine(top[2]);
            if (top.length) custom_fields.match_count = top.length;
            return {
                email,
                first_name: parts[0] || null,
                last_name: parts.length > 1 ? parts.slice(1).join(" ") : null,
                company_name: r.company_name || null,
                state: r.state || null,
                naics_codes: Array.isArray(r.naics_codes) ? r.naics_codes : [],
                source: "sam_gov" as const,
                source_id: r.uei || null,
                tags: [`segment:${seg.key}`],
                custom_fields: Object.keys(custom_fields).length ? custom_fields : null,
            };
        })
        .filter(Boolean) as any[];

    if (!contacts.length) {
        return NextResponse.json({
            list_id: null,
            added: 0,
            message: "No emailable contractors in this segment yet — run Apollo enrichment first.",
        });
    }

    // 2. Insert new contacts (don't clobber existing rows).
    const { error: upErr } = await sb
        .from("outreach_contacts")
        .upsert(contacts, { onConflict: "email", ignoreDuplicates: true });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    // 3. Resolve all contact ids (new + pre-existing) by email.
    const emails = contacts.map((c) => c.email);
    const { data: idRows, error: idErr } = await sb
        .from("outreach_contacts")
        .select("id")
        .in("email", emails);
    if (idErr) return NextResponse.json({ error: idErr.message }, { status: 500 });

    // 4. Create the list.
    const stamp = new Date().toISOString().slice(0, 10);
    const { data: list, error: listErr } = await sb
        .from("outreach_lists")
        .insert({ name: `${seg.label} — ${stamp}`, description: seg.description, filter: { segment: seg.key } })
        .select("id")
        .single();
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

    // 5. Attach members + set count.
    const members = (idRows || []).map((c: any) => ({ list_id: list.id, contact_id: c.id }));
    if (members.length) {
        const { error: memErr } = await sb
            .from("outreach_list_members")
            .upsert(members, { onConflict: "list_id,contact_id", ignoreDuplicates: true });
        if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 });
        await sb.from("outreach_lists").update({ contact_count: members.length }).eq("id", list.id);
    }

    return NextResponse.json({ list_id: list.id, added: members.length });
}

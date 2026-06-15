/**
 * Cron / on-demand: re-run past Quick Checker leads and refresh their matches.
 *
 * 218 warm contacts (tag 'quick_checker') ran the public Quick Checker and left
 * an email. This re-scores each against CURRENT opportunities and writes the
 * top 3 into custom_fields.match_1/2/3 so the "We reran your check" template
 * can merge real, fresh deals. Highest-intent audience we have.
 *
 * Guarded; not on a Vercel schedule (cron ceiling is full) — fired by the
 * admin trigger (/api/admin/outreach/rerun-quick-checkers) or with CRON_SECRET.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { guardCron } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

/* eslint-disable @typescript-eslint/no-explicit-any */

function fmtMatch(o: any): string {
    const title = String(o.title || "Opportunity").slice(0, 70);
    const agency = o.agency ? ` — ${String(o.agency).slice(0, 40)}` : "";
    let due = "";
    if (o.response_deadline) {
        const d = new Date(o.response_deadline);
        if (!isNaN(d.getTime())) due = ` (due ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })})`;
    }
    return `${title}${agency}${due}`;
}

export async function GET(req: NextRequest) {
    const denied = guardCron(req);
    if (denied) return denied;

    const batch = Math.min(200, Math.max(1, parseInt(new URL(req.url).searchParams.get("batch") || "50", 10)));
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

    const { data: contacts, error } = await db
        .from("outreach_contacts")
        .select("id, naics_codes, custom_fields")
        .contains("tags", ["quick_checker"])
        .not("email", "is", null)
        .limit(batch);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!contacts?.length) return NextResponse.json({ ok: true, processed: 0, with_matches: 0 });

    // Resolve NAICS for the batch from the linked Quick Checker analyses.
    const analysisIds = contacts
        .map((c: any) => c.custom_fields?.analysis_id)
        .filter(Boolean);
    const analysisNaics = new Map<string, string[]>();
    if (analysisIds.length) {
        const { data: analyses } = await db
            .from("company_analyses")
            .select("id, inferred_profile")
            .in("id", analysisIds);
        for (const a of analyses || []) {
            const codes = (a as any).inferred_profile?.naics_codes;
            if (Array.isArray(codes) && codes.length) analysisNaics.set((a as any).id, codes.map(String));
        }
    }

    let withMatches = 0;
    for (const c of contacts as any[]) {
        const naics: string[] =
            analysisNaics.get(c.custom_fields?.analysis_id) ||
            (Array.isArray(c.naics_codes) ? c.naics_codes.map(String) : []);

        let matches: string[] = [];
        if (naics.length) {
            const { data: opps } = await db
                .from("opportunities")
                .select("title, agency, response_deadline, opportunity_score")
                .in("naics_code", naics)
                .eq("is_archived", false)
                .in("status", ["ACTIVE", "EXPIRING_SOON", "MARKET_RESEARCH"])
                .order("opportunity_score", { ascending: false, nullsFirst: false })
                .order("response_deadline", { ascending: true, nullsFirst: false })
                .limit(3);
            matches = (opps || []).map(fmtMatch);
        }

        const cf = { ...(c.custom_fields || {}) };
        // Clear stale slots so a re-run never leaves an old match behind.
        cf.match_1 = matches[0] || null;
        cf.match_2 = matches[1] || null;
        cf.match_3 = matches[2] || null;
        cf.matches_refreshed_at = new Date().toISOString();
        await db.from("outreach_contacts").update({ custom_fields: cf }).eq("id", c.id);
        if (matches.length) withMatches++;
    }

    return NextResponse.json({ ok: true, processed: contacts.length, with_matches: withMatches });
}

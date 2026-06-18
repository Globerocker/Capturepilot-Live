/**
 * /api/admin/cockpit/saved — the cockpit "Saved / shortlist" pins.
 *
 * GET  → { contractor_ids: string[], rows: { contractor_id, note, created_at }[] }
 *        the contractors the calling admin has starred. The cockpit uses
 *        contractor_ids to light up the star on each lead card; rows carry the
 *        optional note + when it was saved.
 *
 * POST { contractor_id, action: 'save' | 'unsave', note? }
 *        'save'   → upsert a pin (contractor_id, saved_by=caller) with the note.
 *        'unsave' → delete the caller's pin for that contractor.
 *        Returns { ok, saved: boolean }.
 *
 * Admin-gated via assertAdminWithUser() (we need the caller's id for saved_by,
 * which is also the unique-key second column). Service client bypasses RLS.
 *
 * See also: the leads route's source='saved' branch, which joins this table to
 * return only the caller's saved contractors as full LeadRows.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdminWithUser } from "@/lib/auth-admin";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const dynamic = "force-dynamic";

function svc() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

export async function GET() {
    const gate = await assertAdminWithUser();
    if (!gate.ok) return gate.response;

    const sb = svc();
    const { data, error } = await sb
        .from("cockpit_saved_contractors")
        .select("contractor_id, note, created_at")
        .eq("saved_by", gate.userId)
        .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data || []) as Array<{ contractor_id: string; note: string | null; created_at: string }>;
    return NextResponse.json({
        contractor_ids: rows.map((r) => r.contractor_id),
        rows,
    });
}

export async function POST(req: NextRequest) {
    const gate = await assertAdminWithUser();
    if (!gate.ok) return gate.response;

    let body: any = {};
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
    }

    const contractorId: string | undefined = body?.contractor_id;
    const action: string = String(body?.action || "save").toLowerCase();
    const note: string | null =
        typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;

    if (!contractorId) {
        return NextResponse.json({ error: "contractor_id required" }, { status: 400 });
    }
    if (action !== "save" && action !== "unsave") {
        return NextResponse.json({ error: "action must be 'save' or 'unsave'" }, { status: 400 });
    }

    const sb = svc();

    if (action === "unsave") {
        const { error } = await sb
            .from("cockpit_saved_contractors")
            .delete()
            .eq("contractor_id", contractorId)
            .eq("saved_by", gate.userId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true, saved: false });
    }

    // save → idempotent upsert on (contractor_id, saved_by). Re-saving updates the note.
    const { error } = await sb
        .from("cockpit_saved_contractors")
        .upsert(
            { contractor_id: contractorId, saved_by: gate.userId, note },
            { onConflict: "contractor_id,saved_by" },
        );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, saved: true });
}

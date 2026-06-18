/**
 * POST /api/admin/cockpit/keywords — edit a contractor's capability keywords.
 *
 * The cockpit shows a contractor's capability_keywords (the GIN-indexed text[]
 * column from migration 183) and lets a partner add/remove keywords — including
 * keywords pulled out of a sales-call note.
 *
 * Body: { contractor_id, add?: string[], remove?: string[] }
 *   - add/remove are lowercased + trimmed; blanks dropped.
 *   - The merged list is deduped (set semantics).
 *   - remove wins over add when a keyword is in both lists.
 *
 * Writes BOTH places so reverse-matching (uses the text[] column) and the QC
 * blob (capability_summary_ai.capability_keywords, read by the cockpit + scoring
 * profile builder) stay in sync:
 *   1. contractors.capability_keywords  (text[])
 *   2. contractors.capability_summary_ai.capability_keywords  (jsonb mirror)
 *
 * Returns { ok, capability_keywords: string[] } — the new list.
 *
 * Admin-gated via assertAdmin(). Service client for the read+write.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const dynamic = "force-dynamic";

function svc() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

/** Lowercase, trim, drop blanks. */
function norm(list: unknown): string[] {
    if (!Array.isArray(list)) return [];
    return list
        .map((k) => (typeof k === "string" ? k.toLowerCase().trim() : ""))
        .filter(Boolean);
}

/** Existing keywords from a text[] column (tolerates null / non-array). */
function existingKeywords(v: unknown): string[] {
    if (!Array.isArray(v)) return [];
    return v.map((k) => (typeof k === "string" ? k.toLowerCase().trim() : "")).filter(Boolean);
}

export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    let body: any = {};
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
    }

    const contractorId: string | undefined = body?.contractor_id;
    if (!contractorId) {
        return NextResponse.json({ error: "contractor_id required" }, { status: 400 });
    }

    const add = norm(body?.add);
    const remove = new Set(norm(body?.remove));
    if (add.length === 0 && remove.size === 0) {
        return NextResponse.json({ error: "nothing to add or remove" }, { status: 400 });
    }

    const sb = svc();

    // Load current keywords from BOTH places (column may lag the blob or vice versa).
    const { data: contractor, error: loadErr } = await sb
        .from("contractors")
        .select("id, capability_keywords, capability_summary_ai")
        .eq("id", contractorId)
        .maybeSingle();
    if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
    if (!contractor) return NextResponse.json({ error: "contractor not found" }, { status: 404 });

    const blob = (contractor.capability_summary_ai || {}) as any;

    // Merge the column + the blob mirror as the starting set, then apply add/remove.
    const current = new Set<string>([
        ...existingKeywords(contractor.capability_keywords),
        ...existingKeywords(blob.capability_keywords),
    ]);
    for (const k of add) current.add(k);
    for (const k of remove) current.delete(k);

    const merged = Array.from(current).sort();

    const { error: upErr } = await sb
        .from("contractors")
        .update({
            capability_keywords: merged,
            capability_summary_ai: { ...blob, capability_keywords: merged },
        })
        .eq("id", contractorId);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, capability_keywords: merged });
}

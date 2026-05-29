/**
 * POST /api/admin/leads/refetch-meta-fields?limit=50
 *
 * One-shot backfill — walks Meta leads that have null first_name/last_name/phone
 * and re-fetches the original field_data from the Facebook Graph API to
 * populate them. Used to recover from a webhook bug that wrote the row before
 * the form fields were extracted properly.
 *
 * Idempotent: existing values are not overwritten.
 * Dual auth: admin session OR CRON_SECRET bearer.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";
import { isAuthorizedCron } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 120;

interface FieldData { name: string; values: string[] }

interface MetaLead {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    company: string | null;
    meta_leadgen_id: string;
}

interface FixResult {
    lead_id: string;
    email: string;
    updated_fields: string[];
    error?: string;
}

export async function POST(req: NextRequest) {
    const isCron = isAuthorizedCron(req.headers.get("authorization"));
    if (!isCron) {
        const unauth = await assertAdmin();
        if (unauth) return unauth;
    }

    const token = process.env.META_SYSTEM_TOKEN;
    if (!token) return NextResponse.json({ error: "META_SYSTEM_TOKEN missing" }, { status: 500 });

    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 200);

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );

    // Eligible = Meta leads where at least one of name/phone is null.
    const { data: leads, error } = await sb
        .from("marketing_leads")
        .select("id, email, first_name, last_name, phone, company, meta_leadgen_id")
        .eq("source", "meta-lead-ad")
        .not("meta_leadgen_id", "is", null)
        .or("first_name.is.null,last_name.is.null,phone.is.null")
        .order("created_at", { ascending: false })
        .limit(limit) as { data: MetaLead[] | null; error: { message: string } | null };

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!leads || leads.length === 0) {
        return NextResponse.json({ processed: 0, updated: 0, results: [], note: "no eligible leads" });
    }

    const results: FixResult[] = [];
    for (const lead of leads) {
        const r: FixResult = { lead_id: lead.id, email: lead.email, updated_fields: [] };
        try {
            const res = await fetch(
                `https://graph.facebook.com/v21.0/${encodeURIComponent(lead.meta_leadgen_id)}?fields=field_data`,
                { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) },
            );
            if (!res.ok) {
                const body = await res.text().catch(() => "");
                r.error = `graph ${res.status}: ${body.slice(0, 160)}`;
                results.push(r);
                continue;
            }
            const data = await res.json() as { field_data?: FieldData[] };
            const lc: Record<string, string> = {};
            for (const f of data.field_data || []) lc[f.name.toLowerCase()] = f.values?.[0] || "";

            const fullName = (lc.full_name || `${lc.first_name || ""} ${lc.last_name || ""}`).trim();
            const firstName = (lc.first_name || (fullName ? fullName.split(" ")[0] : "")).trim();
            const lastName = (lc.last_name || (fullName.split(" ").length > 1 ? fullName.split(" ").slice(1).join(" ") : "")).trim();
            const phone = (lc.phone_number || lc.phone || lc.mobile_phone || lc.mobile || lc.cell_phone || lc.work_phone || "").trim();
            const company = (lc.company_name || lc.company || "").trim();

            const patch: Record<string, string> = {};
            if (!lead.first_name && firstName) { patch.first_name = firstName; r.updated_fields.push("first_name"); }
            if (!lead.last_name && lastName) { patch.last_name = lastName; r.updated_fields.push("last_name"); }
            if (!lead.phone && phone) { patch.phone = phone; r.updated_fields.push("phone"); }
            if (!lead.company && company) { patch.company = company; r.updated_fields.push("company"); }

            if (Object.keys(patch).length > 0) {
                const { error: upErr } = await sb.from("marketing_leads").update(patch).eq("id", lead.id);
                if (upErr) r.error = upErr.message;
            }
        } catch (e) {
            r.error = (e as Error).message.slice(0, 200);
        }
        results.push(r);
    }

    const updated = results.filter(r => r.updated_fields.length > 0).length;
    const errored = results.filter(r => r.error).length;
    return NextResponse.json({
        processed: results.length,
        updated,
        errored,
        results,
        note: `${updated} lead(s) had at least one field recovered from Graph API`,
    });
}

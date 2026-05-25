import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";
import { daysUntilExpiry } from "@/lib/connectors";

export const dynamic = "force-dynamic";

/**
 * Admin Connectors API.
 *
 * GET    /api/admin/connectors      — list registry rows + open alerts joined per connector.
 * PATCH  /api/admin/connectors      — body { id, expires_at?, rotation_days?, notes?, enabled? }
 *
 * The "rotate key" write-to-Vercel UX lives behind VERCEL_TOKEN and ships in
 * a follow-up route once that env var is set. This route is read-only +
 * metadata-edit until then.
 */

function db() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

export async function GET(_req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const sb = db();

    const [{ data: connectors }, { data: openAlerts }] = await Promise.all([
        sb.from("api_connectors")
          .select("id, slug, label, env_var_name, category, enabled, rotation_days, expires_at, docs_url, rotate_url, notes, last_check_at, last_status, last_detail, consecutive_fails")
          .order("category", { ascending: true })
          .order("label", { ascending: true }),
        sb.from("health_alerts")
          .select("id, connector_slug, alert_type, severity, title, detail, fired_at, emailed")
          .is("resolved_at", null)
          .order("fired_at", { ascending: false })
          .limit(200),
    ]);

    // Annotate each connector with derived fields (days_left + open_alerts).
    type Connector = {
        id: string; slug: string; label: string; env_var_name: string;
        category: string; enabled: boolean; rotation_days: number | null;
        expires_at: string | null; docs_url: string | null; rotate_url: string | null;
        notes: string | null; last_check_at: string | null; last_status: string | null;
        last_detail: string | null; consecutive_fails: number;
    };
    type Alert = { id: string; connector_slug: string; alert_type: string; severity: string; title: string; detail: string | null; fired_at: string; emailed: boolean };

    const alertsBySlug = new Map<string, Alert[]>();
    for (const a of ((openAlerts || []) as Alert[])) {
        if (!alertsBySlug.has(a.connector_slug)) alertsBySlug.set(a.connector_slug, []);
        alertsBySlug.get(a.connector_slug)!.push(a);
    }

    const enriched = ((connectors || []) as Connector[]).map((c) => ({
        ...c,
        days_left: daysUntilExpiry(c.expires_at),
        open_alerts: alertsBySlug.get(c.slug) || [],
    }));

    return NextResponse.json({
        connectors: enriched,
        open_alerts: openAlerts || [],
    });
}

export async function PATCH(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const body = await req.json();
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.expires_at !== undefined) update.expires_at = body.expires_at || null;
    if (body.rotation_days !== undefined) update.rotation_days = body.rotation_days || null;
    if (body.notes !== undefined) update.notes = body.notes || null;
    if (body.enabled !== undefined) update.enabled = Boolean(body.enabled);
    if (body.rotate_url !== undefined) update.rotate_url = body.rotate_url || null;
    if (body.docs_url !== undefined) update.docs_url = body.docs_url || null;

    const sb = db();
    const { data, error } = await sb.from("api_connectors").update(update).eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, connector: data });
}

export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const body = await req.json();
    const required = ["slug", "label", "env_var_name"];
    for (const f of required) {
        if (!body[f]) return NextResponse.json({ error: `missing ${f}` }, { status: 400 });
    }

    const sb = db();
    const { data, error } = await sb.from("api_connectors").insert({
        slug: body.slug,
        label: body.label,
        env_var_name: body.env_var_name,
        category: body.category || "integration",
        rotation_days: body.rotation_days || null,
        expires_at: body.expires_at || null,
        docs_url: body.docs_url || null,
        rotate_url: body.rotate_url || null,
        notes: body.notes || null,
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, connector: data });
}

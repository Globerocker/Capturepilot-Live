/**
 * POST /api/admin/alerts/resolve?id=<uuid>
 *
 * Marks a row in `health_alerts` (see migration 075) as resolved by the
 * calling admin. Optional body fields:
 *   - note?: string                  // free-text reason, stored on the row
 *   - confirm?: "RESOLVE"            // required when the alert is severity=critical
 *
 * Why we treat "resolve a critical alert" as destructive: critical alerts
 * gate the morning digest + can trigger paging in the future. Surfacing a
 * confirm token forces the UI to ask the operator twice before silently
 * hiding the failure from the rest of the team.
 *
 * Side-effects:
 *   1) UPDATE health_alerts SET resolved_at = now(), resolved_by, resolved_note
 *      WHERE id = ? AND resolved_at IS NULL  (idempotent)
 *   2) INSERT into alert_autofixes with status='fixed' and recipe_slug='manual_admin'
 *      so the daily digest "auto-fixed in last 24h" view still surfaces the
 *      action (the audit-log analog for the health subsystem — see the audit
 *      notes alongside migration 098).
 *
 * Returns { ok: true, alert_id, resolved_at } on success, { ok: false, error }
 * on rejection. Always returns 200 for "already resolved" so the UI can be
 * idempotent against double-clicks.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdminWithUser } from "@/lib/auth-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function db() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

export async function POST(req: NextRequest) {
    const gate = await assertAdminWithUser();
    if (!gate.ok) return gate.response;

    // ---------- Input validation ----------
    const id = (req.nextUrl.searchParams.get("id") || "").trim();
    if (!id || !UUID_RE.test(id)) {
        return NextResponse.json({ ok: false, error: "Valid alert id (uuid) is required as ?id=" }, { status: 400 });
    }

    let body: { note?: unknown; confirm?: unknown } = {};
    try {
        body = await req.json();
    } catch {
        body = {};
    }

    const note = typeof body.note === "string" ? body.note.slice(0, 500).trim() || null : null;
    const confirm = typeof body.confirm === "string" ? body.confirm : null;

    const sb = db();

    // ---------- Pre-flight: load the alert so we can enforce the confirm-token
    // requirement for severity=critical, and so we can return a stable shape
    // for the "already resolved" branch without a second round-trip.
    const { data: existing, error: loadErr } = await sb
        .from("health_alerts")
        .select("id, severity, resolved_at, connector_slug")
        .eq("id", id)
        .maybeSingle();

    if (loadErr) {
        console.error("[admin/alerts/resolve] load failed", { id, error: loadErr.message });
        return NextResponse.json({ ok: false, error: "Failed to load alert" }, { status: 500 });
    }
    if (!existing) {
        return NextResponse.json({ ok: false, error: "Alert not found" }, { status: 404 });
    }

    const row = existing as { id: string; severity: string; resolved_at: string | null; connector_slug: string | null };

    // Idempotent short-circuit — re-resolving a resolved alert is a no-op,
    // not an error, so the UI can be safely retried.
    if (row.resolved_at) {
        return NextResponse.json({
            ok: true,
            alert_id: row.id,
            resolved_at: row.resolved_at,
            already_resolved: true,
        });
    }

    // Destructive guard: critical alerts require the confirm token.
    if (row.severity === "critical" && confirm !== "RESOLVE") {
        return NextResponse.json({
            ok: false,
            error: "Confirmation required for critical alert. POST { confirm: 'RESOLVE' }.",
            requires_confirm: true,
        }, { status: 412 });
    }

    // ---------- Write ----------
    const resolvedAt = new Date().toISOString();
    try {
        const { error: updErr } = await sb
            .from("health_alerts")
            .update({
                resolved_at: resolvedAt,
                resolved_by: gate.userId,
                resolved_note: note,
                // Clear any active snooze so it doesn't linger in indexes.
                snoozed_until: null,
            })
            .eq("id", id)
            .is("resolved_at", null);

        if (updErr) {
            console.error("[admin/alerts/resolve] update failed", { id, error: updErr.message });
            return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
        }
    } catch (e) {
        console.error("[admin/alerts/resolve] update threw", { id, error: (e as Error).message });
        return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
    }

    // ---------- Audit log (alert_autofixes is the health-subsystem audit log
    // per migration 098; client_activity_log requires a user_profile_id and
    // would be wrong here since alerts are not user-scoped). Best-effort —
    // a write failure shouldn't undo the resolution.
    try {
        await sb.from("alert_autofixes").insert({
            alert_id: id,
            connector_slug: row.connector_slug,
            recipe_slug: "manual_admin",
            status: "fixed",
            action_taken: `Manually resolved by admin (${gate.email || gate.userId})${note ? `: ${note}` : ""}`,
            payload: { actor_id: gate.userId, actor_email: gate.email, severity: row.severity, note },
        });
    } catch (e) {
        console.error("[admin/alerts/resolve] audit insert failed", { id, error: (e as Error).message });
    }

    return NextResponse.json({
        ok: true,
        alert_id: id,
        resolved_at: resolvedAt,
        resolved_by: gate.userId,
    });
}

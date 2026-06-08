/**
 * POST /api/admin/alerts/snooze?id=<uuid>&hours=24
 *
 * Suppresses a row in `health_alerts` (see migration 075) from the morning
 * digest + self_heal cron for N hours by setting `snoozed_until`. Does NOT
 * resolve the alert — when the snooze elapses it surfaces again.
 *
 * Inputs (query string):
 *   - id: alert uuid                       (required)
 *   - hours: 1 | 4 | 24 | 72 | 168         (required, capped at 168 = 7d)
 *
 * Body (optional):
 *   - note?: string                         // free-text reason, persisted to alert_autofixes payload
 *   - confirm?: "SNOOZE"                    // required when hours > 24 (longer-than-1-day snoozes can hide real failures)
 *
 * Side-effects:
 *   1) UPDATE health_alerts SET snoozed_until = now() + hours, snoozed_by
 *      WHERE id = ? AND resolved_at IS NULL
 *   2) INSERT into alert_autofixes with status='escalated' + recipe_slug='manual_snooze'
 *      so the daily digest still shows the audit trail. Picking 'escalated'
 *      (not 'fixed') because snoozing is acknowledgement, not repair.
 *
 * Returns { ok, alert_id, snoozed_until } on success.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdminWithUser } from "@/lib/auth-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Whitelist of allowed snooze windows. Keeps the UI honest (no "snooze for
// 999 hours" smuggled in via dev-tools) and forces us to think before adding
// a longer option.
const ALLOWED_HOURS = new Set([1, 4, 24, 72, 168]);
const CONFIRM_THRESHOLD_HOURS = 24;

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

    const hoursRaw = req.nextUrl.searchParams.get("hours");
    const hours = Number(hoursRaw);
    if (!Number.isFinite(hours) || !ALLOWED_HOURS.has(hours)) {
        return NextResponse.json({
            ok: false,
            error: `Invalid hours value. Allowed: ${[...ALLOWED_HOURS].join(", ")}.`,
        }, { status: 400 });
    }

    let body: { note?: unknown; confirm?: unknown } = {};
    try {
        body = await req.json();
    } catch {
        body = {};
    }

    const note = typeof body.note === "string" ? body.note.slice(0, 500).trim() || null : null;
    const confirm = typeof body.confirm === "string" ? body.confirm : null;

    // Destructive guard: snoozes longer than a day can mask real failures
    // through the next business day, so require explicit confirmation.
    if (hours > CONFIRM_THRESHOLD_HOURS && confirm !== "SNOOZE") {
        return NextResponse.json({
            ok: false,
            error: `Confirmation required for snoozes longer than ${CONFIRM_THRESHOLD_HOURS}h. POST { confirm: 'SNOOZE' }.`,
            requires_confirm: true,
        }, { status: 412 });
    }

    const sb = db();

    // ---------- Pre-flight ----------
    const { data: existing, error: loadErr } = await sb
        .from("health_alerts")
        .select("id, severity, resolved_at, snoozed_until, connector_slug")
        .eq("id", id)
        .maybeSingle();

    if (loadErr) {
        console.error("[admin/alerts/snooze] load failed", { id, error: loadErr.message });
        return NextResponse.json({ ok: false, error: "Failed to load alert" }, { status: 500 });
    }
    if (!existing) {
        return NextResponse.json({ ok: false, error: "Alert not found" }, { status: 404 });
    }

    const row = existing as {
        id: string;
        severity: string;
        resolved_at: string | null;
        snoozed_until: string | null;
        connector_slug: string | null;
    };

    if (row.resolved_at) {
        return NextResponse.json({ ok: false, error: "Cannot snooze a resolved alert." }, { status: 409 });
    }

    // ---------- Write ----------
    const snoozedUntil = new Date(Date.now() + hours * 3_600_000).toISOString();
    try {
        const { error: updErr } = await sb
            .from("health_alerts")
            .update({
                snoozed_until: snoozedUntil,
                snoozed_by: gate.userId,
            })
            .eq("id", id)
            .is("resolved_at", null);

        if (updErr) {
            console.error("[admin/alerts/snooze] update failed", { id, error: updErr.message });
            return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
        }
    } catch (e) {
        console.error("[admin/alerts/snooze] update threw", { id, error: (e as Error).message });
        return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
    }

    // ---------- Audit log (alert_autofixes — see /resolve for rationale) ----------
    try {
        await sb.from("alert_autofixes").insert({
            alert_id: id,
            connector_slug: row.connector_slug,
            recipe_slug: "manual_snooze",
            status: "escalated",
            action_taken: `Snoozed ${hours}h by admin (${gate.email || gate.userId})${note ? `: ${note}` : ""}`,
            payload: {
                actor_id: gate.userId,
                actor_email: gate.email,
                severity: row.severity,
                hours,
                snoozed_until: snoozedUntil,
                previous_snoozed_until: row.snoozed_until,
                note,
            },
        });
    } catch (e) {
        console.error("[admin/alerts/snooze] audit insert failed", { id, error: (e as Error).message });
    }

    return NextResponse.json({
        ok: true,
        alert_id: id,
        snoozed_until: snoozedUntil,
        snoozed_by: gate.userId,
        hours,
    });
}

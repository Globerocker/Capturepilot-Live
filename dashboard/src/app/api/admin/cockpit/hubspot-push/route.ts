/**
 * POST /api/admin/cockpit/hubspot-push — the cockpit warm hand-off.
 *
 * After an admin/partner has worked a lead in the cockpit (reviewed the AI
 * message, maybe taken a discovery call), this pushes the lead into HubSpot as
 * a real, actionable record for the closer (Sergio):
 *
 *   1. Upsert the contact (email-keyed) with name / company / phone + lifecycle
 *      = "lead" so it lands in the SaaS pipeline's lead views.
 *   2. Create a NOTE on the contact combining the admin's notes + the call
 *      transcript + a short cockpit context block (top live match, ICP tier).
 *   3. Create a TASK assigned to Sergio (owner 88389389) due in 2 days so the
 *      hand-off never gets lost in a timeline.
 *   4. Optionally log a CALL when a transcript is supplied (shows under the
 *      contact's "Calls" filter, separate from the Note).
 *
 * Resilient by design: each HubSpot step is independently try/caught so a
 * failure in (say) the call-log doesn't lose the contact + note + task. The
 * response reports exactly which step succeeded.
 *
 * Admin-gated via assertAdmin(). Service client for the optional context reads.
 *
 * Body: {
 *   contractor_id?: string,    // contractors.id      — for cockpit context
 *   analysis_id?: string,      // company_analyses.id — inbound lead context
 *   email: string,             // required — HubSpot contact key
 *   first_name?: string,
 *   last_name?: string,
 *   company?: string,
 *   phone?: string,
 *   notes?: string,            // free-text the admin typed
 *   call_transcript?: string,  // discovery-call transcript / summary
 *   stage?: string,            // optional lifecyclestage override (default "lead")
 * }
 *
 * Returns: {
 *   ok: boolean,
 *   contact_id: string | null,
 *   note_id: string | null,
 *   task_id: string | null,
 *   call_id?: string | null,
 *   steps: { contact, note, task, call }  // per-step status + error
 * }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";
import {
    upsertHubSpotContact,
    createNoteForContact,
    createHubSpotTask,
    createCallForContact,
    splitContactName,
    COCKPIT_TASK_OWNER_ID,
} from "@/lib/hubspot";
import { computeIcpFit, icpTier } from "@/lib/icp-fit";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const maxDuration = 60;

interface StepStatus {
    ok: boolean;
    error?: string;
    skipped?: boolean;
}

function escapeHtml(s: unknown): string {
    return typeof s === "string"
        ? s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        : "";
}

// Render plain text into a HubSpot-friendly HTML paragraph block (preserves
// line breaks). HubSpot strips most CSS but keeps <p>/<br>.
function textToHtml(s: string): string {
    return escapeHtml(s).replace(/\n/g, "<br>");
}

// Lightweight cockpit context — pulled from the contractor / inbound-lead row so
// the closer opens HubSpot to "here's the top live match + why this firm fits"
// without bouncing back into the app. Best-effort: never blocks the push.
interface CockpitContext {
    top_match: { title: string; agency: string | null } | null;
    icp_score: number | null;
    icp_tier: "A" | "B" | "C" | null;
    result_url: string | null;
}

async function loadContractorContext(db: any, id: string): Promise<CockpitContext> {
    const { data } = await db
        .from("contractors")
        .select("company_name, certifications, sba_certifications, employee_count, federal_awards_count, capability_summary_ai")
        .eq("id", id)
        .maybeSingle();
    if (!data) return { top_match: null, icp_score: null, icp_tier: null, result_url: null };
    const blob = (data.capability_summary_ai || {}) as any;
    const top = Array.isArray(blob.top_matches) ? blob.top_matches : [];
    const icp = computeIcpFit(data);
    return {
        top_match: top[0]
            ? { title: String(top[0].title || "Untitled opportunity"), agency: top[0].agency ?? null }
            : null,
        icp_score: icp.score,
        icp_tier: icpTier(icp.score),
        result_url: null,
    };
}

async function loadAnalysisContext(db: any, id: string): Promise<CockpitContext> {
    const { data } = await db
        .from("company_analyses")
        .select("id, inferred_profile, preview_matches")
        .eq("id", id)
        .maybeSingle();
    if (!data) return { top_match: null, icp_score: null, icp_tier: null, result_url: null };
    const inferred = (data.inferred_profile || {}) as any;
    const preview = Array.isArray(data.preview_matches) ? data.preview_matches : [];
    // Inbound leads carry firmographics in inferred_profile — map onto the ICP
    // shape so the score is comparable to the contractor list.
    const icp = computeIcpFit({
        certifications: inferred.sba_certifications || inferred.certifications || [],
        sba_certifications: inferred.sba_certifications || [],
        employee_count: inferred.employee_count ?? null,
        federal_awards_count: inferred.federal_awards_count ?? 0,
    });
    const appBase = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "").replace(/\/$/, "");
    return {
        top_match: preview[0]
            ? { title: String(preview[0].title || "Untitled opportunity"), agency: preview[0].agency ?? null }
            : null,
        icp_score: icp.score,
        icp_tier: icpTier(icp.score),
        result_url: appBase ? `${appBase}/check/${data.id}` : `/check/${data.id}`,
    };
}

export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const contractor_id = typeof body.contractor_id === "string" ? body.contractor_id : undefined;
    const analysis_id = typeof body.analysis_id === "string" ? body.analysis_id : undefined;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const company = typeof body.company === "string" ? body.company : undefined;
    const phone = typeof body.phone === "string" ? body.phone : undefined;
    const notes = typeof body.notes === "string" ? body.notes : "";
    const callTranscript = typeof body.call_transcript === "string" ? body.call_transcript : "";
    const stage = typeof body.stage === "string" && body.stage ? body.stage : "lead";

    let firstName = typeof body.first_name === "string" ? body.first_name : undefined;
    let lastName = typeof body.last_name === "string" ? body.last_name : undefined;

    if (!email || !email.includes("@")) {
        return NextResponse.json({ ok: false, error: "valid email is required" }, { status: 400 });
    }

    // ── Best-effort cockpit context (top match + ICP tier) for the note ──────
    let ctx: CockpitContext = { top_match: null, icp_score: null, icp_tier: null, result_url: null };
    if (contractor_id || analysis_id) {
        try {
            const db = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_KEY!,
                { auth: { persistSession: false } },
            );
            ctx = contractor_id
                ? await loadContractorContext(db, contractor_id)
                : await loadAnalysisContext(db, analysis_id!);
        } catch (e) {
            // Context is enrichment, not a hard requirement — log + continue.
            console.warn("[cockpit/hubspot-push] context load failed:", e instanceof Error ? e.message : e);
        }
    }

    // If the caller didn't pass a name but we have a "company" we still upsert by
    // email; name stays whatever they sent (HubSpot keeps the existing value on a
    // null patch). No name-from-company guessing — keeps the contact clean.
    if (!firstName && !lastName) {
        const fromCompany = splitContactName(undefined); // no-op; preserves shape
        firstName = fromCompany.firstname;
        lastName = fromCompany.lastname;
    }

    const steps: Record<"contact" | "note" | "task" | "call", StepStatus> = {
        contact: { ok: false },
        note: { ok: false, skipped: true },
        task: { ok: false, skipped: true },
        call: { ok: false, skipped: true },
    };

    let contactId: string | null = null;
    let noteId: string | null = null;
    let taskId: string | null = null;
    let callId: string | null = null;

    // ── Step 1: upsert contact ───────────────────────────────────────────────
    try {
        contactId = await upsertHubSpotContact({
            email,
            firstname: firstName,
            lastname: lastName,
            phone,
            company,
            lifecyclestage: stage,
            extra: {
                lead_source_cp: "manual",
                // Mirror the cockpit ICP read so HubSpot lists can filter on it.
                ...(ctx.icp_score != null ? { readiness_score: ctx.icp_score } : {}),
            } as any,
        });
        if (contactId) {
            steps.contact = { ok: true };
        } else {
            steps.contact = { ok: false, error: "upsertHubSpotContact returned null (token unset or HubSpot rejected)" };
        }
    } catch (e) {
        steps.contact = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }

    // Without a contact there's nothing to associate notes/tasks/calls to —
    // bail early but return what we have so the UI can show the failure cause.
    if (!contactId) {
        return NextResponse.json({
            ok: false,
            contact_id: null,
            note_id: null,
            task_id: null,
            call_id: null,
            steps,
        });
    }

    const companyLabel = company || "this contractor";

    // ── Step 2: note (notes + transcript + cockpit context) ──────────────────
    const noteParts: string[] = [];
    noteParts.push(`<p><strong>📇 CapturePilot cockpit hand-off — ${escapeHtml(companyLabel)}</strong></p>`);
    if (ctx.icp_tier) {
        noteParts.push(`<p><strong>ICP fit:</strong> Tier ${ctx.icp_tier}${ctx.icp_score != null ? ` (${ctx.icp_score}/100)` : ""}</p>`);
    }
    if (ctx.top_match) {
        const agency = ctx.top_match.agency ? ` — ${escapeHtml(ctx.top_match.agency)}` : "";
        noteParts.push(`<p><strong>Top live match:</strong> ${escapeHtml(ctx.top_match.title)}${agency}</p>`);
    }
    if (ctx.result_url) {
        noteParts.push(`<p>🔗 Quick Checker results: <a href="${escapeHtml(ctx.result_url)}">${escapeHtml(ctx.result_url)}</a></p>`);
    }
    if (notes.trim()) {
        noteParts.push(`<p><strong>Notes</strong></p><p>${textToHtml(notes.trim())}</p>`);
    }
    if (callTranscript.trim()) {
        noteParts.push(`<p><strong>Call transcript / summary</strong></p><p>${textToHtml(callTranscript.trim())}</p>`);
    }
    noteParts.push(`<hr><p><em>Pushed from CapturePilot cockpit · ${new Date().toUTCString()}</em></p>`);

    // Only create a note when there's real content beyond the header (notes,
    // transcript, a match, or an ICP read). A header-only note is noise.
    const hasNoteContent = Boolean(notes.trim() || callTranscript.trim() || ctx.top_match || ctx.icp_tier);
    if (hasNoteContent) {
        try {
            const res = await createNoteForContact(contactId, noteParts.join(""));
            noteId = res?.id || null;
            steps.note = noteId ? { ok: true } : { ok: false, error: "note create returned null" };
        } catch (e) {
            steps.note = { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
    }

    // ── Step 3: follow-up task for Sergio (due +2 days) ──────────────────────
    try {
        const matchLine = ctx.top_match
            ? `Top live match: ${ctx.top_match.title}${ctx.top_match.agency ? ` (${ctx.top_match.agency})` : ""}.`
            : "No live match captured — lead with the gap from the cockpit.";
        const tierLine = ctx.icp_tier ? ` ICP tier ${ctx.icp_tier}${ctx.icp_score != null ? ` (${ctx.icp_score}/100)` : ""}.` : "";
        const taskBody = [
            `Warm hand-off from the CapturePilot cockpit for ${companyLabel} (${email}).`,
            matchLine + tierLine,
            notes.trim() ? `\nNotes: ${notes.trim()}` : "",
            callTranscript.trim() ? "\nDiscovery call transcript is logged on the contact." : "",
            "\nReview the contact note and reach out.",
        ].filter(Boolean).join("\n");

        const res = await createHubSpotTask({
            subject: `Follow up: ${companyLabel}`,
            body: taskBody,
            contactId,
            ownerId: COCKPIT_TASK_OWNER_ID,
            dueAt: Date.now() + 2 * 24 * 60 * 60 * 1000,
            status: "NOT_STARTED",
        });
        taskId = res?.id || null;
        steps.task = taskId ? { ok: true } : { ok: false, error: "task create returned null" };
    } catch (e) {
        steps.task = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }

    // ── Step 4: optional call log (only when a transcript is supplied) ───────
    if (callTranscript.trim()) {
        try {
            const res = await createCallForContact({
                contactId,
                body: callTranscript.trim(),
                title: `Discovery call — ${companyLabel}`,
            });
            callId = res?.id || null;
            steps.call = callId ? { ok: true } : { ok: false, error: "call create returned null" };
        } catch (e) {
            steps.call = { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
    }

    // ok = the contact landed AND the follow-up task (the actionable artifact)
    // landed. Note/call are enrichment — their failure shouldn't read as a
    // total failure since the closer still has a contact + task.
    const ok = steps.contact.ok && steps.task.ok;

    return NextResponse.json({
        ok,
        contact_id: contactId,
        note_id: noteId,
        task_id: taskId,
        call_id: callId,
        steps,
    });
}

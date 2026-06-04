/**
 * HubSpot Strategic-Brief push (Phase 5 of the Quick Checker overhaul).
 *
 * After a Quick Checker run completes, this module:
 *   1. Upserts the contact (email-keyed) with firmographic + readiness data.
 *   2. Creates a Note on that contact containing the full strategic brief
 *      — top 5 matches, strengths, weaknesses, pitch_angles, certs
 *      verified vs claimed — so the sales rep can open HubSpot and have
 *      a call-ready POV without bouncing back into the app.
 *
 * Why a Note (not custom properties): properties require pre-creation in
 * the HubSpot portal and break silently when the user hasn't added them.
 * A Note is a built-in object every HubSpot account supports — body is
 * rich HTML, appears in the contact timeline, no portal-config required.
 * If we later want individual fields searchable, we layer custom
 * properties on top — this just lights up the brief immediately.
 *
 * Fire-and-forget: any failure here is logged and swallowed. Never
 * blocks the Quick Checker pipeline.
 */

import { upsertHubSpotContact } from "@/lib/hubspot";
import type { ReconciledProfile } from "@/lib/quick-checker/reconcile";

const HUBSPOT_TOKEN =
    process.env.HUBSPOT_API_KEY ||
    process.env.HUBSPOT_ACCESS_TOKEN ||
    process.env.HUBSPOT_PRIVATE_APP_TOKEN ||
    "";
const BASE = "https://api.hubapi.com";

export interface QuickCheckerBriefInput {
    /** Lead's email — used to upsert the HubSpot contact. */
    email: string;
    /** Company name as the user knows it. */
    companyName: string;
    /** Lead's name (best-effort split into first/last). */
    contactName?: string | null;
    /** Optional phone for the contact. */
    contactPhone?: string | null;
    /** Optional website. */
    website?: string | null;
    /** Public /check/<id> URL — included in the Note for one-click access. */
    quickCheckerUrl?: string | null;
    /** 0-100 readiness score from quick-checker. */
    readinessScore?: number | null;
    /** Top matches surface — typically top 5. */
    topMatches?: Array<{
        title?: string | null;
        agency?: string | null;
        set_aside_code?: string | null;
        score?: number;
        eligibility?: "eligible" | "not_eligible_cert" | "not_eligible_size";
        required_certifications?: string[];
        notice_id?: string | null;
    }>;
    /** Phase 2 strategic-positioning extracts. */
    strengths?: string[];
    weaknesses?: string[];
    pitchAngles?: string[];
    nailDownKeywords?: string[];
    revenueSignal?: string | null;
    federalAgenciesServed?: string[];
    /** Phase 3 reconciled certs (verified vs crawl-claimed). */
    reconciled?: ReconciledProfile | null;
    /** Optional industry / NAICS shortlist for the contact card. */
    naicsCodes?: string[];
}

/**
 * Format the strategic brief into HubSpot-ready HTML.
 * Built for the Note timeline — readable on web + mobile. Uses simple
 * inline tags only because HubSpot strips most CSS classes.
 */
function formatBriefHtml(input: QuickCheckerBriefInput): string {
    const sections: string[] = [];

    const safe = (s: unknown): string =>
        typeof s === "string"
            ? s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            : "";

    const list = (items: string[] | undefined, fallback: string): string => {
        if (!items || items.length === 0) return `<em>${fallback}</em>`;
        return `<ul>${items.map(i => `<li>${safe(i)}</li>`).join("")}</ul>`;
    };

    // ── Header ─────────────────────────────────────────────────────────
    sections.push(`<p><strong>📋 Quick Checker Strategic Brief — ${safe(input.companyName)}</strong></p>`);
    if (input.quickCheckerUrl) {
        sections.push(`<p>🔗 Full report: <a href="${safe(input.quickCheckerUrl)}">${safe(input.quickCheckerUrl)}</a></p>`);
    }
    if (typeof input.readinessScore === "number") {
        const band = input.readinessScore >= 70 ? "🟢 High" : input.readinessScore >= 40 ? "🟡 Medium" : "🔴 Low";
        sections.push(`<p><strong>Federal Readiness:</strong> ${input.readinessScore}/100 (${band})</p>`);
    }

    // ── Strengths / Weaknesses / Pitch Angles ──────────────────────────
    sections.push(`<p><strong>💪 Strengths (lead with these)</strong></p>${list(input.strengths, "No specific strengths surfaced — review website manually.")}`);
    sections.push(`<p><strong>⚠️ Weaknesses to address</strong></p>${list(input.weaknesses, "No specific gaps surfaced.")}`);
    sections.push(`<p><strong>🎯 Pitch angles for the discovery call</strong></p>${list(input.pitchAngles, "No pitch angles generated — fall back to generic capture pitch.")}`);

    // ── Keywords ───────────────────────────────────────────────────────
    if (input.nailDownKeywords && input.nailDownKeywords.length > 0) {
        sections.push(`<p><strong>🔑 What they actually do</strong>: ${input.nailDownKeywords.map(safe).join(" · ")}</p>`);
    }

    // ── Reconciled certifications ──────────────────────────────────────
    if (input.reconciled) {
        const verified = input.reconciled.verified_certifications;
        const unverified = input.reconciled.crawl_claimed_unverified;
        if (verified.length > 0 || unverified.length > 0) {
            const parts: string[] = ["<p><strong>🏅 Certifications</strong></p>"];
            if (verified.length > 0) parts.push(`<p>✅ Verified in SAM: ${verified.map(safe).join(", ")}</p>`);
            if (unverified.length > 0) {
                parts.push(`<p>⚠️ Claimed on website but NOT in SAM (do not pitch as eligible): ${unverified.map(safe).join(", ")}</p>`);
            }
            sections.push(parts.join(""));
        }
        if (input.reconciled.federal_revenue_lifetime.value) {
            const total = input.reconciled.federal_revenue_lifetime.value;
            const formatted = total >= 1_000_000
                ? `$${(total / 1_000_000).toFixed(1)}M`
                : total >= 1_000
                    ? `$${(total / 1_000).toFixed(0)}K`
                    : `$${total}`;
            sections.push(`<p><strong>💰 Past federal revenue (USAspending):</strong> ${formatted} lifetime across ${input.reconciled.federal_award_count.value ?? "?"} awards</p>`);
        }
        if (input.reconciled.sam_active) {
            sections.push(`<p>✅ <strong>SAM Active</strong> · UEI ${safe(input.reconciled.uei.value || "—")}</p>`);
        } else {
            sections.push(`<p>❌ <strong>Not SAM-registered</strong> — they cannot bid federal until they register. Lead with this.</p>`);
        }
    }

    if (input.revenueSignal) {
        sections.push(`<p><strong>📊 Revenue signal:</strong> ${safe(input.revenueSignal)}</p>`);
    }
    if (input.federalAgenciesServed && input.federalAgenciesServed.length > 0) {
        sections.push(`<p><strong>🏛️ Past federal agencies:</strong> ${input.federalAgenciesServed.map(safe).join(", ")}</p>`);
    }

    // ── Top matches ────────────────────────────────────────────────────
    if (input.topMatches && input.topMatches.length > 0) {
        sections.push(`<p><strong>🎯 Top ${Math.min(5, input.topMatches.length)} matches</strong></p>`);
        const rows = input.topMatches.slice(0, 5).map((m, i) => {
            const ineligible = m.eligibility && m.eligibility !== "eligible";
            const lockNote = ineligible
                ? ` ⚠️ <em>Not eligible (${m.eligibility === "not_eligible_size" ? "too large" : `needs ${(m.required_certifications || []).join("/")}`})</em>`
                : "";
            const samLink = m.notice_id && /^[0-9a-f]{32}$/i.test(m.notice_id)
                ? ` · <a href="https://sam.gov/opp/${safe(m.notice_id)}/view">SAM.gov</a>`
                : "";
            const setAside = m.set_aside_code ? ` · ${safe(m.set_aside_code)}` : "";
            const score = typeof m.score === "number" ? ` (${Math.round(m.score * 100)}% fit)` : "";
            return `<li>#${i + 1} <strong>${safe(m.title || "Untitled")}</strong>${score} — ${safe(m.agency || "Unknown agency")}${setAside}${samLink}${lockNote}</li>`;
        }).join("");
        sections.push(`<ol>${rows}</ol>`);
    }

    // ── Footer ─────────────────────────────────────────────────────────
    sections.push(`<hr><p><em>Generated by CapturePilot Quick Checker · ${new Date().toUTCString()}</em></p>`);
    return sections.join("");
}

/**
 * Create a Note on a HubSpot contact. Returns the note ID on success or
 * null on any failure. HubSpot Notes API:
 *   POST /crm/v3/objects/notes  → { id }
 *   POST /crm/v3/objects/notes/{noteId}/associations/contacts/{contactId}/note_to_contact
 */
async function createNoteOnContact(contactId: string, htmlBody: string): Promise<string | null> {
    if (!HUBSPOT_TOKEN) return null;
    try {
        const res = await fetch(`${BASE}/crm/v3/objects/notes`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${HUBSPOT_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                properties: {
                    hs_note_body: htmlBody,
                    hs_timestamp: new Date().toISOString(),
                },
                associations: [
                    {
                        to: { id: contactId },
                        // Association type id 202 = "Note to Contact" per HubSpot's
                        // default associations spec. Stable across portals.
                        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }],
                    },
                ],
            }),
            signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) {
            const txt = await res.text().catch(() => "");
            console.error(`[HubSpot] note create ${res.status}:`, txt.slice(0, 300));
            return null;
        }
        const json = await res.json() as { id?: string };
        return json.id || null;
    } catch (err) {
        console.error("[HubSpot] note create exception:", err instanceof Error ? err.message : err);
        return null;
    }
}

function splitName(full?: string | null): { firstname?: string; lastname?: string } {
    if (!full) return {};
    const t = full.trim();
    if (!t) return {};
    const parts = t.split(/\s+/);
    if (parts.length === 1) return { firstname: parts[0] };
    return { firstname: parts[0], lastname: parts.slice(1).join(" ") };
}

/**
 * Push the full strategic brief to HubSpot — upsert the contact, create
 * the note. Returns the HubSpot contact ID + note ID for downstream logging.
 */
export async function pushQuickCheckerBriefToHubSpot(input: QuickCheckerBriefInput): Promise<{
    contact_id: string | null;
    note_id: string | null;
    skipped_reason?: string;
}> {
    if (!HUBSPOT_TOKEN) {
        return { contact_id: null, note_id: null, skipped_reason: "HUBSPOT_TOKEN not configured" };
    }
    if (!input.email) {
        return { contact_id: null, note_id: null, skipped_reason: "No email — cannot upsert contact" };
    }

    const { firstname, lastname } = splitName(input.contactName);

    const contactId = await upsertHubSpotContact({
        email: input.email,
        firstname,
        lastname,
        phone: input.contactPhone || undefined,
        company: input.companyName,
        lifecyclestage: "lead",
        extra: {
            quick_checker_url: input.quickCheckerUrl || undefined,
            readiness_score: typeof input.readinessScore === "number" ? input.readinessScore : undefined,
            naics_codes: (input.naicsCodes || []).slice(0, 5).join(", ") || undefined,
            uei: input.reconciled?.uei.value || undefined,
            business_state: input.reconciled?.state.value || undefined,
            sam_registered: input.reconciled?.sam_active,
            veteran_owned: (input.reconciled?.verified_certifications || []).some(c =>
                c.toUpperCase() === "VOSB" || c.toUpperCase() === "SDVOSB",
            ),
            matched_opportunities_count: input.topMatches?.length,
            lead_source_cp: "quick_checker",
        },
    });

    if (!contactId) {
        return { contact_id: null, note_id: null, skipped_reason: "upsertHubSpotContact returned null" };
    }

    const noteId = await createNoteOnContact(contactId, formatBriefHtml(input));

    return { contact_id: contactId, note_id: noteId };
}

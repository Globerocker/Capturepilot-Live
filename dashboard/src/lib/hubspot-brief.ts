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
    /** Phase 22 — firmographic cascade output (Apollo employees/revenue/etc). */
    firmographics?: {
        employee_count?: { value: number | null; source: string };
        revenue?: { value: number | null; source: string };
        founded_year?: { value: number | null; source: string };
        industries?: { value: string[] | null; source: string };
    } | null;
    /** Contact job title (e.g. "CEO", "Founder"). */
    contactJobTitle?: string | null;
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
 * Map the freeform certifications we store internally to the canonical
 * HubSpot dropdown_key values (see docs/certifications-and-clearances.md).
 * Returns unique entries. Unknown inputs are dropped silently.
 */
function toCertDropdownKeys(certs: string[]): string[] {
    const out = new Set<string>();
    for (const raw of certs) {
        const s = (raw || "").toUpperCase().replace(/[()\s]/g, "");
        if (!s) continue;
        const map: Record<string, string> = {
            "8A": "EIGHT_A", "8AA": "EIGHT_A",
            "HUBZONE": "HUBZONE",
            "WOSB": "WOSB", "EDWOSB": "EDWOSB",
            "VOSB": "VOSB", "SDVOSB": "SDVOSB",
            "SDB": "SDB",
            "SBASMALLBUSINESS": "SBA_SMALL_BUSINESS", "SBA": "SBA_SMALL_BUSINESS",
            "DBE": "DBE", "MBE": "MBE_STATE",
            "MENTORPROTEGE": "MENTOR_PROTEGE",
            "NATIVEAMERICANOWNED": "NATIVE_AMERICAN_OWNED",
            "TRIBAL8A": "TRIBAL_8A", "ANC8A": "ANC_8A", "NHO8A": "NHO_8A",
        };
        if (map[s]) out.add(map[s]);
    }
    return Array.from(out);
}

/**
 * Best-effort domain extraction. Accepts URL or email; strips protocol,
 * www., trailing slash + path. Returns null on garbage.
 */
function extractDomain(websiteOrEmail?: string | null): string | null {
    if (!websiteOrEmail) return null;
    const s = String(websiteOrEmail).trim();
    if (!s) return null;
    if (s.includes("@")) {
        const part = s.split("@")[1] || "";
        return part.toLowerCase() || null;
    }
    try {
        const url = s.match(/^https?:\/\//) ? s : `https://${s}`;
        const h = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
        return h || null;
    } catch {
        return null;
    }
}

/**
 * Phase 21 — Contact ↔ Company sync.
 *
 * Upserts a HubSpot Company keyed on `domain`, populates the same CP custom
 * properties we write to the contact (cp_set_aside_certifications,
 * cp_security_clearance, cp_set_asides_verified_by, cp_uei, cp_naics_codes,
 * cp_readiness_score, cp_sam_registered, cp_quick_checker_url) + standard
 * HubSpot fields (name, domain, numberofemployees, industry,
 * year_founded, state). Then associates the contact to this company.
 *
 * HubSpot also runs its own auto-create-company-from-email-domain rule —
 * we lookup by domain first and reuse the existing company in that case
 * rather than creating a duplicate. Falls back to creation when nothing
 * matches. Best-effort: failures log + skip.
 *
 * Returns the company ID on success or null on any failure / no domain.
 */
async function syncCompanyForContact(args: {
    contactId: string;
    domain: string;
    companyName: string;
    properties: Record<string, string>;
}): Promise<string | null> {
    if (!HUBSPOT_TOKEN || !args.domain) return null;

    // 1) Search for an existing company by domain
    let companyId: string | null = null;
    try {
        const sres = await fetch(`${BASE}/crm/v3/objects/companies/search`, {
            method: "POST",
            headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                filterGroups: [{ filters: [{ propertyName: "domain", operator: "EQ", value: args.domain }] }],
                properties: ["domain", "name"],
                limit: 1,
            }),
            signal: AbortSignal.timeout(10_000),
        });
        if (sres.ok) {
            const sjson = await sres.json() as { results?: Array<{ id?: string }> };
            companyId = sjson.results?.[0]?.id || null;
        }
    } catch (err) {
        console.warn("[HubSpot] company search failed:", err instanceof Error ? err.message : err);
    }

    // 2) Create or update
    const properties: Record<string, string> = {
        name: args.companyName,
        domain: args.domain,
        ...args.properties,
    };

    try {
        if (companyId) {
            const ures = await fetch(`${BASE}/crm/v3/objects/companies/${companyId}`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}`, "Content-Type": "application/json" },
                body: JSON.stringify({ properties }),
                signal: AbortSignal.timeout(10_000),
            });
            if (!ures.ok) {
                const t = await ures.text().catch(() => "");
                console.warn(`[HubSpot] company update ${ures.status}:`, t.slice(0, 200));
            }
        } else {
            const cres = await fetch(`${BASE}/crm/v3/objects/companies`, {
                method: "POST",
                headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}`, "Content-Type": "application/json" },
                body: JSON.stringify({ properties }),
                signal: AbortSignal.timeout(10_000),
            });
            if (cres.ok) {
                const cjson = await cres.json() as { id?: string };
                companyId = cjson.id || null;
            } else {
                const t = await cres.text().catch(() => "");
                console.warn(`[HubSpot] company create ${cres.status}:`, t.slice(0, 200));
            }
        }
    } catch (err) {
        console.warn("[HubSpot] company upsert failed:", err instanceof Error ? err.message : err);
    }

    if (!companyId) return null;

    // 3) Associate contact → company (Primary Company). associationTypeId 1
    //    = "Contact to Company" (Primary). HubSpot dedupes if already linked.
    try {
        await fetch(`${BASE}/crm/v4/objects/contacts/${args.contactId}/associations/companies/${companyId}`, {
            method: "PUT",
            headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify([{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 1 }]),
            signal: AbortSignal.timeout(10_000),
        });
    } catch (err) {
        console.warn("[HubSpot] contact→company association failed:", err instanceof Error ? err.message : err);
    }

    return companyId;
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
    // Reject obviously-broken emails before hitting HubSpot — bulk backfill
    // surfaced rows like "contracts.786-477-0477hello@govconedu.comlearngovcon"
    // (scraped concatenation of phone + email + page text). HubSpot rejects
    // anyway, this just spares the wasted POST + the 400-log noise.
    const cleanEmail = input.email.trim().toLowerCase();
    const emailOk = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(cleanEmail)
        && cleanEmail.length <= 100
        && (cleanEmail.match(/@/g) || []).length === 1
        && !/[^\w.+\-@]/.test(cleanEmail.replace(/[@.]/g, ""));
    if (!emailOk) {
        return { contact_id: null, note_id: null, skipped_reason: `Invalid email: ${input.email}` };
    }
    input = { ...input, email: cleanEmail };

    const { firstname, lastname } = splitName(input.contactName);

    // Phase 21 — reconcile cert sources into the dropdown_key strings
    // HubSpot's multi-select expects. Verified SAM > crawl-claimed, with
    // a provenance flag so the rep can SEE which list to trust.
    const verifiedCerts = toCertDropdownKeys(input.reconciled?.verified_certifications || []);
    const claimedCerts  = toCertDropdownKeys(input.reconciled?.crawl_claimed_unverified || []);
    const allCertKeys   = Array.from(new Set([...verifiedCerts, ...claimedCerts]));
    const certProvenance = verifiedCerts.length > 0 ? "SAM" : (claimedCerts.length > 0 ? "CRAWL" : "MANUAL");

    // Phase 22 — write HubSpot STANDARD properties so sales reps don't have
    // to dig through custom fields. industry, numberofemployees,
    // annualrevenue, jobtitle, hs_analytics_source_data_1 ("Quick Checker"
    // — appears in the Last Traffic Source Drill-Down column), hs_lead_status
    // ("NEW"), state — all map to HubSpot defaults that ship with every
    // contact view. Customs (cp_*) only used when no standard equivalent exists.
    const empCount = (input.firmographics as { employee_count?: { value?: number | null } } | undefined)?.employee_count?.value || undefined;
    const revenueDollars = (input.firmographics as { revenue?: { value?: number | null } } | undefined)?.revenue?.value || undefined;
    const inferredIndustry = (input.firmographics as { industries?: { value?: string[] | null } } | undefined)?.industries?.value?.[0] || undefined;

    const contactId = await upsertHubSpotContact({
        email: input.email,
        firstname,
        lastname,
        phone: input.contactPhone || undefined,
        company: input.companyName,
        lifecyclestage: "lead",
        extra: {
            // ── Standard HubSpot CONTACT properties (Phase 22 audit) ──
            // Note: hs_analytics_source* are READ-ONLY on contacts (tracker-
            // controlled). numberofemployees lives on company only.
            // `industry` is a closed enum (~150 values) — Apollo strings
            // like "electrical/electronic manufacturing" don't match, so
            // we route those to the company via hs_keywords. Use
            // lead_source_cp custom prop to mark Quick Checker origin.
            hs_lead_status: "NEW",
            annualrevenue: revenueDollars,
            jobtitle: input.contactJobTitle || undefined,
            state: input.reconciled?.state.value || undefined,
            website: input.website || undefined,
            // ── Custom CP properties (no standard equivalent) ──
            quick_checker_url: input.quickCheckerUrl || undefined,
            readiness_score: typeof input.readinessScore === "number" ? input.readinessScore : undefined,
            naics_codes: (input.naicsCodes || []).slice(0, 5).join(", ") || undefined,
            uei: input.reconciled?.uei.value || undefined,
            business_state: input.reconciled?.state.value || undefined,
            sam_registered: input.reconciled?.sam_active,
            cp_set_aside_certifications: allCertKeys.length > 0 ? allCertKeys.join(";") : undefined,
            cp_set_asides_verified_by: allCertKeys.length > 0 ? certProvenance : undefined,
            veteran_owned: (input.reconciled?.verified_certifications || []).some(c =>
                c.toUpperCase() === "VOSB" || c.toUpperCase() === "SDVOSB",
            ),
            matched_opportunities_count: input.topMatches?.length,
            lead_source_cp: "quick_checker",
        } as Record<string, unknown>,
    });

    if (!contactId) {
        return { contact_id: null, note_id: null, skipped_reason: "upsertHubSpotContact returned null" };
    }

    // ── Phase 21 — Contact ↔ Company sync ──
    // Mirror the CP custom properties onto the company so company-level
    // segmentation works in HubSpot reports without the rep having to
    // re-key data on both objects. Domain is the dedupe key.
    const domain = extractDomain(input.website) || extractDomain(input.email);
    if (domain) {
        const companyProps: Record<string, string> = {};

        // ── HubSpot STANDARD company fields (Phase 22) ──
        // These show up in the default company view and feed every HubSpot
        // report. NOTE: `industry` is a CLOSED enum (~150 standard values)
        // — arbitrary strings like "electrical/electronic manufacturing"
        // get rejected. Skip it and stash the industry string in
        // hs_keywords alongside the NAICS codes, where free text is OK.
        // Same with hs_analytics_source* — read-only on contact, writable
        // on company per HubSpot's docs.
        companyProps.lifecyclestage = "lead";
        companyProps.hs_lead_status = "NEW";
        if (empCount)                      companyProps.numberofemployees = String(empCount);
        if (revenueDollars)                companyProps.annualrevenue = String(revenueDollars);
        const foundedYear = (input.firmographics as { founded_year?: { value?: number | null } } | undefined)?.founded_year?.value;
        if (foundedYear)                   companyProps.founded_year = String(foundedYear);
        if (input.reconciled?.state.value) companyProps.state = input.reconciled.state.value;
        if (input.website)                 companyProps.website = input.website;
        // hs_keywords looked like the right home for industry + NAICS, but
        // this HubSpot account has it locked to a custom enum too. Stash
        // both in cp_naics_codes (custom text) below — no standard field
        // accepts arbitrary text on this portal.
        // Description: short strategic brief — leads with strengths so the
        // rep sees the pitch angle the moment they open the company.
        if (input.strengths && input.strengths.length > 0) {
            const strengthSummary = input.strengths.slice(0, 3).map(s => `• ${s}`).join("\n");
            companyProps.description = `Federal-contracting profile (CapturePilot):\n${strengthSummary}\n\nFull brief: ${input.quickCheckerUrl || "see contact notes"}`;
        }

        // ── Custom CP company props (no standard equivalent) ──
        if (allCertKeys.length > 0) {
            companyProps.cp_set_aside_certifications = allCertKeys.join(";");
            companyProps.cp_set_asides_verified_by   = certProvenance;
        }
        if (input.reconciled?.uei.value)       companyProps.cp_uei = input.reconciled.uei.value;
        if ((input.naicsCodes || []).length)   companyProps.cp_naics_codes = input.naicsCodes!.slice(0, 5).join(", ");
        if (typeof input.readinessScore === "number") companyProps.cp_readiness_score = String(input.readinessScore);
        if (input.reconciled?.sam_active !== undefined) companyProps.cp_sam_registered = String(!!input.reconciled.sam_active);
        if (input.quickCheckerUrl)             companyProps.cp_quick_checker_url = input.quickCheckerUrl;

        await syncCompanyForContact({
            contactId,
            domain,
            companyName: input.companyName,
            properties: companyProps,
        });
    }

    const noteId = await createNoteOnContact(contactId, formatBriefHtml(input));

    return { contact_id: contactId, note_id: noteId };
}

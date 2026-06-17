/**
 * POST /api/admin/cockpit/enrich — on-demand "Pro AI enrich" for ONE contractor
 * from the cockpit lead queue.
 *
 * SMARTER ENRICHMENT (v2): finds MORE per contractor by deriving a website from
 * a company email and crawling it for contact info, on top of the existing
 * firmographic cascade + LinkedIn finder.
 *
 * Sub-steps (each independently try/caught — a slow/failed third-party never
 * fails the whole request):
 *   0. DERIVE WEBSITE FROM EMAIL — if the row has NO website (website +
 *      business_url both empty) but has a company email (email or
 *      primary_poc_email that is NOT a free webmail/ISP provider), derive
 *      website = 'https://' + emailDomain and persist it to contractors.website
 *      (only when it was empty). This unlocks the crawl below for the ~thousands
 *      of email-only rows.
 *   1. CRAWL FOR CONTACT INFO — when a website is now known (existing or
 *      derived), best-effort crawl the homepage + the best contact/about/team
 *      sub-page (reusing the Quick Checker scrapePage cascade + the
 *      libphonenumber/RFC-5322 contact extractors). Fills primary_poc_phone
 *      (when empty), primary_poc_title (when empty) and improves
 *      primary_poc_name (only when the existing value is missing/weak).
 *   2. FIRMOGRAPHIC CASCADE (Apollo → SAM → OpenCorporates → Wayback) via the
 *      shared enrichFirmographics() helper — fills employee_count /
 *      years_in_business that the QC crawl couldn't extract.
 *   3. Owner/CEO LinkedIn finder (Brave-primary, DuckDuckGo-fallback) for the
 *      contractor's primary POC.
 *
 * Write-back rules (mirrors the Phase-8 cascade in quick-checker-finish):
 *   - Only OVERWRITE a column when the new value is REAL (non-null, real source).
 *     Never clobber a good existing value with null or a weaker value.
 *   - Always stamp owner_linkedin_searched_at when we ran the LinkedIn finder
 *     (found or not) so the cron never re-searches this row.
 *
 * Admin-gated via assertAdmin(). Service client for the read + write.
 *
 * Body: { contractor_id: string }
 * Returns: {
 *   ok,
 *   updated: { website?, phone?, title?, poc_name?, employee_count?,
 *              years_in_business?, owner_linkedin? },
 *   sources
 * }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";
import { enrichFirmographics } from "@/lib/quick-checker/firmographics";
import { findOwnerLinkedIn } from "@/lib/quick-checker/find-linkedin";
import { extractPhones, extractEmails } from "@/lib/quick-checker/contacts";
import { scrapePage, pickInterestingLinks } from "@/lib/quick-checker/firecrawl";
import { FREE_EMAIL_DOMAINS } from "@/lib/lead-validation";
import { assertSafePublicUrl } from "@/lib/ssrf-guard";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const runtime = "nodejs";
export const maxDuration = 90;

function svc() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

/** Extract a bare hostname (no protocol, no www.) from a website/business_url field. */
function toDomain(raw: string | null | undefined): string {
    const v = (raw || "").trim();
    if (!v) return "";
    try {
        const withProto = /^https?:\/\//i.test(v) ? v : `https://${v}`;
        return new URL(withProto).hostname.replace(/^www\./i, "");
    } catch {
        return "";
    }
}

/**
 * Derive a company website from a business email address.
 * Returns 'https://<domain>' only when the email's domain is a REAL company
 * domain (not a free webmail / ISP provider) and structurally valid; else "".
 *
 * Examples:
 *   deriveWebsiteFromEmail("john@acmepaving.com")      → "https://acmepaving.com"
 *   deriveWebsiteFromEmail("jane@gmail.com")           → ""  (free provider)
 *   deriveWebsiteFromEmail("BOB SMITH")                → ""  (not an email)
 */
function deriveWebsiteFromEmail(email: string | null | undefined): string {
    const e = (email || "").trim().toLowerCase();
    if (!e || !e.includes("@")) return "";
    const domain = e.split("@")[1]?.trim() || "";
    if (!domain) return "";
    // Must look like a real domain: label(s) + a 2+ char TLD.
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(domain)) return "";
    if (!/\.[a-z]{2,}$/i.test(domain)) return "";
    // Skip free webmail / ISP providers — those aren't company sites.
    if (FREE_EMAIL_DOMAINS.has(domain)) return "";
    return `https://${domain}`;
}

/** Is this an all-caps SAM-style POC name ("JOHN SMITH") — i.e. a weak value worth upgrading? */
function isWeakPocName(name: string | null | undefined): boolean {
    const n = (name || "").trim();
    if (!n) return true;
    // All-caps (SAM redaction style) with no lowercase letters → weak.
    if (n === n.toUpperCase() && /[A-Z]/.test(n)) return true;
    return false;
}

// Titles we recognize as a contractor decision-maker / POC title.
const TITLE_PATTERN =
    /\b(owner|founder|co-?founder|president|vice president|vp|ceo|chief executive officer|coo|cfo|cto|chief [a-z]+ officer|principal|managing (?:member|partner|director)|general manager|gm|director|business development|capture manager|proposal manager|contracts? manager|partner)\b/i;

// Person-name pattern: "First Last" or "First M. Last", title-cased, 2-3 tokens.
const NAME_PATTERN = /\b([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+){1,2})\b/;

/**
 * Best-effort extraction of a POC title (and possibly a better name) from
 * crawled page text. Looks for a recognized title and the nearest title-cased
 * person name around it. Returns nulls when nothing usable is found.
 */
function extractPocFromText(text: string): { name: string | null; title: string | null } {
    if (!text) return { name: null, title: null };
    let foundTitle: string | null = null;
    let foundName: string | null = null;

    // Walk each title hit and look at a small window around it for a name.
    const re = new RegExp(TITLE_PATTERN.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null && (!foundTitle || !foundName)) {
        const title = m[0].trim();
        if (!foundTitle) {
            // Normalize the title to a clean Title Case display value.
            foundTitle = title
                .split(/\s+/)
                .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
                .join(" ");
        }
        // Look in a window of ~80 chars before and after for a person name.
        const start = Math.max(0, m.index - 80);
        const end = Math.min(text.length, m.index + title.length + 80);
        const window = text.slice(start, end);
        const nm = NAME_PATTERN.exec(window);
        if (nm && !foundName) {
            const candidate = nm[1].trim();
            // Reject candidates that are clearly company/section words.
            if (!/\b(home|about|contact|services|team|company|llc|inc|corp|group|solutions)\b/i.test(candidate)) {
                foundName = candidate;
            }
        }
    }

    return { name: foundName, title: foundTitle };
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

    const contractor_id = typeof body.contractor_id === "string" ? body.contractor_id.trim() : "";
    if (!contractor_id) {
        return NextResponse.json({ ok: false, error: "contractor_id required" }, { status: 400 });
    }

    const db = svc();

    // ── Load the contractor row ──────────────────────────────────────────────
    const { data: c, error } = await db
        .from("contractors")
        .select(
            "id, company_name, website, business_url, uei, email, primary_poc_name, primary_poc_email, " +
                "primary_poc_title, primary_poc_phone, employee_count, years_in_business, owner_linkedin",
        )
        .eq("id", contractor_id)
        .maybeSingle();
    if (error) {
        console.error("[cockpit/enrich] contractor lookup failed:", error.message);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!c) {
        return NextResponse.json({ ok: false, error: "contractor not found" }, { status: 404 });
    }

    const row = c as any;
    const companyName = (row.company_name as string) || "";

    const updated: {
        website?: string;
        phone?: string;
        title?: string;
        poc_name?: string;
        employee_count?: number;
        years_in_business?: number;
        owner_linkedin?: string;
    } = {};
    const sources: Record<string, string> = {};
    const patch: Record<string, unknown> = {};

    // Track the website we'll crawl: existing, or derived this run.
    let website: string | null = (row.website as string) || (row.business_url as string) || null;

    // ── Sub-step 0: derive website from a company email ────────────────────────
    // Only when BOTH website + business_url are empty and we have a non-free
    // company email. Never clobbers an existing website.
    try {
        const haveWebsite = Boolean((row.website as string) || (row.business_url as string));
        if (!haveWebsite) {
            const candidateEmail = (row.email as string) || (row.primary_poc_email as string) || "";
            const derived = deriveWebsiteFromEmail(candidateEmail);
            if (derived) {
                patch.website = derived;
                updated.website = derived;
                sources.website = "email-domain";
                website = derived;
            }
        }
    } catch (e) {
        console.error("[cockpit/enrich] website-from-email failed:", e instanceof Error ? e.message : String(e));
    }

    const domain = toDomain(website);

    // ── Sub-step 1: crawl the website for contact info ─────────────────────────
    // Cheap, SSRF-safe, best-effort. Homepage + best contact/about/team page.
    // Fills primary_poc_phone (empty), primary_poc_title (empty); upgrades a
    // weak/all-caps primary_poc_name. Never clobbers a good existing value.
    if (website) {
        try {
            const startUrl = /^https?:\/\//i.test(website) ? website : `https://${website}`;
            // SSRF guard before any outbound fetch.
            await assertSafePublicUrl(startUrl);

            const home = await scrapePage(startUrl, { formats: ["markdown", "links"] });
            const pages = home ? [home] : [];

            // Pull the single highest-signal contact/about/team sub-page.
            if (home) {
                const [extraUrl] = pickInterestingLinks(home.links, startUrl, 1);
                if (extraUrl) {
                    try {
                        await assertSafePublicUrl(extraUrl);
                        const extra = await scrapePage(extraUrl, { formats: ["markdown", "links"] });
                        if (extra) pages.push(extra);
                    } catch {
                        /* sub-page failed — homepage alone is fine */
                    }
                }
            }

            const combined = pages.map((p) => p.markdown).join("\n\n").slice(0, 60_000);

            // Phone — first valid fixed_line/main number we can find.
            if (combined && !(row.primary_poc_phone as string)?.trim()) {
                const phones = extractPhones(combined);
                // Prefer a fixed line / main number over mobile/toll-free noise.
                const best =
                    phones.find((p) => p.type === "fixed_line") ||
                    phones.find((p) => p.type === "mobile") ||
                    phones[0];
                if (best) {
                    patch.primary_poc_phone = best.national;
                    updated.phone = best.national;
                    sources.phone = "website-crawl";
                }
            }

            // POC title + name from page text.
            if (combined) {
                const poc = extractPocFromText(combined);
                if (poc.title && !(row.primary_poc_title as string)?.trim()) {
                    patch.primary_poc_title = poc.title;
                    updated.title = poc.title;
                    sources.title = "website-crawl";
                }
                // Only upgrade the POC name when the existing one is missing or
                // a weak all-caps SAM value — never overwrite a clean name.
                if (poc.name && isWeakPocName(row.primary_poc_name as string)) {
                    patch.primary_poc_name = poc.name;
                    updated.poc_name = poc.name;
                    sources.poc_name = "website-crawl";
                }
            }

            // Belt-and-suspenders: if we still have no company email on file,
            // pick up the first business email the crawl found.
            if (combined && !(row.email as string)?.trim() && !(row.primary_poc_email as string)?.trim()) {
                const emails = extractEmails(combined);
                const biz = emails.find((e) => !FREE_EMAIL_DOMAINS.has(e.domain)) || emails[0];
                if (biz) {
                    patch.primary_poc_email = biz.normalized;
                    sources.poc_email = "website-crawl";
                }
            }
        } catch (e) {
            console.error("[cockpit/enrich] contact crawl failed:", e instanceof Error ? e.message : String(e));
        }
    }

    // ── Sub-step 2: firmographic cascade (employees / years_in_business) ───────
    try {
        const firmo = await enrichFirmographics({
            domain,
            companyName,
            uei: (row.uei as string | null) || null,
            existing: {
                employee_count: (row.employee_count as number | null) ?? null,
                founded_year: (row.years_in_business as number | null)
                    ? new Date().getFullYear() - (row.years_in_business as number)
                    : null,
            },
        });

        // employee_count — only set when resolved to a real source AND the row
        // doesn't already carry a value (never clobber a good value).
        if (
            firmo.employee_count.value !== null &&
            firmo.employee_count.source !== "missing" &&
            firmo.employee_count.source !== "crawl" &&
            !(row.employee_count > 0)
        ) {
            patch.employee_count = firmo.employee_count.value;
            updated.employee_count = firmo.employee_count.value;
            sources.employee_count = firmo.employee_count.source;
        }

        // years_in_business — derived from founded_year by the cascade. Only fill
        // when real and the row is empty.
        if (
            firmo.years_in_business.value !== null &&
            firmo.years_in_business.source !== "missing" &&
            firmo.years_in_business.source !== "crawl" &&
            !(row.years_in_business > 0)
        ) {
            patch.years_in_business = firmo.years_in_business.value;
            updated.years_in_business = firmo.years_in_business.value;
            sources.years_in_business = firmo.years_in_business.source;
        }
    } catch (e) {
        console.error("[cockpit/enrich] firmographics failed:", e instanceof Error ? e.message : String(e));
    }

    // ── Sub-step 3: owner/CEO LinkedIn finder (Brave → DDG) ────────────────────
    // Always stamp searched_at so the cron lane never re-walks this row. Never
    // clobber an already-resolved owner_linkedin. Use the (possibly upgraded)
    // POC name so an all-caps SAM name doesn't sabotage the search.
    try {
        patch.owner_linkedin_searched_at = new Date().toISOString();
        const pocNameForSearch = (updated.poc_name as string) || (row.primary_poc_name as string) || "";
        if (!row.owner_linkedin && pocNameForSearch) {
            const li = await findOwnerLinkedIn(pocNameForSearch, companyName);
            if (li?.url) {
                patch.owner_linkedin = li.url;
                updated.owner_linkedin = li.url;
                sources.owner_linkedin = process.env.BRAVE_SEARCH_API_KEY ? "brave" : "duckduckgo";
            }
        }
    } catch (e) {
        console.error("[cockpit/enrich] linkedin finder failed:", e instanceof Error ? e.message : String(e));
    }

    // ── Persist (resilient — log on failure, still return what we resolved) ────
    try {
        if (Object.keys(patch).length) {
            const { error: upErr } = await db.from("contractors").update(patch).eq("id", contractor_id);
            if (upErr) {
                console.error("[cockpit/enrich] write-back failed:", upErr.message);
                return NextResponse.json(
                    { ok: false, error: upErr.message, updated, sources },
                    { status: 500 },
                );
            }
        }
    } catch (e) {
        console.error("[cockpit/enrich] write-back threw:", e instanceof Error ? e.message : String(e));
        return NextResponse.json(
            { ok: false, error: "write-back failed", updated, sources },
            { status: 500 },
        );
    }

    return NextResponse.json({ ok: true, updated, sources });
}

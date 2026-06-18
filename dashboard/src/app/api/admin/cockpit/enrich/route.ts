/**
 * POST /api/admin/cockpit/enrich — on-demand "Research & fill gaps" for ONE
 * contractor from the cockpit lead queue. ONE action does everything: deep
 * website crawl + deterministic extraction + firmographics + owner LinkedIn +
 * public-reputation research.
 *
 * Sub-steps (each independently try/caught — a slow/failed third-party never
 * fails the whole request):
 *   0. DERIVE WEBSITE FROM EMAIL — if the row has NO website (website +
 *      business_url both empty) but has a non-free company email, derive
 *      website = 'https://' + emailDomain and persist it (only when empty).
 *   1. DEEP CRAWL — when a website is known, crawl up to 3 pages (homepage +
 *      best About + best Contact, via pickInterestingLinks), each SSRF-guarded.
 *      From the combined markdown + raw HTML extract, DETERMINISTICALLY:
 *        - PHONE: every phone incl. footer (extractPhones). Fill
 *          primary_poc_phone when empty (prefer fixed-line); store ALL found in
 *          capability_summary_ai.phones[].
 *        - EMAIL: all business emails (extractEmails). Fill primary_poc_email
 *          when empty; store capability_summary_ai.emails[].
 *        - COMPANY LINKEDIN + socials from <a href> (classifySocials over the
 *          raw HTML) — write contractors.company_linkedin (when empty). Never
 *          guessed; pulled straight from footer/header links.
 *        - YEARS / TRACK RECORD: regex the prose ("NN years", "since YYYY") →
 *          years_in_business when empty; "NN+ projects/clients" →
 *          capability_summary_ai.track_record[].
 *        - LEGAL NAME: "…LLC/Inc/Corp" / "legally known as" →
 *          capability_summary_ai.legal_name.
 *        - POC title + name (best-effort) as before.
 *   2. FIRMOGRAPHIC CASCADE (Apollo → SAM → OpenCorporates → Wayback) — fills
 *      employee_count / years_in_business the crawl couldn't extract.
 *   3. Owner/CEO LinkedIn finder (Brave-primary, DDG-fallback) — STRICT: only
 *      writes a profile when the slug unambiguously matches both names.
 *   4. COMPANY RESEARCH — reuses runCompanyResearch() (reviews / web presence /
 *      sentiment) and recomputes the reputation blob in the same call.
 *
 * Write-back rules:
 *   - Only OVERWRITE a column when the new value is REAL. Never clobber a good
 *     existing value with null or a weaker value.
 *   - Always stamp owner_linkedin_searched_at when we ran the LinkedIn finder.
 *
 * Admin-gated via assertAdmin(). Service client for the read + write.
 *
 * Body: { contractor_id: string }
 * Returns: {
 *   ok,
 *   updated: { website?, phone?, title?, poc_name?, poc_email?, company_linkedin?,
 *              employee_count?, years_in_business?, owner_linkedin?,
 *              phones?, emails?, track_record?, legal_name? },
 *   research: { rating, reviews_count, sentiment, summary, sources } | null,
 *   sources
 * }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";
import { enrichFirmographics } from "@/lib/quick-checker/firmographics";
import { findOwnerLinkedIn, matchKnownProfileByName } from "@/lib/quick-checker/find-linkedin";
import { extractPhones, extractEmails } from "@/lib/quick-checker/contacts";
import { scrapePage, pickInterestingLinks, type FirecrawlPage } from "@/lib/quick-checker/firecrawl";
import { classifySocials } from "@/lib/quick-checker/website-tech";
import { extractYearsInBusiness, extractTrackRecord, extractLegalName } from "@/lib/quick-checker/prose-signals";
import { runCompanyResearch } from "../research/route";
import { FREE_EMAIL_DOMAINS } from "@/lib/lead-validation";
import { assertSafePublicUrl } from "@/lib/ssrf-guard";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Known meeting-scheduler hosts. Many small firms list a "book a call" link
// instead of a phone, so this is often the only reachable contact channel.
const BOOKING_HOST_RE =
    /(?:calendly\.com|cal\.com|meetings?\.hubspot\.com|app\.hubspot\.com\/meetings|acuityscheduling\.com|app\.acuityscheduling\.com|tidycal\.com|savvycal\.com|koalendar\.com|youcanbook\.me|calendar\.app\.google|book\.ms|outlook\.office365\.com\/book|squareup\.com\/appointments|setmore\.com|zcal\.co)/i;

/** Return the first booking/scheduling URL from a link list, else null. */
function detectBookingLink(links: string[]): string | null {
    for (const raw of links) {
        const u = String(raw || "").trim();
        if (u && BOOKING_HOST_RE.test(u)) {
            // Strip trailing punctuation the href regex can grab.
            return u.replace(/[)\].,"';]+$/, "");
        }
    }
    return null;
}

export const runtime = "nodejs";
export const maxDuration = 180;

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
            "id, company_name, website, business_url, uei, state, email, primary_poc_name, primary_poc_email, " +
                "primary_poc_title, primary_poc_phone, employee_count, years_in_business, owner_linkedin, " +
                "company_linkedin, social_linkedin, capability_summary_ai",
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
        poc_email?: string;
        company_linkedin?: string;
        employee_count?: number;
        years_in_business?: number;
        owner_linkedin?: string;
        phones?: string[];
        emails?: string[];
        track_record?: string[];
        legal_name?: string;
        booking_url?: string;
    } = {};
    const sources: Record<string, string> = {};
    const patch: Record<string, unknown> = {};

    // Existing capability_summary_ai blob — we MERGE into it (never clobber).
    const capBlob: Record<string, any> = (row.capability_summary_ai && typeof row.capability_summary_ai === "object")
        ? { ...(row.capability_summary_ai as Record<string, any>) }
        : {};
    let capBlobDirty = false;

    // Track the website we'll crawl: existing, or derived this run.
    let website: string | null = (row.website as string) || (row.business_url as string) || null;

    // Personal linkedin.com/in/ profiles found ON the contractor's own site —
    // matched against the POC name in the LinkedIn sub-step (deterministic source).
    let onSitePersonalLinkedIn: string[] = [];

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

    // ── Sub-step 1: DEEP crawl the website ─────────────────────────────────────
    // SSRF-safe, best-effort. Homepage + the best About + best Contact sub-page
    // (up to 3 pages total). Reads BOTH combined markdown AND raw HTML so footer
    // <a href> socials + footer phones survive. Everything here is
    // deterministic/regex — never guessed.
    if (website) {
        try {
            const startUrl = /^https?:\/\//i.test(website) ? website : `https://${website}`;
            // SSRF guard before any outbound fetch.
            await assertSafePublicUrl(startUrl);

            // Homepage — request HTML too so we can read footer/header <a href>.
            const home = await scrapePage(startUrl, { formats: ["markdown", "links", "html"] });
            const pages: FirecrawlPage[] = home ? [home] : [];

            // Pull up to 2 high-signal sub-pages, biasing toward an About page AND
            // a Contact page (not just the single top-scored link). pickInterestingLinks
            // scores /contact highest then /about, so taking the top 4 and keeping
            // the first about-ish + first contact-ish gives us both when present.
            if (home) {
                const ranked = pickInterestingLinks(home.links, startUrl, 6);
                const aboutUrl = ranked.find((u) => /\/about|who-we-are/i.test(u));
                const contactUrl = ranked.find((u) => /\/contact/i.test(u));
                const chosen = [aboutUrl, contactUrl].filter((v): v is string => !!v);
                // Fill remaining budget (up to 3 pages total) with next-best links.
                for (const u of ranked) {
                    if (chosen.length >= 2) break;
                    if (!chosen.includes(u)) chosen.push(u);
                }
                for (const extraUrl of chosen.slice(0, 2)) {
                    try {
                        await assertSafePublicUrl(extraUrl);
                        const extra = await scrapePage(extraUrl, { formats: ["markdown", "links", "html"] });
                        if (extra) pages.push(extra);
                    } catch {
                        /* sub-page failed — keep going */
                    }
                }
            }

            const combined = pages.map((p) => p.markdown).join("\n\n").slice(0, 120_000);
            const combinedHtml = pages.map((p) => p.html || "").join("\n").slice(0, 400_000);

            // ── PHONES — every phone across all pages incl. footer ──────────────
            if (combined) {
                const phones = extractPhones(combined);
                if (phones.length) {
                    // Store ALL found phones (national format) in the cap blob.
                    const allNational = [...new Set(phones.map((p) => p.national))];
                    if (allNational.length) { capBlob.phones = allNational; capBlobDirty = true; updated.phones = allNational; }
                    // Fill primary_poc_phone when empty — prefer a real fixed line.
                    if (!(row.primary_poc_phone as string)?.trim()) {
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
                }
            }

            // ── EMAILS — all business emails ────────────────────────────────────
            if (combined) {
                const emails = extractEmails(combined);
                const bizEmails = emails.filter((e) => !FREE_EMAIL_DOMAINS.has(e.domain));
                const all = [...new Set((bizEmails.length ? bizEmails : emails).map((e) => e.normalized))];
                if (all.length) { capBlob.emails = all; capBlobDirty = true; updated.emails = all; }
                // Fill primary_poc_email when empty.
                if (!(row.email as string)?.trim() && !(row.primary_poc_email as string)?.trim()) {
                    const biz = bizEmails[0] || emails[0];
                    if (biz) {
                        patch.primary_poc_email = biz.normalized;
                        updated.poc_email = biz.normalized;
                        sources.poc_email = "website-crawl";
                    }
                }
            }

            // ── COMPANY LINKEDIN + socials from FOOTER/HEADER <a href> ──────────
            // Deterministic — classifySocials scans raw links + html, not prose.
            try {
                const linkPool: string[] = [];
                for (const p of pages) for (const l of p.links || []) linkPool.push(l);
                const socials = classifySocials(linkPool.length ? linkPool : []);
                // Re-scan raw HTML too (footer links often aren't in links[]).
                if (combinedHtml) {
                    const hrefRe = /https?:\/\/[^\s"'<>)\]]+/gi;
                    const htmlUrls: string[] = [];
                    let mm: RegExpExecArray | null;
                    while ((mm = hrefRe.exec(combinedHtml)) !== null) htmlUrls.push(mm[0]);
                    const htmlSocials = classifySocials(htmlUrls);
                    socials.linkedin ||= htmlSocials.linkedin;
                    socials.linkedin_people.push(...htmlSocials.linkedin_people);
                }
                // Write company_linkedin ONLY when empty and a real COMPANY page
                // found (classifySocials routes /company/ + /school/ here; personal
                // /in/ profiles go to linkedin_people and are NEVER written here).
                const haveCompanyLi = Boolean((row.company_linkedin as string) || (row.social_linkedin as string));
                if (socials.linkedin && !haveCompanyLi) {
                    patch.company_linkedin = socials.linkedin;
                    updated.company_linkedin = socials.linkedin;
                    sources.company_linkedin = "website-footer";
                }
                // Hold on-site personal profiles for the owner-LinkedIn match below.
                onSitePersonalLinkedIn = [...new Set(socials.linkedin_people)];

                // ── BOOKING / SCHEDULING LINK ──────────────────────────────────
                // Many firms have no phone on the contact page, just a "book a
                // meeting" link. Capture it so the rep has a way in (e.g. Titan
                // Secure Tech → cal.com/titansecuretech). Stored in the blob.
                if (!capBlob.booking_url) {
                    const allLinks = [...linkPool];
                    if (combinedHtml) {
                        const hrefRe2 = /https?:\/\/[^\s"'<>)\]]+/gi;
                        let bm: RegExpExecArray | null;
                        while ((bm = hrefRe2.exec(combinedHtml)) !== null) allLinks.push(bm[0]);
                    }
                    const booking = detectBookingLink(allLinks);
                    if (booking) {
                        capBlob.booking_url = booking;
                        capBlobDirty = true;
                        updated.booking_url = booking;
                        sources.booking_url = "website-crawl";
                    }
                }
            } catch (e) {
                console.error("[cockpit/enrich] socials scan failed:", e instanceof Error ? e.message : String(e));
            }

            // ── YEARS IN BUSINESS / TRACK RECORD (deterministic prose) ──────────
            if (combined) {
                if (!(row.years_in_business > 0)) {
                    const yrs = extractYearsInBusiness(combined);
                    if (yrs && yrs > 0) {
                        patch.years_in_business = yrs;
                        updated.years_in_business = yrs;
                        sources.years_in_business = "website-prose";
                    }
                }
                const track = extractTrackRecord(combined);
                if (track.length && !(Array.isArray(capBlob.track_record) && capBlob.track_record.length)) {
                    capBlob.track_record = track;
                    capBlobDirty = true;
                    updated.track_record = track;
                }
            }

            // ── LEGAL COMPANY NAME ──────────────────────────────────────────────
            if ((combined || combinedHtml) && !capBlob.legal_name) {
                const legal = extractLegalName(combined) || extractLegalName(
                    combinedHtml.replace(/<[^>]+>/g, " "),
                );
                if (legal) {
                    capBlob.legal_name = legal;
                    capBlobDirty = true;
                    updated.legal_name = legal;
                }
            }

            // ── POC title + name (best-effort prose) ────────────────────────────
            if (combined) {
                const poc = extractPocFromText(combined);
                if (poc.title && !(row.primary_poc_title as string)?.trim()) {
                    patch.primary_poc_title = poc.title;
                    updated.title = poc.title;
                    sources.title = "website-crawl";
                }
                // Only upgrade the POC name when missing or a weak all-caps SAM value.
                if (poc.name && isWeakPocName(row.primary_poc_name as string)) {
                    patch.primary_poc_name = poc.name;
                    updated.poc_name = poc.name;
                    sources.poc_name = "website-crawl";
                }
            }
        } catch (e) {
            console.error("[cockpit/enrich] deep crawl failed:", e instanceof Error ? e.message : String(e));
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
        // when real and the row is empty AND the deep crawl didn't already capture
        // an explicit on-site claim (the crawl value is preferred).
        if (
            firmo.years_in_business.value !== null &&
            firmo.years_in_business.source !== "missing" &&
            firmo.years_in_business.source !== "crawl" &&
            !(row.years_in_business > 0) &&
            patch.years_in_business == null
        ) {
            patch.years_in_business = firmo.years_in_business.value;
            updated.years_in_business = firmo.years_in_business.value;
            sources.years_in_business = firmo.years_in_business.source;
        }
    } catch (e) {
        console.error("[cockpit/enrich] firmographics failed:", e instanceof Error ? e.message : String(e));
    }

    // ── Sub-step 3: owner/CEO LinkedIn finder ──────────────────────────────────
    // Always stamp searched_at so the cron lane never re-walks this row. Never
    // clobber an already-resolved owner_linkedin. Use the (possibly upgraded)
    // POC name so an all-caps SAM name doesn't sabotage the match. Two sources,
    // both STRICT (slug must carry both names):
    //   1. A personal /in/ profile the company published on its OWN site
    //      (most reliable — it's their own link, not a search guess).
    //   2. Brave/DDG search fallback.
    try {
        patch.owner_linkedin_searched_at = new Date().toISOString();
        const pocNameForSearch = (updated.poc_name as string) || (row.primary_poc_name as string) || "";
        if (!row.owner_linkedin && pocNameForSearch) {
            // 1. On-site personal profile (deterministic).
            const onSite = onSitePersonalLinkedIn.length
                ? matchKnownProfileByName(onSitePersonalLinkedIn, pocNameForSearch)
                : null;
            if (onSite) {
                patch.owner_linkedin = onSite;
                updated.owner_linkedin = onSite;
                sources.owner_linkedin = "website-onsite";
            } else {
                // 2. Search fallback (strict-gated inside findOwnerLinkedIn).
                const li = await findOwnerLinkedIn(pocNameForSearch, companyName);
                if (li?.url) {
                    patch.owner_linkedin = li.url;
                    updated.owner_linkedin = li.url;
                    sources.owner_linkedin = process.env.BRAVE_SEARCH_API_KEY ? "brave" : "duckduckgo";
                }
            }
        }
    } catch (e) {
        console.error("[cockpit/enrich] linkedin finder failed:", e instanceof Error ? e.message : String(e));
    }

    // Fold the merged capability_summary_ai blob into the patch when changed.
    if (capBlobDirty) patch.capability_summary_ai = capBlob;

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

    // ── Sub-step 4: COMPANY RESEARCH (reviews / web presence / sentiment) ──────
    // Reuse the shared research core so ONE "Research & fill gaps" action does
    // everything. It persists research_findings + google_rating itself; we just
    // surface the result. Best-effort — never fails the enrich.
    let research: {
        rating: number | null;
        reviews_count: number | null;
        sentiment: string;
        summary: string;
        sources: Array<{ url: string; title: string; source_type: string }>;
    } | null = null;
    try {
        const r = await runCompanyResearch({
            contractorId: contractor_id,
            companyName,
            state: (row.state as string | null) || null,
            website,
        });
        research = {
            rating: r.rating,
            reviews_count: r.reviews_count,
            sentiment: r.sentiment,
            summary: r.summary,
            sources: r.sources,
        };
        if (r.rating != null) sources.research_rating = "brave+openai";
    } catch (e) {
        console.error("[cockpit/enrich] research failed:", e instanceof Error ? e.message : String(e));
    }

    return NextResponse.json({ ok: true, updated, research, sources });
}

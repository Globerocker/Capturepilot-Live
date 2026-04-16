/**
 * Data extraction functions.
 * Ported 1:1 from tools/17_analyze_company.py lines 337-804.
 *
 * Each function takes arrays of Cheerio root objects (soups) and/or
 * plain-text strings (texts) and returns structured data.
 */

import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import {
    EMAIL_RE, PHONE_RE, YEAR_RE, EMPLOYEE_RE, REVENUE_RE, REVENUE_RE2,
    UEI_RE, UEI_CONTEXT_RE, ADDRESS_RE, STATE_RE_STR,
    US_STATES, TITLE_KEYWORDS, CERT_KEYWORDS, JUNK_EMAIL_DOMAINS,
    FEDERAL_AGENCIES, USER_AGENT, MAX_RESPONSE_SIZE,
} from "./config";

// Helper: run a global regex and return all matches (resets lastIndex)
function findAll(re: RegExp, text: string): RegExpMatchArray[] {
    const copy = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    return [...text.matchAll(copy)];
}

// ─── Company Name ──────────────────────────────────────────────────────────

export function extractCompanyName(soups: CheerioAPI[]): string {
    for (const $ of soups) {
        // og:site_name is the cleanest source
        const siteName = $('meta[property="og:site_name"]').attr("content");
        if (siteName?.trim() && siteName.trim().length > 1 && siteName.trim().length < 80) {
            return siteName.trim();
        }
    }
    for (const $ of soups) {
        // <title> tag, strip common suffixes like " | Home", " - Welcome"
        const title = $("title").text().trim();
        if (title && title.length > 1) {
            const cleaned = title
                .replace(/\s*[-–—|]\s*(home|welcome|main|official|website|site).*$/i, "")
                .replace(/\s*[-–—|]\s*$/, "")
                .trim();
            if (cleaned.length > 1 && cleaned.length < 80) return cleaned;
        }
    }
    return "";
}

// ─── Description ───────────────────────────────────────────────────────────

export function extractDescription(soups: CheerioAPI[], texts: string[]): string {
    let description = "";

    for (const $ of soups) {
        const metaDesc = $('meta[name="description"]').attr("content");
        if (metaDesc?.trim()) { description = metaDesc.trim(); break; }
        const ogDesc = $('meta[property="og:description"]').attr("content");
        if (ogDesc?.trim()) { description = ogDesc.trim(); break; }
    }

    // If the meta description is short or missing, harvest 2-3 paragraphs from
    // the About / Services pages so the capability-statement drafter has real
    // content to work with. Previous cap of 500 chars produced ~23 lines of
    // output for the cap statement — too thin. New cap: 4000 chars.
    if (description.length < 300 && texts.length > 1) {
        const aboutText = [texts[1], texts[2], texts[0]].filter(Boolean).join(" ");
        const sentences = aboutText.split(/(?<=[.!?])\s+/);
        const paras: string[] = [];
        for (const s of sentences) {
            const t = s.trim();
            if (t.length > 40) {
                paras.push(t);
                if (paras.join(" ").length > 3500) break;
            }
        }
        if (paras.length) {
            const supplement = paras.join(" ").slice(0, 3500);
            description = description ? description + " " + supplement : supplement;
        }
    }

    return description.slice(0, 4000);
}

// ─── Services ──────────────────────────────────────────────────────────────

// Phrases that routinely appear in <li> items that are actually menu / footer /
// CTA / marketing copy rather than real services.
const SERVICE_BLOCKLIST = [
    "home", "login", "sign in", "sign up", "signup", "privacy", "cookie", "©",
    "contact us", "about us", "terms", "policy", "sitemap", "read more", "learn more",
    "get started", "get expert", "get help", "book now", "book a call", "schedule a call",
    "free course", "free guide", "free trial", "free consultation", "free download",
    "watch video", "watch now", "listen now", "subscribe", "newsletter",
    "all guides", "all courses", "all articles", "all posts", "view all",
    "terms of service", "terms of use", "refund policy", "shipping",
    "my account", "your account", "log out", "sign out",
    "careers", "jobs", "press", "media kit", "company", "our team", "our story",
    "testimonials", "case studies", "pricing", "plans", "compare plans", "faq", "help center",
];

// Ancestor-tag / class tokens that indicate navigation or chrome rather than content.
const NAV_CLASS_TOKENS = ["nav", "menu", "header", "footer", "sidebar", "breadcrumb", "pagination", "cta"];

function hasNavAncestor(node: Cheerio<AnyNode>): boolean {
    let cur = node.parent();
    for (let depth = 0; depth < 4 && cur.length; depth++) {
        const tag = cur.prop("tagName")?.toLowerCase();
        if (tag === "nav" || tag === "header" || tag === "footer" || tag === "aside") return true;
        const cls = (cur.attr("class") || "").toLowerCase();
        const id = (cur.attr("id") || "").toLowerCase();
        if (NAV_CLASS_TOKENS.some(t => cls.includes(t) || id.includes(t))) return true;
        cur = cur.parent();
    }
    return false;
}

function isLikelyServiceText(raw: string): boolean {
    const text = raw.trim();
    if (text.length < 10 || text.length > 120) return false;
    // Strip decorative arrows used in CTA links ("All Guides →")
    if (/[→↗»›▶▸▷▹⟶]/.test(text)) return false;
    // TOC-style numbering ("01What Is a Capability Statement?")
    if (/^\d+[A-Za-z]/.test(text) || /^\d+\.\s/.test(text)) return false;
    // All-caps blurbs are usually section headers, not services
    if (text === text.toUpperCase() && /[A-Z]{3,}/.test(text)) return false;
    // Contains a question — typically FAQ copy or blog title, not a service name
    if (text.includes("?")) return false;

    const lower = text.toLowerCase();
    for (const bad of SERVICE_BLOCKLIST) {
        if (lower.includes(bad)) return false;
    }
    return true;
}

export function extractServices(soups: CheerioAPI[], _texts: string[]): string[] {
    const services = new Set<string>();

    for (const $ of soups) {
        // List items
        $("ul li, ol li").each((_i, el) => {
            const text = $(el).text().replace(/\s+/g, " ").trim();
            if (!isLikelyServiceText(text)) return;
            if (hasNavAncestor($(el))) return;
            services.add(text);
        });

        // Headings near service keywords
        $("h2, h3, h4, .service-title, .card-title").each((_i, el) => {
            const text = $(el).text().replace(/\s+/g, " ").trim();
            if (text.length < 5 || text.length > 80) return;
            if (!isLikelyServiceText(text)) return;
            if (hasNavAncestor($(el))) return;

            const kws = ["service", "solution", "capabilit", "offer", "what we do", "specializ", "core competenc"];
            const lower = text.toLowerCase();
            const parentText = $(el).parent().text().replace(/\s+/g, " ").trim().slice(0, 100).toLowerCase();
            if (kws.some(kw => lower.includes(kw) || parentText.includes(kw))) {
                services.add(text);
            }
        });
    }

    return [...services].slice(0, 20);
}

// ─── Contacts & Social Links ───────────────────────────────────────────────

interface ContactInfo { email?: string; phone?: string }
interface SocialLinks { linkedin: string | null; facebook: string | null; twitter: string | null }

export function extractContacts(
    texts: string[], soups: CheerioAPI[]
): { contacts: ContactInfo[]; socialLinks: SocialLinks } {
    const allText = texts.join(" ");
    const contacts: ContactInfo[] = [];

    // Emails
    const emails = new Set<string>();
    for (const m of findAll(EMAIL_RE, allText)) {
        const email = m[0];
        const domain = email.split("@")[1].toLowerCase();
        if (!JUNK_EMAIL_DOMAINS.has(domain)) emails.add(email.toLowerCase());
    }

    // Phones
    const phones = new Set<string>();
    for (const m of findAll(PHONE_RE, allText)) {
        const phone = m[1];
        const clean = phone.replace(/[^\d+]/g, "");
        if (clean.length >= 10) phones.add(phone.trim());
    }

    for (const email of [...emails].slice(0, 5)) contacts.push({ email });
    for (const phone of [...phones].slice(0, 3)) contacts.push({ phone });

    // Social links
    const socialLinks: SocialLinks = { linkedin: null, facebook: null, twitter: null };
    for (const $ of soups) {
        $("a[href]").each((_i, el) => {
            const href = ($(el).attr("href") || "").toLowerCase();
            if (href.includes("linkedin.com/company") && !socialLinks.linkedin) {
                socialLinks.linkedin = $(el).attr("href") || null;
            } else if (href.includes("facebook.com/") && !socialLinks.facebook) {
                socialLinks.facebook = $(el).attr("href") || null;
            } else if ((href.includes("twitter.com/") || href.includes("x.com/")) && !socialLinks.twitter) {
                socialLinks.twitter = $(el).attr("href") || null;
            }
        });
    }

    return { contacts, socialLinks };
}

// ─── Locations ─────────────────────────────────────────────────────────────

// State abbreviations that are also common English words — only match in address context
const AMBIGUOUS_STATES = new Set(["IN", "OR", "OH", "ME", "OK", "PA", "ID", "HI", "DE", "MD", "MA", "LA", "AL"]);

export function extractLocations(
    texts: string[]
): { locations: Array<{ address?: string; state?: string }>; states: string[] } {
    const allText = texts.join(" ");
    const locations: Array<{ address?: string; state?: string }> = [];
    const stateScores = new Map<string, number>();

    // Method 1: Full addresses with embedded state (highest confidence)
    for (const m of findAll(ADDRESS_RE, allText)) {
        locations.push({ address: m[0].trim() });
        // Extract state from the address match
        const addrStateRe = new RegExp(`\\b(${STATE_RE_STR})\\s*\\d{5}`, "g");
        const addrMatch = addrStateRe.exec(m[0]);
        if (addrMatch && US_STATES.has(addrMatch[1])) {
            stateScores.set(addrMatch[1], (stateScores.get(addrMatch[1]) || 0) + 10);
        }
    }

    // Method 2: "City, ST" or "City, ST ZIP" pattern (high confidence)
    const cityStateRe = new RegExp(`[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*\\s*,\\s*(${STATE_RE_STR})\\b(?:\\s*\\d{5})?`, "g");
    for (const m of findAll(cityStateRe, allText)) {
        if (US_STATES.has(m[1])) {
            stateScores.set(m[1], (stateScores.get(m[1]) || 0) + 8);
        }
    }

    // Method 3: "STATE ZIP" pattern (high confidence)
    const stateZipRe = new RegExp(`\\b(${STATE_RE_STR})\\s+\\d{5}\\b`, "g");
    for (const m of findAll(stateZipRe, allText)) {
        if (US_STATES.has(m[1])) {
            stateScores.set(m[1], (stateScores.get(m[1]) || 0) + 7);
        }
    }

    // Method 4: Standalone state codes (only for non-ambiguous states)
    const standaloneRe = new RegExp(`\\b(${STATE_RE_STR})\\b`, "g");
    for (const m of findAll(standaloneRe, allText)) {
        const code = m[1];
        if (!US_STATES.has(code)) continue;
        if (AMBIGUOUS_STATES.has(code)) continue; // Skip ambiguous codes in standalone context
        stateScores.set(code, (stateScores.get(code) || 0) + 2);
    }

    // Method 5: Full state names (medium-high confidence)
    const STATE_NAMES: Record<string, string> = {
        "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
        "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
        "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID",
        "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
        "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
        "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
        "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
        "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
        "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
        "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
        "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT",
        "Vermont": "VT", "Virginia": "VA", "Washington": "WA", "West Virginia": "WV",
        "Wisconsin": "WI", "Wyoming": "WY", "District of Columbia": "DC",
    };
    for (const [name, code] of Object.entries(STATE_NAMES)) {
        const nameRe = new RegExp(`\\b${name}\\b`, "gi");
        const matches = findAll(nameRe, allText);
        if (matches.length > 0) {
            stateScores.set(code, (stateScores.get(code) || 0) + 6 * matches.length);
        }
    }

    // Only include states with sufficient confidence score (>= 5)
    const states = [...stateScores.entries()]
        .filter(([, score]) => score >= 5)
        .sort((a, b) => b[1] - a[1])
        .map(([code]) => code);

    if (!locations.length && states.length) {
        for (const state of states.slice(0, 3)) {
            locations.push({ state });
        }
    }
    if (locations.length && states.length) {
        locations[0].state = states[0];
    }

    return { locations: locations.slice(0, 5), states };
}

// ─── Certifications ────────────────────────────────────────────────────────

export function detectCertifications(
    texts: string[]
): Array<{ type: string; confidence: number }> {
    const allText = texts.join(" ").toLowerCase();
    const found: Array<{ type: string; confidence: number }> = [];

    for (const [certName, patterns] of Object.entries(CERT_KEYWORDS)) {
        for (const pattern of patterns) {
            if (pattern.test(allText)) {
                // Reset lastIndex for counting
                const countRe = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
                const count = [...allText.matchAll(countRe)].length;
                const confidence = Math.min(0.5 + count * 0.15, 0.95);
                found.push({ type: certName, confidence: Math.round(confidence * 100) / 100 });
                break;
            }
        }
    }

    return found;
}

// ─── Employee Estimate ─────────────────────────────────────────────────────

// Words that, when found in the immediate context of an "N employees" match,
// mean the number is talking about *other* people (customers, students, the
// federal workforce) rather than this company's own team.
const EMPLOYEE_OTHER_CONTEXT_RE = /\b(client|customer|student|graduate|member|user|subscriber|business|compan(?:y|ies)|contractor|small\s+business|federal\s+employee|federal\s+workforce|serve(?:d|s)?|help(?:ed|s)?|train(?:ed|s|ing)?|course|course\s+graduate|community)\b/i;

export function estimateEmployees(
    texts: string[]
): { estimate: number; source: string } | null {
    const allText = texts.join(" ");
    for (const m of findAll(EMPLOYEE_RE, allText)) {
        const count = parseInt(m[1], 10);
        if (count < 1 || count > 50000) continue;
        // Check a ±80 char window for "5,000 small businesses", "500 graduates",
        // "trained 5,000 contractors" — these aren't the company's headcount.
        const start = Math.max(0, (m.index ?? 0) - 80);
        const end = Math.min(allText.length, (m.index ?? 0) + m[0].length + 80);
        const context = allText.slice(start, end);
        if (EMPLOYEE_OTHER_CONTEXT_RE.test(context)) continue;
        return { estimate: count, source: "page_text" };
    }
    return null;
}

// ─── Founding Year ─────────────────────────────────────────────────────────

export function extractFoundingYear(texts: string[]): number | null {
    const allText = texts.join(" ");
    for (const m of findAll(YEAR_RE, allText)) {
        const year = parseInt(m[1], 10);
        if (year >= 1900 && year <= 2026) return year;
    }
    return null;
}

// ─── Leadership ────────────────────────────────────────────────────────────

// Validate that a string looks like a real person's name (first + last, no junk)
function isLikelyPersonName(name: string): boolean {
    const words = name.split(/\s+/).filter(w => w.length > 0);
    // Must have at least 2 words (first + last name)
    if (words.length < 2 || words.length > 5) return false;
    // Each word should start with an uppercase letter and be alphabetic
    if (!words.every(w => /^[A-Z][a-zA-Z'-]+$/.test(w))) return false;
    // Reject common non-name words
    const junkNames = new Set(["our", "the", "and", "for", "with", "from", "your", "this", "that",
        "all", "new", "top", "best", "more", "about", "home", "page", "site", "contact",
        "ambient", "general", "commercial", "industrial", "professional", "custom"]);
    if (words.some(w => junkNames.has(w.toLowerCase()))) return false;
    // Name total length reasonable
    if (name.length < 5 || name.length > 40) return false;
    return true;
}

// Validate that a string looks like a real business title
function isLikelyTitle(title: string): boolean {
    const tl = title.toLowerCase();
    // Must contain at least one recognized leadership keyword
    const hasKeyword = TITLE_KEYWORDS.some(kw => tl.includes(kw));
    if (!hasKeyword) return false;
    // Should be short (a title, not a sentence)
    if (title.length > 60 || title.length < 3) return false;
    // Reject if it looks like a description/sentence (too many words)
    if (title.split(/\s+/).length > 8) return false;
    return true;
}

export function extractLeadership(
    texts: string[], soups: CheerioAPI[]
): Array<{ name: string; title: string; email?: string; phone?: string }> {
    const leaders: Array<{ name: string; title: string; email?: string; phone?: string }> = [];

    // Collect all valid emails/phones for heuristic matching
    const allText = texts.join(" ");
    const allEmails = new Set<string>();
    const allPhones = new Set<string>();

    for (const m of findAll(EMAIL_RE, allText)) {
        const domain = m[0].split("@")[1].toLowerCase();
        if (!JUNK_EMAIL_DOMAINS.has(domain)) allEmails.add(m[0].toLowerCase());
    }
    for (const m of findAll(PHONE_RE, allText)) {
        const clean = m[1].replace(/[^\d+]/g, "");
        if (clean.length >= 10) allPhones.add(m[1].trim());
    }

    for (const $ of soups) {
        // Method 1: Structured name+title in divs/sections
        $("div, section, article, li, td, span, p").each((_i, el) => {
            const tagText = $(el).text().trim();
            if (tagText.length > 200 || tagText.length < 8) return;

            const parts = tagText.split(/[-–—|,\n\r]/);
            if (parts.length < 2) return;

            const name = parts[0].trim();
            const title = parts[1].trim();

            // Both parts must pass validation
            if (!isLikelyPersonName(name)) return;
            if (!isLikelyTitle(title)) return;

            const leader: { name: string; title: string; email?: string; phone?: string } = { name, title };
            // Check parent for nearby contact info
            const parentEl = $(el).parent();
            if (parentEl.length) {
                const parentText = parentEl.text().trim();
                const nearbyEmails = findAll(EMAIL_RE, parentText);
                for (const em of nearbyEmails) {
                    if (!JUNK_EMAIL_DOMAINS.has(em[0].split("@")[1].toLowerCase())) {
                        leader.email = em[0].toLowerCase();
                        break;
                    }
                }
                const nearbyPhones = findAll(PHONE_RE, parentText);
                for (const ph of nearbyPhones) {
                    const clean = ph[1].replace(/[^\d+]/g, "");
                    if (clean.length >= 10) { leader.phone = ph[1].trim(); break; }
                }
            }
            leaders.push(leader);
        });

        // Method 2: h3/h4/h5 with name, followed by sibling with title
        $("h3, h4, h5").each((_i, el) => {
            const headingText = $(el).text().trim();
            if (!isLikelyPersonName(headingText)) return;

            const sibling = $(el).nextAll("p, span, div").first();
            if (!sibling.length) return;
            const sibText = sibling.text().trim();

            if (!isLikelyTitle(sibText)) return;

            const leader: { name: string; title: string; email?: string; phone?: string } = {
                name: headingText, title: sibText
            };
            const contactSib = sibling.nextAll("p, span, div, a").first();
            if (contactSib.length) {
                const csText = contactSib.text().trim();
                const em = findAll(EMAIL_RE, csText);
                if (em.length && !JUNK_EMAIL_DOMAINS.has(em[0][0].split("@")[1].toLowerCase())) {
                    leader.email = em[0][0].toLowerCase();
                }
                const ph = findAll(PHONE_RE, csText);
                if (ph.length) {
                    const clean = ph[0][1].replace(/[^\d+]/g, "");
                    if (clean.length >= 10) leader.phone = ph[0][1].trim();
                }
            }
            leaders.push(leader);
        });
    }

    // Deduplicate by name
    const seen = new Set<string>();
    const unique = leaders.filter(l => {
        const key = l.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Heuristic email assignment if no contact info — only use personal emails
    if (unique.length && allEmails.size) {
        const genericPrefixes = ["info@", "contact@", "support@", "admin@", "sales@", "hello@", "office@", "hr@", "jobs@", "careers@"];
        const personalEmails = [...allEmails].filter(e => !genericPrefixes.some(p => e.startsWith(p)));

        for (const leader of unique) {
            if (!leader.email) {
                const firstName = (leader.name.split(/\s+/)[0] || "").toLowerCase();
                if (firstName.length > 2) {
                    for (const email of personalEmails) {
                        const local = email.split("@")[0].toLowerCase();
                        if (local.includes(firstName)) { leader.email = email; break; }
                    }
                }
            }
        }
    }

    return unique.slice(0, 5);
}

// ─── Revenue Signals ───────────────────────────────────────────────────────

export function extractRevenueSignals(
    texts: string[]
): { estimate: number; source: string } | null {
    const allText = texts.join(" ");
    const multipliers: Record<string, number> = {
        million: 1_000_000, m: 1_000_000,
        billion: 1_000_000_000, b: 1_000_000_000,
        k: 1_000,
    };

    // Phrases that, when near the dollar figure, mean it's market size / total
    // contract spend / fundraising stats — NOT this company's revenue.
    const otherContextRe = /\b(award(?:ed|s)?|contract(?:s|ing)?|market\s+size|federal\s+budget|federal\s+spending|industry|annually\s+awarded|spent|budget|raised|funding|investment|valuation|economy|gdp|grants?|total\s+federal|government\s+spending)\b/i;
    // Phrases that corroborate this *is* the company's revenue.
    const ownContextRe = /\b(our\s+revenue|company\s+revenue|annual\s+revenue|gross\s+revenue|we\s+generate|revenue\s+of|revenues\s+of|sales\s+of|top\s+line)\b/i;

    for (const re of [REVENUE_RE, REVENUE_RE2]) {
        for (const m of findAll(re, allText)) {
            const amount = parseFloat(m[1]);
            const unit = m[2].toLowerCase();
            const mult = multipliers[unit] || 1;
            const estimate = amount * mult;
            if (estimate < 10_000 || estimate > 100_000_000_000) continue;

            const start = Math.max(0, (m.index ?? 0) - 100);
            const end = Math.min(allText.length, (m.index ?? 0) + m[0].length + 100);
            const context = allText.slice(start, end);

            // If the surrounding copy is clearly about market size / contract
            // volume / fundraising, skip — it's not the company's own revenue.
            if (otherContextRe.test(context) && !ownContextRe.test(context)) continue;
            // Very large figures (>$1B) are almost always market-wide numbers
            // unless something explicitly ties them to the company.
            if (estimate > 1_000_000_000 && !ownContextRe.test(context)) continue;

            return { estimate, source: "page_text" };
        }
    }
    return null;
}

// ─── Past Clients ──────────────────────────────────────────────────────────

export function extractPastClients(texts: string[]): string[] {
    const allText = texts.join(" ");
    const allLower = allText.toLowerCase();
    const found = new Set<string>();

    for (const agency of FEDERAL_AGENCIES) {
        if (agency.length <= 3) {
            const re = new RegExp(`\\b${agency.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
            if (re.test(allText)) found.add(agency);
        } else {
            if (allLower.includes(agency.toLowerCase())) found.add(agency);
        }
    }

    // Check proximity to context keywords
    const contextKws = [
        "client", "customer", "partner", "contract", "award", "past performance",
        "work with", "served", "supported", "provided",
    ];
    const relevant = new Set<string>();
    for (const agency of found) {
        const agencyPos = allLower.indexOf(agency.toLowerCase());
        for (const kw of contextKws) {
            const kwPos = allLower.indexOf(kw);
            if (agencyPos >= 0 && kwPos >= 0 && Math.abs(agencyPos - kwPos) < 200) {
                relevant.add(agency);
                break;
            }
        }
    }

    return relevant.size ? [...relevant] : [...found].slice(0, 10);
}

// ─── UEI Detection ─────────────────────────────────────────────────────────

export function detectUei(texts: string[], soups: CheerioAPI[]): string | null {
    const allText = texts.join(" ");

    // Structured data first (JSON-LD)
    for (const $ of soups) {
        let found: string | null = null;
        $('script[type="application/ld+json"]').each((_i, el) => {
            if (found) return;
            const ldText = $(el).text().trim();
            if (ldText.toLowerCase().includes("uei")) {
                for (const m of findAll(UEI_RE, ldText.toUpperCase())) {
                    const c = m[1];
                    if (/[A-Z]/.test(c) && /[0-9]/.test(c)) { found = c; return; }
                }
            }
        });
        if (found) return found;
    }

    // Context-based search
    for (const m of findAll(UEI_CONTEXT_RE, allText)) {
        const start = Math.max(0, m.index! - 100);
        const end = Math.min(allText.length, m.index! + m[0].length + 100);
        const nearby = allText.slice(start, end).toUpperCase();

        for (const cm of findAll(UEI_RE, nearby)) {
            const c = cm[1];
            if (/[A-Z]/.test(c) && /[0-9]/.test(c) && new Set(c).size >= 4) {
                return c;
            }
        }
    }

    // Labeled pattern: "UEI: XXXXXXXXXXXX"
    const labeledRe = /UEI\s*[:#]\s*([A-Z0-9]{12})\b/g;
    for (const m of findAll(labeledRe, allText.toUpperCase())) {
        const c = m[1];
        if (/[A-Z]/.test(c) && /[0-9]/.test(c)) return c;
    }

    return null;
}

// ─── CAGE Code Detection ───────────────────────────────────────────────────

export function detectCageCode(texts: string[]): string | null {
    const allText = texts.join(" ");
    const cageRe = /(?:CAGE|cage\s+code)\s*[:#]?\s*([A-Z0-9]{5})\b/gi;

    for (const m of findAll(cageRe, allText)) {
        const c = m[1].toUpperCase();
        if (/[A-Z]/.test(c) && /[0-9]/.test(c)) return c;
    }
    return null;
}

// ─── Legal Info ────────────────────────────────────────────────────────────

export function extractLegalInfo(
    texts: string[], _soups: CheerioAPI[]
): { legal_name?: string; entity_type?: string } {
    const allText = texts.join(" ");
    const info: { legal_name?: string; entity_type?: string } = {};

    const legalNameRe = /(?:legal\s+name|registered\s+(?:as|name)|doing\s+business\s+as|DBA|d\.b\.a\.)\s*[:#]?\s*([A-Z][A-Za-z0-9\s&.,'-]+)/i;
    const nameMatch = legalNameRe.exec(allText);
    if (nameMatch) {
        const name = nameMatch[1].trim();
        if (name.length > 3 && name.length < 100) info.legal_name = name;
    }

    const entityTypes = allText.match(
        /\b(LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|LP|LLP|S-Corp|C-Corp)\b/gi
    );
    if (entityTypes?.length) {
        info.entity_type = entityTypes[0].toUpperCase().replace(/\.$/, "");
    }

    return info;
}

// ─── Past Customers / Clients ──────────────────────────────────────────────

/**
 * Extract past customers/clients by locating sections labeled "clients", "customers",
 * "case studies", "partners" and pulling short capitalized entity names from them.
 * Returns a deduplicated list of up to 15 entries.
 */
export function extractPastCustomers(
    texts: string[], soups: CheerioAPI[]
): string[] {
    const found = new Set<string>();
    const sectionHeadings = /(?:our\s+)?(clients|customers|case\s+stud(?:y|ies)|partners|who\s+we\s+serve|trusted\s+by|testimonial)/i;

    for (const $ of soups) {
        // Find headings matching client/customer patterns, then collect sibling text
        $("h1, h2, h3, h4, h5, section, div").each((_i, el) => {
            const text = $(el).text().trim();
            if (!text || text.length > 120) return;
            if (!sectionHeadings.test(text)) return;

            // Collect names from the next siblings (lists, divs, images with alt text)
            const container = $(el).parent().length ? $(el).parent() : $(el);
            container.find("li, img[alt], p, span").each((_j, sub) => {
                let candidate = "";
                const tagName = (sub as unknown as { tagName?: string }).tagName || (sub as unknown as { name?: string }).name || "";
                if (tagName === "img") {
                    candidate = $(sub).attr("alt") || "";
                } else {
                    candidate = $(sub).text().trim();
                }
                candidate = candidate.replace(/\s+/g, " ").trim();
                // Valid customer names are 2-60 chars, start with uppercase, not a sentence
                if (candidate.length < 2 || candidate.length > 60) return;
                const words = candidate.split(/\s+/);
                if (words.length > 6) return;
                if (!/^[A-Z]/.test(candidate)) return;
                // Skip generic words
                if (/^(the|our|and|for|with|this|that|view|more|all|home|about|contact)$/i.test(candidate)) return;
                found.add(candidate);
            });
        });
    }

    // Fallback: scan raw text for "trusted by X, Y, Z" or "clients include X, Y, Z" patterns
    if (found.size < 3) {
        const allText = texts.join(" ");
        const trustedRe = /(?:trusted\s+by|clients?\s+include|customers?\s+include|partners?\s+include|our\s+clients|case\s+studies?)[:\s]+([^.!?\n]{10,400})/gi;
        for (const m of findAll(trustedRe, allText)) {
            const chunk = m[1];
            for (const piece of chunk.split(/[,;&/]|\band\b/i)) {
                const clean = piece.trim().replace(/\s+/g, " ");
                if (clean.length < 2 || clean.length > 60) continue;
                const words = clean.split(/\s+/);
                if (words.length > 6) continue;
                if (!/^[A-Z]/.test(clean)) continue;
                if (/^(the|our|and|for|with|this|that|view|more|all|home|about|contact)$/i.test(clean)) continue;
                found.add(clean);
            }
        }
    }

    return [...found].slice(0, 15);
}

// ─── Project Portfolio ─────────────────────────────────────────────────────

/**
 * Extract project/portfolio entries from case study pages, work/portfolio sections.
 */
export function extractProjectPortfolio(
    texts: string[], soups: CheerioAPI[]
): string[] {
    const projects = new Set<string>();
    const portfolioKws = /(portfolio|case\s+stud|project|our\s+work|recent\s+work|past\s+projects|featured\s+work)/i;

    for (const $ of soups) {
        $("h2, h3, h4, section, article").each((_i, el) => {
            const text = $(el).text().trim();
            if (!text || text.length > 150) return;
            if (!portfolioKws.test(text)) return;

            // Collect card titles from nearby containers
            const container = $(el).parent().length ? $(el).parent() : $(el);
            container.find("h3, h4, h5, .card-title, figcaption").each((_j, sub) => {
                const candidate = $(sub).text().trim().replace(/\s+/g, " ");
                if (candidate.length >= 5 && candidate.length <= 120) {
                    projects.add(candidate);
                }
            });
        });
    }

    return [...projects].slice(0, 10);
}

// ─── Government Experience Signals ─────────────────────────────────────────

/**
 * Detect phrases that indicate prior government / federal / military experience.
 */
export function detectGovExperience(
    texts: string[]
): { keywords: string[]; hit_count: number; has_gov_experience: boolean } {
    const allText = texts.join(" ").toLowerCase();
    const signals: Record<string, RegExp> = {
        federal: /\bfederal\s+(?:government|contract|agency|client)/g,
        government: /\bgovernment\s+(?:contract|client|agency|work|experience)/g,
        military: /\bmilitary\s+(?:contract|experience|grade|client)/g,
        dod: /\b(?:dod|department\s+of\s+defense)\b/g,
        doe: /\b(?:department\s+of\s+energy)\b/g,
        dhs: /\b(?:dhs|department\s+of\s+homeland\s+security)\b/g,
        va: /\b(?:veterans?\s+affairs?|department\s+of\s+veterans?)\b/g,
        army: /\bu\.?s\.?\s+army\b/g,
        navy: /\bu\.?s\.?\s+navy\b/g,
        airforce: /\bu\.?s\.?\s+air\s+force\b/g,
        gsa_schedule: /\bgsa\s+schedule\b/g,
        federal_contract: /\bfederal\s+contract/g,
        prime_contractor: /\bprime\s+contractor\b/g,
        past_performance: /\bpast\s+performance\b/g,
        capability_statement: /\bcapability\s+statement\b/g,
    };

    const hits: string[] = [];
    let hitCount = 0;
    for (const [name, re] of Object.entries(signals)) {
        const matches = [...allText.matchAll(re)];
        if (matches.length > 0) {
            hits.push(name);
            hitCount += matches.length;
        }
    }

    return {
        keywords: hits,
        hit_count: hitCount,
        has_gov_experience: hits.length >= 2 || hitCount >= 3,
    };
}

// ─── Team Size Signal ──────────────────────────────────────────────────────

/**
 * Return a qualitative team-size signal based on explicit mentions and employee estimate.
 */
export function inferTeamSizeSignal(
    texts: string[], employeeSignals: { estimate: number; source: string } | null
): string | null {
    if (employeeSignals) {
        const n = employeeSignals.estimate;
        if (n >= 500) return "enterprise";
        if (n >= 50) return "mid-sized";
        if (n >= 10) return "small";
        return "micro";
    }

    const allText = texts.join(" ").toLowerCase();
    if (/\bfortune\s+\d+|\bmulti[-\s]national|\bglobal\s+presence/.test(allText)) return "enterprise";
    if (/\b(family[-\s]owned|boutique|small\s+business|local\s+business|veteran[-\s]owned)/.test(allText)) return "small";
    if (/\bteam\s+of\s+(\d+)\b/.test(allText)) {
        const m = allText.match(/\bteam\s+of\s+(\d+)\b/);
        if (m) {
            const n = parseInt(m[1], 10);
            if (n >= 50) return "mid-sized";
            if (n >= 10) return "small";
            return "micro";
        }
    }
    return null;
}

// ─── Per-Page Clean Extract ────────────────────────────────────────────────

/**
 * Extract a cleaned textual summary for a single page (title + best paragraphs).
 */
export function extractPageSummary($: CheerioAPI): { title: string; text: string } {
    const title = $("title").text().trim().slice(0, 200) ||
                  $("h1").first().text().trim().slice(0, 200) ||
                  "";
    // Gather paragraph-like content, skipping nav/footer
    $("nav, footer, header, aside, script, style, noscript").remove();
    const paragraphs: string[] = [];
    $("p, li, h2, h3, h4").each((_i, el) => {
        const text = $(el).text().trim().replace(/\s+/g, " ");
        if (text.length >= 30 && text.length <= 500) {
            paragraphs.push(text);
        }
    });
    // Cap to first ~2000 chars of collected content
    const combined = paragraphs.join(" ").slice(0, 2000);
    return { title, text: combined };
}

// ─── LinkedIn Enrichment ───────────────────────────────────────────────────

export async function fetchLinkedInData(
    linkedinUrl: string | null,
): Promise<{ description?: string; employee_count?: number; industry?: string } | null> {
    if (!linkedinUrl) return null;

    try {
        const resp = await fetch(linkedinUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
            signal: AbortSignal.timeout(5000),
            redirect: "follow",
        });
        if (!resp.ok) return null;

        const html = (await resp.text()).slice(0, MAX_RESPONSE_SIZE);
        const data: Record<string, unknown> = {};

        // Meta description
        const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i) ||
                          html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
        if (descMatch) data.description = descMatch[1].trim().slice(0, 500);

        // Employee count
        const empMatch = html.match(/(\d[\d,]+)\s*(?:employees?|associates|workers)/i);
        if (empMatch) {
            const count = parseInt(empMatch[1].replace(/,/g, ""), 10);
            if (count >= 1 && count <= 500_000) data.employee_count = count;
        }

        // Industry
        const industryMatch = html.match(/<meta\s+name="industry"\s+content="([^"]+)"/i);
        if (industryMatch) data.industry = industryMatch[1].trim();

        return Object.keys(data).length ? data as { description?: string; employee_count?: number; industry?: string } : null;
    } catch {
        return null;
    }
}

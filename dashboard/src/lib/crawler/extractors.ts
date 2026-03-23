/**
 * Data extraction functions.
 * Ported 1:1 from tools/17_analyze_company.py lines 337-804.
 *
 * Each function takes arrays of Cheerio root objects (soups) and/or
 * plain-text strings (texts) and returns structured data.
 */

import type { CheerioAPI } from "cheerio";
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

// ─── Description ───────────────────────────────────────────────────────────

export function extractDescription(soups: CheerioAPI[], texts: string[]): string {
    let description = "";

    for (const $ of soups) {
        const metaDesc = $('meta[name="description"]').attr("content");
        if (metaDesc?.trim()) { description = metaDesc.trim(); break; }
        const ogDesc = $('meta[property="og:description"]').attr("content");
        if (ogDesc?.trim()) { description = ogDesc.trim(); break; }
    }

    if (description.length < 100 && texts.length > 1) {
        const aboutText = texts[1] || texts[0];
        const sentences = aboutText.split(/(?<=[.!?])\s+/);
        const paras: string[] = [];
        for (const s of sentences) {
            const t = s.trim();
            if (t.length > 50) {
                paras.push(t);
                if (paras.join(" ").length > 300) break;
            }
        }
        if (paras.length) {
            const supplement = paras.join(" ").slice(0, 500);
            description = description ? description + " " + supplement : supplement;
        }
    }

    return description.slice(0, 1000);
}

// ─── Services ──────────────────────────────────────────────────────────────

export function extractServices(soups: CheerioAPI[], _texts: string[]): string[] {
    const services = new Set<string>();

    for (const $ of soups) {
        // List items
        $("ul li, ol li").each((_i, el) => {
            const text = $(el).text().trim();
            if (text.length > 10 && text.length < 100) {
                const lower = text.toLowerCase();
                if (!["home", "login", "sign", "privacy", "cookie", "©"].some(s => lower.includes(s))) {
                    services.add(text);
                }
            }
        });

        // Headings near service keywords
        $("h2, h3, h4").each((_i, el) => {
            const text = $(el).text().trim();
            if (text.length > 5 && text.length < 80) {
                const kws = ["service", "solution", "capabilit", "offer", "what we do", "specializ"];
                const parentText = $(el).parent().text().trim().slice(0, 100).toLowerCase();
                if (kws.some(kw => text.toLowerCase().includes(kw) || parentText.includes(kw))) {
                    services.add(text);
                }
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

export function extractLocations(
    texts: string[]
): { locations: Array<{ address?: string; state?: string }>; states: string[] } {
    const allText = texts.join(" ");
    const locations: Array<{ address?: string; state?: string }> = [];

    for (const m of findAll(ADDRESS_RE, allText)) {
        locations.push({ address: m[0].trim() });
    }

    const stateRe = new RegExp(`\\b(${STATE_RE_STR})\\b`, "g");
    const states = new Set<string>();
    for (const m of findAll(stateRe, allText)) {
        if (US_STATES.has(m[1])) states.add(m[1]);
    }

    if (!locations.length && states.size) {
        for (const state of [...states].slice(0, 3)) {
            locations.push({ state });
        }
    }
    if (locations.length && states.size) {
        locations[0].state = [...states][0];
    }

    return { locations: locations.slice(0, 5), states: [...states] };
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

export function estimateEmployees(
    texts: string[]
): { estimate: number; source: string } | null {
    const allText = texts.join(" ");
    for (const m of findAll(EMPLOYEE_RE, allText)) {
        const count = parseInt(m[1], 10);
        if (count >= 1 && count <= 50000) {
            return { estimate: count, source: "page_text" };
        }
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
            const tagLower = tagText.toLowerCase();

            for (const keyword of TITLE_KEYWORDS) {
                if (tagLower.includes(keyword) && tagText.length < 200) {
                    const parts = tagText.split(/[-–—|,\n\r]/);
                    if (parts.length >= 2) {
                        const name = parts[0].trim();
                        const title = parts[1].trim();
                        if (name.length > 3 && name.length < 50 && title.length > 3 && title.length < 60) {
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
                        }
                    }
                    break;
                }
            }
        });

        // Method 2: h3/h4/h5 with name, followed by sibling with title
        $("h3, h4, h5").each((_i, el) => {
            const headingText = $(el).text().trim();
            if (headingText.length <= 3 || headingText.length >= 50) return;
            const skipWords = ["service", "about", "contact", "our", "meet"];
            if (skipWords.some(w => headingText.toLowerCase().includes(w))) return;

            const sibling = $(el).nextAll("p, span, div").first();
            if (!sibling.length) return;
            const sibText = sibling.text().trim();
            const sibLower = sibText.toLowerCase();

            for (const keyword of TITLE_KEYWORDS) {
                if (sibLower.includes(keyword) && sibText.length < 80) {
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
                    return; // equivalent to break from inner loop + continue outer
                }
            }
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

    // Heuristic email assignment if no contact info
    if (unique.length && allEmails.size) {
        const genericPrefixes = ["info@", "contact@", "support@", "admin@", "sales@", "hello@", "office@"];
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

    for (const re of [REVENUE_RE, REVENUE_RE2]) {
        for (const m of findAll(re, allText)) {
            const amount = parseFloat(m[1]);
            const unit = m[2].toLowerCase();
            const mult = multipliers[unit] || 1;
            const estimate = amount * mult;
            if (estimate >= 10_000 && estimate <= 100_000_000_000) {
                return { estimate, source: "page_text" };
            }
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

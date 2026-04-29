/**
 * Contractor website crawl — fallback enrichment when Apollo doesn't return
 * an email. Reuses the Quick Checker pipeline (Firecrawl-rendered markdown
 * → OpenAI structured outputs) via `analyzeCompany`, which already extracts
 * leadership, contacts, and social links.
 *
 * Returned shape is intentionally narrow — only what we'd write back to
 * the contractors table — so callers don't need to know the full
 * CrawlData.
 */

import { analyzeCompany } from "@/lib/crawler";

export interface CrawledContact {
    primary_poc_name?: string;
    primary_poc_title?: string;
    primary_poc_email?: string;
    primary_poc_phone?: string;
    secondary_poc_name?: string;
    secondary_poc_title?: string;
    secondary_poc_email?: string;
    company_linkedin?: string;
    pages_crawled: number;
}

const GENERIC_EMAIL_LOCAL_RE = /^(info|admin|hello|contact|sales|support|office|enquiries|inquiries|service|services|noreply|no-reply|postmaster|webmaster|marketing|hr|jobs)@/i;

/**
 * Pick the most useful executive from `leadership[]`. Strong preference for
 * CEO/President/Owner/Founder. Falls back to the first leader with an email.
 */
function pickExecutive(leadership: Array<{ name?: string; title?: string; email?: string; phone?: string }>):
    { name?: string; title?: string; email?: string; phone?: string } | null {
    if (!leadership?.length) return null;

    const score = (title?: string): number => {
        const t = (title || "").toLowerCase();
        if (/(^|\b)(ceo|chief executive)\b/.test(t))             return 100;
        if (/(^|\b)(president)\b/.test(t))                       return 90;
        if (/(^|\b)(owner|principal|founder|managing director)\b/.test(t)) return 85;
        if (/(^|\b)(coo|chief operating)\b/.test(t))             return 70;
        if (/(^|\b)(vice president|vp|director)\b/.test(t))      return 50;
        if (/(^|\b)(general manager|gm)\b/.test(t))              return 40;
        if (t)                                                   return 20;
        return 10;
    };

    return leadership
        .filter(l => l.name)
        .map(l => ({ ...l, _s: score(l.title) + (l.email ? 5 : 0) }))
        .sort((a, b) => b._s - a._s)[0] || null;
}

/**
 * Pick the best contact email out of the loose contacts list. Prefers
 * non-generic addresses on the company's domain.
 */
function pickEmail(
    contacts: Array<{ email?: string; phone?: string }>,
    primaryDomain?: string | null,
): string | undefined {
    const emails = contacts.map(c => c.email).filter((e): e is string => !!e && e.includes("@"));
    if (!emails.length) return undefined;

    const onDomain = primaryDomain
        ? emails.filter(e => e.toLowerCase().endsWith("@" + primaryDomain.toLowerCase()))
        : [];
    const named = (onDomain.length ? onDomain : emails).filter(e => !GENERIC_EMAIL_LOCAL_RE.test(e));
    return named[0] || onDomain[0] || emails[0];
}

function pickPhone(contacts: Array<{ phone?: string }>, leadership: Array<{ phone?: string }>): string | undefined {
    return leadership.find(l => l.phone)?.phone || contacts.find(c => c.phone)?.phone;
}

function domainOf(url?: string | null): string | null {
    if (!url) return null;
    try {
        const u = new URL(url.startsWith("http") ? url : "https://" + url);
        return u.hostname.replace(/^www\./, "").toLowerCase();
    } catch {
        return null;
    }
}

export async function crawlContractor(args: {
    company_name: string;
    website: string;
}): Promise<{ ok: true; contact: CrawledContact } | { ok: false; reason: string }> {
    const { company_name, website } = args;
    if (!website) return { ok: false, reason: "no_website" };

    const result = await analyzeCompany(company_name || "", website);
    if (!result.success) {
        return { ok: false, reason: (result.errors[0] || "crawl_failed").slice(0, 120) };
    }

    const data = result.data;
    const primaryDomain = domainOf(website);
    const executive = pickExecutive(data.leadership);
    const fallbackEmail = pickEmail(data.contacts, primaryDomain);
    const fallbackPhone = pickPhone(data.contacts, data.leadership);

    const contact: CrawledContact = {
        pages_crawled: data.pages_crawled.length,
    };

    if (executive?.name)                       contact.primary_poc_name = executive.name;
    if (executive?.title)                      contact.primary_poc_title = executive.title;
    if (executive?.email)                      contact.primary_poc_email = executive.email;
    else if (fallbackEmail)                    contact.primary_poc_email = fallbackEmail;
    if (executive?.phone)                      contact.primary_poc_phone = executive.phone;
    else if (fallbackPhone)                    contact.primary_poc_phone = fallbackPhone;

    // Keep a second leader on hand if there is one — useful for follow-up
    // sequences when the primary doesn't reply.
    const second = data.leadership.find(l => l.name && l.name !== executive?.name);
    if (second?.name)                          contact.secondary_poc_name = second.name;
    if (second?.title)                         contact.secondary_poc_title = second.title;
    if (second?.email)                         contact.secondary_poc_email = second.email;

    if (data.social_links?.linkedin)           contact.company_linkedin = data.social_links.linkedin;

    return { ok: true, contact };
}

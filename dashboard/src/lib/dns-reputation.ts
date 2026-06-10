/**
 * DNS-based domain auth checks for SPF / DKIM / DMARC.
 *
 * Why this exists: outbound deliverability silently breaks when the
 * SPF include list drifts, a DKIM key rotates without the DNS record
 * being updated, or a DMARC policy is dropped. Checking via raw DNS
 * (TXT lookup) means we don't depend on Resend/Postmark's dashboards —
 * we see the truth of what every mailbox provider sees.
 *
 * Used by:
 *   - /api/cron/check_domain_reputation  (daily snapshot + Sentry alert on flip)
 *   - /api/admin/outreach/domain-auth    (live re-check button on Settings tab)
 */

import { resolveTxt } from "node:dns/promises";

export type AuthCheck = {
    record: string | null;     // raw TXT value we found (or null if missing)
    pass: boolean;             // does it look syntactically valid + reasonable
    reason: string;            // human explanation for UI
};

export type DomainAuthResult = {
    domain: string;
    spf: AuthCheck;
    dkim: AuthCheck;
    dmarc: AuthCheck;
    checked_at: string;
};

/**
 * Look up TXT records and return them as joined strings (DNS chunks every
 * 255 chars, so we join the array of strings node returns per record).
 */
async function txt(host: string): Promise<string[]> {
    try {
        const records = await resolveTxt(host);
        return records.map((chunks) => chunks.join(""));
    } catch {
        return [];
    }
}

/**
 * SPF: TXT record on the root domain that starts with "v=spf1".
 * Pass = exactly one v=spf1 record found and it includes an enforcement
 * mechanism (~all, -all, ?all, or +all). Multiple SPF records is a hard
 * fail per RFC 7208.
 */
async function checkSpf(domain: string): Promise<AuthCheck> {
    const records = await txt(domain);
    const spfRecords = records.filter((r) => r.toLowerCase().startsWith("v=spf1"));

    if (spfRecords.length === 0) {
        return { record: null, pass: false, reason: "No SPF record found" };
    }
    if (spfRecords.length > 1) {
        return {
            record: spfRecords.join(" | "),
            pass: false,
            reason: `Multiple SPF records (${spfRecords.length}) — RFC 7208 violation`,
        };
    }
    const spf = spfRecords[0];
    const hasAll = /\s[~\-?+]all\b/.test(spf);
    if (!hasAll) {
        return { record: spf, pass: false, reason: "SPF record missing 'all' mechanism" };
    }
    return { record: spf, pass: true, reason: "SPF record present and well-formed" };
}

/**
 * DKIM: TXT on <selector>._domainkey.<domain>. We probe a list of common
 * selectors (Resend uses "resend", many ESPs use "default" or "s1"/"s2",
 * Google uses "google", Mailgun uses "k1"/"krs", Postmark uses "20*").
 * Pass = at least one selector returns a v=DKIM1 record with a non-empty p=.
 */
const DKIM_SELECTORS = [
    "resend",
    "default",
    "google",
    "s1",
    "s2",
    "k1",
    "k2",
    "selector1",
    "selector2",
    "mail",
    "sm",
    "smtpapi",
    "dkim",
];

async function checkDkim(domain: string): Promise<AuthCheck> {
    for (const selector of DKIM_SELECTORS) {
        const records = await txt(`${selector}._domainkey.${domain}`);
        for (const r of records) {
            const lower = r.toLowerCase();
            if (!lower.includes("v=dkim1")) continue;
            const pMatch = r.match(/[;\s]p=([A-Za-z0-9+/=]+)/);
            if (!pMatch || !pMatch[1] || pMatch[1].length < 20) {
                return {
                    record: r,
                    pass: false,
                    reason: `DKIM (${selector}) found but p= missing or revoked`,
                };
            }
            return {
                record: r,
                pass: true,
                reason: `DKIM passes via selector "${selector}"`,
            };
        }
    }
    return {
        record: null,
        pass: false,
        reason: `No DKIM record found on common selectors (${DKIM_SELECTORS.join(", ")})`,
    };
}

/**
 * DMARC: TXT on _dmarc.<domain> starting with "v=DMARC1".
 * Pass = record present AND policy is quarantine or reject (p=none is
 * monitor-only and Gmail/Yahoo's 2024 bulk-sender rules treat it as fail).
 */
async function checkDmarc(domain: string): Promise<AuthCheck> {
    const records = await txt(`_dmarc.${domain}`);
    const dmarc = records.find((r) => r.toLowerCase().startsWith("v=dmarc1"));
    if (!dmarc) {
        return { record: null, pass: false, reason: "No DMARC record found" };
    }
    const pMatch = dmarc.match(/[;\s]p=(none|quarantine|reject)/i);
    const policy = pMatch ? pMatch[1].toLowerCase() : null;
    if (!policy) {
        return { record: dmarc, pass: false, reason: "DMARC record missing p= policy" };
    }
    if (policy === "none") {
        return {
            record: dmarc,
            pass: false,
            reason: "DMARC policy=none — Gmail/Yahoo bulk-sender rules require quarantine/reject",
        };
    }
    return { record: dmarc, pass: true, reason: `DMARC policy=${policy}` };
}

/**
 * Run all three checks in parallel. Bare domain (no scheme, no path).
 *   await checkDomainAuth("capturepilot.com")
 */
export async function checkDomainAuth(domain: string): Promise<DomainAuthResult> {
    const clean = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const [spf, dkim, dmarc] = await Promise.all([
        checkSpf(clean),
        checkDkim(clean),
        checkDmarc(clean),
    ]);
    return {
        domain: clean,
        spf,
        dkim,
        dmarc,
        checked_at: new Date().toISOString(),
    };
}

/**
 * Extract the bare domain from a `Name <user@example.com>` style env value,
 * or from a plain `user@example.com`. Returns null if no @ found.
 */
export function extractDomainFromFromEmail(fromEmail: string | undefined | null): string | null {
    if (!fromEmail) return null;
    const m = fromEmail.match(/[\w.\-+]+@([\w.\-]+)/);
    return m ? m[1].toLowerCase() : null;
}

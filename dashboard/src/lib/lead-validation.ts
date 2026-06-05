/**
 * Shared lead validation helpers.
 *
 * Used by:
 *  - /api/lead-magnet/confirm (server-side reject of fake submissions)
 *  - hubspot-brief.ts (lead-quality classification at HubSpot push)
 *  - LeadMagnetForm (optional client-side warning before submit)
 *
 * Two distinct checks:
 *  - isFakeSubmission()       — hard reject. Gibberish name, garbage email
 *                                shape, throwaway keywords. We do NOT send
 *                                reports / push to HubSpot when this trips.
 *  - looksFreeEmailDomain()   — soft signal. Personal email (gmail, yahoo,
 *                                ISP) is a real person, just lower intent.
 *                                Use it to warn the user ("for a more
 *                                accurate match, use your work email") not
 *                                to block.
 */

export const FREE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
    // Major webmail
    "gmail.com","yahoo.com","hotmail.com","outlook.com","aol.com","icloud.com","me.com",
    "live.com","msn.com","protonmail.com","proton.me","gmx.com","gmx.de","gmx.net",
    "web.de","t-online.de","yandex.com","mail.com","ymail.com","rocketmail.com",
    "zoho.com","tutanota.com","fastmail.com","duck.com","googlemail.com","hotmail.co.uk",
    // US ISP-provided
    "verizon.net","comcast.net","sbcglobal.net","att.net","charter.net","cox.net",
    "earthlink.net","optimum.net","optonline.net","prodigy.net","frontier.com",
    "frontiernet.net","windstream.net","centurylink.net","suddenlink.net",
    "mediacombb.net","twc.com","rr.com","bellsouth.net","swbell.net","pacbell.net",
    "ameritech.net","snet.net","q.com","embarqmail.com",
]);

// Sketchy TLDs that are almost always spam / one-off throwaway domains.
const SKETCHY_TLD = /\.(tk|ml|ga|cf|gq|click|top|xyz|loan|work|gdn|men|cricket|date)$/i;

/**
 * Email looks structurally valid AND isn't an obvious scrape artifact.
 * Returns null if OK, or a short reason string if rejected.
 */
export function checkEmailShape(rawEmail: string | null | undefined): string | null {
    if (!rawEmail) return "Email is required";
    const email = rawEmail.trim().toLowerCase();
    if (email.length < 5) return "Email is too short";
    if (email.length > 100) return "Email is too long";
    if ((email.match(/@/g) || []).length !== 1) return "Email must contain exactly one @";
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return "That email format doesn't look right";
    const local = email.split("@")[0] || "";
    const domain = email.split("@")[1] || "";
    if (SKETCHY_TLD.test(domain)) return "Please use a real business or personal email — that domain is on our spam list";
    // Embedded phone number in the local part — a classic scrape-artifact tell
    // (we've seen "contracts.786-477-0477hello@govconedu.comlearngovcon" etc).
    // 7+ consecutive digits OR a NNN-NNN-NNNN pattern → reject.
    if (/\d{3}[-\s.]?\d{3}[-\s.]?\d{4}/.test(local)) return "That email looks garbled (phone number embedded) — please re-type it";
    if (/\d{7,}/.test(local)) return "That email looks garbled — please re-type it";
    // Domain has TLD-then-more-letters glued on ("...comlearngovcon"). Real
    // domains end in a known TLD; this catches the typo + scrape cases.
    if (/\.(com|net|org|gov|edu|io|co|ai|us|de|uk)[a-z]{3,}$/i.test(domain)) return "That email looks garbled — please re-type it";
    return null;
}

export function looksFreeEmailDomain(email: string | null | undefined): boolean {
    if (!email) return false;
    const domain = email.toLowerCase().split("@")[1]?.trim() || "";
    return FREE_EMAIL_DOMAINS.has(domain);
}

/**
 * "Looks like a real human name." Rejects digit-laced first names, random
 * keyboard mashes, and the handful of obvious throwaway tokens we've actually
 * seen in marketing_leads. Returns true if the inputs look gibberish enough
 * to drop the submission.
 *
 * Tuned to be PERMISSIVE — false negatives (some spam slips through) are
 * better than false positives (legit name "Bjørn" gets rejected). Sales
 * has cp_lead_quality + hs_lead_status=UNQUALIFIED as the second layer.
 */
export function looksGibberishName(firstName?: string | null, lastName?: string | null, company?: string | null): boolean {
    const parts = [firstName, lastName, company].filter(Boolean).map(s => String(s).trim().toLowerCase());
    if (parts.length === 0) return false;

    const first = (firstName || "").trim().toLowerCase();
    // Digits in a person's first name → almost always fake ("jaydub3961",
    // "user1234"). Don't flag if it's ONLY the company name with digits
    // (e.g. "1st Choice Services LLC" is legit).
    if (first && /\d/.test(first)) return true;

    for (const p of parts) {
        // Random keyboard mash: 5+ consonants in a row ("vkhgjk", "asdfgh")
        if (/[bcdfghjklmnpqrstvwxz]{5,}/i.test(p)) return true;
        // Known throwaway tokens
        if (/^(test|asdf|qwer|qwerty|hjkl|abcd|xxx+|yyy+|fake|spam|admin|na|n\/a|none)\d*$/i.test(p)) return true;
    }

    // Spam-bot vocabulary we've actually seen in marketing_leads
    const fullName = `${firstName || ""} ${lastName || ""}`.toLowerCase().trim();
    if (/(hegemony|ample|wretched|gobble|gulping|whatever|whoever|asdfgh|qwerty)/i.test(fullName)) return true;

    return false;
}

/**
 * Top-level "should we hard-reject this submission?" check. Combines email
 * shape + name gibberish into one boolean + reason. Used by
 * /api/lead-magnet/confirm — when this returns a reason, we 400 with that
 * message and write nothing.
 *
 * NOTE: does NOT reject for free email domain. That's a soft signal —
 * gmail users are real people, sales just sees them as lower quality via
 * cp_lead_quality=FREE_EMAIL_ONLY in HubSpot.
 */
export function rejectFakeSubmission(args: {
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    company?: string | null;
}): string | null {
    const emailErr = checkEmailShape(args.email);
    if (emailErr) return emailErr;
    if (looksGibberishName(args.firstName, args.lastName, args.company)) {
        return "Please use your real name — we use this to address your report.";
    }
    return null;
}

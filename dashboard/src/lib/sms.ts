/**
 * Twilio SMS — partner alerts for new lead briefs (complement to whatsapp.ts).
 *
 * We talk to Twilio's REST API directly (no SDK) — keeps the bundle small +
 * lets us own the timeout/retry behavior. The endpoint is dead simple:
 *   POST /2010-04-01/Accounts/{AccountSID}/Messages.json
 *   HTTP Basic Auth with AccountSID:AuthToken
 *   Form-encoded body { From, To, Body }
 *
 * Required env (one of two auth modes):
 *   TWILIO_ACCOUNT_SID    — "AC..." 34-char string from console.twilio.com
 *   TWILIO_PHONE_NUMBER   — our Twilio number in E.164 (e.g. +18338661386)
 *
 *   Auth mode A (preferred, scoped + revokable):
 *     TWILIO_API_KEY_SID    — "SK..." API key SID
 *     TWILIO_API_KEY_SECRET — the matching secret
 *
 *   Auth mode B (fallback, account-wide):
 *     TWILIO_AUTH_TOKEN     — the master Auth Token from the dashboard
 *
 * We prefer the API key when both are set so we can rotate without breaking
 * other tools (e.g. the Account Auth Token may be shared with HubSpot/Stripe
 * integrations later).
 *
 * The recipient phone (Sergio's number) is read from the SAME env var
 * WhatsApp uses — WHATSAPP_PARTNER_PHONE — so we don't drift between channels.
 * If you want a separate SMS recipient later, swap to SMS_PARTNER_PHONE.
 *
 * Trial-account caveat: until you upgrade, Twilio only accepts `To` numbers
 * that you've verified in the console at console.twilio.com/us1/develop/
 * phone-numbers/manage/verified. Verify Sergio's +18503769785 there once,
 * and the API will start accepting messages to him.
 *
 * Toll-free caveat: +18338661386 is a US toll-free number (TFN). Until you
 * complete TFN Verified Sender registration with Twilio (free, ~3-day approval),
 * throughput is capped at ~10 messages/min and some carriers may filter
 * traffic. For low-volume partner alerts (~10/day) this is fine.
 */

interface SmsResult {
    sent: boolean;
    sid?: string;
    error?: string;
    code?: number;
    needsVerification?: boolean;
}

interface MultiSmsResult {
    sent: boolean;       // true if AT LEAST ONE recipient delivery succeeded
    perRecipient: Array<{ to: string; sent: boolean; sid?: string; error?: string; code?: number; needsVerification?: boolean }>;
    error?: string;      // top-level error (env missing, no recipients, etc.)
}

/**
 * Send to ONE specific recipient. Internal — callers should use
 * sendSmsPartnerAlert() so multi-recipient routing stays centralized.
 */
async function sendSmsToOne(args: { accountSid: string; authUser: string; authPass: string; from: string; to: string; text: string }): Promise<SmsResult> {
    const { accountSid, authUser, authPass, from, to, text } = args;
    const auth = Buffer.from(`${authUser}:${authPass}`).toString("base64");
    const body = new URLSearchParams({ From: from, To: to, Body: text.slice(0, 1600) });
    try {
        const res = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
            {
                method: "POST",
                headers: { Authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
                body: body.toString(),
                signal: AbortSignal.timeout(10000),
            },
        );
        const raw = await res.text();
        let parsed: { sid?: string; code?: number; message?: string };
        try { parsed = JSON.parse(raw); } catch { parsed = {}; }
        if (!res.ok) {
            const code = parsed.code || 0;
            return {
                sent: false,
                error: parsed.message || `twilio ${res.status}: ${raw.slice(0, 200)}`,
                code,
                needsVerification: code === 21608,
            };
        }
        return { sent: true, sid: parsed.sid };
    } catch (e) {
        return { sent: false, error: (e as Error).message };
    }
}

/**
 * Send the same SMS to every configured partner recipient. The env
 * SMS_PARTNER_PHONES takes a comma-separated E.164 list (e.g.
 * "+14427322693,+18503769785") and wins over the legacy single-recipient
 * SMS_PARTNER_PHONE / WHATSAPP_PARTNER_PHONE vars.
 *
 * Returns success if AT LEAST ONE recipient delivery succeeded — partial
 * failure is logged per-recipient in perRecipient[]. This shape lets the
 * brief pipeline keep moving when Twilio bounces one number but the other
 * lands.
 */
export async function sendSmsPartnerAlert(text: string): Promise<MultiSmsResult> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const apiKeySid = process.env.TWILIO_API_KEY_SID;
    const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_PHONE_NUMBER;

    // Multi-recipient: comma-separated list wins. Fall back to legacy single
    // vars for backward compat (still useful when only Sergio's number is set).
    const recipientsRaw = process.env.SMS_PARTNER_PHONES
        || process.env.SMS_PARTNER_PHONE
        || process.env.WHATSAPP_PARTNER_PHONE
        || "";
    const recipients = recipientsRaw.split(",").map(s => s.trim()).filter(Boolean);

    const useApiKey = !!(apiKeySid && apiKeySecret);
    const authUser = useApiKey ? apiKeySid : accountSid;
    const authPass = useApiKey ? apiKeySecret : authToken;

    if (!accountSid || !authUser || !authPass || !from || recipients.length === 0) {
        return {
            sent: false,
            perRecipient: [],
            error: `Missing env: ${[
                !accountSid && "TWILIO_ACCOUNT_SID",
                !authUser && "TWILIO_API_KEY_SID or TWILIO_AUTH_TOKEN",
                !authPass && "TWILIO_API_KEY_SECRET or TWILIO_AUTH_TOKEN",
                !from && "TWILIO_PHONE_NUMBER",
                recipients.length === 0 && "SMS_PARTNER_PHONES (or SMS_PARTNER_PHONE / WHATSAPP_PARTNER_PHONE)",
            ].filter(Boolean).join(", ")}`,
        };
    }

    const perRecipient: MultiSmsResult["perRecipient"] = [];
    for (const to of recipients) {
        const r = await sendSmsToOne({ accountSid, authUser: authUser as string, authPass: authPass as string, from, to, text });
        perRecipient.push({ to, ...r });
    }
    const sent = perRecipient.some(r => r.sent);
    return { sent, perRecipient };
}

/**
 * Maps the marketing_leads.magnet_key to a human-readable whitepaper name.
 * Keep this in sync with lib/lead-magnets.ts as new magnets are added.
 */
const MAGNET_DISPLAY_NAMES: Record<string, string> = {
    "meta-lead-field-manual": "Field Manual",
    "field-manual": "Field Manual",
    "claim_profile": "Profile Claim",
};

function magnetDisplayName(key: string | null | undefined): string {
    if (!key) return "Whitepaper";
    return MAGNET_DISPLAY_NAMES[key] || key.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Sergio's SMS alert — designed to look like a quick triage card on his lock
 * screen. Order matches the agreed structure: header → magnet → name → company
 * → phone → site → SAM → score → findings → CTA. Plain text, no emojis (US
 * carriers can split mid-emoji and corrupt segments). Phone + URL auto-link
 * on iOS/Android.
 *
 * Length budget: ~420 chars (3 SMS segments) when all fields are present.
 * ~280 chars (2 segments) when website/findings are sparse.
 */
export function formatPartnerAlertSmsFromBrief(args: {
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    phone: string | null;
    email: string;
    website: string | null;
    samRegistered: boolean;
    fitScore: number;
    magnetKey: string | null;
    fitRationale: string | null;
    websiteSummaryShort: string | null;
}): string {
    const { firstName, lastName, company, phone, email, website, samRegistered, fitScore, magnetKey, fitRationale, websiteSummaryShort } = args;
    const fullName = [firstName, lastName].filter(Boolean).join(" ") || "(name unknown)";

    const lines = [
        `New Facebook lead`,
        `Downloaded: ${magnetDisplayName(magnetKey)}`,
        ``,
        fullName,
        company ? `${company}...` : `(company unknown)`,
        ``,
    ];

    if (phone) lines.push(`Call: ${phone}`);
    else lines.push(`Phone: (not provided) — Email: ${email}`);

    if (website) lines.push(`Site: ${website}`);
    else lines.push(`Site: (not found)`);

    lines.push(`SAM registered: ${samRegistered ? "Yes" : "No"}`);
    lines.push(`Gov-readiness score: ${fitScore}/10`);
    lines.push(``);

    // Findings: prefer the LLM's website summary (concrete: what the company
    // actually does) over the AI's fit rationale (often abstract). Fall back
    // to whichever exists. Cap to a sentence to keep segment count down.
    const findings = websiteSummaryShort || fitRationale || "No enrichment data available.";
    lines.push(`Findings: ${findings}`);
    lines.push(``);
    lines.push(`Call within the next 30 minutes please.`);

    return lines.join("\n");
}

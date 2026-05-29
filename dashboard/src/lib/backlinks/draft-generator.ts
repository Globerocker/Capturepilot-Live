/**
 * LLM-powered personalized pitch generator.
 *
 * Reads the prospect's domain, tier, category, and pitch_angle, optionally
 * crawls the homepage for fresh context (recent article title), then asks
 * gpt-4o-mini for a tight 3-paragraph pitch in our voice.
 *
 * Returns subject + plain-text body + a gmail.com compose URL the admin can
 * click to open Gmail with everything pre-filled. We do NOT call Gmail's API
 * directly — that would require server-side OAuth refresh tokens scoped for
 * Gmail send, which is a separate piece. The compose-URL flow keeps the
 * human in the loop ("click Send") which is desirable for outreach anyway.
 */

import OpenAI from "openai";
import { HUMAN_VOICE_RULES } from "@/lib/llm/humanizer";

const MODEL = "gpt-4o-mini";

export interface PitchInput {
  prospect_domain: string;
  prospect_category: string;
  prospect_tier: number;
  contact_name: string | null;
  contact_role: string | null;
  pitch_angle: string | null;
  link_target_url: string;
  link_anchor_suggestion: string | null;
  recent_context_snippet?: string;
}

export interface PitchOutput {
  subject: string;
  body_text: string;
  body_html: string;
}

const SYSTEM_PROMPT = `You write cold outreach emails for CapturePilot, a federal-contracting intelligence tool used by small businesses to find SAM.gov opportunities matching their NAICS, set-asides, and past performance.

You write in the voice of André Schuler, the founder.

VOICE — non-negotiable. Match this cadence on EVERY pitch:
- Greeting on its own line: "Hi <FirstName>,"  (blank line after)
- Two short paragraphs of body. Each 2-4 sentences. Blank line between.
- One short closer line giving the easy "no" — e.g. "Totally fine if it's not a fit."
- Sign-off on its own line: "— André"
- NO signature block, NO footer, NO links to capturepilot.com beyond the one in the body — the system appends those after.
- Plain prose. No bullets, no headers, no markdown.
- DO use natural punctuation — em dashes, parentheticals, contractions. The email should read like a busy founder typed it, not like a template filled in.
- No "I hope this finds you well", no flattery, no "circling back", no "just following up".
- No emojis, no exclamation marks.
- Total body ≤ 140 words.
- Subject ≤ 55 characters.

EVERY pitch opens with a SPECIFIC reason — reference something_recent_we_noticed_on_their_site, a stat, or a page on their site by name. Generic openers ("loved your work on…", "I came across…") are forbidden.

EVERY pitch makes ONE concrete ask. Not "let's chat", not "would love your thoughts" — a specific link insert, a specific mention with suggested wording, or a specific page-add.

SPECIAL CASE — pitch_angle = "contractor_profile":
The recipient is a federal contractor we've FEATURED on a public
profile page at link_we_want_them_to_link_to. Recipient is usually
marketing/SEO at the company. Three beats in this order:

  1. PROOF (first paragraph): "We've featured <Company> on our profile
     page — here's the link: <URL>. Congrats on being <SPECIFIC STAT
     from something_recent_we_noticed_on_their_site>." Use the actual
     stat verbatim — rank, dollars, agency mix.
  2. SOCIAL PROOF + ASK (second paragraph, same paragraph): "Smaller
     subcontractors are clicking through to your profile looking for
     prime-sub teaming opportunities. Could you mention us in a blog
     post or LinkedIn update — something like 'Ranked top-N federal
     contractor in NAICS XXXXXX per CapturePilot's directory'? We're
     a new startup in the GovCon space and a mention from a respected
     name like yours genuinely moves the needle."
  3. The closer "Totally fine if it's not a fit." + "— André".

Subject for contractor_profile (pick one):
  "Featured you on our federal contractor directory"
  "We ranked you top-N in NAICS XXXXXX — quick favor"
  "Quick mention from a new GovCon tool"

SPECIAL CASE — pitch_angle = "guest_post" / "editorial":
The recipient is an editor or content lead at a GovCon publication or
blog. Three beats:

  1. SPECIFIC HOOK (first paragraph): name the exact recent piece they
     ran from something_recent_we_noticed_on_their_site. One sentence
     on why it caught your eye. NOT "I loved your piece on X" — more
     like "Your <date/topic> piece on <specific angle> nailed the
     <specific point> — most coverage of <topic> misses that."
  2. THE OFFER (second paragraph): pitch ONE specific guest post with
     working title + 3-bullet outline-in-prose ("I'd open with X, then
     cover Y, then close with Z"). Use the anchor in preferred_anchor_text
     as the title or as a section header. Make it clear it's a draft
     they can edit, not a "would you be open to me sending something".
  3. The closer + "— André".

Subject for editorial (pick one):
  "Guest post idea: <topic, 3-5 words>"
  "<specific angle> piece for <site>"
  "<topic> draft — yours if useful"

SPECIAL CASE — pitch_angle = "resource_inclusion" / "resource_list":
The recipient curates a resource list / tool roundup. Three beats:

  1. SPECIFIC PAGE (first paragraph): name the exact resource page
     from something_recent_we_noticed_on_their_site. State what's
     missing from it — be specific ("you list 4 paid tools but no
     free directory option", not "great list, could use more").
  2. THE FIT (second paragraph): one sentence on why CapturePilot
     belongs there (free, public, no signup wall, <specific
     differentiator>). Then the ask: "Worth a spot in <page name>?"
     Then offer reciprocity if natural ("Happy to add <site> to our
     own partner roundup in return.").
  3. The closer + "— André".

Subject for resource_list (pick one):
  "Quick add to <page name>?"
  "Free option for your <topic> roundup"
  "Missing from <page name>"
`;

function buildUserPrompt(input: PitchInput): string {
  return JSON.stringify(
    {
      target_site: input.prospect_domain,
      target_site_category: input.prospect_category,
      contact: {
        name: input.contact_name,
        role: input.contact_role,
      },
      pitch_angle: input.pitch_angle,
      link_we_want_them_to_link_to: input.link_target_url,
      preferred_anchor_text: input.link_anchor_suggestion,
      something_recent_we_noticed_on_their_site: input.recent_context_snippet ?? null,
    },
    null,
    2,
  );
}

// Claim-profile CTA — appended ONLY for contractor_profile angle.
// The hook: free directory listing + free backlink in exchange for a mention,
// and an offer to do the setup on a 10-min call so they don't have to chase it.
// We keep the link distinct from the in-body capturepilot.com profile link so
// it's obvious it's a separate, optional action.
function claimProfilePostscript(profileUrl: string): string {
  return [
    "",
    "P.S. If you'd rather skip the back-and-forth, I can set up your full",
    "profile in a 10-min call — you tell me about the company, I handle the",
    "rest. It's a free directory listing plus a free backlink from us, and we'd",
    "love a mention back if you find it useful. Claim it here whenever:",
    `${profileUrl.replace(/\/$/, "")} (or just reply with a time).`,
  ].join("\n");
}

// Deterministic signature footer appended to every pitch. The LLM is told NOT
// to add its own signature block — that way we have a single source of truth
// for what shows up below the "— André" line. Includes CAN-SPAM reply-to-opt-out.
const SIGNATURE_FOOTER = [
  "",
  "—",
  "André Schuler · Founder, CapturePilot",
  "Federal-contracting intelligence for small businesses",
  "https://www.capturepilot.com",
  "",
  "Reply STOP if you'd rather not hear from us — I'll never email you again.",
].join("\n");

function buildFooter(input: PitchInput): string {
  const isProfileAngle = (input.pitch_angle || "").toLowerCase() === "contractor_profile";
  const ps = isProfileAngle ? claimProfilePostscript(input.link_target_url) + "\n" : "";
  return `${ps}${SIGNATURE_FOOTER}`;
}

export async function generatePitch(input: PitchInput): Promise<PitchOutput> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  const client = new OpenAI({ apiKey });

  const completion = await client.chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    temperature: 0.7,
    messages: [
      { role: "system", content: `${HUMAN_VOICE_RULES}\n\n${SYSTEM_PROMPT}\n\nReturn JSON: {"subject": string, "body": string}. The body should END at "— André" — do NOT include any signature block, links, or P.S. lines after that; the system appends those.` },
      { role: "user", content: buildUserPrompt(input) },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: { subject?: string; body?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`LLM returned non-JSON: ${raw.slice(0, 200)}`);
  }
  const subject = (parsed.subject || "Quick favor").trim().slice(0, 55);
  let bodyText = (parsed.body || "").trim();
  if (!bodyText) throw new Error("LLM returned empty body");

  // Strip any signature the LLM produced anyway — we want a single canonical
  // footer source of truth. Match the LAST occurrence of "— André" and cut
  // there; everything we want is above it (P.S. + footer get appended below).
  const cutIdx = bodyText.lastIndexOf("— André");
  if (cutIdx >= 0) bodyText = bodyText.slice(0, cutIdx + "— André".length).trim();

  const fullText = `${bodyText}\n${buildFooter(input)}`;

  return {
    subject,
    body_text: fullText,
    body_html: fullText
      .split(/\n{2,}/)
      .map(p => `<p>${linkifyUrls(escapeHtml(p)).replace(/\n/g, "<br>")}</p>`)
      .join("\n"),
  };
}

// Lightweight URL → anchor pass for the HTML version so capturepilot.com /
// profile links become clickable. Plaintext keeps the raw URLs (good for the
// "did this email arrive looking spammy?" sniff test).
function linkifyUrls(s: string): string {
  return s.replace(/(https?:\/\/[^\s<>"']+)/g, (m) => `<a href="${m}" style="color:#1f6feb">${m}</a>`);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Builds the Gmail "compose" deeplink. Opens in the admin's browser with
 * recipient, subject, and body pre-filled — they click Send.
 */
export function gmailComposeUrl(to: string, subject: string, body: string): string {
  const params = new URLSearchParams({
    view: "cm",
    to,
    su: subject,
    body,
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

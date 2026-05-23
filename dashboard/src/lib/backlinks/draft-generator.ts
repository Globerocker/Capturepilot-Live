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

Rules:
- Short. 3 short paragraphs max. Under 130 words total.
- No "I hope this finds you well", no flattery, no buzzwords.
- Open with a SPECIFIC reason you're reaching out — reference their site or a recent piece if you have it.
- Make the ask crisp: a single, concrete favor. Either a guest-post slot, a link insert in an existing article, a mention in their newsletter, or inclusion in a resource list.
- Always end with one sentence that gives them an easy "no" path. E.g. "Totally fine if it's not a fit."
- Sign off "— André".
- No subject longer than 55 characters.
- No emojis, no exclamation marks.`;

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

export async function generatePitch(input: PitchInput): Promise<PitchOutput> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  const client = new OpenAI({ apiKey });

  const completion = await client.chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    temperature: 0.7,
    messages: [
      { role: "system", content: SYSTEM_PROMPT + "\n\nReturn JSON: {\"subject\": string, \"body\": string}." },
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
  const bodyText = (parsed.body || "").trim();
  if (!bodyText) throw new Error("LLM returned empty body");

  return {
    subject,
    body_text: bodyText,
    body_html: bodyText
      .split(/\n{2,}/)
      .map(p => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
      .join("\n"),
  };
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

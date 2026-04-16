/**
 * Beta invite templates — preset override + personal note pairs that tune the
 * invite email for the context in which the admin met the recipient.
 *
 * The "ai" template is the default and takes free-text context (e.g. "met at
 * GovCon Summit, runs a janitorial company bidding on VA contracts") and asks
 * the model to produce a warm, specific opening line + personal note.
 */

export type TemplateId = "ai" | "linkedin" | "call" | "in_person" | "cold";

export interface InviteOverrides {
    subject?: string;
    eyebrow?: string;
    heading?: string;
    ctaLabel?: string;
    introLine?: string;
}

export interface InviteTemplate {
    id: TemplateId;
    label: string;
    short: string;
    hint: string;
    requiresAi?: boolean;
    overrides?: InviteOverrides;
    personalNote?: string;
}

export const INVITE_TEMPLATES: InviteTemplate[] = [
    {
        id: "ai",
        label: "Custom (AI)",
        short: "Describe the context, we write it",
        hint: "Default. Paste the context of how you met or what you discussed — the AI writes a warm, specific opener.",
        requiresAi: true,
    },
    {
        id: "linkedin",
        label: "After LinkedIn Chat",
        short: "You messaged on LinkedIn",
        hint: "Warm follow-up referencing your LinkedIn conversation.",
        overrides: {
            subject: "Great connecting on LinkedIn — your CapturePilot access",
            eyebrow: "Following Up From LinkedIn",
            heading: "Great connecting, [firstName]",
            ctaLabel: "Accept Beta Access",
            introLine: "Really enjoyed our chat on LinkedIn — I wanted to follow up with what we talked about.",
        },
        personalNote:
            "As promised from our LinkedIn conversation, here's your private access to CapturePilot. Just click the button below to set your password and you'll see federal opportunities matched to your company in under a minute.",
    },
    {
        id: "call",
        label: "After a Call",
        short: "You had a phone or video call",
        hint: "Follow-up after a phone or video call.",
        overrides: {
            subject: "Following up on our call — your CapturePilot access",
            eyebrow: "Following Up From Our Call",
            heading: "Great talking today, [firstName]",
            ctaLabel: "Accept Beta Access",
            introLine: "Thanks for taking the time to chat today.",
        },
        personalNote:
            "As we discussed on our call, here's your private beta access to CapturePilot. Set a password and you'll immediately see which federal opportunities fit the work we talked about.",
    },
    {
        id: "in_person",
        label: "After In-Person Meeting",
        short: "You met face-to-face",
        hint: "Warm follow-up after a face-to-face meeting or event.",
        overrides: {
            subject: "Great meeting you — your CapturePilot access",
            eyebrow: "Great To Meet You",
            heading: "Great meeting you, [firstName]",
            ctaLabel: "Accept Beta Access",
            introLine: "Thanks for connecting in person — it was great to meet you.",
        },
        personalNote:
            "As promised after our conversation, here's your private beta access to CapturePilot. Takes 60 seconds to set up and you'll immediately see the federal opportunities your company could be bidding on.",
    },
    {
        id: "cold",
        label: "Cold Outreach",
        short: "No prior context",
        hint: "Cold introduction with no prior contact — keeps the default framing.",
        overrides: {
            subject: "You're invited to the CapturePilot beta",
            eyebrow: "Private Beta Invitation",
            heading: "Hi [firstName], you're invited",
            ctaLabel: "Claim Your Beta Account",
        },
        personalNote: "",
    },
];

/** Look up a template by id (falls back to the ai default). */
export function getTemplate(id: TemplateId): InviteTemplate {
    return INVITE_TEMPLATES.find(t => t.id === id) ?? INVITE_TEMPLATES[0];
}

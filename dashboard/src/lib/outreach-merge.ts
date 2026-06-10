/**
 * Outreach merge-tag rendering + the shared fake contact used everywhere
 * we want a live preview (campaign builder, test send, admin preview).
 */

export interface MergeContact {
    firstName?: string;
    lastName?: string;
    company?: string;
    email?: string;
    phone?: string;
    title?: string;
    city?: string;
    state?: string;
    unsubscribe_url?: string;
    [k: string]: string | undefined;
}

export const FAKE_CONTACT: MergeContact = {
    firstName: "Sarah",
    lastName: "Chen",
    company: "Acme Federal Solutions",
    email: "sarah@acmefederal.com",
    phone: "+1 (202) 555-0142",
    title: "Director of Business Development",
    city: "Arlington",
    state: "VA",
    unsubscribe_url: "https://capturepilot.com/unsubscribe?token=preview",
};

const TAG_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/**
 * Replace {{firstName}}, {{company}}, etc. with values from `contact`.
 * Unknown tags are left in place so the user can spot bad merge names.
 */
export function renderMergeFields(template: string, contact: MergeContact): string {
    if (!template) return "";
    return template.replace(TAG_RE, (full, key) => {
        const v = contact[key as keyof MergeContact];
        return v !== undefined ? String(v) : full;
    });
}

/**
 * Lightweight tag detector — used by the spam-check route to flag bodies
 * with unfilled tags (which read as broken to recipients).
 */
export function extractMergeTags(text: string): string[] {
    const out = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = TAG_RE.exec(text)) !== null) out.add(m[1]);
    return [...out];
}

/**
 * Single source of truth for the $70 B2B Startup Pack — list of digital goods.
 *
 * Each asset points at a Google Drive folder/file. The buyer lands on
 * /startup-pack/download/[token] and sees these grouped by category.
 *
 * HOW TO UPDATE THE DRIVE LINKS
 * 1. Make sure the Drive folder/file is shared "Anyone with the link can view".
 * 2. Paste the share URL into `gdriveUrl`. We support folder URLs and file URLs.
 * 3. If you want a direct-download button (single file only), set `gdriveFileId`
 *    to the file ID. We render a "Download" button that hits
 *    `https://drive.google.com/uc?export=download&id=<fileId>`.
 *
 * KEEP THIS FILE SAFE TO COMMIT — these are public-share links anyway, no secrets.
 */

export type AssetCategory =
    | "capability_statement"
    | "sources_sought"
    | "bid_no_bid"
    | "certifications"
    | "past_performance"
    | "outreach"
    | "pricing"
    | "onboarding";

export interface StartupPackAsset {
    /** Stable ID — used for tracking. Never change once shipped. */
    id: string;
    /** Section the asset is grouped under in the UI. */
    category: AssetCategory;
    /** Headline shown on the download card. */
    title: string;
    /** One-line value prop. */
    description: string;
    /** Format chip — "PDF", "DOCX", "XLSX", "Canva", "Video", "Calendly". */
    format: string;
    /** Public Google Drive share URL (folder or file). Required. */
    gdriveUrl: string;
    /** Optional: single-file Drive ID for a direct download button. */
    gdriveFileId?: string;
    /** Optional: page count / sheet count / duration — for the chip. */
    sizeHint?: string;
    /** Optional: badge ("Most Popular", "Quick Win") on the card. */
    badge?: string;
}

export interface AssetSection {
    category: AssetCategory;
    label: string;
    description: string;
    icon: "FileText" | "Search" | "Scale" | "Award" | "Trophy" | "Mail" | "DollarSign" | "Video";
}

// ──────────────────────────────────────────────────────────────────────────────
// SECTION HEADERS (ordered)
// ──────────────────────────────────────────────────────────────────────────────
export const STARTUP_PACK_SECTIONS: AssetSection[] = [
    {
        category: "capability_statement",
        label: "Capability Statement Kit",
        description: "The single most-used document for federal contracting. Branded templates + a written walkthrough.",
        icon: "FileText",
    },
    {
        category: "sources_sought",
        label: "Sources Sought Playbook",
        description: "Win contracts 6–18 months before they're competed. Step-by-step response templates.",
        icon: "Search",
    },
    {
        category: "bid_no_bid",
        label: "Bid / No-Bid Decision Toolkit",
        description: "Stop wasting time on the wrong opportunities. Score every RFP before you respond.",
        icon: "Scale",
    },
    {
        category: "certifications",
        label: "Certification Eligibility Worksheets",
        description: "8(a), HUBZone, WOSB, SDVOSB — pre-filled forms so you can self-assess in 10 minutes.",
        icon: "Award",
    },
    {
        category: "past_performance",
        label: "Past-Performance Reference Templates",
        description: "Convert commercial work into federal-grade past performance evidence.",
        icon: "Trophy",
    },
    {
        category: "outreach",
        label: "Contracting Officer Outreach Sequences",
        description: "10 proven email templates for the entire capture cycle — RFI through award.",
        icon: "Mail",
    },
    {
        category: "pricing",
        label: "Price-to-Win Worksheet",
        description: "Build defensible federal pricing without leaving 30% on the table.",
        icon: "DollarSign",
    },
    {
        category: "onboarding",
        label: "Bonus: 30-min Founder Onboarding Call",
        description: "Schedule a 1:1 with our capture lead. Walk through your first bid live.",
        icon: "Video",
    },
];

// ──────────────────────────────────────────────────────────────────────────────
// ASSET LIST
//
// 👉 PASTE GOOGLE DRIVE URLS BELOW.
// Empty `gdriveUrl: ""` strings render a "Coming Soon" disabled state.
// ──────────────────────────────────────────────────────────────────────────────
export const STARTUP_PACK_ASSETS: StartupPackAsset[] = [
    // ── Capability Statement Kit ─────────────────────────────────────────────
    {
        id: "cap-statement-docx",
        category: "capability_statement",
        title: "Capability Statement — Editable Template",
        description: "One-page Word template branded to federal expectations. Drop in your details and ship.",
        format: "DOCX",
        sizeHint: "1 page",
        gdriveUrl: "", // TODO: paste Drive URL
        badge: "Most Popular",
    },
    {
        id: "cap-statement-canva",
        category: "capability_statement",
        title: "Capability Statement — Canva Brand Kit",
        description: "Three styled Canva variants (modern / classic / federal). Edit colors + logo in 10 minutes.",
        format: "Canva",
        sizeHint: "3 variants",
        gdriveUrl: "", // TODO
    },
    {
        id: "cap-statement-walkthrough",
        category: "capability_statement",
        title: "How to Write a Federal Capability Statement",
        description: "12-page written walkthrough — exactly what to put in each section, with annotated examples.",
        format: "PDF",
        sizeHint: "12 pages",
        gdriveUrl: "", // TODO
    },

    // ── Sources Sought Playbook ──────────────────────────────────────────────
    {
        id: "sources-sought-playbook",
        category: "sources_sought",
        title: "Sources Sought Response Playbook",
        description: "Why these are the highest-leverage notices in federal contracting and how to respond to win them.",
        format: "PDF",
        sizeHint: "24 pages",
        gdriveUrl: "", // TODO
        badge: "Quick Win",
    },
    {
        id: "sources-sought-template",
        category: "sources_sought",
        title: "Sources Sought Response — Fill-in-the-Blank Template",
        description: "Pre-formatted Word doc with every required section. Replace yellow placeholders, send.",
        format: "DOCX",
        gdriveUrl: "", // TODO
    },

    // ── Bid / No-Bid Decision Toolkit ────────────────────────────────────────
    {
        id: "bid-no-bid-matrix",
        category: "bid_no_bid",
        title: "Bid / No-Bid Decision Matrix",
        description: "10-factor scoring sheet. Score an opportunity in 5 minutes — go/no-go answer at the bottom.",
        format: "XLSX",
        sizeHint: "1 sheet",
        gdriveUrl: "", // TODO
    },
    {
        id: "pwin-calculator",
        category: "bid_no_bid",
        title: "PWin (Probability of Win) Calculator",
        description: "The exact 10-factor model used by GovCon consultants — customer fit, past perf, price-to-win, capture maturity.",
        format: "XLSX",
        gdriveUrl: "", // TODO
    },

    // ── Certifications ────────────────────────────────────────────────────────
    {
        id: "cert-8a",
        category: "certifications",
        title: "8(a) Certification Self-Assessment",
        description: "Eligibility checklist + document prep list. Know in 10 minutes if you qualify.",
        format: "XLSX",
        gdriveUrl: "", // TODO
    },
    {
        id: "cert-hubzone",
        category: "certifications",
        title: "HUBZone Eligibility Worksheet",
        description: "Map check + employee residency calculator + document prep list.",
        format: "XLSX",
        gdriveUrl: "", // TODO
    },
    {
        id: "cert-wosb",
        category: "certifications",
        title: "WOSB / EDWOSB Self-Cert Pack",
        description: "Required forms + sample affidavits. Self-certification path explained.",
        format: "XLSX",
        gdriveUrl: "", // TODO
    },
    {
        id: "cert-sdvosb",
        category: "certifications",
        title: "VOSB / SDVOSB CVE Application Guide",
        description: "Step-by-step CVE application walkthrough. Common rejection reasons + how to avoid them.",
        format: "PDF",
        gdriveUrl: "", // TODO
    },

    // ── Past Performance ─────────────────────────────────────────────────────
    {
        id: "past-perf-template",
        category: "past_performance",
        title: "Past-Performance Reference Template",
        description: "The exact 1-page format contracting officers expect. Includes scoring rubric.",
        format: "DOCX",
        gdriveUrl: "", // TODO
    },
    {
        id: "past-perf-commercial",
        category: "past_performance",
        title: "Converting Commercial Work into Federal Past Performance",
        description: "How to position non-federal experience without overselling. With before/after examples.",
        format: "PDF",
        sizeHint: "8 pages",
        gdriveUrl: "", // TODO
    },

    // ── Outreach ─────────────────────────────────────────────────────────────
    {
        id: "outreach-sequences",
        category: "outreach",
        title: "10 Contracting Officer Email Templates",
        description: "Cold outreach, RFI follow-up, post-award debrief — the full cycle.",
        format: "DOCX",
        sizeHint: "10 templates",
        gdriveUrl: "", // TODO
    },
    {
        id: "outreach-linkedin",
        category: "outreach",
        title: "LinkedIn Outreach Scripts for KO/COR",
        description: "Connection request + 3-touch DM sequence that opens conversations with contracting officers.",
        format: "PDF",
        gdriveUrl: "", // TODO
    },

    // ── Pricing ───────────────────────────────────────────────────────────────
    {
        id: "pricing-workbook",
        category: "pricing",
        title: "Price-to-Win Worksheet",
        description: "Wrap rates, indirect cost calculation, competitive price banding. Built-in formulas.",
        format: "XLSX",
        sizeHint: "5 sheets",
        gdriveUrl: "", // TODO
    },
    {
        id: "labor-rates",
        category: "pricing",
        title: "Federal Labor Rate Benchmarks",
        description: "Current GSA-schedule rate ranges by labor category. Updated for FY2026.",
        format: "PDF",
        gdriveUrl: "", // TODO
    },

    // ── Onboarding call ──────────────────────────────────────────────────────
    {
        id: "founder-call",
        category: "onboarding",
        title: "Book your 30-min onboarding call",
        description: "Walk through your first Sources Sought response live with our capture lead.",
        format: "Calendly",
        gdriveUrl: "https://calendly.com/capturepilot/startup-pack-onboarding",
        badge: "Free with pack",
    },
];

// ──────────────────────────────────────────────────────────────────────────────
// PRICING — single source of truth
// ──────────────────────────────────────────────────────────────────────────────
export const STARTUP_PACK_PRICE_CENTS = 7000;     // $70.00
export const STARTUP_PACK_FULL_PRICE_CENTS = 15000; // $150.00
export const STARTUP_PACK_OFFER_DAYS = 7;          // countdown from analysis created_at

/**
 * Resolve a Drive URL to a renderable shape for the UI.
 * Returns { previewUrl, downloadUrl } — both may be undefined for empty entries.
 */
export function resolveDriveLinks(asset: StartupPackAsset): { previewUrl?: string; downloadUrl?: string } {
    const url = asset.gdriveUrl?.trim();
    if (!url) return {};

    // Calendly / non-Drive URLs — pass through
    if (!/drive\.google\.com|docs\.google\.com/.test(url)) {
        return { previewUrl: url };
    }

    const downloadUrl = asset.gdriveFileId
        ? `https://drive.google.com/uc?export=download&id=${asset.gdriveFileId}`
        : undefined;

    return { previewUrl: url, downloadUrl };
}

export function getAssetsByCategory(category: AssetCategory): StartupPackAsset[] {
    return STARTUP_PACK_ASSETS.filter(a => a.category === category);
}

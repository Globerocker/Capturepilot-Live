/**
 * Single source of truth for the $70 Federal Launch Kit — list of digital goods.
 *
 * Each asset points either at a local file under `dashboard/protected/starter-pack/<file>`
 * (the canonical delivery path — NOT under /public/) or at a Google Drive
 * share URL (legacy / Canva mocks / Calendly).
 *
 * HOW TO UPDATE THE LINKS
 * 1. Drop the file into `dashboard/protected/starter-pack/` (commit it).
 *    These files are NOT publicly accessible via CDN — they only go out through
 *    the token-gated /api/startup-pack/file/<token>/<id> route.
 * 2. Set `localPath: "/starter-pack/<filename>"`. The UI auto-fills download
 *    + preview URLs from the local path when a valid access token is provided.
 * 3. For Drive/Canva/Calendly only assets, leave `localPath` undefined and set
 *    `gdriveUrl` to the share URL.
 *
 * KEEP THIS FILE SAFE TO COMMIT — these are public-share links anyway, no secrets.
 */

// ──────────────────────────────────────────────────────────────────────────────
// PRODUCT NAMING (single source of truth)
// ──────────────────────────────────────────────────────────────────────────────
export const PRODUCT_NAME = "Federal Launch Kit";
export const PRODUCT_TAGLINE = "Win your first federal contract.";
export const PRODUCT_SUBTITLE = "Every template, playbook, checklist and script you need to land your first federal contract — bundled.";

export type AssetCategory =
    | "sam_gov"
    | "capability_statement"
    | "solicitation_playbooks"
    | "bid_no_bid"
    | "certifications"
    | "past_performance"
    | "outreach"
    | "pricing"
    | "best_practices"
    | "onboarding"
    | "kit_internal"; // guides + master docs + newly-surfaced files — file-route resolvable, hidden from the landing grid

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
    /**
     * Public Google Drive share URL (folder or file). Optional.
     * Either `localPath` or `gdriveUrl` must be set for the asset to be live.
     */
    gdriveUrl: string;
    /** Optional: single-file Drive ID for a direct download button. */
    gdriveFileId?: string;
    /**
     * Optional: local file under `dashboard/protected/starter-pack/<filename>`.
     * When set, the UI serves the file through the token-gated
     * /api/startup-pack/file/<token>/<id> route — no Drive round-trip, no rate
     * limits. Files are NOT publicly accessible via static CDN; they require a
     * valid non-refunded access token.
     */
    localPath?: string;
    /** Optional: page count / sheet count / duration — for the chip. */
    sizeHint?: string;
    /** Optional: badge ("Most Popular", "Quick Win") on the card. */
    badge?: string;
}

export interface AssetSection {
    category: AssetCategory;
    label: string;
    description: string;
    icon: "FileText" | "Search" | "Scale" | "Award" | "Trophy" | "Mail" | "DollarSign" | "Video" | "ClipboardCheck" | "BookOpen" | "Building2";
}

// ──────────────────────────────────────────────────────────────────────────────
// SECTION HEADERS (ordered — what user sees on the download page)
// ──────────────────────────────────────────────────────────────────────────────
export const STARTUP_PACK_SECTIONS: AssetSection[] = [
    {
        category: "sam_gov",
        label: "SAM.gov Registration Kit",
        description: "Step-by-step walkthrough of registering your business — the #1 blocker for first-time federal bidders.",
        icon: "Building2",
    },
    {
        category: "capability_statement",
        label: "Capability Statement Kit",
        description: "The single most-used document in federal contracting. Branded templates + written walkthrough.",
        icon: "FileText",
    },
    {
        category: "solicitation_playbooks",
        label: "Solicitation-Type Playbooks",
        description: "A dedicated playbook for every notice type — Sources Sought, RFI, Pre-Solicitation, Solicitation, RFQ, IDIQ task orders.",
        icon: "BookOpen",
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
        label: "Contracting Officer Outreach Library",
        description: "20+ proven email + LinkedIn scripts for the entire capture cycle — RFI through award.",
        icon: "Mail",
    },
    {
        category: "pricing",
        label: "Price-to-Win Toolkit",
        description: "Build defensible federal pricing without leaving 30% on the table.",
        icon: "DollarSign",
    },
    {
        category: "best_practices",
        label: "Internal Best-Practice Library",
        description: "Our own consulting playbooks — capture maturity, color-team reviews, debrief tactics, FAR clauses.",
        icon: "ClipboardCheck",
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
// `localPath` wins when present — file is served from protected/starter-pack/ (NOT /public/).
// Empty `gdriveUrl: ""` + no `localPath` renders a "Coming soon" disabled card.
// ──────────────────────────────────────────────────────────────────────────────
const LEGACY_ASSETS: StartupPackAsset[] = [
    // ── SAM.gov Registration Kit ─────────────────────────────────────────────
    {
        id: "sam-registration-walkthrough",
        category: "sam_gov",
        title: "SAM.gov Registration — Step-by-Step Walkthrough",
        description: "Every screen of the SAM.gov registration with annotated screenshots. The fastest path from zero to active registration.",
        format: "PDF",
        sizeHint: "32 pages",
        gdriveUrl: "",
        localPath: "/starter-pack/01_SAM_Registration_Kit/FLK_01_SAM_Registration_Walkthrough.pdf",
        badge: "Start Here",
    },
    {
        id: "sam-registration-checklist",
        category: "sam_gov",
        title: "SAM.gov Pre-Registration Checklist",
        description: "Every document, identifier and field you need ready BEFORE starting registration. Saves the 2-week DUNS/UEI back-and-forth.",
        format: "XLSX",
        sizeHint: "1 sheet",
        gdriveUrl: "",
        localPath: "/starter-pack/01_SAM_Registration_Kit/FLK_01_SAM_PreReg_Checklist.xlsx",
    },
    {
        id: "sam-naics-picker",
        category: "sam_gov",
        title: "NAICS Code Picker for SAM.gov",
        description: "How to pick the right primary + secondary NAICS codes during registration — these determine 80% of your matches.",
        format: "PDF",
        gdriveUrl: "",
        localPath: "/starter-pack/01_SAM_Registration_Kit/FLK_01_NAICS_Code_Picker.pdf",
    },
    {
        id: "sam-renewal-reminder-template",
        category: "sam_gov",
        title: "SAM.gov Annual Renewal Reminder Kit",
        description: "Calendar templates + email reminders so your registration never expires (the #1 cause of bid rejection).",
        format: "PDF",
        gdriveUrl: "",
        localPath: "/starter-pack/01_SAM_Registration_Kit/FLK_01_SAM_Renewal_Kit.pdf",
    },

    // ── Capability Statement Kit ─────────────────────────────────────────────
    {
        id: "cap-statement-docx",
        category: "capability_statement",
        title: "Capability Statement — Editable Template",
        description: "One-page Word template branded to federal expectations. Drop in your details and ship.",
        format: "DOCX",
        sizeHint: "1 page",
        gdriveUrl: "",
        localPath: "/starter-pack/02_Capability_Statement_Kit/FLK_02_Capability_Statement_Template.docx",
        badge: "Most Popular",
    },
    {
        id: "cap-statement-canva",
        category: "capability_statement",
        title: "Capability Statement — Branded Design Kit",
        description: "Three styled variants (modern / classic / federal). Use as visual reference when designing your own.",
        format: "PDF",
        sizeHint: "3 variants",
        gdriveUrl: "",
        localPath: "/starter-pack/02_Capability_Statement_Kit/FLK_02_Capability_Statement_Canva_Kit.pdf",
    },
    {
        id: "cap-statement-walkthrough",
        category: "capability_statement",
        title: "How to Write a Federal Capability Statement",
        description: "Written walkthrough — exactly what to put in each section, with annotated examples.",
        format: "PDF",
        sizeHint: "12 pages",
        gdriveUrl: "",
        localPath: "/starter-pack/02_Capability_Statement_Kit/FLK_02_How_to_Write_Capability_Statement.pdf",
    },

    // ── Solicitation-Type Playbooks ──────────────────────────────────────────
    {
        id: "playbook-sources-sought",
        category: "solicitation_playbooks",
        title: "Sources Sought / RFI Playbook",
        description: "Highest-leverage notices in federal — respond 6–18 months before competition opens. Template + scoring rubric inside.",
        format: "PDF",
        sizeHint: "24 pages",
        gdriveUrl: "",
        localPath: "/starter-pack/03_Solicitation_Playbooks/FLK_03_Sources_Sought_RFI_Playbook.pdf",
        badge: "Highest ROI",
    },
    {
        id: "playbook-pre-solicitation",
        category: "solicitation_playbooks",
        title: "Pre-Solicitation Playbook",
        description: "What to do in the 30–60 day window between announcement and live RFP — pre-bid conferences, Q&A submissions, capture moves.",
        format: "PDF",
        sizeHint: "18 pages",
        gdriveUrl: "",
        localPath: "/starter-pack/03_Solicitation_Playbooks/FLK_03_Pre_Solicitation_Playbook.pdf",
    },
    {
        id: "playbook-solicitation",
        category: "solicitation_playbooks",
        title: "Solicitation / RFP Response Playbook",
        description: "Section L/M decoding, compliance matrix template, color-team review schedule, submission-day checklist.",
        format: "PDF",
        sizeHint: "32 pages",
        gdriveUrl: "",
        localPath: "/starter-pack/03_Solicitation_Playbooks/FLK_03_RFP_Response_Playbook.pdf",
    },
    {
        id: "playbook-rfq",
        category: "solicitation_playbooks",
        title: "RFQ (Request for Quote) Playbook",
        description: "Fast-turn quoting on micro-purchases and SAP buys. Pricing strategy for opportunities ≤$250K.",
        format: "PDF",
        sizeHint: "12 pages",
        gdriveUrl: "",
        localPath: "/starter-pack/03_Solicitation_Playbooks/FLK_03_RFQ_Playbook.pdf",
    },
    {
        id: "playbook-idiq-task-order",
        category: "solicitation_playbooks",
        title: "IDIQ / GWAC Task-Order Playbook",
        description: "Win the IDIQ seat AND the task orders. How task-order competition actually works post-award.",
        format: "PDF",
        sizeHint: "20 pages",
        gdriveUrl: "",
        localPath: "/starter-pack/03_Solicitation_Playbooks/FLK_03_IDIQ_GWAC_Task_Order_Playbook.pdf",
    },
    {
        id: "playbook-market-research",
        category: "solicitation_playbooks",
        title: "Federal Market Research Playbook",
        description: "How to research an agency, find the right contract vehicle, and identify the real decision-makers before you bid.",
        format: "PDF",
        sizeHint: "16 pages",
        gdriveUrl: "",
        localPath: "/starter-pack/03_Solicitation_Playbooks/FLK_03_Market_Research_Playbook.pdf",
    },
    {
        id: "playbook-debrief",
        category: "solicitation_playbooks",
        title: "Post-Award Debrief Playbook",
        description: "How to request, attend, and weaponize the debrief — even when you lost. Includes protest-decision flowchart.",
        format: "PDF",
        sizeHint: "14 pages",
        gdriveUrl: "",
        badge: "Coming next drop",
    },

    // ── Bid / No-Bid Decision Toolkit ────────────────────────────────────────
    {
        id: "bid-no-bid-matrix",
        category: "bid_no_bid",
        title: "Bid / No-Bid Decision Matrix",
        description: "10-factor scoring sheet. Score an opportunity in 5 minutes — go/no-go answer at the bottom.",
        format: "XLSX",
        sizeHint: "1 sheet",
        gdriveUrl: "",
        localPath: "/starter-pack/04_Bid_No_Bid_Decision_Toolkit/FLK_04_Bid_No_Bid_Decision_Matrix.xlsx",
    },
    {
        id: "pwin-calculator",
        category: "bid_no_bid",
        title: "PWin (Probability of Win) Calculator",
        description: "The exact 10-factor model used by GovCon consultants — customer fit, past perf, price-to-win, capture maturity.",
        format: "XLSX",
        sizeHint: "1 sheet",
        gdriveUrl: "",
        localPath: "/starter-pack/04_Bid_No_Bid_Decision_Toolkit/FLK_04_PWin_Calculator.xlsx",
    },
    {
        id: "competitive-bid-analysis",
        category: "bid_no_bid",
        title: "Competitive Bid Analysis Worksheet",
        description: "Map the incumbent + likely bidders for every RFP. Find the wedge before you commit.",
        format: "XLSX",
        sizeHint: "1 sheet",
        gdriveUrl: "",
        localPath: "/starter-pack/04_Bid_No_Bid_Decision_Toolkit/FLK_04_Competitive_Bid_Analysis.xlsx",
    },

    // ── Certifications ────────────────────────────────────────────────────────
    {
        id: "cert-8a",
        category: "certifications",
        title: "8(a) Certification Self-Assessment",
        description: "Eligibility checklist + document prep list. Know in 10 minutes if you qualify.",
        format: "XLSX",
        sizeHint: "1 sheet",
        gdriveUrl: "",
        localPath: "/starter-pack/05_Certification_Eligibility_Worksheets/FLK_05_8a_Certification_Self_Assessment.xlsx",
    },
    {
        id: "cert-hubzone",
        category: "certifications",
        title: "HUBZone Eligibility Worksheet",
        description: "Map check + employee residency calculator + document prep list.",
        format: "XLSX",
        sizeHint: "1 sheet",
        gdriveUrl: "",
        localPath: "/starter-pack/05_Certification_Eligibility_Worksheets/FLK_05_HUBZone_Eligibility_Worksheet.xlsx",
    },
    {
        id: "cert-wosb",
        category: "certifications",
        title: "WOSB / EDWOSB Self-Cert Pack",
        description: "Required forms + sample affidavits. Self-certification path explained.",
        format: "XLSX",
        sizeHint: "1 sheet",
        gdriveUrl: "",
        localPath: "/starter-pack/05_Certification_Eligibility_Worksheets/FLK_05_WOSB_EDWOSB_Self_Cert.xlsx",
    },
    {
        id: "cert-sdvosb",
        category: "certifications",
        title: "VOSB / SDVOSB CVE Application Guide",
        description: "Step-by-step CVE application walkthrough. Common rejection reasons + how to avoid them.",
        format: "PDF",
        gdriveUrl: "",
        localPath: "/starter-pack/05_Certification_Eligibility_Worksheets/FLK_05_VOSB_SDVOSB_CVE_Guide.pdf",
    },

    // ── Past Performance ─────────────────────────────────────────────────────
    {
        id: "past-perf-template",
        category: "past_performance",
        title: "Past-Performance Reference Template",
        description: "The exact 1-page format contracting officers expect. Includes scoring rubric.",
        format: "DOCX",
        sizeHint: "1 page",
        gdriveUrl: "",
        localPath: "/starter-pack/06_Past_Performance_Reference_Templates/FLK_06_Past_Performance_Reference_Template.docx",
    },
    {
        id: "past-perf-commercial",
        category: "past_performance",
        title: "Converting Commercial Work into Federal Past Performance",
        description: "How to position non-federal experience without overselling. With before/after examples.",
        format: "PDF",
        sizeHint: "8 pages",
        gdriveUrl: "",
        localPath: "/starter-pack/06_Past_Performance_Reference_Templates/FLK_06_Commercial_to_Federal_Past_Performance.pdf",
    },

    // ── Outreach ─────────────────────────────────────────────────────────────
    {
        id: "outreach-co-sequences",
        category: "outreach",
        title: "10 Contracting Officer Email Templates",
        description: "Cold outreach, RFI follow-up, post-award debrief — the full capture cycle.",
        format: "PDF",
        sizeHint: "10 templates",
        gdriveUrl: "",
        localPath: "/starter-pack/07_Contracting_Officer_Outreach_Library/FLK_07_CO_Email_Templates.pdf",
    },
    {
        id: "outreach-cor-templates",
        category: "outreach",
        title: "COR / Program Manager Scripts",
        description: "5 templates for engaging Contracting Officer Representatives and PMs — the actual decision influencers.",
        format: "PDF",
        sizeHint: "5 templates",
        gdriveUrl: "",
        localPath: "/starter-pack/07_Contracting_Officer_Outreach_Library/FLK_07_COR_PM_Conversation_Scripts.pdf",
    },
    {
        id: "outreach-linkedin",
        category: "outreach",
        title: "LinkedIn Outreach Scripts for KO/COR",
        description: "Connection request + 3-touch DM sequence that opens conversations with contracting officers.",
        format: "PDF",
        gdriveUrl: "",
        localPath: "/starter-pack/07_Contracting_Officer_Outreach_Library/FLK_07_LinkedIn_Outreach_Scripts.pdf",
    },
    {
        id: "outreach-industry-day",
        category: "outreach",
        title: "Industry Day & Pre-Bid Conference Playbook",
        description: "How to maximize the 4 hours that decide your win rate on every contract.",
        format: "PDF",
        sizeHint: "10 pages",
        gdriveUrl: "",
        localPath: "/starter-pack/07_Contracting_Officer_Outreach_Library/FLK_07_Industry_Day_Playbook.pdf",
    },

    // ── Pricing ───────────────────────────────────────────────────────────────
    {
        id: "pricing-workbook",
        category: "pricing",
        title: "Price-to-Win Worksheet",
        description: "Wrap rates, indirect cost calculation, competitive price banding. Built-in formulas.",
        format: "XLSX",
        sizeHint: "5 sheets",
        gdriveUrl: "",
        localPath: "/starter-pack/08_Price_to_Win_Toolkit/FLK_08_Price_to_Win_Worksheet.xlsx",
    },
    {
        id: "labor-rates",
        category: "pricing",
        title: "Federal Labor Rate Benchmarks (FY2026)",
        description: "Current GSA-schedule rate ranges by labor category. Updated for FY2026.",
        format: "PDF",
        gdriveUrl: "",
        localPath: "/starter-pack/08_Price_to_Win_Toolkit/FLK_08_Federal_Labor_Rate_Benchmarks_FY2026.pdf",
    },
    {
        id: "indirect-rate-calc",
        category: "pricing",
        title: "Indirect Rate Calculator",
        description: "G&A + fringe + overhead in one workbook. Defensible rates for any cost-reimbursable contract.",
        format: "XLSX",
        sizeHint: "1 sheet",
        gdriveUrl: "",
        localPath: "/starter-pack/08_Price_to_Win_Toolkit/FLK_08_Indirect_Rate_Calculator.xlsx",
    },

    // ── Internal Best-Practice Library ───────────────────────────────────────
    {
        id: "bp-capture-maturity",
        category: "best_practices",
        title: "Capture Maturity Self-Audit",
        description: "Our internal scorecard — score your firm on the 7 capability dimensions that predict win rate.",
        format: "XLSX",
        sizeHint: "1 sheet",
        gdriveUrl: "",
        localPath: "/starter-pack/09_Internal_Best_Practice_Library/FLK_09_Capture_Maturity_Self_Audit.xlsx",
    },
    {
        id: "bp-color-team-reviews",
        category: "best_practices",
        title: "Color-Team Review Templates",
        description: "Pink, Red, Gold review checklists + scoring rubrics. Used inside CapturePilot for every managed-client bid.",
        format: "PDF",
        sizeHint: "3 templates",
        gdriveUrl: "",
        localPath: "/starter-pack/09_Internal_Best_Practice_Library/FLK_09_Color_Team_Review_Templates.pdf",
    },
    {
        id: "bp-far-decoder",
        category: "best_practices",
        title: "FAR Clause Quick-Reference Decoder",
        description: "Plain-English translations of the 50 most common FAR clauses you'll see in federal contracts.",
        format: "PDF",
        sizeHint: "24 pages",
        gdriveUrl: "",
        localPath: "/starter-pack/09_Internal_Best_Practice_Library/FLK_09_FAR_Clause_Quick_Reference_Decoder.pdf",
    },
    {
        id: "bp-teaming-agreement",
        category: "best_practices",
        title: "Teaming Agreement Template",
        description: "Mutually-fair teaming agreement we use with our own subs. Lawyer-reviewed.",
        format: "DOCX",
        gdriveUrl: "",
        localPath: "/starter-pack/09_Internal_Best_Practice_Library/FLK_09_Teaming_Agreement_Template.docx",
    },
    {
        id: "bp-compliance-matrix",
        category: "best_practices",
        title: "Compliance Matrix Template",
        description: "The exact L/M/Section-cross-walk we use internally for every RFP response.",
        format: "XLSX",
        sizeHint: "1 sheet",
        gdriveUrl: "",
        localPath: "/starter-pack/09_Internal_Best_Practice_Library/FLK_09_Compliance_Matrix_Template.xlsx",
    },

    // ── Onboarding call ──────────────────────────────────────────────────────
    {
        id: "founder-call-guide",
        category: "onboarding",
        title: "Founder Onboarding Call — Prep Guide",
        description: "What to bring + what we'll cover in the 30-min capture call so you walk out with a target opportunity.",
        format: "PDF",
        gdriveUrl: "",
        localPath: "/starter-pack/10_Bonus_Founder_Onboarding_Call/FLK_10_Founder_Onboarding_Call.pdf",
    },
    {
        id: "founder-call",
        category: "onboarding",
        title: "Book your 30-min founder onboarding call",
        description: "Walk through your first Sources Sought response live with our capture lead.",
        format: "Calendly",
        gdriveUrl: "https://calendly.com/capturepilot/launch-kit-onboarding",
        badge: "Free with kit",
    },
];

// ──────────────────────────────────────────────────────────────────────────────
// PRICING — single source of truth
// ──────────────────────────────────────────────────────────────────────────────
export const STARTUP_PACK_PRICE_CENTS = 7000;     // $70.00
export const STARTUP_PACK_FULL_PRICE_CENTS = 15000; // $150.00
export const STARTUP_PACK_OFFER_DAYS = 7;          // countdown from analysis created_at

/**
 * Resolve an asset to a renderable shape for the UI.
 * Returns { previewUrl, downloadUrl } — both may be undefined for empty entries.
 *
 * Resolution order:
 *   1. `localPath` + `token` → both URLs go through /api/startup-pack/file/<token>/<id>
 *      (token-gated streaming, rejects anyone without a valid non-refunded purchase)
 *   1b. `localPath` without `token` → no URLs returned (files are in /protected/, not
 *      /public/, so there is no raw static URL to fall back to).
 *   2. `gdriveUrl` non-Drive (Calendly, etc) → previewUrl pass-through
 *   3. `gdriveUrl` Drive → previewUrl + optional downloadUrl from gdriveFileId
 *
 * Why the optional token: the buyer download page passes the access_token so
 * every file URL becomes token-scoped — the request runs through the route
 * handler that re-validates the token before streaming. Without a token, local
 * files are inaccessible (by design) because they live under /protected/ not
 * /public/. Admin previews should use a valid buyer token or a direct DB lookup.
 */
export function resolveDriveLinks(
    asset: StartupPackAsset,
    token?: string,
): { previewUrl?: string; downloadUrl?: string } {
    if (asset.localPath && asset.localPath.trim()) {
        if (token) {
            const gated = `/api/startup-pack/file/${encodeURIComponent(token)}/${encodeURIComponent(asset.id)}`;
            return { previewUrl: gated, downloadUrl: `${gated}?dl=1` };
        }
        // No token — files are in /protected/ (not /public/) so no raw static URL exists.
        // Return empty to avoid broken links. Admin previews need a valid buyer token.
        return {};
    }

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

// ════════════════════════════════════════════════════════════════════════════
// LAUNCH KIT — phased structure (the after-purchase experience)
//
// Master Guide  →  6 phases (each item = a one-page guide PDF + its templates)
//   →  Bonus  →  Master Template List.
//
// Generated by tools/52_build_launch_kit.mjs (see launch-kit-structure.generated.json).
// This hand-maintained mirror is the single source the download page, the
// /kit/<id> deep-link resolver, and the ZIP route all read. Every guide +
// template + master doc is also flattened into STARTUP_PACK_ASSETS below so the
// token-gated file route can resolve it by id.
// ════════════════════════════════════════════════════════════════════════════

export interface LaunchKitFile {
    id: string;        // file-route asset id (derived from filename)
    title: string;
    localPath: string;
    format: string;    // PDF | DOCX | XLSX | PPTX
}
export interface LaunchKitItem {
    id: string;        // deep-link target + page anchor: /kit/<id> resolves to #kit-<id>
    title: string;
    kind: "template" | "worksheet" | "playbook" | "bundle" | "call";
    folder: string;    // pretty ZIP folder path
    guide: LaunchKitFile;
    templates: LaunchKitFile[];
    calendly?: string;
}
export interface LaunchKitPhase {
    n: number;
    slug: string;
    title: string;
    blurb: string;
    items: LaunchKitItem[];
}

function kitSlug(localPath: string): string {
    const base = (localPath.split("/").pop() || "").replace(/\.[a-z0-9]+$/i, "");
    return base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
/** Build a LaunchKitFile from a title + protected path. id + format are derived. */
function f(title: string, localPath: string): LaunchKitFile {
    return { id: kitSlug(localPath), title, localPath, format: (localPath.split(".").pop() || "").toUpperCase() };
}
function guideOf(title: string, localPath: string): LaunchKitFile {
    return f(`How to use: ${title}`, localPath);
}

export const MASTER_GUIDE: LaunchKitFile = f("Start Here · Master Guide", "/starter-pack/FLK_00_START_HERE_Master_Guide.pdf");
export const MASTER_LIST: LaunchKitFile = f("Master Template List", "/starter-pack/FLK_ZZ_Master_Template_List.pdf");

export const LAUNCH_KIT_PHASES: LaunchKitPhase[] = [
    {
        n: 1, slug: "get-registered", title: "Get Registered & Certified",
        blurb: "You can't win a dollar of federal work until SAM.gov says you're active and your set-aside status is locked in. Start here.",
        items: [
            {
                id: "sam-registration", title: "SAM.gov Registration", kind: "bundle",
                folder: "Phase 1 - Get Registered & Certified/1.1 SAM.gov Registration",
                guide: guideOf("SAM.gov Registration", "/starter-pack/01_SAM_Registration_Kit/FLK_01_GUIDE_SAM_Registration.pdf"),
                templates: [
                    f("SAM.gov Registration Walkthrough", "/starter-pack/01_SAM_Registration_Kit/FLK_01_SAM_Registration_Walkthrough.pdf"),
                    f("Pre-Registration Checklist", "/starter-pack/01_SAM_Registration_Kit/FLK_01_SAM_PreReg_Checklist.xlsx"),
                    f("NAICS Code Picker", "/starter-pack/01_SAM_Registration_Kit/FLK_01_NAICS_Code_Picker.pdf"),
                    f("Annual Renewal Kit", "/starter-pack/01_SAM_Registration_Kit/FLK_01_SAM_Renewal_Kit.pdf"),
                ],
            },
            {
                id: "certifications", title: "Certification Eligibility", kind: "worksheet",
                folder: "Phase 1 - Get Registered & Certified/1.2 Certification Eligibility",
                guide: guideOf("Certification Eligibility", "/starter-pack/05_Certification_Eligibility_Worksheets/FLK_05_GUIDE_Certifications.pdf"),
                templates: [
                    f("8(a) Self-Assessment", "/starter-pack/05_Certification_Eligibility_Worksheets/FLK_05_8a_Certification_Self_Assessment.xlsx"),
                    f("HUBZone Worksheet", "/starter-pack/05_Certification_Eligibility_Worksheets/FLK_05_HUBZone_Eligibility_Worksheet.xlsx"),
                    f("WOSB / EDWOSB Self-Cert", "/starter-pack/05_Certification_Eligibility_Worksheets/FLK_05_WOSB_EDWOSB_Self_Cert.xlsx"),
                    f("Small Disadvantaged Business Self-Assessment", "/starter-pack/05_Certification_Eligibility_Worksheets/FLK_05_SDB_Self_Assessment.xlsx"),
                    f("VOSB / SDVOSB Verification Guide", "/starter-pack/05_Certification_Eligibility_Worksheets/FLK_05_VOSB_SDVOSB_CVE_Guide.pdf"),
                ],
            },
        ],
    },
    {
        n: 2, slug: "federal-identity", title: "Build Your Federal Identity",
        blurb: "Before you chase a single opportunity, you need the two documents every contracting officer asks for: a capability statement and past performance.",
        items: [
            {
                id: "capability-statement", title: "Capability Statement", kind: "template",
                folder: "Phase 2 - Build Your Federal Identity/2.1 Capability Statement",
                guide: guideOf("Capability Statement", "/starter-pack/02_Capability_Statement_Kit/FLK_02_GUIDE_Capability_Statement.pdf"),
                templates: [
                    f("Editable Capability Statement (Word)", "/starter-pack/02_Capability_Statement_Kit/FLK_02_Capability_Statement_Template.docx"),
                    f("Branded Design Variants", "/starter-pack/02_Capability_Statement_Kit/FLK_02_Capability_Statement_Canva_Kit.pdf"),
                    f("How to Write One (full walkthrough)", "/starter-pack/02_Capability_Statement_Kit/FLK_02_How_to_Write_Capability_Statement.pdf"),
                ],
            },
            {
                id: "past-performance", title: "Past Performance", kind: "template",
                folder: "Phase 2 - Build Your Federal Identity/2.2 Past Performance",
                guide: guideOf("Past Performance", "/starter-pack/06_Past_Performance_Reference_Templates/FLK_06_GUIDE_Past_Performance.pdf"),
                templates: [
                    f("Past-Performance Reference (Word)", "/starter-pack/06_Past_Performance_Reference_Templates/FLK_06_Past_Performance_Reference_Template.docx"),
                    f("Reference Request Letter (Word)", "/starter-pack/06_Past_Performance_Reference_Templates/FLK_06_Past_Performance_Reference_Request_Letter.docx"),
                    f("Turning Commercial Work into Federal Past Performance", "/starter-pack/06_Past_Performance_Reference_Templates/FLK_06_Commercial_to_Federal_Past_Performance.pdf"),
                    f("Sample: IT Services", "/starter-pack/06_Past_Performance_Reference_Templates/FLK_06_Sample_Past_Performance_IT_Services.docx"),
                    f("Sample: Janitorial", "/starter-pack/06_Past_Performance_Reference_Templates/FLK_06_Sample_Past_Performance_Janitorial.docx"),
                ],
            },
        ],
    },
    {
        n: 3, slug: "find-qualify", title: "Find & Qualify the Right Work",
        blurb: "Most first-timers waste months bidding the wrong things. This phase is about finding real opportunities early and killing the bad ones fast.",
        items: [
            {
                id: "market-research", title: "Market Research", kind: "playbook",
                folder: "Phase 3 - Find & Qualify the Right Work/3.1 Market Research",
                guide: guideOf("Market Research", "/starter-pack/03_Solicitation_Playbooks/FLK_03_GUIDE_Market_Research.pdf"),
                templates: [f("Federal Market Research Playbook", "/starter-pack/03_Solicitation_Playbooks/FLK_03_Market_Research_Playbook.pdf")],
            },
            {
                id: "sources-sought", title: "Sources Sought & RFI", kind: "playbook",
                folder: "Phase 3 - Find & Qualify the Right Work/3.2 Sources Sought & RFI",
                guide: guideOf("Sources Sought & RFI", "/starter-pack/03_Solicitation_Playbooks/FLK_03_GUIDE_Sources_Sought.pdf"),
                templates: [
                    f("Sources Sought / RFI Playbook", "/starter-pack/03_Solicitation_Playbooks/FLK_03_Sources_Sought_RFI_Playbook.pdf"),
                    f("Sources Sought / RFI Response Template (Word)", "/starter-pack/03_Solicitation_Playbooks/FLK_03_Sources_Sought_RFI_Response_Template.docx"),
                ],
            },
            {
                id: "pre-solicitation", title: "Pre-Solicitation Window", kind: "playbook",
                folder: "Phase 3 - Find & Qualify the Right Work/3.3 Pre-Solicitation",
                guide: guideOf("Pre-Solicitation Window", "/starter-pack/03_Solicitation_Playbooks/FLK_03_GUIDE_Pre_Solicitation.pdf"),
                templates: [f("Pre-Solicitation Playbook", "/starter-pack/03_Solicitation_Playbooks/FLK_03_Pre_Solicitation_Playbook.pdf")],
            },
            {
                id: "bid-no-bid", title: "Bid / No-Bid Decision", kind: "worksheet",
                folder: "Phase 3 - Find & Qualify the Right Work/3.4 Bid or No-Bid Decision",
                guide: guideOf("Bid / No-Bid Decision", "/starter-pack/04_Bid_No_Bid_Decision_Toolkit/FLK_04_GUIDE_Bid_No_Bid.pdf"),
                templates: [
                    f("Bid / No-Bid Decision Matrix", "/starter-pack/04_Bid_No_Bid_Decision_Toolkit/FLK_04_Bid_No_Bid_Decision_Matrix.xlsx"),
                    f("PWin Calculator", "/starter-pack/04_Bid_No_Bid_Decision_Toolkit/FLK_04_PWin_Calculator.xlsx"),
                    f("PWin Worked Example", "/starter-pack/04_Bid_No_Bid_Decision_Toolkit/FLK_04_Sample_Filled_PWin_Worked_Example.xlsx"),
                    f("Competitive Bid Analysis", "/starter-pack/04_Bid_No_Bid_Decision_Toolkit/FLK_04_Competitive_Bid_Analysis.xlsx"),
                    f("Bid Decision Memo (Word)", "/starter-pack/04_Bid_No_Bid_Decision_Toolkit/FLK_04_Bid_Decision_Memo_Template.docx"),
                ],
            },
        ],
    },
    {
        n: 4, slug: "reach-out", title: "Reach Out & Position",
        blurb: "Federal buyers award to firms they already know. This phase is about getting on the contracting officer's radar before the RFP drops.",
        items: [
            {
                id: "co-outreach", title: "Contracting Officer Outreach", kind: "bundle",
                folder: "Phase 4 - Reach Out & Position/4.1 Contracting Officer Outreach",
                guide: guideOf("Contracting Officer Outreach", "/starter-pack/07_Contracting_Officer_Outreach_Library/FLK_07_GUIDE_CO_Outreach.pdf"),
                templates: [
                    f("Contracting Officer Email Templates", "/starter-pack/07_Contracting_Officer_Outreach_Library/FLK_07_CO_Email_Templates.pdf"),
                    f("COR / PM Conversation Scripts", "/starter-pack/07_Contracting_Officer_Outreach_Library/FLK_07_COR_PM_Conversation_Scripts.pdf"),
                    f("LinkedIn Outreach Scripts", "/starter-pack/07_Contracting_Officer_Outreach_Library/FLK_07_LinkedIn_Outreach_Scripts.pdf"),
                    f("LinkedIn Profile Audit", "/starter-pack/07_Contracting_Officer_Outreach_Library/FLK_07_LinkedIn_Profile_Audit.pdf"),
                    f("Industry Day Playbook", "/starter-pack/07_Contracting_Officer_Outreach_Library/FLK_07_Industry_Day_Playbook.pdf"),
                    f("Federal Events Calendar FY2026", "/starter-pack/07_Contracting_Officer_Outreach_Library/FLK_07_Federal_Events_Calendar_FY2026.pdf"),
                    f("Editable Email & Letter Pack (Word)", "/starter-pack/07_Contracting_Officer_Outreach_Library/FLK_07_Editable_Email_and_Letter_Pack.docx"),
                ],
            },
        ],
    },
    {
        n: 5, slug: "price-bid-win", title: "Price, Bid & Win",
        blurb: "The proposal itself. Price it so you win and still make money, respond to exactly what Section L and M ask for, and review it like the evaluators will.",
        items: [
            {
                id: "price-to-win", title: "Price-to-Win", kind: "worksheet",
                folder: "Phase 5 - Price, Bid & Win/5.1 Price-to-Win",
                guide: guideOf("Price-to-Win", "/starter-pack/08_Price_to_Win_Toolkit/FLK_08_GUIDE_Price_to_Win.pdf"),
                templates: [
                    f("Price-to-Win Worksheet", "/starter-pack/08_Price_to_Win_Toolkit/FLK_08_Price_to_Win_Worksheet.xlsx"),
                    f("Indirect Rate Calculator", "/starter-pack/08_Price_to_Win_Toolkit/FLK_08_Indirect_Rate_Calculator.xlsx"),
                    f("Indirect Rate Audit Checklist", "/starter-pack/08_Price_to_Win_Toolkit/FLK_08_Indirect_Rate_Audit_Checklist.pdf"),
                    f("Federal Labor Categories Matrix", "/starter-pack/08_Price_to_Win_Toolkit/FLK_08_Federal_Labor_Categories_Matrix.xlsx"),
                    f("Federal Labor Rate Benchmarks FY2026", "/starter-pack/08_Price_to_Win_Toolkit/FLK_08_Federal_Labor_Rate_Benchmarks_FY2026.pdf"),
                    f("Sample Cost Proposal", "/starter-pack/08_Price_to_Win_Toolkit/FLK_08_Sample_Cost_Proposal.xlsx"),
                ],
            },
            {
                id: "rfp-response", title: "RFP / Solicitation Response", kind: "playbook",
                folder: "Phase 5 - Price, Bid & Win/5.2 RFP - Solicitation Response",
                guide: guideOf("RFP / Solicitation Response", "/starter-pack/03_Solicitation_Playbooks/FLK_03_GUIDE_RFP_Response.pdf"),
                templates: [
                    f("RFP Response Playbook", "/starter-pack/03_Solicitation_Playbooks/FLK_03_RFP_Response_Playbook.pdf"),
                    f("How to Read Section L & M", "/starter-pack/03_Solicitation_Playbooks/FLK_03_How_to_Read_Section_L_M.pdf"),
                    f("Compliance Matrix", "/starter-pack/09_Internal_Best_Practice_Library/FLK_09_Compliance_Matrix_Template.xlsx"),
                    f("Win Themes Workbook", "/starter-pack/03_Solicitation_Playbooks/FLK_03_Win_Themes_Workbook.xlsx"),
                    f("Color-Team Review Templates", "/starter-pack/09_Internal_Best_Practice_Library/FLK_09_Color_Team_Review_Templates.pdf"),
                    f("Proposal Outline & Compliance Shell (Word)", "/starter-pack/03_Solicitation_Playbooks/FLK_03_Proposal_Outline_Compliance_Shell.docx"),
                ],
            },
            {
                id: "rfq", title: "RFQ Quoting", kind: "playbook",
                folder: "Phase 5 - Price, Bid & Win/5.3 RFQ Quotes",
                guide: guideOf("RFQ Quoting", "/starter-pack/03_Solicitation_Playbooks/FLK_03_GUIDE_RFQ.pdf"),
                templates: [f("RFQ Playbook", "/starter-pack/03_Solicitation_Playbooks/FLK_03_RFQ_Playbook.pdf")],
            },
            {
                id: "idiq", title: "IDIQ / GWAC Task Orders", kind: "playbook",
                folder: "Phase 5 - Price, Bid & Win/5.4 IDIQ & Task Orders",
                guide: guideOf("IDIQ / GWAC Task Orders", "/starter-pack/03_Solicitation_Playbooks/FLK_03_GUIDE_IDIQ.pdf"),
                templates: [f("IDIQ / GWAC Task-Order Playbook", "/starter-pack/03_Solicitation_Playbooks/FLK_03_IDIQ_GWAC_Task_Order_Playbook.pdf")],
            },
            {
                id: "teaming", title: "Teaming & Subcontracting", kind: "template",
                folder: "Phase 5 - Price, Bid & Win/5.5 Teaming & Subcontracting",
                guide: guideOf("Teaming & Subcontracting", "/starter-pack/09_Internal_Best_Practice_Library/FLK_09_GUIDE_Teaming.pdf"),
                templates: [
                    f("Teaming Agreement (Word)", "/starter-pack/09_Internal_Best_Practice_Library/FLK_09_Teaming_Agreement_Template.docx"),
                    f("Mutual NDA (Word)", "/starter-pack/09_Internal_Best_Practice_Library/FLK_09_NDA_Template.docx"),
                ],
            },
            {
                id: "capture-maturity", title: "Capture Maturity Self-Audit", kind: "worksheet",
                folder: "Phase 5 - Price, Bid & Win/5.6 Capture Maturity Self-Audit",
                guide: guideOf("Capture Maturity Self-Audit", "/starter-pack/09_Internal_Best_Practice_Library/FLK_09_GUIDE_Capture_Maturity.pdf"),
                templates: [f("Capture Maturity Self-Audit", "/starter-pack/09_Internal_Best_Practice_Library/FLK_09_Capture_Maturity_Self_Audit.xlsx")],
            },
            {
                id: "far-decoder", title: "FAR Clause Decoder", kind: "playbook",
                folder: "Phase 5 - Price, Bid & Win/5.7 FAR Clause Decoder",
                guide: guideOf("FAR Clause Decoder", "/starter-pack/09_Internal_Best_Practice_Library/FLK_09_GUIDE_FAR_Decoder.pdf"),
                templates: [f("FAR Clause Quick-Reference Decoder", "/starter-pack/09_Internal_Best_Practice_Library/FLK_09_FAR_Clause_Quick_Reference_Decoder.pdf")],
            },
        ],
    },
    {
        n: 6, slug: "after-win", title: "After You Win",
        blurb: "Winning is the start. Staying compliant and getting a strong CPARS rating is what gets you the next contract.",
        items: [
            {
                id: "post-award", title: "Post-Award Compliance", kind: "bundle",
                folder: "Phase 6 - After You Win/6.1 Post-Award Compliance",
                guide: guideOf("Post-Award Compliance", "/starter-pack/11_Post_Award_Compliance/FLK_11_GUIDE_Post_Award.pdf"),
                templates: [
                    f("CPARS & Past-Performance Guide", "/starter-pack/11_Post_Award_Compliance/FLK_11_CPARS_Past_Performance_Guide.pdf"),
                    f("DCAA Accounting Basics", "/starter-pack/11_Post_Award_Compliance/FLK_11_DCAA_Accounting_Basics.pdf"),
                    f("Quality Assurance Plan (Word)", "/starter-pack/11_Post_Award_Compliance/FLK_11_Quality_Assurance_Plan_Template.docx"),
                    f("Subcontracting Plan (Word)", "/starter-pack/11_Post_Award_Compliance/FLK_11_Subcontracting_Plan_Template.docx"),
                    f("Contract Mod Request (Word)", "/starter-pack/11_Post_Award_Compliance/FLK_11_Contract_Mod_Request_Template.docx"),
                ],
            },
        ],
    },
];

export const BONUS_ITEM: LaunchKitItem = {
    id: "founder-call", title: "Founder Onboarding Call", kind: "call",
    folder: "Bonus - Founder Onboarding Call",
    guide: guideOf("Founder Onboarding Call", "/starter-pack/10_Bonus_Founder_Onboarding_Call/FLK_10_GUIDE_Founder_Call.pdf"),
    templates: [f("Onboarding Call Prep Guide", "/starter-pack/10_Bonus_Founder_Onboarding_Call/FLK_10_Founder_Onboarding_Call.pdf")],
    calendly: "https://calendly.com/capturepilot/launch-kit-onboarding",
};

/** Resolve a /kit/<id> deep-link to the kit item (and the file route id of its guide). */
export function findKitItem(id: string): LaunchKitItem | undefined {
    if (id === BONUS_ITEM.id) return BONUS_ITEM;
    for (const ph of LAUNCH_KIT_PHASES) {
        const hit = ph.items.find(it => it.id === id);
        if (hit) return hit;
    }
    return undefined;
}

/** Flatten every kit guide + template + master doc into file-route assets. */
function kitExtraAssets(): StartupPackAsset[] {
    const files: LaunchKitFile[] = [MASTER_GUIDE, MASTER_LIST];
    for (const ph of LAUNCH_KIT_PHASES) for (const it of ph.items) files.push(it.guide, ...it.templates);
    files.push(BONUS_ITEM.guide, ...BONUS_ITEM.templates);
    const seen = new Set(LEGACY_ASSETS.map(a => a.id));
    const out: StartupPackAsset[] = [];
    for (const fl of files) {
        if (seen.has(fl.id)) continue;
        seen.add(fl.id);
        out.push({ id: fl.id, category: "kit_internal", title: fl.title, description: "", format: fl.format, gdriveUrl: "", localPath: fl.localPath });
    }
    return out;
}

// The full asset registry the file route resolves against: legacy entries
// (kept for the landing grid + offer card) plus every phased kit file.
export const STARTUP_PACK_ASSETS: StartupPackAsset[] = [...LEGACY_ASSETS, ...kitExtraAssets()];

/**
 * Single source of truth for the $70 Federal Launch Kit — list of digital goods.
 *
 * Each asset points either at a local file under `/public/starter-pack/<file>`
 * (the canonical delivery path after the 2026-06 rebuild) or at a Google Drive
 * share URL (legacy / Canva mocks / Calendly).
 *
 * HOW TO UPDATE THE LINKS
 * 1. Drop the file into `dashboard/public/starter-pack/` (commit it — under ~1 MB).
 * 2. Set `localPath: "/starter-pack/<filename>"`. The UI auto-fills download
 *    + preview URLs from the local path.
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
    /**
     * Public Google Drive share URL (folder or file). Optional.
     * Either `localPath` or `gdriveUrl` must be set for the asset to be live.
     */
    gdriveUrl: string;
    /** Optional: single-file Drive ID for a direct download button. */
    gdriveFileId?: string;
    /**
     * Optional: local file under `/public/starter-pack/<filename>`. When set,
     * the UI serves the file directly from Next's static handler — no Drive
     * round-trip, no rate limits, no token gymnastics.
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
// `localPath` wins when present — file is served from /public/starter-pack/.
// Empty `gdriveUrl: ""` + no `localPath` renders a "Coming soon" disabled card.
// ──────────────────────────────────────────────────────────────────────────────
export const STARTUP_PACK_ASSETS: StartupPackAsset[] = [
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
 *   1b. `localPath` without `token` → admin/staff preview: raw /starter-pack/<file>
 *   2. `gdriveUrl` non-Drive (Calendly, etc) → previewUrl pass-through
 *   3. `gdriveUrl` Drive → previewUrl + optional downloadUrl from gdriveFileId
 *
 * Why the optional token: the buyer download page passes the access_token so
 * every file URL becomes token-scoped — the request runs through the route
 * handler that re-validates the token before streaming. Without it, file URLs
 * fall back to the raw /public path, which is only safe for staff previews
 * since anyone who guesses a filename could wget it.
 */
export function resolveDriveLinks(
    asset: StartupPackAsset,
    token?: string,
): { previewUrl?: string; downloadUrl?: string } {
    if (asset.localPath && asset.localPath.trim()) {
        const path = asset.localPath.trim();
        if (token) {
            const gated = `/api/startup-pack/file/${encodeURIComponent(token)}/${encodeURIComponent(asset.id)}`;
            return { previewUrl: gated, downloadUrl: `${gated}?dl=1` };
        }
        // No token = unauthed preview mode (admin/staff); fall back to raw path.
        return { previewUrl: path, downloadUrl: path };
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

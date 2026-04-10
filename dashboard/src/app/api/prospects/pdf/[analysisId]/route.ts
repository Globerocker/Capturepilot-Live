import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { jsPDF } from "jspdf";

/**
 * GET /api/prospects/pdf/{analysisId}
 *
 * Premium 4-page federal opportunity intelligence report.
 * BCG/McKinsey-style visual design with clickable CTA button.
 *
 *   Page 1  Cover + Government Contracting Readiness Score
 *   Page 2  Matching Federal Opportunities (cards 1-5)
 *   Page 3  Matching Federal Opportunities (cards 6-10)
 *   Page 4  Strategic Next Steps + Clickable Book-Call CTA
 */

const BOOK_CALL_URL = "https://meetings-na2.hubspot.com/americurial/intro-call";
const SITE_URL = "https://capturepilot.com";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ analysisId: string }> }
) {
    const { analysisId } = await params;

    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );

    const { data, error } = await sb
        .from("company_analyses")
        .select("*")
        .eq("id", analysisId)
        .single();

    if (error || !data) {
        return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
    }

    // ── Data extraction ──────────────────────────────────────────────────
    const crawl = (data.crawl_data || {}) as Record<string, unknown>;
    const sam = data.sam_data as Record<string, unknown> | null;
    const profile = (data.inferred_profile || {}) as Record<string, unknown>;
    const naics = (data.inferred_naics || []) as { code: string; label: string; confidence: number }[];
    const selectedNaicsCodes = (data.selected_naics_codes || []) as string[];
    const allMatches = (data.preview_matches || []) as MatchRow[];
    const matches = allMatches.slice(0, 10);
    const certRecs = (data.cert_recommendations || []) as {
        cert_label: string; unlocked_count: number; estimated_value: number;
        difficulty: string; timeline: string;
    }[];
    const easyWins = (data.easy_wins || []) as { title: string; description: string; impact: string }[];
    const aiMatchSummaries = (data.ai_match_summaries || {}) as Record<string, string>;

    const companyName = (data.company_name || "Unknown Company") as string;
    const uei = (sam?.uei || profile.uei || "") as string;
    const cage = (sam?.cage_code || profile.cage_code || "") as string;
    const state = (sam?.state || profile.state || "") as string;
    const city = (sam?.city || "") as string;
    const website = (data.website || "") as string;
    const summary = (data.company_summary || "") as string;
    const certs = (crawl.certifications as { type: string; confidence: number }[]) || [];
    const isVeteran = certs.some(c => /veteran|vosb|sdvosb/i.test(c.type));
    const hasSmallBusinessCert = certs.some(c => /8\(a\)|hubzone|small business|wosb|edwosb/i.test(c.type));

    // Readiness score — use stored value, or compute a sensible one from signals we already have.
    const storedReadiness = typeof data.readiness_score === "number" ? data.readiness_score : null;
    const storedBreakdown = (data.readiness_breakdown || null) as ReadinessBreakdown | null;
    const readiness = storedReadiness !== null && storedBreakdown
        ? { score: clamp(storedReadiness, 0, 10), breakdown: storedBreakdown }
        : computeReadiness({
            hasSam: !!sam,
            certCount: certs.length,
            hasExperience: matches.length >= 3,
            isVeteran,
            hasSmallBusinessCert,
        });

    // Which NAICS were actually used — prefer explicitly selected, fall back to inferred.
    const usedNaics: { code: string; label: string }[] = selectedNaicsCodes.length > 0
        ? selectedNaicsCodes.map(code => {
            const match = naics.find(n => n.code === code);
            return { code, label: match?.label || "" };
        })
        : naics.slice(0, 6).map(n => ({ code: n.code, label: n.label }));

    // ── Color Palette ────────────────────────────────────────────────────
    const C = {
        primary:      [10, 10, 10]    as RGB,  // #0a0a0a
        accent:       [5, 150, 105]   as RGB,  // #059669 emerald-600
        accentDark:   [4, 120, 87]    as RGB,  // #047857 emerald-700
        accentLight:  [209, 250, 229] as RGB,  // #d1fae5 emerald-100
        textPrimary:  [28, 25, 23]    as RGB,  // #1c1917 stone-900
        textSecondary:[87, 83, 78]    as RGB,  // #57534e stone-600
        textMuted:    [168, 162, 158] as RGB,  // #a8a29e stone-400
        cardBg:       [250, 250, 249] as RGB,  // #fafaf9 stone-50
        cardShadow:   [230, 228, 226] as RGB,  // subtle shadow
        border:       [231, 229, 228] as RGB,  // #e7e5e4 stone-200
        white:        [255, 255, 255] as RGB,
        red:          [220, 38, 38]   as RGB,
        amber:        [217, 119, 6]   as RGB,
        blue:         [37, 99, 235]   as RGB,
        watermark:    [245, 244, 243] as RGB,
    };

    // ── Setup ────────────────────────────────────────────────────────────
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = 210;
    const pageH = 297;
    const margin = 18;
    const contentW = pageW - margin * 2;
    let y = 0;

    // Total pages: 1 cover + however many opportunity pages we need + 1 CTA
    const oppsPerPage = 5;
    const oppPageCount = matches.length === 0 ? 1 : Math.ceil(matches.length / oppsPerPage);
    const totalPages = 1 + oppPageCount + 1;

    const dateStr = new Date().toLocaleDateString("en-US", {
        month: "long", day: "numeric", year: "numeric",
    });

    // ── Color helpers ────────────────────────────────────────────────────
    const setColor = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
    const setFill  = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
    const setDraw  = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);

    function formatCurrency(amount: number): string {
        if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
        if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`;
        return `$${amount.toLocaleString()}`;
    }

    // ── Watermark (rotated, subtle) ──────────────────────────────────────
    function drawWatermark() {
        doc.saveGraphicsState();
        setColor(C.watermark);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(72);
        doc.text("CONFIDENTIAL", pageW / 2, pageH / 2 + 40, {
            align: "center",
            angle: 45,
        });
        doc.restoreGraphicsState();
    }

    // ── Footer ───────────────────────────────────────────────────────────
    function drawFooter(pageNum: number) {
        setDraw(C.border);
        doc.setLineWidth(0.25);
        doc.line(margin, pageH - 15, pageW - margin, pageH - 15);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        setColor(C.textMuted);
        doc.text(dateStr, margin, pageH - 10);

        const pageLabel = `${String(pageNum).padStart(2, "0")} / ${String(totalPages).padStart(2, "0")}`;
        doc.text(pageLabel, pageW - margin, pageH - 10, { align: "right" });

        doc.setFont("helvetica", "bold");
        doc.text("CONFIDENTIAL", pageW / 2, pageH - 10, { align: "center" });

        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        setColor(C.accent);
        doc.text("capturepilot.com", margin, pageH - 6);
        setColor(C.textMuted);
        doc.text("Prepared by Americurial LLC", pageW - margin, pageH - 6, { align: "right" });
    }

    // ── Inner-page dark section header ───────────────────────────────────
    function drawSectionHeader(title: string, subtitle?: string): number {
        const barH = 30;
        setFill(C.primary);
        doc.rect(0, 0, pageW, barH, "F");

        setFill(C.accent);
        doc.rect(0, barH, pageW, 0.7, "F");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        setColor(C.accent);
        doc.text("CAPTUREPILOT", margin, 8.5);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        setColor(C.textMuted);
        doc.text("Federal Opportunity Intelligence Report", pageW - margin, 8.5, { align: "right" });

        doc.setFont("helvetica", "bold");
        doc.setFontSize(17);
        setColor(C.white);
        doc.text(title, margin, 20);

        if (subtitle) {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8.5);
            setColor(C.textMuted);
            doc.text(subtitle, margin, 26);
        }

        return barH + 8;
    }

    // ── Section title with emerald underline ─────────────────────────────
    function drawSectionTitle(title: string) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        setColor(C.textPrimary);
        doc.text(title.toUpperCase(), margin, y);
        y += 1.8;
        setDraw(C.accent);
        doc.setLineWidth(0.7);
        doc.line(margin, y, margin + 32, y);
        setDraw(C.border);
        doc.setLineWidth(0.2);
        doc.line(margin + 32, y, pageW - margin, y);
        y += 6;
    }

    function drawBody(text: string, maxWidth?: number) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        setColor(C.textSecondary);
        const lines = doc.splitTextToSize(text, maxWidth || contentW);
        doc.text(lines, margin, y);
        y += lines.length * 4.2;
    }

    // ── Pill / tag ───────────────────────────────────────────────────────
    function drawPill(
        x: number, yPos: number, text: string,
        bgColor: RGB, textColor: RGB, outlined?: boolean,
    ): number {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        const textW = doc.getTextWidth(text);
        const pillW = textW + 5.5;
        const pillH = 4.8;

        if (outlined) {
            setDraw(bgColor);
            doc.setLineWidth(0.35);
            doc.roundedRect(x, yPos, pillW, pillH, 2.2, 2.2, "S");
        } else {
            setFill(bgColor);
            doc.roundedRect(x, yPos, pillW, pillH, 2.2, 2.2, "F");
        }
        setColor(outlined ? bgColor : textColor);
        doc.text(text, x + 2.75, yPos + 3.3);
        return pillW + 2.2;
    }

    // ── Small opportunity score circle ───────────────────────────────────
    function drawOppScoreCircle(x: number, yPos: number, score: number, classification: string) {
        const radius = 6;
        const color: RGB =
            classification === "HOT" ? C.accent :
            classification === "WARM" ? C.amber :
            C.blue;

        // Ring: outer filled + inner punched white look via thick border
        setFill(color);
        doc.circle(x + radius, yPos + radius, radius, "F");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        setColor(C.white);
        doc.text(String(Math.round(score * 100)), x + radius, yPos + radius + 0.8, { align: "center" });

        doc.setFontSize(5);
        doc.setFont("helvetica", "bold");
        doc.text(classification, x + radius, yPos + radius * 2 + 2.8, { align: "center" });
    }

    // ── Readiness gauge (big circle + label) ─────────────────────────────
    function drawReadinessGauge(cx: number, cy: number, score: number) {
        const outerR = 22;
        const innerR = 18;

        const color: RGB =
            score >= 7 ? C.accent :
            score >= 4 ? C.amber :
            C.red;

        // Outer ring (colored)
        setFill(color);
        doc.circle(cx, cy, outerR, "F");

        // Inner circle (white punch) — ring effect
        setFill(C.white);
        doc.circle(cx, cy, innerR, "F");

        // Big score
        doc.setFont("helvetica", "bold");
        doc.setFontSize(32);
        setColor(color);
        doc.text(score.toFixed(1), cx, cy + 2, { align: "center" });

        // /10 under score
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        setColor(C.textMuted);
        doc.text("out of 10", cx, cy + 9, { align: "center" });
    }

    // ── Mini bar for readiness contributors ──────────────────────────────
    function drawReadinessBar(x: number, yPos: number, label: string, value: number, barW: number) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        setColor(C.textSecondary);
        doc.text(label.toUpperCase(), x, yPos);

        const tY = yPos + 1.8;
        const barH = 2.8;

        setFill(C.border);
        doc.roundedRect(x, tY, barW, barH, 1.2, 1.2, "F");

        const fillW = Math.max(barW * clamp(value, 0, 1), 1);
        setFill(C.accent);
        doc.roundedRect(x, tY, fillW, barH, 1.2, 1.2, "F");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(6);
        setColor(C.textPrimary);
        doc.text(`${Math.round(value * 100)}%`, x + barW + 1.5, yPos + 1.5);
    }

    // ── Card shadow helper ───────────────────────────────────────────────
    function drawCardShadow(x: number, yPos: number, w: number, h: number, r: number) {
        setFill(C.cardShadow);
        doc.roundedRect(x + 0.8, yPos + 0.8, w, h, r, r, "F");
    }

    // ════════════════════════════════════════════════════════════════════
    // PAGE 1 — COVER + READINESS SCORE
    // ════════════════════════════════════════════════════════════════════

    // Dark cover block (top 70mm)
    const coverH = 70;
    setFill(C.primary);
    doc.rect(0, 0, pageW, coverH, "F");

    // Emerald accent line at bottom of cover
    setFill(C.accent);
    doc.rect(0, coverH, pageW, 1.2, "F");

    // Brand — top left
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    setColor(C.accent);
    doc.text("CAPTUREPILOT", margin, 11);

    // Report type — top right
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    setColor(C.textMuted);
    doc.text("Federal Opportunity Intelligence Report", pageW - margin, 11, { align: "right" });

    // Company name — big centered
    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    setColor(C.white);
    const nameLines = doc.splitTextToSize(companyName, contentW - 10);
    const nameStartY = nameLines.length > 1 ? 28 : 34;
    doc.text(nameLines, pageW / 2, nameStartY, { align: "center" });

    const postNameY = nameStartY + nameLines.length * 9 + 2;

    // Website in emerald
    if (website) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        setColor(C.accent);
        doc.text(website.replace(/^https?:\/\//, ""), pageW / 2, postNameY, { align: "center" });
    }

    // SAM badge + ID row
    const badgeY = postNameY + 7;
    const badgeText = sam ? "SAM.gov Registered" : "Not on SAM.gov";
    const badgeColor: RGB = sam ? C.accent : C.red;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    const badgeW = doc.getTextWidth(badgeText) + 9;
    const badgeX = (pageW - badgeW) / 2;
    setFill(badgeColor);
    doc.roundedRect(badgeX, badgeY - 3.8, badgeW, 6, 3, 3, "F");
    setColor(C.white);
    doc.text(badgeText, pageW / 2, badgeY, { align: "center" });

    // IDs row
    const idParts: string[] = [];
    if (uei) idParts.push(`UEI ${uei}`);
    if (cage) idParts.push(`CAGE ${cage}`);
    if (city && state) idParts.push(`${city}, ${state}`);
    else if (state) idParts.push(state);

    if (idParts.length > 0) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        setColor(C.textMuted);
        doc.text(idParts.join("    |    "), pageW / 2, badgeY + 6, { align: "center" });
    }

    // Date at bottom of cover
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    setColor(C.textMuted);
    doc.text(dateStr.toUpperCase(), pageW / 2, coverH - 5, { align: "center" });

    // ── Below cover: Readiness Score section ─────────────────────────────
    y = coverH + 12;

    drawSectionTitle("Government Contracting Readiness");

    // Readiness card: gauge on left, bars + label on right
    const readyCardH = 62;
    drawCardShadow(margin, y, contentW, readyCardH, 4);
    setFill(C.cardBg);
    setDraw(C.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, y, contentW, readyCardH, 4, 4, "FD");

    // Gauge on left
    const gaugeCx = margin + 34;
    const gaugeCy = y + readyCardH / 2;
    drawReadinessGauge(gaugeCx, gaugeCy, readiness.score);

    // Vertical divider
    setDraw(C.border);
    doc.setLineWidth(0.25);
    doc.line(margin + 68, y + 10, margin + 68, y + readyCardH - 10);

    // Label + contributors on right
    const rightX = margin + 76;
    const rightTop = y + 9;

    // Big label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    setColor(C.textPrimary);
    doc.text(readinessLabel(readiness.score), rightX, rightTop);

    // Description
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setColor(C.textSecondary);
    const descText = readinessDescription(readiness.score);
    const descLines = doc.splitTextToSize(descText, contentW - 80);
    doc.text(descLines, rightX, rightTop + 6);

    // Contributor bars
    const barsStartY = rightTop + 6 + descLines.length * 3.8 + 4;
    const barW = contentW - 95;
    const barSpacing = 7;
    drawReadinessBar(rightX, barsStartY,                  "SAM Registration", readiness.breakdown.sam,        barW);
    drawReadinessBar(rightX, barsStartY + barSpacing,     "Certifications",   readiness.breakdown.certs,      barW);
    drawReadinessBar(rightX, barsStartY + barSpacing * 2, "Experience Fit",   readiness.breakdown.experience, barW);
    drawReadinessBar(rightX, barsStartY + barSpacing * 3, "Veteran Status",   readiness.breakdown.veteran,    barW);

    y += readyCardH + 10;

    // ── Company Overview ─────────────────────────────────────────────────
    if (summary) {
        drawSectionTitle("Company Overview");
        const overview = summary.length > 380 ? summary.slice(0, 380).trim() + "..." : summary;
        drawBody(overview);
        y += 6;
    }

    // ── NAICS Codes Used ─────────────────────────────────────────────────
    if (usedNaics.length > 0) {
        drawSectionTitle("NAICS Codes Used for Matching");
        let px = margin;
        let pr = y;
        for (const n of usedNaics.slice(0, 6)) {
            const label = n.label ? `${n.code}  ${truncate(n.label, 28)}` : n.code;
            doc.setFont("helvetica", "bold");
            doc.setFontSize(7);
            const tw = doc.getTextWidth(label) + 7;
            if (px + tw > pageW - margin) {
                px = margin;
                pr += 8;
            }
            setDraw(C.accent);
            doc.setLineWidth(0.4);
            doc.roundedRect(px, pr - 3.8, tw, 6, 2.5, 2.5, "S");
            setColor(C.textPrimary);
            doc.text(label, px + 3.5, pr);
            px += tw + 3;
        }
        y = pr + 8;
    }

    drawFooter(1);

    // ════════════════════════════════════════════════════════════════════
    // PAGES 2-N — MATCHING OPPORTUNITIES (5 per page, up to 10 total)
    // ════════════════════════════════════════════════════════════════════

    if (matches.length === 0) {
        doc.addPage();
        y = drawSectionHeader(
            "Matching Federal Opportunities",
            `No active matches found for ${companyName}`,
        );
        y += 10;
        drawBody(
            "We couldn't find active federal opportunities matching this company's NAICS codes, " +
            "location, and set-aside eligibility right now. This may indicate a need to update " +
            "SAM.gov registration, expand NAICS coverage, or pursue additional socioeconomic " +
            "certifications to unlock more contract vehicles.",
        );
        drawFooter(2);
    } else {
        let currentPage = 2;
        for (let pageIdx = 0; pageIdx < oppPageCount; pageIdx++) {
            if (pageIdx > 0 || matches.length > 0) {
                doc.addPage();
            }

            const startIdx = pageIdx * oppsPerPage;
            const endIdx = Math.min(startIdx + oppsPerPage, matches.length);
            const pageMatches = matches.slice(startIdx, endIdx);

            const headerTitle = pageIdx === 0
                ? "Matching Federal Opportunities"
                : "Matching Federal Opportunities (cont.)";
            const headerSubtitle = pageIdx === 0
                ? `Top ${matches.length} matches ranked by fit score`
                : `Showing results ${startIdx + 1}–${endIdx} of ${matches.length}`;

            y = drawSectionHeader(headerTitle, headerSubtitle);
            drawWatermark();

            // Compact opportunity cards (5 per page)
            const cardH = 40;
            const cardGap = 4;

            for (let i = 0; i < pageMatches.length; i++) {
                const m = pageMatches[i];
                const absoluteIdx = startIdx + i;

                // Card shadow + background
                drawCardShadow(margin, y, contentW, cardH, 3);
                setFill(C.cardBg);
                setDraw(C.border);
                doc.setLineWidth(0.3);
                doc.roundedRect(margin, y, contentW, cardH, 3, 3, "FD");

                // Left accent bar (colored by classification)
                const accentColor: RGB =
                    m.classification === "HOT" ? C.accent :
                    m.classification === "WARM" ? C.amber :
                    C.blue;
                setFill(accentColor);
                doc.rect(margin, y, 1.6, cardH, "F");

                // Rank number (small) top-right
                doc.setFont("helvetica", "bold");
                doc.setFontSize(7);
                setColor(C.textMuted);
                doc.text(`#${String(absoluteIdx + 1).padStart(2, "0")}`, pageW - margin - 3, y + 5, { align: "right" });

                // Score circle
                const circleX = margin + 5;
                const circleY = y + 4;
                drawOppScoreCircle(circleX, circleY, m.score, m.classification);

                // Title
                const textX = margin + 22;
                const titleMaxW = contentW - 30;
                doc.setFont("helvetica", "bold");
                doc.setFontSize(9.5);
                setColor(C.textPrimary);
                const titleLines = doc.splitTextToSize(m.title || "Untitled Opportunity", titleMaxW);
                doc.text(titleLines[0], textX, y + 5);

                // Agency
                doc.setFont("helvetica", "normal");
                doc.setFontSize(7.5);
                setColor(C.textMuted);
                doc.text(truncate(m.agency || "Federal Agency", 85), textX, y + 9.5);

                // Tag pills row
                let tagX = textX;
                const tagY = y + 12.5;
                if (m.notice_type) {
                    tagX += drawPill(tagX, tagY, m.notice_type, C.primary, C.white);
                }
                if (m.naics_code) {
                    tagX += drawPill(tagX, tagY, `NAICS ${m.naics_code}`, C.accent, C.white, true);
                }
                if (m.set_aside_code) {
                    tagX += drawPill(tagX, tagY, m.set_aside_code, C.accentLight, C.accentDark);
                }
                if (m.award_amount && m.award_amount > 0) {
                    tagX += drawPill(tagX, tagY, formatCurrency(m.award_amount), C.accent, C.white);
                }
                if (m.response_deadline) {
                    const d = new Date(m.response_deadline);
                    const deadlineStr = `Due ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
                    tagX += drawPill(tagX, tagY, deadlineStr, C.border, C.textSecondary);
                }

                // AI Fit Summary — italic, 2 lines max
                const fitSummary =
                    m.ai_fit_summary ||
                    (m.notice_id && aiMatchSummaries[m.notice_id]) ||
                    buildFallbackFitSummary(m, companyName);

                doc.setFont("helvetica", "italic");
                doc.setFontSize(7.5);
                setColor(C.textSecondary);
                const summaryLines = doc.splitTextToSize(fitSummary, contentW - 30);
                const truncatedSummary = summaryLines.slice(0, 2);
                if (summaryLines.length > 2) {
                    const lastLine = truncatedSummary[1];
                    truncatedSummary[1] = lastLine.slice(0, Math.max(lastLine.length - 3, 1)) + "...";
                }
                const summaryY = y + 21;
                doc.text(truncatedSummary, textX, summaryY);

                // Bottom row: SAM link
                const linkY = y + cardH - 3.5;
                if (m.notice_id) {
                    doc.setFont("helvetica", "normal");
                    doc.setFontSize(6.5);
                    setColor(C.blue);
                    const samUrl = `sam.gov/opp/${m.notice_id}/view`;
                    doc.text(samUrl, textX, linkY);

                    // Make the SAM URL clickable
                    const samLinkW = doc.getTextWidth(samUrl);
                    doc.link(textX, linkY - 2.8, samLinkW, 3.8, {
                        url: `https://sam.gov/opp/${m.notice_id}/view`,
                    });
                }

                y += cardH + cardGap;
            }

            drawFooter(currentPage);
            currentPage++;
        }
    }

    // ════════════════════════════════════════════════════════════════════
    // FINAL PAGE — STRATEGIC NEXT STEPS + CLICKABLE CTA
    // ════════════════════════════════════════════════════════════════════
    doc.addPage();
    y = drawSectionHeader("Strategic Next Steps", `Your action plan to win federal contracts`);
    drawWatermark();

    // ── Top recommendations (compact) ────────────────────────────────────
    const recommendations = buildRecommendations(certRecs, easyWins);

    if (recommendations.length > 0) {
        drawSectionTitle("Recommended Actions");

        for (let i = 0; i < Math.min(recommendations.length, 3); i++) {
            const r = recommendations[i];
            const recH = 22;

            drawCardShadow(margin, y, contentW, recH, 3);
            setFill(C.cardBg);
            setDraw(C.border);
            doc.setLineWidth(0.3);
            doc.roundedRect(margin, y, contentW, recH, 3, 3, "FD");

            // Number circle on left
            setFill(C.primary);
            doc.circle(margin + 8, y + recH / 2, 5, "F");
            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            setColor(C.white);
            doc.text(String(i + 1), margin + 8, y + recH / 2 + 1, { align: "center" });

            // Title
            doc.setFont("helvetica", "bold");
            doc.setFontSize(10.5);
            setColor(C.textPrimary);
            doc.text(r.title, margin + 17, y + 8);

            // Description
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            setColor(C.textSecondary);
            const rLines = doc.splitTextToSize(r.description, contentW - 55);
            doc.text(rLines.slice(0, 2), margin + 17, y + 13);

            // Right-side value / impact badge
            if (r.value) {
                doc.setFont("helvetica", "bold");
                doc.setFontSize(13);
                setColor(C.accent);
                doc.text(r.value, pageW - margin - 4, y + 10, { align: "right" });

                doc.setFont("helvetica", "normal");
                doc.setFontSize(6.5);
                setColor(C.textMuted);
                doc.text(r.valueLabel || "est. value", pageW - margin - 4, y + 14, { align: "right" });
            }

            y += recH + 4;
        }
        y += 4;
    }

    // ── PROMINENT CLICKABLE BOOK CALL BUTTON ─────────────────────────────
    // Position: always at a predictable spot near bottom
    const ctaBlockTop = Math.max(y + 6, pageH - 82);

    // Tagline above button
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    setColor(C.textPrimary);
    doc.text("Ready to win federal contracts?", pageW / 2, ctaBlockTop, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    setColor(C.textSecondary);
    doc.text(
        "Let's turn this report into a funded pipeline.",
        pageW / 2, ctaBlockTop + 6, { align: "center" },
    );

    // Button geometry
    const btnY = ctaBlockTop + 13;
    const btnH = 18;
    const btnW = contentW;

    // Subtle shadow behind button
    setFill(C.cardShadow);
    doc.roundedRect(margin + 0.8, btnY + 1, btnW, btnH, 3.5, 3.5, "F");

    // Button background — emerald
    setFill(C.accent);
    doc.roundedRect(margin, btnY, btnW, btnH, 3.5, 3.5, "F");

    // Inner highlight line for Stripe-like depth
    setDraw(C.accentLight);
    doc.setLineWidth(0.4);
    doc.line(margin + 4, btnY + 1.2, margin + btnW - 4, btnY + 1.2);

    // Button title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    setColor(C.white);
    doc.text("Book a Free Strategy Call  \u2192", pageW / 2, btnY + 8.5, { align: "center" });

    // Button subtitle
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    setColor(C.accentLight);
    doc.text(
        "30-minute call  \u00b7  No commitment  \u00b7  Discuss your opportunities",
        pageW / 2, btnY + 14, { align: "center" },
    );

    // CLICKABLE LINK — the key feature
    doc.link(margin, btnY, btnW, btnH, { url: BOOK_CALL_URL });

    // ── Secondary link below button ──────────────────────────────────────
    const belowBtnY = btnY + btnH + 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setColor(C.textSecondary);
    doc.text("Or visit", pageW / 2 - 14, belowBtnY, { align: "right" });

    doc.setFont("helvetica", "bold");
    setColor(C.accent);
    doc.text("capturepilot.com", pageW / 2 - 11, belowBtnY);
    const siteLinkW = doc.getTextWidth("capturepilot.com");
    doc.link(pageW / 2 - 11, belowBtnY - 2.8, siteLinkW, 3.8, { url: SITE_URL });

    doc.setFont("helvetica", "normal");
    setColor(C.textSecondary);
    doc.text("to explore more", pageW / 2 - 10 + siteLinkW + 1, belowBtnY);

    // Confidentiality stamp
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    setColor(C.textMuted);
    doc.text(
        "Confidential  \u00b7  Prepared by Americurial LLC",
        pageW / 2, belowBtnY + 8, { align: "center" },
    );

    drawFooter(totalPages);

    // ── Return PDF ───────────────────────────────────────────────────────
    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    const safeFilename = companyName.replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "-");

    return new NextResponse(pdfBuffer, {
        status: 200,
        headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="CapturePilot-${safeFilename}.pdf"`,
        },
    });
}

// ═════════════════════════════════════════════════════════════════════════
// Types
// ═════════════════════════════════════════════════════════════════════════

type RGB = [number, number, number];

type MatchRow = {
    title?: string;
    agency?: string;
    score: number;
    classification: string;
    award_amount?: number;
    notice_type?: string;
    naics_code?: string;
    set_aside_code?: string;
    response_deadline?: string;
    notice_id?: string;
    place_of_performance_state?: string;
    score_breakdown?: Record<string, number>;
    ai_fit_summary?: string;
};

type ReadinessBreakdown = {
    sam: number;
    certs: number;
    experience: number;
    veteran: number;
};

// ═════════════════════════════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════════════════════════════

function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
}

function truncate(s: string, max: number): string {
    if (!s) return "";
    return s.length > max ? s.slice(0, max - 1).trim() + "\u2026" : s;
}

/**
 * Deterministic fallback readiness score when the analyzer hasn't written one.
 * Weights roughly mirror the analyzer's actual scoring hierarchy:
 *   SAM registration 40% | Certifications 25% | Experience fit 20% | Veteran 15%
 */
function computeReadiness(signals: {
    hasSam: boolean;
    certCount: number;
    hasExperience: boolean;
    isVeteran: boolean;
    hasSmallBusinessCert: boolean;
}): { score: number; breakdown: ReadinessBreakdown } {
    const sam = signals.hasSam ? 1 : 0.2;
    const certs = clamp(signals.certCount / 3, 0, 1) * (signals.hasSmallBusinessCert ? 1 : 0.7);
    const experience = signals.hasExperience ? 0.75 : 0.35;
    const veteran = signals.isVeteran ? 1 : 0;

    const score = clamp(
        (sam * 0.4 + certs * 0.25 + experience * 0.2 + (veteran || 0.3) * 0.15) * 10,
        1, 10,
    );

    return {
        score: Math.round(score * 10) / 10,
        breakdown: { sam, certs, experience, veteran: veteran || 0.1 },
    };
}

function readinessLabel(score: number): string {
    if (score >= 8.5) return "Highly Qualified";
    if (score >= 7)   return "Ready to Compete";
    if (score >= 4)   return "Getting Started";
    return "Not Ready";
}

function readinessDescription(score: number): string {
    if (score >= 8.5) {
        return "Strong federal posture. You meet the core requirements to compete on contracts of meaningful size.";
    }
    if (score >= 7) {
        return "You have the essentials in place. Focus on capture strategy, teaming, and past performance narratives.";
    }
    if (score >= 4) {
        return "Foundation is partially built. Close the gaps in registrations, certifications, and capability statements.";
    }
    return "Critical gaps remain. Prioritize SAM.gov activation and small business certification before pursuing awards.";
}

/**
 * Deterministic fallback fit summary when the analyzer hasn't generated one.
 * Explains WHY this specific opportunity matched in 1-2 sentences.
 */
function buildFallbackFitSummary(m: MatchRow, company: string): string {
    const reasons: string[] = [];
    if (m.naics_code) reasons.push(`aligns with NAICS ${m.naics_code}`);
    if (m.set_aside_code) reasons.push(`set-aside eligibility (${m.set_aside_code})`);
    if (m.notice_type && /sources sought|rfi/i.test(m.notice_type)) {
        reasons.push("early-stage notice gives you a 6-18 month head start");
    } else if (m.notice_type && /presolicitation/i.test(m.notice_type)) {
        reasons.push("presolicitation stage — incumbent intel still accessible");
    }
    if (m.award_amount && m.award_amount > 100000) {
        reasons.push(`meaningful contract value`);
    }
    if (reasons.length === 0) {
        return `${company} scored ${Math.round(m.score * 100)} on NAICS, location, and set-aside fit — worth investigating.`;
    }
    return `Strong fit: ${reasons.slice(0, 3).join(", ")}. Recommended action: respond to the posting before the deadline.`;
}

function buildRecommendations(
    certRecs: { cert_label: string; unlocked_count: number; estimated_value: number; difficulty: string; timeline: string; }[],
    easyWins: { title: string; description: string; impact: string }[],
): { title: string; description: string; value?: string; valueLabel?: string }[] {
    const out: { title: string; description: string; value?: string; valueLabel?: string }[] = [];

    // Best cert recommendation first
    if (certRecs.length > 0) {
        const top = certRecs[0];
        out.push({
            title: `Pursue ${top.cert_label}`,
            description: `Unlocks ${top.unlocked_count} additional federal opportunities. ${top.difficulty} difficulty, ${top.timeline} timeline.`,
            value: top.estimated_value >= 1_000_000
                ? `$${(top.estimated_value / 1_000_000).toFixed(1)}M`
                : `$${Math.round(top.estimated_value / 1000)}K`,
            valueLabel: "unlocked value",
        });
    }

    // Top easy win
    if (easyWins.length > 0) {
        const w = easyWins[0];
        out.push({
            title: w.title,
            description: w.description,
        });
    }

    // Always include the capture pipeline step
    out.push({
        title: "Build your capture pipeline",
        description: "Track the matched opportunities above, identify incumbents, prepare capability statements, and respond to Sources Sought notices to position for full solicitations.",
    });

    return out.slice(0, 3);
}

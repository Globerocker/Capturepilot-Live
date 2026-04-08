import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { jsPDF } from "jspdf";

/**
 * GET /api/prospects/pdf/{analysisId}
 * Generates a premium 3-4 page PDF report — BCG/McKinsey consulting style.
 *
 * Page 1: Cover + Company Profile
 * Page 2: Matching Federal Opportunities (top 5)
 * Page 3: Strategic Recommendations
 * Page 4 (or bottom of 3): CTA
 */
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

    // ── Data extraction (preserved from original) ────────────────────────
    const crawl = (data.crawl_data || {}) as Record<string, unknown>;
    const sam = data.sam_data as Record<string, unknown> | null;
    const profile = (data.inferred_profile || {}) as Record<string, unknown>;
    const naics = (data.inferred_naics || []) as { code: string; label: string; confidence: number }[];
    const matches = (data.preview_matches || []) as {
        title?: string; agency?: string; score: number; classification: string;
        award_amount?: number; notice_type?: string; naics_code?: string;
        set_aside_code?: string; response_deadline?: string; notice_id?: string;
        place_of_performance_state?: string; score_breakdown?: Record<string, number>;
    }[];
    const certRecs = (data.cert_recommendations || []) as {
        cert_label: string; unlocked_count: number; estimated_value: number;
        difficulty: string; timeline: string;
    }[];
    const easyWins = (data.easy_wins || []) as { title: string; description: string; impact: string }[];

    const companyName = data.company_name || "Unknown Company";
    const uei = (sam?.uei || profile.uei || "") as string;
    const cage = (sam?.cage_code || profile.cage_code || "") as string;
    const state = (sam?.state || profile.state || "") as string;
    const city = (sam?.city || "") as string;
    const website = data.website || "";
    const summary = data.company_summary || "";
    const services = (crawl.services as string[]) || [];
    const certs = (crawl.certifications as { type: string; confidence: number }[]) || [];
    const leadership = (crawl.leadership as { name: string; title: string; email?: string; phone?: string }[]) || [];
    const samPocs = (sam?.points_of_contact as { name: string; title: string; email?: string; phone?: string }[]) || [];
    const contactPerson = (profile.contact_person as { name: string; title: string; email?: string; phone?: string }) || null;

    // ── Color Palette ────────────────────────────────────────────────────
    const C = {
        primary:      [10, 10, 10] as [number, number, number],       // #0a0a0a
        accent:       [5, 150, 105] as [number, number, number],      // #059669
        accentLight:  [209, 250, 229] as [number, number, number],    // #d1fae5
        textPrimary:  [28, 25, 23] as [number, number, number],       // #1c1917
        textSecondary:[87, 83, 78] as [number, number, number],       // #57534e
        textMuted:    [168, 162, 158] as [number, number, number],    // #a8a29e
        cardBg:       [250, 250, 249] as [number, number, number],    // #fafaf9
        border:       [231, 229, 228] as [number, number, number],    // #e7e5e4
        white:        [255, 255, 255] as [number, number, number],
        blue:         [37, 99, 235] as [number, number, number],      // #2563eb
        red:          [220, 38, 38] as [number, number, number],
        amber:        [217, 119, 6] as [number, number, number],
    };

    // ── Build PDF ────────────────────────────────────────────────────────
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = 210;
    const pageH = 297;
    const margin = 20;
    const contentW = pageW - margin * 2;
    let y = 0;
    let totalPages = 3;

    const dateStr = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    function setColor(c: [number, number, number]) {
        doc.setTextColor(c[0], c[1], c[2]);
    }
    function setFill(c: [number, number, number]) {
        doc.setFillColor(c[0], c[1], c[2]);
    }
    function setDraw(c: [number, number, number]) {
        doc.setDrawColor(c[0], c[1], c[2]);
    }

    function formatCurrency(amount: number): string {
        if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
        if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`;
        return `$${amount.toLocaleString()}`;
    }

    // ── Page furniture ───────────────────────────────────────────────────

    function drawPageFooter(pageNum: number) {
        // Thin separator
        setDraw(C.border);
        doc.setLineWidth(0.3);
        doc.line(margin, pageH - 16, pageW - margin, pageH - 16);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        setColor(C.textMuted);
        doc.text(dateStr, margin, pageH - 11);
        doc.text(`Page ${pageNum} of ${totalPages}`, pageW - margin, pageH - 11, { align: "right" });
        doc.text("CONFIDENTIAL", pageW / 2, pageH - 11, { align: "center" });

        // Bottom brand line
        doc.setFontSize(6.5);
        setColor(C.accent);
        doc.text("capturepilot.com", margin, pageH - 7);
        setColor(C.textMuted);
        doc.text("Americurial LLC", pageW - margin, pageH - 7, { align: "right" });
    }

    /** Dark header bar for inner pages (pages 2+) */
    function drawSectionHeader(title: string, subtitle?: string): number {
        const barH = 32;
        setFill(C.primary);
        doc.rect(0, 0, pageW, barH, "F");

        // Emerald accent line at bottom of bar
        setFill(C.accent);
        doc.rect(0, barH, pageW, 0.8, "F");

        // CAPTUREPILOT top-left
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        setColor(C.accent);
        doc.text("CAPTUREPILOT", margin, 8);

        // Report label top-right
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        setColor(C.textMuted);
        doc.text("Federal Opportunity Intelligence Report", pageW - margin, 8, { align: "right" });

        // Section title
        doc.setFont("helvetica", "bold");
        doc.setFontSize(18);
        setColor(C.white);
        doc.text(title, margin, 21);

        if (subtitle) {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            setColor(C.textMuted);
            doc.text(subtitle, margin, 27);
        }

        return barH + 6;
    }

    /** Section heading with emerald underline accent */
    function drawSectionTitle(title: string) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        setColor(C.textPrimary);
        doc.text(title.toUpperCase(), margin, y);
        y += 2;
        // Emerald accent line
        setDraw(C.accent);
        doc.setLineWidth(0.7);
        doc.line(margin, y, margin + 35, y);
        // Faint continuation line
        setDraw(C.border);
        doc.setLineWidth(0.2);
        doc.line(margin + 35, y, pageW - margin, y);
        y += 6;
    }

    /** Small subsection label */
    function drawLabel(text: string) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        setColor(C.textMuted);
        doc.text(text.toUpperCase(), margin, y);
        y += 4;
    }

    /** Body paragraph text */
    function drawBody(text: string, maxWidth?: number, indent?: number) {
        const x = margin + (indent || 0);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        setColor(C.textSecondary);
        const lines = doc.splitTextToSize(text, maxWidth || contentW - (indent || 0));
        doc.text(lines, x, y);
        y += lines.length * 4.2;
    }

    /** Draw a pill/badge */
    function drawPill(x: number, yPos: number, text: string, bgColor: [number, number, number], textColor: [number, number, number], outlined?: boolean): number {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        const textW = doc.getTextWidth(text);
        const pillW = textW + 7;
        const pillH = 5.5;

        if (outlined) {
            setDraw(bgColor);
            doc.setLineWidth(0.4);
            doc.roundedRect(x, yPos, pillW, pillH, 2.5, 2.5, "S");
        } else {
            setFill(bgColor);
            doc.roundedRect(x, yPos, pillW, pillH, 2.5, 2.5, "F");
        }
        setColor(outlined ? bgColor : textColor);
        doc.text(text, x + 3.5, yPos + 3.8);
        return pillW + 3;
    }

    /** Score circle badge */
    function drawScoreCircle(x: number, yPos: number, score: number, classification: string): number {
        const radius = 7;
        const color: [number, number, number] =
            classification === "HOT" ? C.accent :
            classification === "WARM" ? C.amber :
            C.blue;

        // Outer ring
        setFill(color);
        doc.circle(x + radius, yPos + radius, radius, "F");

        // Score text
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        setColor(C.white);
        doc.text(String(Math.round(score * 100)), x + radius, yPos + radius + 1, { align: "center" });

        // Classification below circle
        doc.setFontSize(5.5);
        doc.setFont("helvetica", "bold");
        setColor(color);
        doc.text(classification, x + radius, yPos + radius * 2 + 3, { align: "center" });

        return radius * 2 + 4;
    }

    /** Mini bar chart for score breakdown */
    function drawScoreBar(x: number, yPos: number, label: string, value: number, maxW: number) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6);
        setColor(C.textMuted);
        doc.text(label, x, yPos + 2.5);

        const barX = x + 20;
        const barW = maxW - 24;
        const barH = 3;

        // Background track
        setFill(C.border);
        doc.roundedRect(barX, yPos, barW, barH, 1, 1, "F");

        // Filled portion
        const fillW = Math.max(barW * value, 1);
        setFill(C.accent);
        doc.roundedRect(barX, yPos, fillW, barH, 1, 1, "F");

        // Percentage
        doc.setFontSize(6);
        setColor(C.textSecondary);
        doc.text(`${Math.round(value * 100)}%`, barX + barW + 2, yPos + 2.5);
    }

    // ════════════════════════════════════════════════════════════════════════
    // PAGE 1 — COVER + COMPANY PROFILE
    // ════════════════════════════════════════════════════════════════════════

    // Dark cover block (top ~78mm)
    const coverH = 78;
    setFill(C.primary);
    doc.rect(0, 0, pageW, coverH, "F");

    // Emerald accent line at bottom of cover
    setFill(C.accent);
    doc.rect(0, coverH, pageW, 1, "F");

    // CAPTUREPILOT brand — top left
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    setColor(C.accent);
    doc.text("CAPTUREPILOT", margin, 12);

    // Report type — top right
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    setColor(C.textMuted);
    doc.text("Federal Opportunity Intelligence Report", pageW - margin, 12, { align: "right" });

    // Company name — big and centered
    doc.setFont("helvetica", "bold");
    doc.setFontSize(26);
    setColor(C.white);
    const nameLines = doc.splitTextToSize(companyName, contentW);
    const nameStartY = nameLines.length > 1 ? 30 : 34;
    doc.text(nameLines, pageW / 2, nameStartY, { align: "center" });

    // Website in emerald below name
    const postNameY = nameStartY + nameLines.length * 10;
    if (website) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        setColor(C.accent);
        doc.text(website.replace(/^https?:\/\//, ""), pageW / 2, postNameY, { align: "center" });
    }

    // SAM status badge
    const badgeY = postNameY + 6;
    if (sam) {
        const badgeText = "SAM.gov Registered";
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        const badgeW = doc.getTextWidth(badgeText) + 10;
        const badgeX = (pageW - badgeW) / 2;
        setFill(C.accent);
        doc.roundedRect(badgeX, badgeY - 4, badgeW, 6.5, 3, 3, "F");
        setColor(C.white);
        doc.text(badgeText, pageW / 2, badgeY, { align: "center" });
    } else {
        const badgeText = "Not on SAM.gov";
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        const badgeW = doc.getTextWidth(badgeText) + 10;
        const badgeX = (pageW - badgeW) / 2;
        setFill(C.red);
        doc.roundedRect(badgeX, badgeY - 4, badgeW, 6.5, 3, 3, "F");
        setColor(C.white);
        doc.text(badgeText, pageW / 2, badgeY, { align: "center" });
    }

    // IDs row centered
    const idsY = badgeY + 7;
    const idParts: string[] = [];
    if (uei) idParts.push(`UEI: ${uei}`);
    if (cage) idParts.push(`CAGE: ${cage}`);
    if (city && state) idParts.push(`${city}, ${state}`);
    else if (state) idParts.push(state);

    if (idParts.length > 0) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        setColor(C.textMuted);
        doc.text(idParts.join("    |    "), pageW / 2, idsY, { align: "center" });
    }

    // Date at bottom of cover
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    setColor(C.textMuted);
    doc.text(dateStr, pageW / 2, coverH - 5, { align: "center" });

    // ── Below cover: Company content ─────────────────────────────────────
    y = coverH + 10;

    // Company Overview
    if (summary) {
        drawSectionTitle("Company Overview");
        drawBody(summary);
        y += 5;
    }

    // NAICS Codes as emerald-bordered pills
    if (naics.length > 0) {
        drawSectionTitle("NAICS Codes");
        let pillX = margin;
        let pillRow = y;
        for (const n of naics.slice(0, 6)) {
            const pillText = `${n.code} — ${n.label}`;
            doc.setFont("helvetica", "bold");
            doc.setFontSize(7);
            const tw = doc.getTextWidth(pillText) + 8;

            // Wrap to next row if needed
            if (pillX + tw > pageW - margin) {
                pillX = margin;
                pillRow += 8;
            }

            // Emerald outlined pill
            setDraw(C.accent);
            doc.setLineWidth(0.4);
            doc.roundedRect(pillX, pillRow - 3.5, tw, 6, 2.5, 2.5, "S");
            setColor(C.textPrimary);
            doc.text(pillText, pillX + 4, pillRow);

            pillX += tw + 3;
        }
        y = pillRow + 10;
    }

    // Key Contact — gray card (public version: no email/phone from leadership)
    const keyPerson = contactPerson || samPocs[0] || leadership[0] || null;
    if (keyPerson) {
        drawSectionTitle("Key Contact");

        // Card background
        setFill(C.cardBg);
        setDraw(C.border);
        doc.setLineWidth(0.3);
        doc.roundedRect(margin, y - 2, contentW, 16, 3, 3, "FD");

        // Left: emerald accent bar
        setFill(C.accent);
        doc.roundedRect(margin, y - 2, 1.5, 16, 0.7, 0.7, "F");

        // Name
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        setColor(C.textPrimary);
        doc.text(keyPerson.name, margin + 6, y + 4);

        // Title
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        setColor(C.textSecondary);
        doc.text(keyPerson.title || "", margin + 6, y + 9);

        // Right side: email (from SAM only, public record)
        if (keyPerson.email) {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            setColor(C.blue);
            doc.text(keyPerson.email, pageW - margin - 5, y + 4, { align: "right" });
        }
        if (keyPerson.phone) {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            setColor(C.textSecondary);
            doc.text(keyPerson.phone, pageW - margin - 5, y + 9, { align: "right" });
        }

        y += 20;
    }

    // Certifications as green check badges
    if (certs.length > 0) {
        drawSectionTitle("Certifications");
        let certPillX = margin;
        let certPillRow = y;
        for (const c of certs) {
            const certText = c.type;
            doc.setFont("helvetica", "bold");
            doc.setFontSize(7);
            const tw = doc.getTextWidth(certText) + 12;

            if (certPillX + tw > pageW - margin) {
                certPillX = margin;
                certPillRow += 8;
            }

            // Green filled pill
            setFill(C.accentLight);
            doc.roundedRect(certPillX, certPillRow - 3.5, tw, 6, 2.5, 2.5, "F");
            setColor(C.accent);
            doc.text(certText, certPillX + 4, certPillRow);

            certPillX += tw + 3;
        }
        y = certPillRow + 10;
    }

    // Services (compact, if space)
    if (services.length > 0 && y < 250) {
        drawSectionTitle("Detected Services");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        setColor(C.textSecondary);
        const svcText = services.slice(0, 10).join("  |  ");
        const svcLines = doc.splitTextToSize(svcText, contentW);
        doc.text(svcLines, margin, y);
        y += svcLines.length * 3.8 + 4;
    }

    drawPageFooter(1);

    // ════════════════════════════════════════════════════════════════════════
    // PAGE 2 — MATCHING OPPORTUNITIES
    // ════════════════════════════════════════════════════════════════════════
    doc.addPage();
    y = drawSectionHeader(
        "Matching Federal Opportunities",
        `Top ${Math.min(matches.length, 5)} matches identified for ${companyName}`
    );

    if (matches.length === 0) {
        y += 10;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        setColor(C.textSecondary);
        doc.text("No matching opportunities found for this company profile.", margin, y);
        y += 8;
        doc.setFontSize(9);
        doc.text("This may indicate the company needs to update their SAM.gov registration", margin, y);
        y += 4;
        doc.text("or expand their NAICS codes to match available federal opportunities.", margin, y);
    } else {
        for (let i = 0; i < Math.min(matches.length, 5); i++) {
            const m = matches[i];

            // Check if we need a new page
            if (y > 240) {
                drawPageFooter(2);
                doc.addPage();
                y = drawSectionHeader("Matching Federal Opportunities (cont.)", "");
                totalPages = 4;
            }

            // ── Opportunity card ─────────────────────────────────────────

            // Calculate card height based on content
            const hasBreakdown = m.score_breakdown && Object.keys(m.score_breakdown).length > 0;
            const breakdownEntries = hasBreakdown ? Object.entries(m.score_breakdown!) : [];
            const cardH = hasBreakdown ? 52 + (breakdownEntries.length * 4.5) : 48;

            // Card background with subtle border
            setFill(C.cardBg);
            setDraw(C.border);
            doc.setLineWidth(0.3);
            doc.roundedRect(margin, y - 1, contentW, cardH, 3, 3, "FD");

            // Left accent bar colored by classification
            const accentBarColor: [number, number, number] =
                m.classification === "HOT" ? C.accent :
                m.classification === "WARM" ? C.amber :
                C.blue;
            setFill(accentBarColor);
            doc.roundedRect(margin, y - 1, 1.5, cardH, 0.7, 0.7, "F");

            // Score circle
            const circleX = margin + 5;
            const circleY = y + 2;
            drawScoreCircle(circleX, circleY, m.score, m.classification);

            // Title
            const textStartX = margin + 24;
            const titleMaxW = contentW - 28;
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9.5);
            setColor(C.textPrimary);
            const titleLines = doc.splitTextToSize(m.title || "Untitled Opportunity", titleMaxW);
            doc.text(titleLines[0], textStartX, y + 5);
            if (titleLines.length > 1) {
                doc.text(titleLines[1], textStartX, y + 9.5);
            }

            // Agency
            const agencyY = y + (titleLines.length > 1 ? 14 : 9.5);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            setColor(C.textMuted);
            doc.text(m.agency || "Federal Agency", textStartX, agencyY);

            // Tags row
            let tagY = agencyY + 5;
            let tagX = textStartX;

            if (m.notice_type) {
                tagX += drawPill(tagX, tagY - 3.5, m.notice_type, C.primary, C.white);
            }
            if (m.naics_code) {
                tagX += drawPill(tagX, tagY - 3.5, `NAICS ${m.naics_code}`, C.accent, C.white, true);
            }
            if (m.set_aside_code) {
                tagX += drawPill(tagX, tagY - 3.5, m.set_aside_code, C.accentLight, C.accent);
            }
            if (m.award_amount && m.award_amount > 0) {
                tagX += drawPill(tagX, tagY - 3.5, formatCurrency(m.award_amount), C.accent, C.white);
            }
            if (m.response_deadline) {
                const deadlineStr = `Due ${new Date(m.response_deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
                tagX += drawPill(tagX, tagY - 3.5, deadlineStr, C.border, C.textSecondary);
            }

            tagY += 6;

            // Score breakdown mini bars
            if (hasBreakdown) {
                tagY += 2;
                const barStartX = textStartX;
                const barMaxW = (contentW - 28) / 2 - 5;
                let barIdx = 0;
                for (const [key, val] of breakdownEntries) {
                    const col = barIdx % 2;
                    const row = Math.floor(barIdx / 2);
                    const bx = barStartX + col * (barMaxW + 10);
                    const by = tagY + row * 4.5;

                    const prettyKey = key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
                    drawScoreBar(bx, by, prettyKey, val, barMaxW);
                    barIdx++;
                }
                tagY += Math.ceil(breakdownEntries.length / 2) * 4.5 + 2;
            }

            // Bottom row: SAM link + next steps
            const bottomRowY = tagY + 2;

            // SAM.gov link
            if (m.notice_id) {
                doc.setFont("helvetica", "normal");
                doc.setFontSize(7);
                setColor(C.blue);
                doc.text(`sam.gov/opp/${m.notice_id}/view`, textStartX, bottomRowY);
            }

            // Next steps in italic
            const steps = getNextSteps(m.notice_type);
            doc.setFont("helvetica", "italic");
            doc.setFontSize(7);
            setColor(C.textMuted);
            doc.text(`Next step: ${steps[0]}`, textStartX, bottomRowY + 4);

            y += cardH + 5;
        }
    }

    drawPageFooter(2);

    // ════════════════════════════════════════════════════════════════════════
    // PAGE 3 — STRATEGIC RECOMMENDATIONS
    // ════════════════════════════════════════════════════════════════════════
    doc.addPage();
    y = drawSectionHeader("Strategic Recommendations", `Tailored action plan for ${companyName}`);

    // ── Certifications to Pursue ─────────────────────────────────────────
    if (certRecs.length > 0) {
        drawSectionTitle("Certifications to Pursue");

        for (const rec of certRecs.slice(0, 4)) {
            if (y > 220) break;

            const recCardH = 22;

            // Card with left accent
            setFill(C.cardBg);
            setDraw(C.border);
            doc.setLineWidth(0.3);
            doc.roundedRect(margin, y - 2, contentW, recCardH, 3, 3, "FD");

            // Left emerald accent
            setFill(C.accent);
            doc.roundedRect(margin, y - 2, 1.5, recCardH, 0.7, 0.7, "F");

            // Cert name
            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            setColor(C.textPrimary);
            doc.text(rec.cert_label, margin + 6, y + 4);

            // Unlocked opps
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            setColor(C.textSecondary);
            doc.text(`Unlocks ${rec.unlocked_count} additional opportunities`, margin + 6, y + 10);

            // Difficulty + timeline
            doc.setFontSize(7);
            setColor(C.textMuted);
            doc.text(`${rec.difficulty} difficulty  |  ${rec.timeline}`, margin + 6, y + 15);

            // Right side: estimated value in emerald
            if (rec.estimated_value > 0) {
                doc.setFont("helvetica", "bold");
                doc.setFontSize(14);
                setColor(C.accent);
                doc.text(formatCurrency(rec.estimated_value), pageW - margin - 5, y + 6, { align: "right" });

                doc.setFont("helvetica", "normal");
                doc.setFontSize(7);
                setColor(C.textMuted);
                doc.text("est. contract value", pageW - margin - 5, y + 11, { align: "right" });
            }

            y += recCardH + 4;
        }
        y += 4;
    }

    // ── Quick Wins ───────────────────────────────────────────────────────
    if (easyWins.length > 0 && y < 210) {
        drawSectionTitle("Quick Wins");

        for (let i = 0; i < Math.min(easyWins.length, 5); i++) {
            if (y > 230) break;
            const win = easyWins[i];

            // Number circle
            const numX = margin + 4;
            const numY = y;
            setFill(C.accent);
            doc.circle(numX, numY, 3.5, "F");
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            setColor(C.white);
            doc.text(String(i + 1), numX, numY + 1, { align: "center" });

            // Title + impact badge
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9);
            setColor(C.textPrimary);
            doc.text(win.title, margin + 10, y + 1);

            // Impact badge
            const impactColor: [number, number, number] =
                win.impact === "high" ? C.red :
                win.impact === "medium" ? C.amber :
                C.blue;
            const impactText = win.impact.toUpperCase();
            doc.setFont("helvetica", "bold");
            doc.setFontSize(6);
            const impactW = doc.getTextWidth(impactText) + 5;
            const impactX = margin + 10 + doc.getTextWidth(win.title) + 4;

            // Only draw if it fits on the line
            if (impactX + impactW < pageW - margin) {
                setFill(impactColor);
                doc.roundedRect(impactX, y - 3, impactW, 5, 2, 2, "F");
                setColor(C.white);
                doc.text(impactText, impactX + 2.5, y + 0.5);
            }

            y += 5;

            // Description
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            setColor(C.textSecondary);
            const descLines = doc.splitTextToSize(win.description, contentW - 12);
            doc.text(descLines, margin + 10, y);
            y += descLines.length * 3.5 + 5;
        }
        y += 3;
    }

    // ── Next Steps — 3-step process ──────────────────────────────────────
    if (y < 220) {
        drawSectionTitle("Recommended Next Steps");

        const nextStepsData = [
            {
                step: "1",
                title: "Register & Verify",
                desc: "Ensure SAM.gov registration is active, NAICS codes are comprehensive, and all certifications are current."
            },
            {
                step: "2",
                title: "Build Capture Pipeline",
                desc: "Track the matched opportunities above, identify incumbents, and prepare capability statements for Sources Sought responses."
            },
            {
                step: "3",
                title: "Engage & Compete",
                desc: "Contact contracting officers, attend industry days, build teaming relationships, and submit competitive proposals."
            }
        ];

        for (const ns of nextStepsData) {
            if (y > 245) break;

            // Step number in dark circle
            setFill(C.primary);
            doc.circle(margin + 4, y, 4, "F");
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9);
            setColor(C.white);
            doc.text(ns.step, margin + 4, y + 1, { align: "center" });

            // Title
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9.5);
            setColor(C.textPrimary);
            doc.text(ns.title, margin + 12, y + 1);

            y += 5;

            // Description
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            setColor(C.textSecondary);
            const lines = doc.splitTextToSize(ns.desc, contentW - 14);
            doc.text(lines, margin + 12, y);
            y += lines.length * 3.5 + 5;
        }
    }

    // ── CTA Card ─────────────────────────────────────────────────────────
    // Position CTA at bottom of page
    const ctaH = 38;
    const ctaY = Math.max(y + 6, pageH - 58);

    // Full-width dark card
    setFill(C.primary);
    doc.roundedRect(margin, ctaY, contentW, ctaH, 4, 4, "F");

    // Emerald accent line at top of CTA
    setFill(C.accent);
    doc.roundedRect(margin + 20, ctaY, contentW - 40, 0.8, 0.4, 0.4, "F");

    // Main CTA text
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    setColor(C.white);
    doc.text("Ready to Win Federal Contracts?", pageW / 2, ctaY + 12, { align: "center" });

    // Sub text
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    setColor(C.textMuted);
    doc.text("Book a free strategy call to discuss your opportunities", pageW / 2, ctaY + 19, { align: "center" });

    // Links row
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    setColor(C.accent);
    doc.text("meetings-na2.hubspot.com/americurial/intro-call", pageW / 2, ctaY + 27, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    setColor(C.textMuted);
    doc.text("capturepilot.com", pageW / 2 - 25, ctaY + 33, { align: "center" });

    // Separator dot
    setColor(C.textMuted);
    doc.text("|", pageW / 2, ctaY + 33, { align: "center" });

    doc.setFontSize(7.5);
    setColor(C.textMuted);
    doc.text("Americurial LLC", pageW / 2 + 25, ctaY + 33, { align: "center" });

    drawPageFooter(totalPages);

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

// Notice-type-based next steps (same logic as frontend)
function getNextSteps(noticeType?: string): string[] {
    const nt = (noticeType || "").toLowerCase();
    if (nt.includes("sources sought") || nt.includes("rfi")) {
        return ["Prepare and submit a capability statement", "Identify the Contracting Officer", "Find teaming partners"];
    }
    if (nt.includes("presolicitation")) {
        return ["Research the incumbent contractor", "Prepare a capability statement", "Conduct bid/no-bid analysis"];
    }
    return ["Review the Statement of Work (SOW)", "Conduct go/no-go analysis", "Begin technical proposal draft"];
}

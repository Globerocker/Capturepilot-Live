import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { jsPDF } from "jspdf";

/**
 * GET /api/prospects/pdf/{analysisId}
 * Generates a clean 3-page PDF handout for a company analysis.
 *
 * Page 1: Company Profile (name, UEI, CAGE, key contact, services, certs)
 * Page 2: Matching Opportunities (top 5 with details)
 * Page 3: Recommendations (NAICS, cert recs, easy wins, CTA)
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
    const social = (crawl.social_links || {}) as Record<string, string>;
    const leadership = (crawl.leadership as { name: string; title: string; email?: string; phone?: string }[]) || [];
    const samPocs = (sam?.points_of_contact as { name: string; title: string; email?: string; phone?: string }[]) || [];
    const contactPerson = (profile.contact_person as { name: string; title: string; email?: string; phone?: string }) || null;

    // ── Build PDF ─────────────────────────────────────────────────────────
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = 210;
    const pageH = 297;
    const margin = 18;
    const contentW = pageW - margin * 2;
    let y = 0;

    const BLACK = "#000000";
    const GRAY = "#57534e";
    const LIGHT = "#a8a29e";
    const ACCENT = "#059669";
    const BLUE = "#2563eb";

    function drawHeader() {
        doc.setFillColor(0, 0, 0);
        doc.rect(0, 0, pageW, 12, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        doc.text("CAPTUREPILOT", margin, 8);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.text("Federal Opportunity Intelligence Report", pageW - margin, 8, { align: "right" });
    }

    function drawFooter(pageNum: number) {
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, pageH - 14, pageW - margin, pageH - 14);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(168, 162, 158);
        doc.text(`Generated ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`, margin, pageH - 9);
        doc.text(`Page ${pageNum} of 3`, pageW - margin, pageH - 9, { align: "right" });
        doc.text("app.capturepilot.com", pageW / 2, pageH - 9, { align: "center" });
    }

    function sectionTitle(title: string) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
        doc.text(title.toUpperCase(), margin, y);
        y += 1.5;
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        doc.line(margin, y, margin + 30, y);
        y += 5;
    }

    function label(text: string) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(168, 162, 158);
        doc.text(text.toUpperCase(), margin, y);
        y += 3.5;
    }

    function bodyText(text: string, maxWidth?: number) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(87, 83, 78);
        const lines = doc.splitTextToSize(text, maxWidth || contentW);
        doc.text(lines, margin, y);
        y += lines.length * 4;
    }

    function formatCurrency(amount: number): string {
        if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
        if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`;
        return `$${amount.toLocaleString()}`;
    }

    // ════════════════════════════════════════════════════════════════════════
    // PAGE 1 — COMPANY PROFILE
    // ════════════════════════════════════════════════════════════════════════
    drawHeader();
    y = 22;

    // Company name
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(0, 0, 0);
    doc.text(companyName, margin, y);
    y += 8;

    // Website + IDs row
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(37, 99, 235);
    doc.text(website.replace(/^https?:\/\//, ""), margin, y);
    let idX = margin + 70;
    doc.setTextColor(87, 83, 78);
    if (uei) { doc.text(`UEI: ${uei}`, idX, y); idX += 45; }
    if (cage) { doc.text(`CAGE: ${cage}`, idX, y); idX += 30; }
    if (state) { doc.text(city ? `${city}, ${state}` : state, idX, y); }
    y += 4;

    // SAM badge
    if (sam) {
        doc.setFillColor(5, 150, 105);
        doc.roundedRect(margin, y, 28, 5, 1, 1, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(255, 255, 255);
        doc.text("SAM.gov Verified", margin + 2, y + 3.5);
        y += 3;
    }
    y += 6;

    // Summary
    if (summary) {
        sectionTitle("Company Overview");
        bodyText(summary);
        y += 4;
    }

    // Key Account Holder
    const keyPerson = contactPerson || samPocs[0] || leadership[0] || null;
    if (keyPerson || samPocs.length > 0) {
        sectionTitle("Key Account Holder");

        if (keyPerson) {
            doc.setFillColor(245, 245, 244);
            doc.roundedRect(margin, y - 1, contentW, 16, 2, 2, "F");

            doc.setFont("helvetica", "bold");
            doc.setFontSize(11);
            doc.setTextColor(0, 0, 0);
            doc.text(keyPerson.name, margin + 4, y + 4);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(87, 83, 78);
            doc.text(keyPerson.title, margin + 4, y + 9);

            let contactX = margin + 80;
            if (keyPerson.email) {
                doc.setTextColor(37, 99, 235);
                doc.text(keyPerson.email, contactX, y + 4);
            }
            if (keyPerson.phone) {
                doc.setTextColor(87, 83, 78);
                doc.text(keyPerson.phone, contactX, y + 9);
            }
            y += 18;
        }

        // Additional POCs from SAM.gov
        const otherPocs = samPocs.filter(p => !keyPerson || p.name !== keyPerson.name).slice(0, 2);
        if (otherPocs.length > 0) {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7);
            doc.setTextColor(168, 162, 158);
            doc.text("Additional contacts from SAM.gov:", margin, y);
            y += 4;
            for (const poc of otherPocs) {
                doc.setFont("helvetica", "normal");
                doc.setFontSize(8);
                doc.setTextColor(87, 83, 78);
                const line = `${poc.name} — ${poc.title}${poc.email ? ` | ${poc.email}` : ""}${poc.phone ? ` | ${poc.phone}` : ""}`;
                doc.text(line, margin + 2, y);
                y += 4;
            }
        }
        y += 3;
    }

    // Social Profiles
    const socialEntries = Object.entries(social).filter(([, url]) => url);
    if (socialEntries.length > 0) {
        sectionTitle("Social Profiles");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(37, 99, 235);
        for (const [platform, url] of socialEntries) {
            doc.text(`${platform.charAt(0).toUpperCase() + platform.slice(1)}: ${url}`, margin, y);
            y += 4;
        }
        y += 3;
    }

    // Services
    if (services.length > 0) {
        sectionTitle("Detected Services");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(87, 83, 78);
        const svcText = services.slice(0, 12).join("  •  ");
        const svcLines = doc.splitTextToSize(svcText, contentW);
        doc.text(svcLines, margin, y);
        y += svcLines.length * 3.5 + 3;
    }

    // Certifications
    if (certs.length > 0) {
        sectionTitle("Certification Signals");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        for (const c of certs) {
            doc.setTextColor(5, 150, 105);
            doc.text(`✓ ${c.type} (${Math.round(c.confidence * 100)}% confidence)`, margin, y);
            y += 4;
        }
        y += 3;
    }

    // NAICS on page 1 if space
    if (naics.length > 0 && y < 240) {
        sectionTitle("Inferred NAICS Codes");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        for (const n of naics.slice(0, 5)) {
            doc.setTextColor(0, 0, 0);
            doc.setFont("helvetica", "bold");
            doc.text(n.code, margin, y);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(87, 83, 78);
            doc.text(`${n.label} — ${Math.round(n.confidence * 100)}%`, margin + 20, y);
            y += 4;
        }
    }

    drawFooter(1);

    // ════════════════════════════════════════════════════════════════════════
    // PAGE 2 — MATCHING OPPORTUNITIES
    // ════════════════════════════════════════════════════════════════════════
    doc.addPage();
    drawHeader();
    y = 22;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text("Matching Federal Opportunities", margin, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(168, 162, 158);
    doc.text(`Top ${matches.length} matches for ${companyName}`, margin, y);
    y += 8;

    if (matches.length === 0) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(87, 83, 78);
        doc.text("No matching opportunities found for this company profile.", margin, y);
    } else {
        for (let i = 0; i < Math.min(matches.length, 5); i++) {
            const m = matches[i];
            if (y > 255) break; // Safety: don't overflow page

            // Match card background
            doc.setFillColor(250, 250, 249);
            const cardH = 36;
            doc.roundedRect(margin, y - 2, contentW, cardH, 2, 2, "F");

            // Score badge
            const scoreColor = m.score >= 0.7 ? [5, 150, 105] : m.score >= 0.5 ? [217, 119, 6] : [37, 99, 235];
            doc.setFillColor(scoreColor[0], scoreColor[1], scoreColor[2]);
            doc.roundedRect(margin + 2, y, 12, 10, 2, 2, "F");
            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.setTextColor(255, 255, 255);
            doc.text(String(Math.round(m.score * 100)), margin + 8, y + 7, { align: "center" });

            // Title + agency
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9);
            doc.setTextColor(0, 0, 0);
            const titleLines = doc.splitTextToSize(m.title || "Untitled Opportunity", contentW - 22);
            doc.text(titleLines[0], margin + 17, y + 4);
            if (titleLines.length > 1) doc.text(titleLines[1], margin + 17, y + 8);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(7.5);
            doc.setTextColor(87, 83, 78);
            doc.text(m.agency || "Federal Agency", margin + 17, y + (titleLines.length > 1 ? 12 : 8));

            // Details row
            const detailY = y + 16;
            let dx = margin + 4;
            doc.setFontSize(7);

            if (m.classification) {
                doc.setFont("helvetica", "bold");
                doc.setTextColor(m.classification === "HOT" ? 220 : 200, m.classification === "HOT" ? 38 : 119, m.classification === "HOT" ? 38 : 6);
                doc.text(m.classification, dx, detailY);
                dx += 14;
            }
            doc.setFont("helvetica", "normal");
            doc.setTextColor(87, 83, 78);
            if (m.notice_type) { doc.text(m.notice_type, dx, detailY); dx += 32; }
            if (m.naics_code) { doc.text(`NAICS: ${m.naics_code}`, dx, detailY); dx += 28; }
            if (m.award_amount && m.award_amount > 0) { doc.text(`Est: ${formatCurrency(m.award_amount)}`, dx, detailY); dx += 22; }
            if (m.set_aside_code) { doc.text(m.set_aside_code, dx, detailY); dx += 18; }
            if (m.response_deadline) {
                doc.text(`Due: ${new Date(m.response_deadline).toLocaleDateString()}`, dx, detailY);
            }

            // Score breakdown
            if (m.score_breakdown) {
                const breakdownY = y + 21;
                let bx = margin + 4;
                doc.setFontSize(6.5);
                doc.setTextColor(168, 162, 158);
                for (const [key, val] of Object.entries(m.score_breakdown)) {
                    doc.text(`${key}: ${Math.round(val * 100)}%`, bx, breakdownY);
                    bx += 22;
                    if (bx > pageW - margin - 10) break;
                }
            }

            // SAM.gov link
            if (m.notice_id) {
                doc.setFontSize(7);
                doc.setTextColor(37, 99, 235);
                doc.text(`sam.gov/opp/${m.notice_id}/view`, margin + 4, y + 26);
            }

            // Next steps
            const steps = getNextSteps(m.notice_type);
            const stepsY = y + 30;
            doc.setFontSize(6.5);
            doc.setTextColor(168, 162, 158);
            doc.text(`Next: ${steps[0]}`, margin + 4, stepsY);

            y += cardH + 4;
        }
    }

    drawFooter(2);

    // ════════════════════════════════════════════════════════════════════════
    // PAGE 3 — RECOMMENDATIONS
    // ════════════════════════════════════════════════════════════════════════
    doc.addPage();
    drawHeader();
    y = 22;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text("Recommendations", margin, y);
    y += 10;

    // Cert Recommendations
    if (certRecs.length > 0) {
        sectionTitle("Certifications to Pursue");
        for (const rec of certRecs.slice(0, 4)) {
            if (y > 230) break;
            doc.setFillColor(245, 245, 244);
            doc.roundedRect(margin, y - 2, contentW, 14, 2, 2, "F");

            doc.setFont("helvetica", "bold");
            doc.setFontSize(9);
            doc.setTextColor(0, 0, 0);
            doc.text(rec.cert_label, margin + 3, y + 3);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(7.5);
            doc.setTextColor(87, 83, 78);
            doc.text(`+${rec.unlocked_count} new opportunities`, margin + 3, y + 8);

            // Right side info
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.setTextColor(5, 150, 105);
            if (rec.estimated_value > 0) {
                doc.text(formatCurrency(rec.estimated_value), pageW - margin - 3, y + 3, { align: "right" });
            }
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7);
            doc.setTextColor(168, 162, 158);
            doc.text(`${rec.difficulty} • ${rec.timeline}`, pageW - margin - 3, y + 8, { align: "right" });

            y += 16;
        }
        y += 3;
    }

    // Easy Wins
    if (easyWins.length > 0) {
        sectionTitle("Quick Wins");
        for (const win of easyWins.slice(0, 5)) {
            if (y > 250) break;
            const impactColor = win.impact === "high" ? [220, 38, 38] : win.impact === "medium" ? [217, 119, 6] : [37, 99, 235];
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8.5);
            doc.setTextColor(0, 0, 0);
            doc.text(win.title, margin, y);

            doc.setFont("helvetica", "bold");
            doc.setFontSize(6.5);
            doc.setTextColor(impactColor[0], impactColor[1], impactColor[2]);
            doc.text(win.impact.toUpperCase(), margin + doc.getTextWidth(win.title) + 3, y);

            y += 4;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7.5);
            doc.setTextColor(87, 83, 78);
            const descLines = doc.splitTextToSize(win.description, contentW);
            doc.text(descLines, margin, y);
            y += descLines.length * 3.5 + 4;
        }
        y += 3;
    }

    // Call to Action
    if (y < 250) {
        y = Math.max(y, 220);
        doc.setFillColor(0, 0, 0);
        doc.roundedRect(margin, y, contentW, 30, 3, 3, "F");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(255, 255, 255);
        doc.text("Ready to Win Federal Contracts?", pageW / 2, y + 10, { align: "center" });

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text("Book a free strategy call to discuss your opportunities.", pageW / 2, y + 17, { align: "center" });

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.text("calendly.com/americurial/intro-call  |  app.capturepilot.com", pageW / 2, y + 24, { align: "center" });
    }

    drawFooter(3);

    // ── Return PDF ────────────────────────────────────────────────────────
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

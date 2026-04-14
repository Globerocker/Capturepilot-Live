/**
 * Client-side Capability Statement PDF builder.
 * Uses jspdf with manual positioning to produce a federal-contracting-grade
 * 1-page (sometimes 2-page) Capability Statement.
 *
 * Layout:
 *   ─── Color band (primary) with logo + company name + "CAPABILITY STATEMENT"
 *   ─── Two-column row: Company Overview (left) | Contact / UEI / CAGE (right)
 *   ─── Core Competencies (full width, two-column bullets if long)
 *   ─── Differentiators (full width, bullets)
 *   ─── Past Performance (full width)
 *   ─── NAICS & Certifications (two-column)
 *   ─── Footer color band with UEI / CAGE / website
 */

import { jsPDF } from "jspdf";

export type CapSection = { key?: string; title: string; content: string };

export type CapMetadata = {
    company_name?: string;
    naics_codes?: string[];
    certifications?: string[];
    uei?: string | null;
    cage_code?: string | null;
    contact?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    address?: string | null;
    logo_url?: string | null;
    primary_color?: string;
};

// ─── helpers ─────────────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
    let h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map(c => c + c).join("");
    if (h.length === 8) h = h.slice(0, 6);
    if (h.length !== 6) return [10, 61, 98];
    return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
    ];
}

function contrastTextColor(hex: string): "#ffffff" | "#1a1a1a" {
    const [r, g, b] = hexToRgb(hex);
    // YIQ luminance
    const y = (r * 299 + g * 587 + b * 114) / 1000;
    return y > 160 ? "#1a1a1a" : "#ffffff";
}

async function loadImageAsDataUrl(url: string): Promise<{ dataUrl: string; format: "PNG" | "JPEG" } | null> {
    if (!url) return null;
    try {
        // Bust CORS via a same-origin proxy if present; otherwise rely on crossOrigin on <img>.
        const img = new Image();
        img.crossOrigin = "anonymous";
        const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("image load failed"));
        });
        img.src = url;
        const el = await Promise.race([
            loaded,
            new Promise<HTMLImageElement>((_res, rej) => setTimeout(() => rej(new Error("timeout")), 5000)),
        ]);
        const canvas = document.createElement("canvas");
        canvas.width = el.naturalWidth || el.width || 200;
        canvas.height = el.naturalHeight || el.height || 200;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
        // PNG preserves transparency — use PNG for logos
        const dataUrl = canvas.toDataURL("image/png");
        return { dataUrl, format: "PNG" };
    } catch {
        return null;
    }
}

// Strip leading bullet markers and common prefixes
function cleanBulletLine(line: string): string {
    return line.replace(/^[\s]*[-•*·▪►]\s*/, "").replace(/^\d+[.)]\s*/, "").trim();
}

function splitBullets(content: string): string[] {
    return content
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l.length > 0 && !/^#+\s/.test(l))
        .map(cleanBulletLine)
        .filter(l => l.length > 0);
}

// ─── main builder ────────────────────────────────────────────────────────
export async function buildCapabilityPdf(
    sections: CapSection[],
    metadata: CapMetadata,
): Promise<Blob> {
    const doc = new jsPDF({ unit: "pt", format: "letter" }); // 612 x 792 pt
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 36; // 0.5"
    const contentW = pageW - margin * 2;

    const primary = metadata.primary_color || "#0a3d62";
    const [pr, pg, pb] = hexToRgb(primary);
    const onPrimary = contrastTextColor(primary);
    const [opR, opG, opB] = hexToRgb(onPrimary);

    let y = 0;

    // ─── Header color band ───────────────────────────────────────────
    const headerH = 96;
    doc.setFillColor(pr, pg, pb);
    doc.rect(0, 0, pageW, headerH, "F");

    // Logo (best effort)
    let logoPlaced = false;
    const logoMaxH = 60;
    const logoMaxW = 140;
    if (metadata.logo_url) {
        const img = await loadImageAsDataUrl(metadata.logo_url);
        if (img) {
            try {
                // Fit within 140 x 60 while preserving aspect ratio
                const el = new Image();
                el.src = img.dataUrl;
                await new Promise(res => { el.onload = () => res(null); el.onerror = () => res(null); });
                let w = el.naturalWidth || logoMaxW;
                let h = el.naturalHeight || logoMaxH;
                const scale = Math.min(logoMaxW / w, logoMaxH / h, 1);
                w = w * scale;
                h = h * scale;
                if (w < 10 || h < 10) { w = logoMaxW; h = logoMaxH; }
                doc.addImage(img.dataUrl, "PNG", margin, (headerH - h) / 2, w, h, undefined, "FAST");
                logoPlaced = true;
            } catch { /* fall through */ }
        }
    }

    const textX = logoPlaced ? margin + logoMaxW + 16 : margin;
    doc.setTextColor(opR, opG, opB);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    const companyName = metadata.company_name || "Capability Statement";
    doc.text(companyName, textX, headerH / 2 - 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text("CAPABILITY STATEMENT", textX, headerH / 2 + 14);

    // Small accent line at bottom of header
    doc.setFillColor(Math.min(255, pr + 30), Math.min(255, pg + 30), Math.min(255, pb + 30));
    doc.rect(0, headerH, pageW, 4, "F");

    y = headerH + 18;

    // ─── Two-column: Overview (left) + Contact card (right) ──────────
    const leftColW = contentW * 0.62;
    const rightColW = contentW - leftColW - 12;
    const rightX = margin + leftColW + 12;

    // Contact card background
    const contactLines: Array<[string, string]> = [];
    if (metadata.contact) contactLines.push(["Contact", metadata.contact]);
    if (metadata.phone) contactLines.push(["Phone", metadata.phone]);
    if (metadata.email) contactLines.push(["Email", metadata.email]);
    if (metadata.website) contactLines.push(["Website", metadata.website]);
    if (metadata.address) contactLines.push(["Address", metadata.address]);
    if (metadata.uei) contactLines.push(["UEI", metadata.uei]);
    if (metadata.cage_code) contactLines.push(["CAGE", metadata.cage_code]);

    const overviewSection = sections.find(s => /overview/i.test(s.title)) || sections[0];
    const overviewText = overviewSection?.content?.trim() || "";

    // Section heading style
    const drawSectionHeading = (label: string, x: number, yy: number, width: number) => {
        doc.setTextColor(pr, pg, pb);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text(label.toUpperCase(), x, yy);
        doc.setDrawColor(pr, pg, pb);
        doc.setLineWidth(1);
        doc.line(x, yy + 3, x + width, yy + 3);
        return yy + 14;
    };

    // Left column: overview
    let leftY = y;
    leftY = drawSectionHeading(overviewSection?.title || "Company Overview", margin, leftY, leftColW);
    doc.setTextColor(30, 30, 30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const overviewLines = doc.splitTextToSize(overviewText, leftColW);
    doc.text(overviewLines, margin, leftY);
    leftY += overviewLines.length * 12 + 8;

    // Right column: contact card
    let rightY = y;
    rightY = drawSectionHeading("Contact", rightX, rightY, rightColW);
    doc.setDrawColor(230, 230, 230);
    doc.setFillColor(248, 248, 246);
    const cardStartY = rightY - 4;
    const cardHeight = contactLines.length * 14 + 10;
    doc.roundedRect(rightX, cardStartY, rightColW, cardHeight, 4, 4, "FD");
    doc.setFontSize(9);
    for (const [label, value] of contactLines) {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(80, 80, 80);
        doc.text(`${label}:`, rightX + 6, rightY + 8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(30, 30, 30);
        const valueLines = doc.splitTextToSize(value, rightColW - 55);
        doc.text(valueLines[0] || "", rightX + 50, rightY + 8);
        rightY += 14;
    }
    rightY = cardStartY + cardHeight + 10;

    y = Math.max(leftY, rightY) + 4;

    // ─── Helper: render a section as full-width paragraph/bullets ────
    const ensurePage = (needed: number) => {
        if (y + needed > pageH - 70) {
            doc.addPage();
            y = margin;
        }
    };

    const renderBulletSection = (section: CapSection, twoColumn = false) => {
        ensurePage(40);
        y = drawSectionHeading(section.title, margin, y, contentW);
        const bullets = splitBullets(section.content);
        doc.setTextColor(30, 30, 30);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);

        if (twoColumn && bullets.length >= 4) {
            const colW = (contentW - 12) / 2;
            const mid = Math.ceil(bullets.length / 2);
            const leftItems = bullets.slice(0, mid);
            const rightItems = bullets.slice(mid);
            let lY = y;
            let rY = y;
            for (const b of leftItems) {
                const lines = doc.splitTextToSize(b, colW - 12);
                doc.setTextColor(pr, pg, pb);
                doc.text("•", margin, lY);
                doc.setTextColor(30, 30, 30);
                doc.text(lines, margin + 10, lY);
                lY += lines.length * 12 + 2;
            }
            for (const b of rightItems) {
                const lines = doc.splitTextToSize(b, colW - 12);
                doc.setTextColor(pr, pg, pb);
                doc.text("•", margin + colW + 12, rY);
                doc.setTextColor(30, 30, 30);
                doc.text(lines, margin + colW + 22, rY);
                rY += lines.length * 12 + 2;
            }
            y = Math.max(lY, rY) + 6;
        } else {
            for (const b of bullets) {
                const lines = doc.splitTextToSize(b, contentW - 14);
                ensurePage(lines.length * 12 + 6);
                doc.setTextColor(pr, pg, pb);
                doc.text("•", margin, y);
                doc.setTextColor(30, 30, 30);
                doc.text(lines, margin + 10, y);
                y += lines.length * 12 + 3;
            }
            y += 4;
        }
    };

    const renderParagraphSection = (section: CapSection) => {
        ensurePage(40);
        y = drawSectionHeading(section.title, margin, y, contentW);
        doc.setTextColor(30, 30, 30);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        // Split content on blank lines into paragraphs
        const paragraphs = section.content.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
        for (const p of paragraphs) {
            const isBulletLike = /^\s*[-•*]/.test(p);
            if (isBulletLike) {
                const bullets = splitBullets(p);
                for (const b of bullets) {
                    const lines = doc.splitTextToSize(b, contentW - 14);
                    ensurePage(lines.length * 12 + 6);
                    doc.setTextColor(pr, pg, pb);
                    doc.text("•", margin, y);
                    doc.setTextColor(30, 30, 30);
                    doc.text(lines, margin + 10, y);
                    y += lines.length * 12 + 3;
                }
            } else {
                const lines = doc.splitTextToSize(p, contentW);
                ensurePage(lines.length * 12 + 8);
                doc.text(lines, margin, y);
                y += lines.length * 12 + 8;
            }
        }
        y += 4;
    };

    // ─── Remaining sections ─────────────────────────────────────────
    for (const section of sections) {
        if (section === overviewSection) continue; // already drawn
        if (/contact/i.test(section.title)) continue; // already in right card

        if (/competenc/i.test(section.title)) {
            renderBulletSection(section, true);
        } else if (/differenti/i.test(section.title)) {
            renderBulletSection(section, false);
        } else if (/naics|certificat/i.test(section.title)) {
            renderBulletSection(section, true);
        } else {
            renderParagraphSection(section);
        }
    }

    // ─── Footer band ─────────────────────────────────────────────────
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
        doc.setPage(p);
        const fy = pageH - 36;
        doc.setFillColor(pr, pg, pb);
        doc.rect(0, fy, pageW, 36, "F");
        doc.setTextColor(opR, opG, opB);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        const footerLeft = [
            metadata.uei ? `UEI: ${metadata.uei}` : "",
            metadata.cage_code ? `CAGE: ${metadata.cage_code}` : "",
        ].filter(Boolean).join("  •  ");
        doc.text(footerLeft || "", margin, fy + 14);
        if (metadata.website) doc.text(metadata.website, margin, fy + 26);
        const pageLabel = `Page ${p} of ${pages}`;
        const w = doc.getTextWidth(pageLabel);
        doc.text(pageLabel, pageW - margin - w, fy + 14);
        if (metadata.company_name) {
            const nw = doc.getTextWidth(metadata.company_name);
            doc.text(metadata.company_name, pageW - margin - nw, fy + 26);
        }
    }

    return doc.output("blob");
}

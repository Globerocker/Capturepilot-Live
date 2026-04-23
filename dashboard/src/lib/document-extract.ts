/**
 * Unified document text extractor for SAM.gov opportunity attachments.
 * Handles PDF, DOCX, XLSX, ZIP, plain text. Returns { text, pages?, sheets? }.
 *
 * PDF path:
 *   - If MISTRAL_API_KEY is set, use Mistral OCR (clean markdown, layout-aware)
 *   - Otherwise regex extraction from raw PDF bytes (~30% recovery on text PDFs)
 *
 * DOCX path: mammoth → plain text
 * XLSX path: exceljs → CSV-like per sheet
 * ZIP path: JSZip → recurse into each entry (limit depth 1 + max 15 files)
 */

import mammoth from "mammoth";
import JSZip from "jszip";
import { extractFromUrl as mistralExtractFromUrl, isMistralConfigured } from "@/lib/llm/mistral-ocr";

export interface ExtractResult {
    text: string;
    kind: "pdf" | "docx" | "xlsx" | "zip" | "txt" | "unknown";
    filename: string;
    bytes: number;
    sub_files?: ExtractResult[]; // for zip
    ocr_used?: boolean;
}

function kindOf(filename: string, contentType?: string): ExtractResult["kind"] {
    const lower = filename.toLowerCase();
    if (lower.endsWith(".pdf") || contentType?.includes("pdf")) return "pdf";
    if (lower.endsWith(".docx") || lower.endsWith(".doc")) return "docx";
    if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "xlsx";
    if (lower.endsWith(".zip")) return "zip";
    if (lower.endsWith(".txt") || lower.endsWith(".md")) return "txt";
    return "unknown";
}

function pdfRegexExtract(bytes: Uint8Array): string {
    const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const chunks: string[] = [];
    // BT ... ET text-object blocks
    const btEt = /BT\s*([\s\S]*?)\s*ET/g;
    let m;
    while ((m = btEt.exec(raw)) !== null) {
        const tj = /\(([^)]*)\)\s*Tj/g;
        let t;
        while ((t = tj.exec(m[1])) !== null) chunks.push(t[1]);
    }
    // Fallback: ASCII runs > 20 chars
    const ascii = /[\x20-\x7E]{20,}/g;
    let a;
    while ((a = ascii.exec(raw)) !== null) {
        if (!a[0].includes("obj") && !a[0].includes("endobj") && !a[0].startsWith("%PDF")) {
            chunks.push(a[0]);
        }
    }
    return chunks.join(" ").replace(/\s+/g, " ").trim();
}

async function extractPdf(bytes: Uint8Array, url: string): Promise<{ text: string; ocr: boolean }> {
    // Prefer Mistral OCR when configured
    if (isMistralConfigured()) {
        try {
            const ocr = await mistralExtractFromUrl(url);
            if (ocr.full_markdown && ocr.full_markdown.length > 200) {
                return { text: ocr.full_markdown.slice(0, 40_000), ocr: true };
            }
        } catch {
            // fall through
        }
    }
    return { text: pdfRegexExtract(bytes).slice(0, 40_000), ocr: false };
}

async function extractDocx(bytes: Uint8Array): Promise<string> {
    // mammoth expects a Buffer on the node side; Buffer.from(Uint8Array) works
    // at runtime but TS narrows it wrong — cast.
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) as unknown as Buffer });
    return (result.value || "").replace(/\s+/g, " ").trim().slice(0, 40_000);
}

async function extractXlsx(bytes: Uint8Array): Promise<string> {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(Buffer.from(bytes) as any);
    const parts: string[] = [];
    wb.eachSheet((ws) => {
        parts.push(`# Sheet: ${ws.name}`);
        ws.eachRow((row) => {
            const values = (row.values as unknown[]).slice(1).map((v) => {
                if (v === null || v === undefined) return "";
                if (typeof v === "object" && v !== null && "text" in v) return String((v as { text: unknown }).text);
                return String(v);
            });
            if (values.some((x) => x.trim().length > 0)) {
                parts.push(values.join(" | "));
            }
        });
    });
    return parts.join("\n").slice(0, 40_000);
}

async function extractZip(bytes: Uint8Array): Promise<{ text: string; sub_files: ExtractResult[] }> {
    const zip = await JSZip.loadAsync(bytes);
    const subFiles: ExtractResult[] = [];
    let combined = "";
    const entries = Object.keys(zip.files).slice(0, 15); // cap depth
    for (const name of entries) {
        const entry = zip.files[name];
        if (entry.dir) continue;
        const kind = kindOf(name);
        if (kind === "unknown" || kind === "zip") continue; // skip nested ZIPs
        try {
            const data = await entry.async("uint8array");
            const sub = await extractOne(data, name, kind);
            subFiles.push(sub);
            if (sub.text) combined += `\n\n=== ${name} ===\n${sub.text}`;
        } catch {
            // Skip unreadable entries
        }
    }
    return { text: combined.slice(0, 40_000), sub_files: subFiles };
}

async function extractOne(bytes: Uint8Array, filename: string, kind?: ExtractResult["kind"]): Promise<ExtractResult> {
    const resolvedKind = kind || kindOf(filename);
    const base: Omit<ExtractResult, "text"> = {
        kind: resolvedKind,
        filename,
        bytes: bytes.byteLength,
    };
    try {
        switch (resolvedKind) {
            case "pdf": {
                const { text, ocr } = await extractPdf(bytes, "");
                return { ...base, text, ocr_used: ocr };
            }
            case "docx":
                return { ...base, text: await extractDocx(bytes) };
            case "xlsx":
                return { ...base, text: await extractXlsx(bytes) };
            case "txt":
                return { ...base, text: new TextDecoder("utf-8", { fatal: false }).decode(bytes).slice(0, 40_000) };
            case "zip": {
                const { text, sub_files } = await extractZip(bytes);
                return { ...base, text, sub_files };
            }
            default:
                return { ...base, text: "" };
        }
    } catch (e) {
        return { ...base, text: "", kind: resolvedKind };
    }
}

/**
 * Fetch a SAM.gov attachment URL + extract the text.
 * Returns empty text on any failure; caller decides what to do with it.
 */
export async function fetchAndExtract(
    url: string,
    opts: { samApiKey?: string; filename?: string } = {},
): Promise<ExtractResult> {
    const guessedName = opts.filename || url.split("/").pop()?.split("?")[0] || "unknown";
    try {
        const res = await fetch(url, {
            headers: opts.samApiKey ? { "X-Api-Key": opts.samApiKey } : {},
            signal: AbortSignal.timeout(20_000),
            redirect: "follow",
        });
        if (!res.ok) {
            return { text: "", kind: "unknown", filename: guessedName, bytes: 0 };
        }
        const contentType = res.headers.get("content-type") || "";
        const cd = res.headers.get("content-disposition") || "";
        const nameFromHeader = /filename="?([^";]+)"?/i.exec(cd)?.[1];
        const resolvedName = nameFromHeader || guessedName;
        const kind = kindOf(resolvedName, contentType);
        const buf = new Uint8Array(await res.arrayBuffer());
        // For PDFs we want the URL so Mistral OCR can fetch it directly
        if (kind === "pdf" && isMistralConfigured()) {
            try {
                const ocr = await mistralExtractFromUrl(url);
                if (ocr.full_markdown && ocr.full_markdown.length > 200) {
                    return {
                        text: ocr.full_markdown.slice(0, 40_000),
                        kind: "pdf",
                        filename: resolvedName,
                        bytes: buf.byteLength,
                        ocr_used: true,
                    };
                }
            } catch { /* fall back to regex */ }
        }
        return await extractOne(buf, resolvedName, kind);
    } catch {
        return { text: "", kind: "unknown", filename: guessedName, bytes: 0 };
    }
}

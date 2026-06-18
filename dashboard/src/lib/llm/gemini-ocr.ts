/**
 * Gemini OCR wrapper — the self-owned, near-free replacement for Mistral OCR.
 *
 * Gemini 2.0 Flash ingests a PDF inline (base64) and returns the document's
 * text as clean Markdown, OCRing scanned/image pages. We already pay ~nothing
 * for it (GEMINI_API_KEY is the same key used by /api/letters + /api/drafts),
 * so this restores scanned-attachment extraction after Mistral's API was
 * disabled — at a fraction of the cost.
 *
 * Same interface as mistral-ocr.ts (extractFromUrl / extractFromBase64 →
 * OcrResult) so it's a drop-in behind @/lib/llm/ocr.
 */
import type { OcrResult } from "./mistral-ocr";

// gemini-2.0-flash was retired (generateContent 404s); 2.5-flash is the current
// stable multimodal flash model — cheap, 1M-token context, native PDF OCR.
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Downstream consumers slice to 40 KB; keep parity with the Mistral wrapper.
const MAX_OCR_MARKDOWN_BYTES = 60_000;
// Gemini fetches the doc itself only via the File API; for inline we must pass
// bytes. Cap the inline payload so a huge PDF can't blow the request.
const MAX_INLINE_BYTES = 18 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;

const OCR_PROMPT =
    "You are an OCR engine. Extract ALL text from this document as clean GitHub-flavored Markdown. " +
    "Preserve tables (as Markdown tables), headings, lists, and natural reading order. Transcribe scanned/image " +
    "pages too. Output ONLY the document's text content — no preamble, no commentary, no code fences around the whole thing.";

export function isGeminiOcrConfigured(): boolean {
    return Boolean(process.env.GEMINI_API_KEY);
}

function clampMarkdown(s: string): string {
    return s.length > MAX_OCR_MARKDOWN_BYTES ? s.slice(0, MAX_OCR_MARKDOWN_BYTES) : s;
}

async function callGemini(base64: string, mimeType: string): Promise<OcrResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { inline_data: { mime_type: mimeType, data: base64 } },
                    { text: OCR_PROMPT },
                ],
            }],
            generationConfig: { temperature: 0, maxOutputTokens: 8192 },
        }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS + 30_000),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Gemini OCR failed (${res.status}): ${text.slice(0, 500)}`);
    }
    const json = await res.json();
    const parts = json?.candidates?.[0]?.content?.parts;
    const md = Array.isArray(parts)
        ? parts.map((p: { text?: string }) => p?.text || "").join("\n").trim()
        : "";
    return {
        model: GEMINI_MODEL,
        pages: [],
        full_markdown: clampMarkdown(md),
        page_count: 0, // Gemini doesn't return a page count; callers only use full_markdown.
    };
}

async function fetchAsBase64(url: string): Promise<{ base64: string; mimeType: string }> {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: "follow" });
    if (!res.ok) throw new Error(`fetch for OCR failed (${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0) throw new Error("empty document");
    if (buf.byteLength > MAX_INLINE_BYTES) throw new Error(`document too large for inline OCR (${Math.round(buf.byteLength / 1e6)}MB)`);
    const ct = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    // Default to PDF; pass through known image/doc types Gemini accepts.
    const mimeType = ct && (ct.startsWith("image/") || ct === "application/pdf") ? ct : "application/pdf";
    return { base64: buf.toString("base64"), mimeType };
}

export async function extractFromUrl(url: string): Promise<OcrResult> {
    const { base64, mimeType } = await fetchAsBase64(url);
    return callGemini(base64, mimeType);
}

export async function extractFromBase64(base64: string, _filename = "document.pdf"): Promise<OcrResult> {
    return callGemini(base64, "application/pdf");
}

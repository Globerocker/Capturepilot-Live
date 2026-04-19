/**
 * Mistral OCR wrapper.
 *
 * Mistral publishes a dedicated OCR endpoint (model: `mistral-ocr-latest`)
 * that handles PDF/DOCX/image → structured Markdown with table + layout
 * preservation. Typically faster and cheaper than GPT-4o vision for long
 * solicitation attachments.
 *
 * Pricing (2026-04): ~$1/1000 pages. Free tier applies per Mistral console.
 * API: https://docs.mistral.ai/capabilities/document/
 *
 * Two invocation modes:
 *   extractFromUrl  — pass a publicly reachable URL; Mistral fetches + OCRs
 *   extractFromBase64 — pass a base64-encoded document inline
 *
 * Returns clean Markdown per page plus page-level image/table metadata.
 *
 * When MISTRAL_API_KEY is absent, callers should fall back to the OpenAI
 * vision pipeline in attachment_intelligence.
 */

const MISTRAL_OCR_URL = "https://api.mistral.ai/v1/ocr";

export interface OcrPage {
    index: number;
    markdown: string;
    images?: unknown[];
}

export interface OcrResult {
    model: string;
    pages: OcrPage[];
    full_markdown: string;
    page_count: number;
}

interface MistralOcrResponse {
    model?: string;
    pages?: Array<{
        index?: number;
        markdown?: string;
        images?: unknown[];
    }>;
    document_annotation?: unknown;
}

export function isMistralConfigured(): boolean {
    return Boolean(process.env.MISTRAL_API_KEY);
}

async function postOcr(body: Record<string, unknown>): Promise<MistralOcrResponse> {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) throw new Error("MISTRAL_API_KEY not configured");
    const res = await fetch(MISTRAL_OCR_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "mistral-ocr-latest",
            include_image_base64: false,
            ...body,
        }),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Mistral OCR failed (${res.status}): ${text.slice(0, 500)}`);
    }
    return (await res.json()) as MistralOcrResponse;
}

function combinePages(resp: MistralOcrResponse): OcrResult {
    const pages: OcrPage[] = (resp.pages || []).map((p, i) => ({
        index: p.index ?? i,
        markdown: p.markdown || "",
        images: p.images,
    }));
    return {
        model: resp.model || "mistral-ocr-latest",
        pages,
        full_markdown: pages.map((p) => p.markdown).join("\n\n---\n\n"),
        page_count: pages.length,
    };
}

export async function extractFromUrl(url: string): Promise<OcrResult> {
    const resp = await postOcr({
        document: { type: "document_url", document_url: url },
    });
    return combinePages(resp);
}

export async function extractFromBase64(base64: string, filename = "document.pdf"): Promise<OcrResult> {
    const resp = await postOcr({
        document: {
            type: "document_url",
            document_url: `data:application/pdf;base64,${base64}`,
            document_name: filename,
        },
    });
    return combinePages(resp);
}

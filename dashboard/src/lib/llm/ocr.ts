/**
 * Unified document OCR — backend-agnostic.
 *
 * Order: Gemini 2.0 Flash (near-free, our own GEMINI_API_KEY) first; Mistral OCR
 * only as a fallback IF its key is still configured and working. Mistral's API
 * was disabled (billing), so Gemini is effectively primary now — but keeping
 * Mistral as a graceful fallback means it auto-recovers if billing is restored,
 * with no code change.
 *
 * Same shape as the old mistral-ocr import (extractFromUrl / extractFromBase64 →
 * OcrResult) so call sites only swap the import path.
 */
import type { OcrResult } from "./mistral-ocr";
import * as gemini from "./gemini-ocr";
import * as mistral from "./mistral-ocr";

export type { OcrResult } from "./mistral-ocr";

/** True when at least one OCR backend is configured. */
export function isOcrConfigured(): boolean {
    return gemini.isGeminiOcrConfigured() || mistral.isMistralConfigured();
}

function nonEmpty(r: OcrResult | null | undefined): r is OcrResult {
    return !!r && typeof r.full_markdown === "string" && r.full_markdown.trim().length > 0;
}

export async function extractFromUrl(url: string): Promise<OcrResult> {
    if (gemini.isGeminiOcrConfigured()) {
        try {
            const r = await gemini.extractFromUrl(url);
            if (nonEmpty(r)) return r;
            console.warn("[ocr] Gemini returned empty markdown, trying fallback");
        } catch (e) {
            console.warn("[ocr] Gemini OCR failed, trying fallback:", e instanceof Error ? e.message : String(e));
        }
    }
    if (mistral.isMistralConfigured()) return mistral.extractFromUrl(url);
    throw new Error("No OCR backend available (GEMINI_API_KEY / MISTRAL_API_KEY both unset or failing)");
}

export async function extractFromBase64(base64: string, filename = "document.pdf"): Promise<OcrResult> {
    if (gemini.isGeminiOcrConfigured()) {
        try {
            const r = await gemini.extractFromBase64(base64, filename);
            if (nonEmpty(r)) return r;
            console.warn("[ocr] Gemini returned empty markdown, trying fallback");
        } catch (e) {
            console.warn("[ocr] Gemini OCR failed, trying fallback:", e instanceof Error ? e.message : String(e));
        }
    }
    if (mistral.isMistralConfigured()) return mistral.extractFromBase64(base64, filename);
    throw new Error("No OCR backend available (GEMINI_API_KEY / MISTRAL_API_KEY both unset or failing)");
}

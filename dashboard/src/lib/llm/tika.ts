/**
 * Apache Tika client — server-side text extraction for PDFs, DOCX, XLSX, etc.
 *
 * Tika runs as a Docker container on the Hostinger VPS at
 * https://tika.srv1113360.hstgr.cloud, gated by Traefik with a bearer token.
 *
 * We use Tika as the FIRST PDF-extraction step (in place of the regex fallback
 * that recovered ~30% of text). For scanned PDFs that Tika can't extract
 * meaningfully (returns empty/short text), document-extract.ts falls back to
 * Mistral OCR — which is paid, so the win here is cutting Mistral spend on the
 * 80%+ of SAM PDFs that are already digital.
 *
 * Env:
 *   TIKA_URL              e.g. https://tika.srv1113360.hstgr.cloud
 *   TIKA_AUTH_TOKEN       bearer token (matches Traefik label)
 */

const TIKA_URL = process.env.TIKA_URL || null;
const TIKA_AUTH_TOKEN = process.env.TIKA_AUTH_TOKEN || null;
const TIKA_TIMEOUT_MS = 25_000;

export function isTikaConfigured(): boolean {
    return !!TIKA_URL;
}

/**
 * Extract text from a binary document via Tika. Returns the trimmed plain-text
 * body. Throws on transport errors; returns empty string for a successful but
 * empty response (e.g. scanned PDF with no embedded text — caller should fall
 * back to OCR).
 */
export async function tikaExtract(
    bytes: Uint8Array,
    contentType: string,
): Promise<string> {
    if (!TIKA_URL) throw new Error("TIKA_URL not configured");
    const headers: Record<string, string> = {
        "Content-Type": contentType || "application/octet-stream",
        "Accept": "text/plain",
    };
    if (TIKA_AUTH_TOKEN) headers["Authorization"] = `Bearer ${TIKA_AUTH_TOKEN}`;

    const res = await fetch(`${TIKA_URL}/tika`, {
        method: "PUT",
        headers,
        body: bytes as unknown as BodyInit,
        signal: AbortSignal.timeout(TIKA_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`tika http ${res.status}`);
    const text = await res.text();
    return text.replace(/\s+/g, " ").trim();
}

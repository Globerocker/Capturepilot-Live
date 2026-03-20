/**
 * Cleans raw description text from SAM.gov:
 * 1. Parses JSON-wrapped descriptions (extracts the actual text)
 * 2. Removes duplicate consecutive lines
 * 3. Removes duplicate sentences
 */
export function cleanDescription(raw: string | null | undefined): string {
    if (!raw) return "";
    let text = raw.trim();

    // 1. Parse JSON wrapper — SAM.gov sometimes returns {"description":"..."}
    if (text.startsWith("{")) {
        try {
            const parsed = JSON.parse(text);
            text = parsed.description || parsed.content || parsed.body || parsed.text || text;
            if (typeof text !== "string") text = String(text);
        } catch {
            // Not valid JSON, use as-is
        }
    }

    // 2. Remove duplicate consecutive lines
    const lines = text.split(/\n/);
    const deduped: string[] = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0 && deduped.length > 0 && deduped[deduped.length - 1] === "") {
            continue;
        }
        if (deduped.length > 0 && deduped[deduped.length - 1] === trimmed && trimmed.length > 20) {
            continue;
        }
        deduped.push(trimmed);
    }
    text = deduped.join("\n");

    // 3. Remove duplicate sentences (for cases like "sentence. sentence. sentence.")
    const sentences = text.split(/(?<=[.!?])\s+/);
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const sentence of sentences) {
        const normalized = sentence.trim().toLowerCase();
        if (normalized.length > 30 && seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);
        unique.push(sentence);
    }
    text = unique.join(" ");

    return text.trim();
}

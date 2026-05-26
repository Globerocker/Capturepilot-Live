/**
 * Texas ESBD (Electronic State Business Daily) HTML parser.
 *
 * Source URL: https://www.txsmartbuy.gov/esbd
 * Per docs/source-analysis/STATE_HTML_SCRAPERS.md — TX ESBD is fully
 * server-side rendered, so vanilla fetch + regex parsing works. No
 * Playwright / cheerio required.
 *
 * Two public entry points:
 *   - fetchTxEsbdList(status, page) → list of solicitation IDs + titles
 *   - fetchTxEsbdDetail(id) → full opportunity record
 *
 * Designed for the ingest_tx_esbd cron — same shape as the existing
 * Bonfire / Socrata ingest pipelines.
 */

const BASE = "https://www.txsmartbuy.gov";
const UA = "CapturePilot/1.0 (+https://www.capturepilot.com; ops@capturepilot.com)";

export interface TxEsbdListing {
    id: string;          // e.g. "TCC26001"
    title: string;
    detailUrl: string;
}

/**
 * Scrape one page of the ESBD list. status=1 → Posted/Open.
 * ~23 results per page; full open set is 9 pages (~200 solicitations).
 */
export async function fetchTxEsbdList(args: {
    status?: "1" | "2" | "11" | "5" | "3" | "";
    page?: number;
    timeoutMs?: number;
} = {}): Promise<TxEsbdListing[]> {
    const status = args.status ?? "1";
    const page = args.page ?? 1;
    const url = new URL(`${BASE}/esbd`);
    if (status) url.searchParams.set("status", status);
    if (page > 1) url.searchParams.set("page", String(page));

    try {
        const res = await fetch(url.toString(), {
            headers: { "User-Agent": UA, Accept: "text/html" },
            signal: AbortSignal.timeout(args.timeoutMs ?? 15000),
        });
        if (!res.ok) return [];
        const html = await res.text();
        return parseListHtml(html);
    } catch {
        return [];
    }
}

function parseListHtml(html: string): TxEsbdListing[] {
    // Each list row is wrapped in `<div class="esbd-result-row">` with a
    // `<div class="esbd-result-title"><a href="/esbd/<id>">title</a>`.
    const out: TxEsbdListing[] = [];
    const linkRe = /<div\s+class="esbd-result-title">\s*<a\s+href="\/esbd\/([^"]+)"[^>]*>\s*([\s\S]*?)\s*<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(html)) !== null) {
        const id = m[1].trim();
        const title = decodeHtml(m[2]).replace(/\s+/g, " ").trim();
        if (id && title) out.push({ id, title, detailUrl: `${BASE}/esbd/${id}` });
    }
    return out;
}

export interface TxEsbdDetail {
    id: string;
    title: string;
    status: string | null;
    agency_code: string | null;
    posted_at: string | null;          // ISO 8601
    response_deadline: string | null;  // ISO 8601 — combined date + time, Central tz
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    submission_email: string | null;
    external_response_url: string | null;
    description: string | null;        // plain text (HTML stripped)
    description_html: string | null;
    nigp_codes: Array<{ code: string; label: string }>;
    attachments: Array<{ name: string; url: string; description: string | null }>;
    raw_fields: Record<string, string>;
}

export async function fetchTxEsbdDetail(id: string, timeoutMs = 15000): Promise<TxEsbdDetail | null> {
    try {
        const res = await fetch(`${BASE}/esbd/${encodeURIComponent(id)}`, {
            headers: { "User-Agent": UA, Accept: "text/html" },
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) return null;
        const html = await res.text();
        return parseDetailHtml(id, html);
    } catch {
        return null;
    }
}

function decodeHtml(s: string): string {
    return s
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
}

function stripHtml(s: string): string {
    return s
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|tr)>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/g, "'")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function parseDetailHtml(id: string, html: string): TxEsbdDetail {
    // Title — find <h4>...</h4> inside esbd-result-title
    const titleMatch = html.match(/<div\s+class="esbd-result-title">\s*<h4[^>]*>\s*([\s\S]*?)\s*<\/h4>/i);
    const title = titleMatch ? decodeHtml(titleMatch[1]) : id;

    // Per-cell key-value rows: <strong>Label:</strong><p>Value</p>
    const cellRe = /<div\s+class="esbd-result-cell">\s*<strong[^>]*>\s*([^<]+?)\s*:\s*(?:&nbsp;)?\s*<\/strong>\s*<p[^>]*>\s*([\s\S]*?)\s*<\/p>/gi;
    const fields: Record<string, string> = {};
    let m: RegExpExecArray | null;
    while ((m = cellRe.exec(html)) !== null) {
        const label = decodeHtml(m[1]);
        const value = decodeHtml(m[2]);
        if (label && value) fields[label] = value;
    }

    // Description (rich text editor content)
    const descMatch = html.match(/Solicitation Description[\s\S]{0,200}?<div\s+class="rich-text-editor-content"[^>]*>([\s\S]*?)<\/div>/i);
    const descriptionHtml = descMatch ? descMatch[1].trim() : null;
    const description = descriptionHtml ? stripHtml(descriptionHtml) : null;

    // Bid Response URL — separate "full width" cell
    const respUrlMatch = html.match(/Bid Response URL[\s\S]{0,200}?<a[^>]+href="([^"]+)"[^>]*class="esbd-full-width-url"/i);
    const externalResponseUrl = respUrlMatch ? respUrlMatch[1] : null;

    // NIGP codes
    const nigpRaw = fields["Class/Item Code"] || fields["NIGP Class/Item"] || "";
    const nigpCodes = nigpRaw
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
            const mm = s.match(/^(\d{3,5})\s*-\s*(.+)$/);
            return mm ? { code: mm[1], label: mm[2].trim() } : null;
        })
        .filter((x): x is { code: string; label: string } => x !== null);

    // Attachments
    const attachRe = /<a[^>]*data-action="downloadURL"[^>]*data-href="([^"]+)"[^>]*>\s*([^<]+?)\s*<\/a>[\s\S]*?<p\s+class="pod-attachment-cell">\s*([^<]*?)\s*<\/p>/gi;
    const attachments: TxEsbdDetail["attachments"] = [];
    let am: RegExpExecArray | null;
    while ((am = attachRe.exec(html)) !== null) {
        const relUrl = am[1].trim();
        const filename = decodeHtml(am[2]);
        const descriptionField = decodeHtml(am[3]);
        if (relUrl && filename) {
            attachments.push({
                url: relUrl.startsWith("http") ? relUrl : `${BASE}${relUrl}`,
                name: filename,
                description: descriptionField || null,
            });
        }
    }

    // Date parsing: "5/25/2026" + "10:00 AM" → ISO. Assume Central tz; the
    // server's HTML doesn't carry tz info so we approximate with UTC and
    // accept the small offset for now.
    function parseDateTime(date: string | null | undefined, time: string | null | undefined): string | null {
        if (!date) return null;
        const dm = date.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (!dm) return null;
        const [, mo, day, yr] = dm;
        let hour = 0;
        let minute = 0;
        if (time) {
            const tm = time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
            if (tm) {
                hour = parseInt(tm[1], 10);
                minute = parseInt(tm[2], 10);
                if (tm[3].toUpperCase() === "PM" && hour < 12) hour += 12;
                if (tm[3].toUpperCase() === "AM" && hour === 12) hour = 0;
            }
        }
        // Treat input as US Central (UTC-5 in summer / UTC-6 in winter).
        // Approximate with UTC-5 — exact tz precision isn't critical for the
        // dashboard match heuristic (we round to nearest day anyway).
        const date_iso = `${yr}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-05:00`;
        const t = new Date(date_iso);
        return Number.isNaN(t.getTime()) ? null : t.toISOString();
    }

    return {
        id,
        title,
        status: fields["Status"] || null,
        agency_code: fields["Agency/Texas SmartBuy Member Number"] || null,
        posted_at: parseDateTime(fields["Solicitation Posting Date"], null),
        response_deadline: parseDateTime(fields["Response Due Date"], fields["Response Due Time"]),
        contact_name: fields["Contact Name"] || null,
        contact_email: fields["Contact Email"] || null,
        contact_phone: fields["Contact Number"] || null,
        submission_email: fields["Bid Response Email"] || null,
        external_response_url: externalResponseUrl,
        description,
        description_html: descriptionHtml,
        nigp_codes: nigpCodes,
        attachments,
        raw_fields: fields,
    };
}

/** Map ESBD status string → canonical opportunities.status */
export function mapStatus(s: string | null | undefined): "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "AWARDED" | "CANCELLED" {
    if (!s) return "ACTIVE";
    const k = s.toLowerCase();
    if (k.includes("posted")) return "ACTIVE";
    if (k.includes("awarded")) return "AWARDED";
    if (k.includes("no award")) return "EXPIRED";
    if (k.includes("closed")) return "EXPIRED";
    if (k.includes("cancel")) return "CANCELLED";
    return "ACTIVE";
}

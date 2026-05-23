/**
 * Thin Semrush API client for backlink-prospect discovery.
 *
 * Requires SEMRUSH_API_KEY env var. If absent, every function resolves to []
 * and the caller logs a skipped-run row instead of crashing.
 *
 * Docs: https://www.semrush.com/api-analytics/
 * Each Semrush call costs API units — the cron is gated to weekly + limited
 * to N rows per competitor to keep spend predictable.
 */

const SEMRUSH_BASE = "https://api.semrush.com/analytics/v1/";

export interface RefDomainRow {
  domain: string;
  domain_score: number;
  domain_trust_score: number;
  backlinks_num: number;
  first_seen?: number;
  last_seen?: number;
  ip?: string;
  country?: string;
}

function parseCsv(body: string): Record<string, string>[] {
  const lines = body.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(";");
  return lines.slice(1).map(line => {
    const cells = line.split(";");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ""; });
    return row;
  });
}

/**
 * Pulls referring domains for a target (competitor or our own site).
 * Returns rows already sorted by domain_score desc (Semrush default).
 */
export async function fetchRefDomains(
  target: string,
  limit = 100,
): Promise<RefDomainRow[]> {
  const key = process.env.SEMRUSH_API_KEY;
  if (!key) {
    console.warn("[semrush] SEMRUSH_API_KEY missing — fetchRefDomains skipped");
    return [];
  }

  const url = new URL(SEMRUSH_BASE);
  url.searchParams.set("type", "backlinks_refdomains");
  url.searchParams.set("key", key);
  url.searchParams.set("target", target);
  url.searchParams.set("target_type", "root_domain");
  url.searchParams.set("display_limit", String(limit));
  url.searchParams.set("display_sort", "domain_ascore_desc");
  url.searchParams.set(
    "export_columns",
    "domain,backlinks_num,domain_score,domain_trust_score,first_seen,last_seen,ip,country",
  );

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Semrush refdomains failed for ${target}: ${res.status}`);
  }
  const body = await res.text();
  // Semrush error responses come back as "ERROR ::" plaintext.
  if (body.startsWith("ERROR")) {
    throw new Error(`Semrush API error for ${target}: ${body}`);
  }

  return parseCsv(body).map(row => ({
    domain: row.domain,
    domain_score: parseInt(row.domain_score, 10) || 0,
    domain_trust_score: parseInt(row.domain_trust_score, 10) || 0,
    backlinks_num: parseInt(row.backlinks_num, 10) || 0,
    first_seen: row.first_seen ? parseInt(row.first_seen, 10) : undefined,
    last_seen: row.last_seen ? parseInt(row.last_seen, 10) : undefined,
    ip: row.ip || undefined,
    country: row.country || undefined,
  }));
}

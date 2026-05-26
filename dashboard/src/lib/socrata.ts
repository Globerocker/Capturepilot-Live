/**
 * Minimal Socrata SODA API client.
 *
 * Socrata is the open-data platform behind ~50 US city + state portals
 * (NYC, Chicago, LA, SF, Seattle, Austin, state of CA, state of NY, …).
 * Every portal exposes datasets at the same URL shape:
 *
 *   https://<portal_host>/resource/<dataset_id>.json?$where=...&$order=...&$limit=...
 *
 * Datasets have non-uniform field names (NYC's "short_title" vs LA's "title"),
 * so each dataset carries a `field_map` JSONB row in `socrata_sources` that
 * declares which Socrata column to read for each of our canonical fields.
 */

export type FieldMap = Record<string, string | string[]>;

/** Pull a value from a Socrata row using the field-map declaration. Supports
 *  array-of-keys ("try in order") and dotted nested paths ("url.url"). */
export function readField(row: Record<string, unknown>, mapping: string | string[] | undefined): string | null {
    if (!mapping) return null;
    const candidates = Array.isArray(mapping) ? mapping : [mapping];
    for (const key of candidates) {
        const value = readPath(row, key);
        if (value !== null && value !== undefined && value !== "") {
            return String(value);
        }
    }
    return null;
}

function readPath(obj: unknown, path: string): unknown {
    if (!obj || typeof obj !== "object") return null;
    const parts = path.split(".");
    let cur: unknown = obj;
    for (const p of parts) {
        if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
            cur = (cur as Record<string, unknown>)[p];
        } else {
            return null;
        }
    }
    return cur;
}

export interface SocrataSource {
    portal_host: string;
    dataset_id: string;
    source_prefix: string;
    agency_name: string | null;
    state: string | null;
    city: string | null;
    jurisdiction_level: string | null;
    jurisdiction_code: string | null;
    website: string | null;
    field_map: FieldMap;
    app_token_env: string | null;
}

/**
 * Fetch up to `limit` rows from the dataset, ordered by either the configured
 * posted_date column or `:updated_at` system field, descending. Optional
 * `since` filter trims to rows updated after that ISO timestamp — useful for
 * incremental polling without re-pulling history.
 */
export async function fetchSocrataRows(
    src: SocrataSource,
    options?: { limit?: number; since?: string; timeoutMs?: number },
): Promise<{ rows: Record<string, unknown>[]; status: "ok" | "error"; detail?: string }> {
    const limit = options?.limit ?? 200;
    const url = new URL(`https://${src.portal_host}/resource/${src.dataset_id}.json`);
    url.searchParams.set("$limit", String(limit));

    // Try to order by the configured posted_date field; fall back to system column.
    const postedField = readField({}, src.field_map.posted_date as string | string[] | undefined)
        || (typeof src.field_map.posted_date === "string" ? src.field_map.posted_date : undefined)
        || ":updated_at";
    url.searchParams.set("$order", `${postedField} DESC`);

    // Build a single $where clause combining the static filter (configured per
    // source for datasets that mix procurement + non-procurement records, e.g.
    // NYC dg92-zbpx where section_name='Procurement' isolates the right rows)
    // and the incremental since-marker.
    const clauses: string[] = [];
    const extraWhere = src.field_map.extra_where as string | undefined;
    if (extraWhere && typeof extraWhere === "string") clauses.push(extraWhere);
    if (options?.since) clauses.push(`:updated_at > '${options.since}'`);
    if (clauses.length > 0) {
        url.searchParams.set("$where", clauses.join(" AND "));
    }

    const headers: Record<string, string> = {
        Accept: "application/json",
        "User-Agent": "CapturePilot/1.0 (+https://www.capturepilot.com; ops@capturepilot.com)",
    };
    if (src.app_token_env && process.env[src.app_token_env]) {
        headers["X-App-Token"] = process.env[src.app_token_env]!;
    }

    try {
        const res = await fetch(url.toString(), {
            headers,
            signal: AbortSignal.timeout(options?.timeoutMs ?? 12000),
        });
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            return { rows: [], status: "error", detail: `HTTP ${res.status}: ${text.slice(0, 120)}` };
        }
        const rows = await res.json() as Record<string, unknown>[];
        return { rows: Array.isArray(rows) ? rows : [], status: "ok" };
    } catch (err) {
        return { rows: [], status: "error", detail: (err as Error).message };
    }
}

/**
 * Thin client for GovTribe's MCP server (https://govtribe.com/mcp).
 *
 * GovTribe exposes federal procurement intelligence (awards, IDVs, sub-awards,
 * forecasts, contacts, vehicles, FPDS transactions) as a JSON-RPC MCP service.
 * Auth is a long-lived JWT in `GOVTRIBE_API_KEY` with scope `mcp:use`.
 *
 * Each call costs three round-trips: initialize → notifications/initialized →
 * tools/call. Sessions are per-request because Vercel Lambdas don't persist.
 *
 * The free-tier surface returns aggregations (top-N stats) and search-result
 * IDs — for detail records, link users to the govtribe.com web UI via the
 * returned `path` field.
 */

const MCP_URL = "https://govtribe.com/mcp";

interface JsonRpcResult<T = unknown> {
    jsonrpc: "2.0";
    id?: number;
    result?: T;
    error?: { code: number; message: string };
}

interface CallToolResult {
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
}

async function rpc(token: string, sessionId: string | null, body: Record<string, unknown>): Promise<{ result: JsonRpcResult; sessionId: string | null }> {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
    };
    if (sessionId) headers["Mcp-Session-Id"] = sessionId;
    const res = await fetch(MCP_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(25_000),
    });
    const newSession = res.headers.get("mcp-session-id") || sessionId;
    if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`GovTribe MCP ${res.status}: ${txt.slice(0, 200)}`);
    }
    const raw = await res.text();
    // Handle SSE: extract the data: line if present
    let json: JsonRpcResult;
    if (raw.startsWith("data:")) {
        const dataLine = raw.split("\n").find((l) => l.startsWith("data:"));
        json = JSON.parse((dataLine || "").replace(/^data:\s*/, ""));
    } else {
        json = JSON.parse(raw);
    }
    return { result: json, sessionId: newSession };
}

import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

function admin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

function cacheKey(tool: string, args: Record<string, unknown>): string {
    const canonical = JSON.stringify(args, Object.keys(args).sort());
    const hash = crypto.createHash("sha256").update(`${tool}:${canonical}`).digest("hex").slice(0, 32);
    return `${tool}:${hash}`;
}

/** Call a GovTribe MCP tool. Returns the parsed JSON inside the text response.
 *  Caches in Supabase `govtribe_cache` with a per-call TTL — cuts a 1-2 s MCP
 *  round-trip down to a single PG read. */
export async function callGovTribeTool<T = unknown>(
    toolName: string,
    args: Record<string, unknown>,
    opts: { ttlSeconds?: number } = {},
): Promise<T> {
    const token = process.env.GOVTRIBE_API_KEY;
    if (!token) throw new Error("GOVTRIBE_API_KEY not configured");

    const ttl = opts.ttlSeconds ?? 6 * 60 * 60; // default 6 h
    const key = cacheKey(toolName, args);
    const db = admin();

    // Cache lookup
    try {
        const { data: cached } = await db
            .from("govtribe_cache")
            .select("response, expires_at")
            .eq("cache_key", key)
            .maybeSingle();
        if (cached && new Date(cached.expires_at) > new Date()) {
            return cached.response as T;
        }
    } catch { /* fall through to live fetch */ }

    // 1. initialize
    const init = await rpc(token, null, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "capturepilot", version: "1.0" },
        },
    });
    const sid = init.sessionId;
    if (!sid) throw new Error("GovTribe MCP did not return a session id");

    // 2. notifications/initialized (fire-and-forget)
    await rpc(token, sid, {
        jsonrpc: "2.0",
        method: "notifications/initialized",
    }).catch(() => { /* notifications don't need response */ });

    // 3. tools/call
    const call = await rpc(token, sid, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: toolName, arguments: args },
    });
    const r = call.result;
    if (r.error) throw new Error(`GovTribe ${toolName}: ${r.error.message}`);
    const ct = r.result as CallToolResult;
    if (ct?.isError) {
        const msg = ct.content?.[0]?.text || "unknown error";
        throw new Error(`GovTribe ${toolName} returned error: ${msg.slice(0, 300)}`);
    }
    const txt = ct?.content?.[0]?.text || "{}";
    const parsed = JSON.parse(txt) as T;

    // Cache write — best effort
    try {
        const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
        await db.from("govtribe_cache").upsert({
            cache_key: key,
            tool_name: toolName,
            args,
            response: parsed as unknown as Record<string, unknown>,
            fetched_at: new Date().toISOString(),
            expires_at: expiresAt,
        }, { onConflict: "cache_key" });
    } catch { /* cache write failure is non-fatal */ }

    return parsed;
}

// ============== Convenience wrappers ==============

export interface AwardsSummary {
    total: number;
    path: string;
    aggregations: {
        dollars_obligated_stats?: { count: number; min: number; max: number; avg: number; sum: number };
        top_contracting_federal_agencies_by_dollars_obligated?: { buckets: AgencyBucket[]; sum_other_doc_count: number };
        top_naics_codes_by_dollars_obligated?: { buckets: NaicsBucket[]; sum_other_doc_count: number };
        top_idvs_by_dollars_obligated?: { buckets: IdvBucket[]; sum_other_doc_count: number };
        top_set_aside_types_by_dollars_obligated?: { buckets: SetAsideBucket[]; sum_other_doc_count: number };
    };
}

export interface AgencyBucket { key: { name: string; defense_or_civilian?: string; u_r_l?: string }; doc_count: number; sum_value: { value: number } }
export interface NaicsBucket { key: { name: string; n_a_i_c_s?: string }; doc_count: number; sum_value: { value: number } }
export interface IdvBucket { key: { name: string }; doc_count: number; sum_value: { value: number } }
export interface SetAsideBucket { key: { name: string }; doc_count: number; sum_value: { value: number } }

/** Aggregate award stats for a recipient name. 7-day cache — vendor record
 *  changes slowly. */
export async function fetchAwardsSummary(query: string): Promise<AwardsSummary> {
    return callGovTribeTool<AwardsSummary>(
        "Search_Federal_Contract_Awards",
        {
            query: `"${query.replace(/"/g, "")}"`,
            aggregations: [
                "dollars_obligated_stats",
                "top_contracting_federal_agencies_by_dollars_obligated",
                "top_naics_codes_by_dollars_obligated",
                "top_idvs_by_dollars_obligated",
                "top_set_aside_types_by_dollars_obligated",
            ],
        },
        { ttlSeconds: 7 * 24 * 60 * 60 },
    );
}

// ============== Opportunity activity ==============

export interface OpportunityActivity {
    total: number;
    path: string;
    aggregations: {
        top_federal_agencies_by_doc_count?: { buckets: Array<{ key: { name: string }; doc_count: number }> };
        top_naics_codes_by_doc_count?: { buckets: Array<{ key: { name: string; n_a_i_c_s?: string }; doc_count: number }> };
        top_set_aside_types_by_doc_count?: { buckets: Array<{ key: { name: string }; doc_count: number }> };
        top_psc_codes_by_doc_count?: { buckets: Array<{ key: { name: string }; doc_count: number }> };
    };
}

/** Count + breakdown of federal opportunities posted in a recent window.
 *  Default: last 14 days. 4-hour cache — refreshed frequently for dashboard
 *  pulse but not on every page load. */
export async function fetchOpportunityActivity(days = 14, naicsIds?: string[]): Promise<OpportunityActivity> {
    const args: Record<string, unknown> = {
        posted_date: { from: `now-${days}d/d`, to: "now/d" },
        per_page: 1,
        aggregations: [
            "top_federal_agencies_by_doc_count",
            "top_naics_codes_by_doc_count",
            "top_set_aside_types_by_doc_count",
            "top_psc_codes_by_doc_count",
        ],
    };
    if (naicsIds && naicsIds.length > 0) args.naics_category_ids = naicsIds;
    return callGovTribeTool<OpportunityActivity>(
        "Search_Federal_Contract_Opportunities",
        args,
        { ttlSeconds: 4 * 60 * 60 },
    );
}

// ============== Forecast intelligence ==============

export interface ForecastSummary {
    total: number;
    path: string;
    aggregations: Record<string, { buckets: Array<{ key: { name: string }; doc_count: number; sum_value?: { value: number } }> }>;
}

/** Federal forecast records for a NAICS / agency window. Forecasts list
 *  planned RFPs — early signal for pursuit pipeline. 24-h cache. */
export async function fetchForecasts(naicsIds?: string[], agencyQuery?: string): Promise<ForecastSummary> {
    const args: Record<string, unknown> = {
        per_page: 1,
        aggregations: [
            "top_federal_agencies_by_doc_count",
            "top_naics_codes_by_doc_count",
            "top_set_aside_types_by_doc_count",
            "top_contacts_by_doc_count",
        ],
    };
    if (naicsIds?.length) args.naics_category_ids = naicsIds;
    if (agencyQuery) args.query = `"${agencyQuery.replace(/"/g, "")}"`;
    return callGovTribeTool<ForecastSummary>(
        "Search_Federal_Forecasts",
        args,
        { ttlSeconds: 24 * 60 * 60 },
    );
}

// ============== Sub-awards / teaming intel ==============

export interface SubAwardsSummary {
    total: number;
    path: string;
    aggregations: {
        top_awardees_by_doc_count?: { buckets: Array<{ key: { name: string }; doc_count: number }> };
        top_funding_federal_agencies_by_doc_count?: { buckets: Array<{ key: { name: string }; doc_count: number }> };
        top_contracting_federal_agencies_by_doc_count?: { buckets: Array<{ key: { name: string }; doc_count: number }> };
    };
}

/** Sub-award activity for a recipient — shows the prime/sub teaming network
 *  by record count. Teaming intelligence. 7-day cache. */
export async function fetchSubAwards(query: string): Promise<SubAwardsSummary> {
    return callGovTribeTool<SubAwardsSummary>(
        "Search_Federal_Contract_Sub_Awards",
        {
            query: `"${query.replace(/"/g, "")}"`,
            aggregations: [
                "top_awardees_by_doc_count",
                "top_funding_federal_agencies_by_doc_count",
                "top_contracting_federal_agencies_by_doc_count",
            ],
        },
        { ttlSeconds: 7 * 24 * 60 * 60 },
    );
}

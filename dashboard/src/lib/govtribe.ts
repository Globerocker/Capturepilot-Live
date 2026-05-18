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

/** Call a GovTribe MCP tool. Returns the parsed JSON inside the text response. */
export async function callGovTribeTool<T = unknown>(toolName: string, args: Record<string, unknown>): Promise<T> {
    const token = process.env.GOVTRIBE_API_KEY;
    if (!token) throw new Error("GOVTRIBE_API_KEY not configured");

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
    return JSON.parse(txt) as T;
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

/** Aggregate award stats for a recipient name. Returns total awards, $ summed,
 *  top contracting agencies, top NAICS, top IDV vehicles, top set-asides. */
export async function fetchAwardsSummary(query: string): Promise<AwardsSummary> {
    return callGovTribeTool<AwardsSummary>("Search_Federal_Contract_Awards", {
        query: `"${query.replace(/"/g, "")}"`,
        aggregations: [
            "dollars_obligated_stats",
            "top_contracting_federal_agencies_by_dollars_obligated",
            "top_naics_codes_by_dollars_obligated",
            "top_idvs_by_dollars_obligated",
            "top_set_aside_types_by_dollars_obligated",
        ],
    });
}

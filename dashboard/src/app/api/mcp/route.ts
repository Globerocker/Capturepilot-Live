import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractBearer, resolveToken } from "@/lib/api-token";

export const maxDuration = 60;

/**
 * Model Context Protocol (MCP) server endpoint.
 * Spec: https://modelcontextprotocol.io (JSON-RPC 2.0 over HTTP)
 *
 * Supports methods:
 *   initialize                 — capability handshake
 *   tools/list                 — lists available tools
 *   tools/call                 — invokes a tool
 *
 * Auth: Bearer {MCP token}. Create one at /settings/integrations in-app.
 * Each token is scoped to a single user_profile_id.
 *
 * Tools:
 *   search_opportunities       — find matching opps by NAICS/agency/keyword
 *   get_opportunity_detail     — pull full opportunity by notice_id
 *   get_capture_brief          — regenerate or fetch cached brief
 *   list_my_matches            — user's HOT/WARM matches
 *   get_contractor_past_perf   — CPARS-proxy rating by UEI
 *   search_labor_rates         — GSA CALC median/p25/p75
 *   lookup_far_clause          — FAR/DFARS clause text
 */

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
    jsonrpc: "2.0";
    id: JsonRpcId;
    method: string;
    params?: Record<string, unknown>;
}

interface JsonRpcSuccess<T> {
    jsonrpc: "2.0";
    id: JsonRpcId;
    result: T;
}

interface JsonRpcError {
    jsonrpc: "2.0";
    id: JsonRpcId;
    error: { code: number; message: string; data?: unknown };
}

function ok<T>(id: JsonRpcId, result: T): JsonRpcSuccess<T> {
    return { jsonrpc: "2.0", id, result };
}

function err(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcError {
    return { jsonrpc: "2.0", id, error: { code, message, data } };
}

function adminClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
}

// ─── Tool schema ──────────────────────────────────────────────
const TOOLS = [
    {
        name: "search_opportunities",
        description: "Search federal opportunities from SAM.gov by keyword, NAICS, agency, or set-aside. Returns up to 20 results.",
        inputSchema: {
            type: "object",
            properties: {
                keyword: { type: "string", description: "Free-text search against title + description" },
                naics: { type: "string", description: "6-digit NAICS code" },
                agency: { type: "string", description: "Department / agency name (partial match)" },
                set_aside: { type: "string", description: "e.g. SDVOSB, 8(a), HUBZone, WOSB" },
                limit: { type: "number", description: "Max results (1-50, default 20)" },
            },
        },
    },
    {
        name: "get_opportunity_detail",
        description: "Returns the full opportunity record including description, requirements, scoring, and incumbent data.",
        inputSchema: {
            type: "object",
            required: ["notice_id"],
            properties: {
                notice_id: { type: "string", description: "SAM.gov notice ID" },
            },
        },
    },
    {
        name: "list_my_matches",
        description: "Returns the authenticated user's top HOT/WARM matches ranked by score.",
        inputSchema: {
            type: "object",
            properties: {
                classification: { type: "string", description: "HOT | WARM | COLD (default HOT)" },
                limit: { type: "number", description: "Max results (1-50, default 20)" },
            },
        },
    },
    {
        name: "get_contractor_past_perf",
        description: "Returns the CPARS-proxy past-performance rating for a given UEI.",
        inputSchema: {
            type: "object",
            required: ["uei"],
            properties: { uei: { type: "string", description: "12-character SAM UEI" } },
        },
    },
    {
        name: "search_labor_rates",
        description: "Returns median / p25 / p75 awarded hourly rates from GSA CALC for a labor category.",
        inputSchema: {
            type: "object",
            required: ["labor_category"],
            properties: {
                labor_category: { type: "string" },
                education: { type: "string", description: "e.g. 'Bachelors', 'Masters'" },
                min_years: { type: "number" },
            },
        },
    },
    {
        name: "lookup_far_clause",
        description: "Returns the full text of a FAR or DFARS clause (e.g. '52.219-14', 'DFARS 252.204-7012').",
        inputSchema: {
            type: "object",
            required: ["clause"],
            properties: { clause: { type: "string" } },
        },
    },
];

// ─── Tool implementations ─────────────────────────────────────
async function callTool(
    name: string,
    args: Record<string, unknown>,
    userProfileId: string
): Promise<unknown> {
    const admin = adminClient();

    if (name === "search_opportunities") {
        const keyword = (args.keyword as string) || "";
        const naics = (args.naics as string) || null;
        const agency = (args.agency as string) || null;
        const setAside = (args.set_aside as string) || null;
        const limit = Math.min(50, Math.max(1, Number(args.limit) || 20));

        let q = admin
            .from("opportunities")
            .select("notice_id, title, department, naics_code, typeOfSetAsideDescription, response_deadline, award_amount, status")
            .in("status", ["ACTIVE", "EXPIRING_SOON", "DISCOVERED"])
            .limit(limit);
        if (keyword) q = q.or(`title.ilike.%${keyword}%,description.ilike.%${keyword}%`);
        if (naics) q = q.eq("naics_code", naics);
        if (agency) q = q.ilike("department", `%${agency}%`);
        if (setAside) q = q.ilike("typeOfSetAsideDescription", `%${setAside}%`);

        const { data } = await q;
        return { results: data || [] };
    }

    if (name === "get_opportunity_detail") {
        const noticeId = args.notice_id as string;
        const { data } = await admin.from("opportunities").select("*").eq("notice_id", noticeId).single();
        return data || { error: "not_found" };
    }

    if (name === "list_my_matches") {
        const classification = (args.classification as string) || "HOT";
        const limit = Math.min(50, Math.max(1, Number(args.limit) || 20));
        const { data } = await admin
            .from("user_matches")
            .select("opportunity_id, score, classification, opportunities!inner(notice_id, title, department, response_deadline, award_amount)")
            .eq("user_profile_id", userProfileId)
            .eq("classification", classification)
            .eq("is_dismissed", false)
            .order("score", { ascending: false })
            .limit(limit);
        return { matches: data || [] };
    }

    if (name === "get_contractor_past_perf") {
        const uei = ((args.uei as string) || "").toUpperCase();
        const { data } = await admin
            .from("past_perf_ratings")
            .select("*")
            .eq("uei", uei)
            .maybeSingle();
        return data || { error: "not_yet_computed", hint: `Call GET /api/contractors/${uei}/past-perf to compute.` };
    }

    if (name === "search_labor_rates") {
        const category = (args.labor_category as string) || "";
        const { data } = await admin
            .from("labor_rates")
            .select("labor_category, education_level, min_years_experience, contractor_name, hourly_rate_current")
            .ilike("labor_category", `%${category}%`)
            .not("hourly_rate_current", "is", null)
            .limit(200);
        const rates = (data || [])
            .map((r) => Number(r.hourly_rate_current))
            .filter((r) => r > 0)
            .sort((a, b) => a - b);
        const pct = (p: number) => (rates.length ? rates[Math.floor((rates.length - 1) * p)] : null);
        return {
            total: rates.length,
            p25: pct(0.25),
            median: pct(0.5),
            p75: pct(0.75),
            sample: (data || []).slice(0, 5),
        };
    }

    if (name === "lookup_far_clause") {
        const clause = (args.clause as string) || "";
        const cleaned = clause.trim().toUpperCase().replace(/^(FAR|DFARS)[- ]?/, "");
        const kind = clause.trim().toUpperCase().startsWith("DFARS") || clause.startsWith("252.") ? "DFARS" : "FAR";
        const clauseId = `${kind} ${cleaned}`;
        const { data } = await admin
            .from("far_clauses_cache")
            .select("clause_id, title, body_text, section_url")
            .eq("clause_id", clauseId)
            .maybeSingle();
        if (data) return data;
        return { error: "not_cached", hint: `GET /api/far/${cleaned} to fetch from eCFR.` };
    }

    throw new Error(`Unknown tool: ${name}`);
}

// ─── Request handler ──────────────────────────────────────────
export async function POST(req: NextRequest) {
    const token = extractBearer(req.headers.get("authorization"));
    const resolved = await resolveToken(token, "mcp");
    if (!resolved) {
        return NextResponse.json(err(null, -32001, "Invalid or missing MCP token"), { status: 401 });
    }

    let rpc: JsonRpcRequest;
    try {
        rpc = (await req.json()) as JsonRpcRequest;
    } catch {
        return NextResponse.json(err(null, -32700, "Parse error"));
    }

    if (rpc.jsonrpc !== "2.0" || !rpc.method) {
        return NextResponse.json(err(rpc.id || null, -32600, "Invalid Request"));
    }

    if (rpc.method === "initialize") {
        return NextResponse.json(
            ok(rpc.id, {
                protocolVersion: "2024-11-05",
                capabilities: { tools: { listChanged: false } },
                serverInfo: { name: "capturepilot-mcp", version: "1.0.0" },
            })
        );
    }

    if (rpc.method === "tools/list") {
        return NextResponse.json(ok(rpc.id, { tools: TOOLS }));
    }

    if (rpc.method === "tools/call") {
        const params = rpc.params || {};
        const name = params.name as string;
        const args = (params.arguments as Record<string, unknown>) || {};
        if (!name) return NextResponse.json(err(rpc.id, -32602, "Missing params.name"));

        try {
            const result = await callTool(name, args, resolved.userProfileId);
            return NextResponse.json(
                ok(rpc.id, {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                    isError: false,
                })
            );
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Tool call failed";
            return NextResponse.json(err(rpc.id, -32603, msg));
        }
    }

    return NextResponse.json(err(rpc.id, -32601, `Method not found: ${rpc.method}`));
}

export async function GET() {
    return NextResponse.json({
        name: "CapturePilot MCP Server",
        version: "1.0.0",
        protocol: "2024-11-05",
        description:
            "MCP endpoint for federal contracting intelligence. Add as a connector in Claude Desktop or any MCP-compatible client. Auth: Bearer <mcp_token>. Generate tokens at /settings/integrations.",
        endpoint: "/api/mcp (POST, JSON-RPC 2.0)",
        tools: TOOLS.map((t) => t.name),
    });
}

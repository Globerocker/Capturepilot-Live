import { NextResponse } from "next/server";

/**
 * .well-known/mcp.json
 *
 * Auto-discovery manifest per the MCP Remote Server Spec. MCP clients
 * (Claude Desktop, Cursor, future web-hosted MCP hubs) can hit this URL
 * instead of hand-configuring the endpoint.
 *
 * Spec: https://modelcontextprotocol.io/specification/basic/transports
 */
export async function GET() {
    const base = process.env.NEXT_PUBLIC_APP_URL || "https://app.capturepilot.com";
    return NextResponse.json({
        name: "CapturePilot",
        version: "1.0.0",
        description:
            "Federal government-contracting intelligence: opportunity search, capture briefs, " +
            "past-performance ratings, labor rates, and FAR/DFARS clause lookup.",
        protocol_version: "2024-11-05",
        transport: {
            type: "http",
            endpoint: `${base}/api/mcp`,
            auth: {
                type: "bearer",
                token_generation_url: `${base}/settings/integrations`,
            },
        },
        capabilities: {
            tools: { listChanged: false },
            resources: false,
            prompts: false,
        },
        contact: "support@capturepilot.com",
        docs: `${base}/docs/mcp`,
    });
}

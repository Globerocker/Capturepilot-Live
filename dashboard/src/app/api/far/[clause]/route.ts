import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30;

/**
 * GET /api/far/[clause]
 *   /api/far/52.219-14
 *   /api/far/52.204-21
 *   /api/far/DFARS-252.204-7012
 *
 * Returns the FAR or DFARS clause text. Cached in far_clauses_cache for
 * 30 days; cache miss → pull from the eCFR API and store.
 *
 * eCFR API reference: https://www.ecfr.gov/developers/documentation/api/v1
 *   FAR is Title 48 Chapter 1 (subchapters A-H)
 *   DFARS is Title 48 Chapter 2 (subchapters A-G)
 *
 * We hit the /api/versioner/v1/structure.json + /api/versioner/v1/full.json
 * endpoints to fetch the current content, then cache the section.
 */

interface ClauseResult {
    clause_id: string;
    title: string;
    body_text: string;
    body_html?: string;
    section_url?: string;
    last_amended?: string;
    source: "cache" | "ecfr";
}

function parseClauseId(raw: string): { kind: "FAR" | "DFARS"; section: string } | null {
    const cleaned = raw.trim().toUpperCase().replace(/^FAR[- ]?/, "").replace(/^DFARS[- ]?/, "");
    const isDfars = raw.trim().toUpperCase().startsWith("DFARS") || raw.trim().toUpperCase().startsWith("252.");
    // Valid section patterns: 52.219-14, 252.204-7012, 1.602-1
    if (!/^\d+\.\d+(-\d+)?$/.test(cleaned)) return null;
    return { kind: isDfars ? "DFARS" : "FAR", section: cleaned };
}

async function fetchFromECFR(
    kind: "FAR" | "DFARS",
    section: string
): Promise<Omit<ClauseResult, "source"> | null> {
    // eCFR lets us query directly on a section
    // Example: https://www.ecfr.gov/api/versioner/v1/full/2026-04-19/title-48.json?section=52.219-14
    const title = 48;
    const today = new Date().toISOString().slice(0, 10);
    const url = `https://www.ecfr.gov/api/versioner/v1/full/${today}/title-${title}.xml?section=${section}`;

    const res = await fetch(url, {
        headers: { Accept: "application/xml" },
        // eCFR is public, no auth
    });
    if (!res.ok) return null;
    const xml = await res.text();

    // Simple XML → text extraction. eCFR wraps section content in <SECTION>.
    // Strip all tags, collapse whitespace. We also keep the title from <HEAD>.
    const titleMatch = xml.match(/<HEAD>([\s\S]*?)<\/HEAD>/);
    const title_text = titleMatch
        ? titleMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
        : `${kind} ${section}`;

    const body_text = xml
        .replace(/<HEAD>[\s\S]*?<\/HEAD>/g, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    if (!body_text || body_text.length < 50) return null;

    return {
        clause_id: `${kind} ${section}`,
        title: title_text,
        body_text: body_text.slice(0, 30000),
        body_html: xml.length < 100000 ? xml : undefined,
        section_url: `https://www.ecfr.gov/current/title-48/section-${section}`,
        last_amended: undefined,
    };
}

export async function GET(
    _req: NextRequest,
    context: { params: Promise<{ clause: string }> }
) {
    const { clause } = await context.params;
    const parsed = parseClauseId(clause);
    if (!parsed) {
        return NextResponse.json(
            { error: "Invalid clause format. Expected e.g. 52.219-14 or DFARS-252.204-7012." },
            { status: 400 }
        );
    }
    const clauseId = `${parsed.kind} ${parsed.section}`;

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Cache check — 30 day TTL
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: cached } = await admin
        .from("far_clauses_cache")
        .select("clause_id, title, body_text, body_html, section_url, last_amended, fetched_at")
        .eq("clause_id", clauseId)
        .gt("fetched_at", thirtyDaysAgo)
        .maybeSingle();

    if (cached) {
        return NextResponse.json({ ...cached, source: "cache" } as ClauseResult);
    }

    const fetched = await fetchFromECFR(parsed.kind, parsed.section);
    if (!fetched) {
        return NextResponse.json(
            { error: `Could not find ${clauseId} on eCFR.` },
            { status: 404 }
        );
    }

    await admin
        .from("far_clauses_cache")
        .upsert({
            clause_id: fetched.clause_id,
            title: fetched.title,
            body_text: fetched.body_text,
            body_html: fetched.body_html || null,
            section_url: fetched.section_url,
            last_amended: fetched.last_amended || null,
            fetched_at: new Date().toISOString(),
        });

    return NextResponse.json({ ...fetched, source: "ecfr" } as ClauseResult);
}

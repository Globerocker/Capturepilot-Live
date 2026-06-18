/**
 * /api/admin/cockpit/assets — the cockpit ASSETS LIBRARY.
 *
 * The library is admin-curated CapturePilot collateral (whitepapers, lead
 * magnets, guides, templates) a rep attaches to outreach. Backed by the
 * `cockpit_assets` table (migration 185).
 *
 * GET  ?keywords=a,b,c&naics=561720,541511&kind=guide&include_inactive=1
 *   Returns the best-fitting ACTIVE assets for a lead. Fit is a JS overlap score:
 *     • +3 per NAICS code that overlaps (exact or 4/3-digit prefix), capped
 *     • +1 per keyword that appears in tags / title / description
 *   Assets with NO naics array are treated as universally applicable (they don't
 *   lose to a NAICS-specific asset — they just don't gain the NAICS bonus).
 *   With no keywords/naics, returns all active assets (most recent first).
 *   `kind` narrows to one asset kind. `include_inactive=1` returns inactive rows
 *   too (admin library-management view).
 *   Response: { assets: Asset[] }
 *
 * POST  { id?, title, url, kind?, description?, tags?, naics?, is_active? }
 *   Upsert one asset. With `id` → edit that row; without → insert a new one.
 *   This is the admin curation path. Response: { ok: true, asset: Asset }.
 *
 * Admin-gated via assertAdmin(). Service client for the reads/writes.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const dynamic = "force-dynamic";

const ASSET_KINDS = ["whitepaper", "lead_magnet", "guide", "template"] as const;
type AssetKind = (typeof ASSET_KINDS)[number];

function svc() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

interface CockpitAsset {
    id: string;
    title: string;
    url: string;
    kind: AssetKind | string;
    description: string | null;
    tags: string[];
    naics: string[];
    is_active: boolean;
    created_at: string | null;
    /** Computed at read time when keywords/naics are supplied (absent otherwise). */
    fit_score?: number;
}

const ASSET_COLS = "id, title, url, kind, description, tags, naics, is_active, created_at";

function toStrArray(v: unknown): string[] {
    if (Array.isArray(v)) {
        return v.map((x) => String(x ?? "").trim()).filter(Boolean);
    }
    if (typeof v === "string") {
        return v.split(",").map((s) => s.trim()).filter(Boolean);
    }
    return [];
}

function normalizeKind(v: unknown): AssetKind | undefined {
    const k = String(v ?? "").trim().toLowerCase();
    return (ASSET_KINDS as readonly string[]).includes(k) ? (k as AssetKind) : undefined;
}

function rowToAsset(r: any): CockpitAsset {
    return {
        id: String(r.id),
        title: String(r.title || ""),
        url: String(r.url || ""),
        kind: r.kind || "guide",
        description: r.description ?? null,
        tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
        naics: Array.isArray(r.naics) ? r.naics.map(String) : [],
        is_active: !!r.is_active,
        created_at: r.created_at ?? null,
    };
}

/**
 * Two NAICS codes "overlap" when one is a prefix of the other at 6, 4, or 3
 * digits — so 561720 (janitorial) fits an asset tagged 5617 or 561, and an
 * asset tagged 561720 fits a lead in 561730. Returns a weighted bonus.
 */
function naicsBonus(assetNaics: string[], leadNaics: string[]): number {
    if (assetNaics.length === 0 || leadNaics.length === 0) return 0;
    let bonus = 0;
    for (const a of assetNaics) {
        for (const l of leadNaics) {
            const aa = a.replace(/\D/g, "");
            const ll = l.replace(/\D/g, "");
            if (!aa || !ll) continue;
            if (aa === ll) { bonus += 3; break; }
            // 4- or 3-digit prefix match — softer signal.
            if (aa.slice(0, 4) === ll.slice(0, 4)) { bonus += 2; break; }
            if (aa.slice(0, 3) === ll.slice(0, 3)) { bonus += 1; break; }
        }
    }
    return Math.min(bonus, 9); // cap so a long NAICS array can't swamp keywords
}

/** +1 per keyword that appears in the asset's tags / title / description. */
function keywordBonus(asset: CockpitAsset, keywords: string[]): number {
    if (keywords.length === 0) return 0;
    const hay = [
        ...asset.tags.map((t) => t.toLowerCase()),
        asset.title.toLowerCase(),
        (asset.description || "").toLowerCase(),
    ].join(" ");
    let bonus = 0;
    for (const kw of keywords) {
        const k = kw.toLowerCase().trim();
        if (k && hay.includes(k)) bonus += 1;
    }
    return bonus;
}

// ───────────────────────── GET ─────────────────────────

export async function GET(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const sp = req.nextUrl.searchParams;
    const keywords = toStrArray(sp.get("keywords"));
    const leadNaics = toStrArray(sp.get("naics"));
    const kind = normalizeKind(sp.get("kind"));
    const includeInactive = sp.get("include_inactive") === "1";

    const sb = svc();
    try {
        let query = sb
            .from("cockpit_assets")
            .select(ASSET_COLS)
            .order("created_at", { ascending: false, nullsFirst: false })
            .limit(200);
        if (!includeInactive) query = query.eq("is_active", true);
        if (kind) query = query.eq("kind", kind);

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        const assets = (data || []).map(rowToAsset);

        // No targeting signal → just return active assets, newest first.
        if (keywords.length === 0 && leadNaics.length === 0) {
            return NextResponse.json({ assets });
        }

        // Score + sort by fit. Ties keep the original (recency) order via index.
        const scored = assets.map((a, i) => ({
            asset: { ...a, fit_score: naicsBonus(a.naics, leadNaics) + keywordBonus(a, keywords) },
            i,
        }));
        scored.sort((x, y) => (y.asset.fit_score! - x.asset.fit_score!) || (x.i - y.i));

        return NextResponse.json({ assets: scored.map((s) => s.asset) });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || "query failed" }, { status: 500 });
    }
}

// ───────────────────────── POST (admin curation) ─────────────────────────

export async function POST(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    let body: any;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
    }

    const id = typeof body?.id === "string" && body.id.trim() ? body.id.trim() : null;
    const title = String(body?.title || "").trim();
    const url = String(body?.url || "").trim();
    if (!title || !url) {
        return NextResponse.json({ error: "title and url are required" }, { status: 400 });
    }
    // Basic URL sanity — we surface these as clickable links in the cockpit.
    if (!/^https?:\/\//i.test(url)) {
        return NextResponse.json({ error: "url must be an absolute http(s) URL" }, { status: 400 });
    }

    const row: Record<string, any> = {
        title,
        url,
        kind: normalizeKind(body?.kind) || "guide",
        description: typeof body?.description === "string" ? body.description.trim() || null : null,
        tags: toStrArray(body?.tags),
        naics: toStrArray(body?.naics),
        is_active: body?.is_active === undefined ? true : !!body.is_active,
    };

    const sb = svc();
    try {
        let res;
        if (id) {
            res = await sb.from("cockpit_assets").update(row).eq("id", id).select(ASSET_COLS).maybeSingle();
        } else {
            res = await sb.from("cockpit_assets").insert(row).select(ASSET_COLS).maybeSingle();
        }
        if (res.error) throw new Error(res.error.message);
        if (!res.data) return NextResponse.json({ error: "not found" }, { status: 404 });
        return NextResponse.json({ ok: true, asset: rowToAsset(res.data) });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || "save failed" }, { status: 500 });
    }
}

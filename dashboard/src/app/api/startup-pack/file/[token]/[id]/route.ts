import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { STARTUP_PACK_ASSETS } from "@/lib/startup-pack-assets";

/**
 * GET /api/startup-pack/file/[token]/[id]
 *
 * Token-gated streaming download for any starter-pack asset.
 *
 * Pipeline:
 *   1. Look up the access_token in startup_pack_purchases (same logic as
 *      /api/startup-pack/access/[token]). Reject if missing or refunded.
 *   2. Look up the asset by `id` in STARTUP_PACK_ASSETS. The asset must
 *      have a `localPath` starting with "/starter-pack/" so we can resolve
 *      it to a file under dashboard/protected/starter-pack/.
 *   3. Stream the file with correct Content-Type + Content-Disposition.
 *
 * Why this exists: the alternative — serving files directly from
 * /public — means anyone who knows or guesses a filename can download
 * without paying. This route enforces "must hold a non-refunded access
 * token" before the bytes leave the server.
 *
 * Files live under dashboard/protected/starter-pack/ (NOT /public/), so
 * Vercel never serves them as static assets — they can only be accessed
 * through this handler, which re-validates the token on every request.
 * next.config.ts opts the directory into outputFileTracingIncludes so
 * Vercel bundles it alongside the serverless functions.
 */

const PROTECTED_DIR = resolve(process.cwd(), "protected");

const MIME_BY_EXT: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    zip: "application/zip",
    csv: "text/csv",
    txt: "text/plain",
};

function mimeFor(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    return MIME_BY_EXT[ext] || "application/octet-stream";
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ token: string; id: string }> },
) {
    const { token, id } = await params;
    if (!token || token.length < 16) {
        return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    // ── 1. Token check ──
    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
    const { data: purchase, error: lookupErr } = await sb
        .from("startup_pack_purchases")
        .select("id, refunded_at")
        .eq("access_token", token)
        .maybeSingle();

    if (lookupErr || !purchase) {
        return NextResponse.json({ error: "Access denied" }, { status: 404 });
    }
    if (purchase.refunded_at) {
        return NextResponse.json({ error: "Refunded — access revoked" }, { status: 403 });
    }

    // ── 2. Asset lookup ──
    const asset = STARTUP_PACK_ASSETS.find(a => a.id === id);
    if (!asset) {
        return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }
    if (!asset.localPath) {
        return NextResponse.json({ error: "Asset has no local file (offsite-hosted)" }, { status: 404 });
    }

    // localPath is "/starter-pack/<filename>". Strip the leading slash, then
    // resolve under /protected. Anti-traversal: reject anything that escapes.
    const rel = asset.localPath.replace(/^\/+/, "");
    if (rel.includes("..") || !rel.startsWith("starter-pack/")) {
        return NextResponse.json({ error: "Invalid asset path" }, { status: 400 });
    }
    const absPath = resolve(PROTECTED_DIR, rel);
    if (!absPath.startsWith(PROTECTED_DIR + "/")) {
        return NextResponse.json({ error: "Path traversal denied" }, { status: 400 });
    }

    // ── 3. Stream ──
    let buf: Buffer;
    try {
        buf = await readFile(absPath);
    } catch {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const filename = absPath.split("/").pop() || "asset";
    const wantDownload = request.nextUrl.searchParams.get("dl") === "1";

    return new NextResponse(buf as unknown as BodyInit, {
        status: 200,
        headers: {
            "Content-Type": mimeFor(filename),
            "Content-Length": String(buf.length),
            "Content-Disposition": wantDownload
                ? `attachment; filename="${filename}"`
                : `inline; filename="${filename}"`,
            "Cache-Control": "private, max-age=300",
        },
    });
}

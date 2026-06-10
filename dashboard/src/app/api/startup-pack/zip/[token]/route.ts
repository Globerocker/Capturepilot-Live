import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import JSZip from "jszip";

/**
 * GET /api/startup-pack/zip/[token]
 *
 * Token-gated "download everything" endpoint that streams a single ZIP
 * containing every local file in dashboard/public/starter-pack/.
 *
 * Pipeline:
 *   1. Validate the access_token against startup_pack_purchases (same logic
 *      as /api/startup-pack/access/[token]). Return 403 for invalid/refunded.
 *   2. Walk the starter-pack directory, read every file into memory.
 *   3. Build a ZIP in-memory with JSZip (already in package.json).
 *   4. Stream the ZIP back as application/zip with a friendly filename.
 *
 * Note: the bundle is roughly 30-80 MB uncompressed. JSZip uses DEFLATE
 * by default (compression: "DEFLATE"), which typically halves PDF size.
 * Vercel's 300-second timeout is more than enough for this volume.
 */

const PUBLIC_DIR = resolve(process.cwd(), "public");
const PACK_DIR   = resolve(PUBLIC_DIR, "starter-pack");

/** Recursively collect every file path under a directory. */
async function collectFiles(dir: string): Promise<string[]> {
    const { readdir, stat } = await import("node:fs/promises");
    const entries = await readdir(dir, { withFileTypes: true });
    const results: string[] = [];
    for (const entry of entries) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...await collectFiles(full));
        } else if (entry.isFile()) {
            results.push(full);
        }
    }
    return results;
}

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ token: string }> },
) {
    const { token } = await params;

    // ── 1. Token validation (same guard as /access/[token]) ──────────────────
    if (!token || token.length < 16) {
        return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

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
        return new NextResponse("Access denied", { status: 403 });
    }
    if (purchase.refunded_at) {
        return new NextResponse("Refunded — access revoked", { status: 403 });
    }

    // ── 2. Ensure the pack directory exists ──────────────────────────────────
    if (!existsSync(PACK_DIR)) {
        console.error("[zip] starter-pack directory not found at", PACK_DIR);
        return new NextResponse("Pack files not found", { status: 500 });
    }

    // ── 3. Collect all files ─────────────────────────────────────────────────
    let filePaths: string[];
    try {
        filePaths = await collectFiles(PACK_DIR);
    } catch (err) {
        console.error("[zip] failed to list pack files:", err);
        return new NextResponse("Could not read pack directory", { status: 500 });
    }

    if (filePaths.length === 0) {
        return new NextResponse("No files to zip", { status: 500 });
    }

    // ── 4. Build ZIP in-memory ────────────────────────────────────────────────
    const zip = new JSZip();

    await Promise.all(
        filePaths.map(async (absPath) => {
            // Validate path stays inside PACK_DIR (anti-traversal, belt-and-suspenders).
            if (!absPath.startsWith(PACK_DIR + "/")) return;

            // Zip entry path = relative to the pack dir so the ZIP has a clean
            // folder structure like:  01_SAM_Registration_Kit/FLK_01_...pdf
            const zipEntry = absPath.slice(PACK_DIR.length + 1); // strip leading slash

            try {
                const buf = await readFile(absPath);
                zip.file(zipEntry, buf, { compression: "DEFLATE", compressionOptions: { level: 6 } });
            } catch (err) {
                // Skip unreadable files instead of aborting the whole ZIP.
                console.warn("[zip] skipping unreadable file:", absPath, err);
            }
        }),
    );

    // ── 5. Serialise ─────────────────────────────────────────────────────────
    let zipBuf: Buffer;
    try {
        const ab = await zip.generateAsync({ type: "nodebuffer", streamFiles: true });
        zipBuf = Buffer.from(ab);
    } catch (err) {
        console.error("[zip] JSZip generate failed:", err);
        return new NextResponse("ZIP generation failed", { status: 500 });
    }

    // ── 6. Stream back ────────────────────────────────────────────────────────
    return new NextResponse(zipBuf as unknown as BodyInit, {
        status: 200,
        headers: {
            "Content-Type": "application/zip",
            "Content-Length": String(zipBuf.length),
            "Content-Disposition": 'attachment; filename="Federal_Launch_Kit.zip"',
            // Don't cache — the token is the gate; content may change.
            "Cache-Control": "private, no-store",
        },
    });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import JSZip from "jszip";
import { LAUNCH_KIT_PHASES, MASTER_GUIDE, MASTER_LIST, BONUS_ITEM, type LaunchKitFile } from "@/lib/startup-pack-assets";

/**
 * GET /api/startup-pack/zip/[token]
 *
 * Token-gated "download everything" endpoint. Streams a single ZIP laid out in
 * the same phase folders the buyer sees on the download page:
 *
 *   00 - START HERE - Master Guide.pdf
 *   Phase 1 - Get Registered & Certified/
 *     1.1 SAM.gov Registration/
 *       00 How to use SAM.gov Registration.pdf      ← the one-page guide
 *       01 SAM.gov Registration Walkthrough.pdf      ← the templates, in order
 *       ...
 *   ...
 *   ZZ - All Templates/Master Template List.pdf
 *
 * Built from LAUNCH_KIT_PHASES (the manifest) rather than the raw protected/
 * directory tree, so the ZIP structure matches the on-page experience exactly.
 */

const PROTECTED_DIR = resolve(process.cwd(), "protected");
const PACK_DIR = resolve(PROTECTED_DIR, "starter-pack");

/** Sanitize a label for use as a ZIP entry name (no path separators / illegal chars). */
function safe(name: string): string {
    return name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
}
function extOf(localPath: string): string {
    return (localPath.split(".").pop() || "").toLowerCase();
}
/** Resolve a manifest localPath ("/starter-pack/...") to an absolute file under PACK_DIR. */
function absOf(localPath: string): string | null {
    const rel = localPath.replace(/^\/+/, "");
    if (rel.includes("..") || !rel.startsWith("starter-pack/")) return null;
    const abs = resolve(PROTECTED_DIR, rel);
    return abs.startsWith(PACK_DIR + "/") ? abs : null;
}

/** Build the ordered list of { zipPath, file } entries for the whole kit. */
function buildEntries(): Array<{ zipPath: string; file: LaunchKitFile }> {
    const out: Array<{ zipPath: string; file: LaunchKitFile }> = [];
    out.push({ zipPath: "00 - START HERE - Master Guide.pdf", file: MASTER_GUIDE });

    for (const phase of LAUNCH_KIT_PHASES) {
        for (const item of phase.items) {
            out.push({ zipPath: `${item.folder}/00 ${safe(item.guide.title)}.pdf`, file: item.guide });
            item.templates.forEach((t, i) => {
                out.push({ zipPath: `${item.folder}/${String(i + 1).padStart(2, "0")} ${safe(t.title)}.${extOf(t.localPath)}`, file: t });
            });
        }
    }

    // Bonus
    out.push({ zipPath: `${BONUS_ITEM.folder}/00 ${safe(BONUS_ITEM.guide.title)}.pdf`, file: BONUS_ITEM.guide });
    BONUS_ITEM.templates.forEach((t, i) => {
        out.push({ zipPath: `${BONUS_ITEM.folder}/${String(i + 1).padStart(2, "0")} ${safe(t.title)}.${extOf(t.localPath)}`, file: t });
    });

    out.push({ zipPath: "ZZ - All Templates/Master Template List.pdf", file: MASTER_LIST });
    return out;
}

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ token: string }> },
) {
    const { token } = await params;

    // ── Token validation ──
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
    if (lookupErr || !purchase) return new NextResponse("Access denied", { status: 403 });
    if (purchase.refunded_at) return new NextResponse("Refunded — access revoked", { status: 403 });

    // ── Build ZIP from the manifest structure ──
    const zip = new JSZip();
    const entries = buildEntries();
    let added = 0;
    await Promise.all(entries.map(async ({ zipPath, file }) => {
        const abs = absOf(file.localPath);
        if (!abs) return;
        try {
            const buf = await readFile(abs);
            zip.file(zipPath, buf, { compression: "DEFLATE", compressionOptions: { level: 6 } });
            added++;
        } catch (err) {
            console.warn("[zip] skipping missing file:", file.localPath, err);
        }
    }));

    if (added === 0) {
        console.error("[zip] no kit files resolved under", PACK_DIR);
        return new NextResponse("Pack files not found", { status: 500 });
    }

    let zipBuf: Buffer;
    try {
        const ab = await zip.generateAsync({ type: "nodebuffer", streamFiles: true });
        zipBuf = Buffer.from(ab);
    } catch (err) {
        console.error("[zip] JSZip generate failed:", err);
        return new NextResponse("ZIP generation failed", { status: 500 });
    }

    return new NextResponse(zipBuf as unknown as BodyInit, {
        status: 200,
        headers: {
            "Content-Type": "application/zip",
            "Content-Length": String(zipBuf.length),
            "Content-Disposition": 'attachment; filename="Federal_Launch_Kit.zip"',
            "Cache-Control": "private, no-store",
        },
    });
}

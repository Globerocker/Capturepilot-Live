import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractFromBytes } from "@/lib/document-extract";
import { requireUser } from "@/lib/auth-server";
import { protectCrawl } from "@/lib/protect-crawl";

export const maxDuration = 60;
export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB cap
const ALLOWED_TYPES = new Set([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
    "application/msword", // .doc (mammoth handles it best-effort)
    "text/plain",
]);

/**
 * POST /api/analyze-company/upload-cap-statement
 * multipart/form-data: { file: File, analysis_id: string }
 *
 * Stores an uploaded capability statement in Supabase Storage under
 * `client-docs/capability-statements/quick-check/{analysis_id}/{timestamp}.{ext}`,
 * extracts the text, and patches the analysis row with file URL + extracted text
 * so the AI summary pipeline can use it as context.
 */
export async function POST(request: NextRequest) {
    try {
        // Gate the route: must be authenticated AND throttled per-IP, otherwise
        // anyone can stuff 10MB blobs into Supabase Storage just by knowing
        // (or guessing) a publicly enumerable analysis_id.
        const auth = await requireUser();
        if (auth instanceof NextResponse) return auth;

        const limited = protectCrawl(request, {
            route: "upload-cap-statement",
            maxPerMin: 3,
            // 1-hour window, max 3 uploads per IP per hour
            windowMs: 60 * 60 * 1000,
        });
        if (limited) return limited;

        const formData = await request.formData();
        const file = formData.get("file");
        const analysisId = String(formData.get("analysis_id") || "");

        if (!analysisId) {
            return NextResponse.json({ error: "analysis_id required" }, { status: 400 });
        }
        if (!(file instanceof File)) {
            return NextResponse.json({ error: "file required" }, { status: 400 });
        }
        if (file.size > MAX_BYTES) {
            return NextResponse.json({ error: "File exceeds 10 MB" }, { status: 413 });
        }
        if (file.type && !ALLOWED_TYPES.has(file.type) && !/\.(pdf|docx?|txt)$/i.test(file.name)) {
            return NextResponse.json({ error: "Only PDF, DOCX or TXT allowed" }, { status: 415 });
        }

        const sb = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_KEY!,
        );

        // Verify the analysis exists before we waste storage on it
        const { data: analysis } = await sb
            .from("company_analyses")
            .select("id, inferred_profile")
            .eq("id", analysisId)
            .maybeSingle();
        if (!analysis) {
            return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
        }

        const bytes = new Uint8Array(await file.arrayBuffer());

        // Upload to Supabase Storage
        const ts = Date.now();
        const safeName = file.name.replace(/[^a-z0-9._-]/gi, "_").slice(0, 80) || "capability.pdf";
        const storagePath = `capability-statements/quick-check/${analysisId}/${ts}_${safeName}`;
        const { error: uploadErr } = await sb.storage
            .from("client-docs")
            .upload(storagePath, bytes, {
                contentType: file.type || "application/octet-stream",
                upsert: false,
            });

        if (uploadErr) {
            console.error("[upload-cap-statement] storage error:", uploadErr);
            return NextResponse.json({ error: "Upload failed: " + uploadErr.message }, { status: 500 });
        }

        // `client-docs` is a private bucket (see migration 135). We persist
        // only the storage path; callers mint short-lived signed URLs on
        // demand through `/api/documents/signed-url`. Long-lived signed
        // URLs (1y) are effectively forever-valid links and defeat the
        // point of locking the bucket down — don't reintroduce them here.

        // Mint a short-lived URL so the caller can preview the upload
        // immediately. 5 minutes is plenty for the success toast +
        // "view what you uploaded" link. After that, the dashboard re-signs.
        const { data: signed } = await sb.storage
            .from("client-docs")
            .createSignedUrl(storagePath, 300);

        // Extract text — best-effort; failure just means we'll skip the AI context boost
        let extractedText = "";
        try {
            const result = await extractFromBytes(bytes, file.name);
            extractedText = (result.text || "").slice(0, 8000); // cap to keep prompt sane
        } catch (e) {
            console.warn("[upload-cap-statement] text extraction failed:", e);
        }

        // Patch the analysis row — merge into inferred_profile. We persist
        // ONLY the storage path + extracted text + display name. No long-
        // lived URL is written to the row.
        const existingProfile = (analysis.inferred_profile || {}) as Record<string, unknown>;
        await sb.from("company_analyses").update({
            inferred_profile: {
                ...existingProfile,
                cap_statement_file_name: file.name,
                cap_statement_storage_path: storagePath,
                cap_statement_text: extractedText || null,
                // Explicitly clear any legacy long-lived URL that pre-existed
                // on this row from a prior upload.
                cap_statement_file_url: null,
            },
        }).eq("id", analysisId);

        return NextResponse.json({
            success: true,
            filename: file.name,
            bytes: file.size,
            extracted_chars: extractedText.length,
            // 5-min preview URL — caller should re-sign via /api/documents/signed-url for anything longer.
            url: signed?.signedUrl || null,
            storage_path: storagePath,
        });
    } catch (e) {
        console.error("[upload-cap-statement] error:", e);
        return NextResponse.json({ error: (e as Error).message || "Upload failed" }, { status: 500 });
    }
}

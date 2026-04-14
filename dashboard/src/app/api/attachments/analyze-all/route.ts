import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Allow up to 5 minutes for batch processing on Vercel
export const maxDuration = 300;

const SAM_API_KEY = process.env.SAM_API_KEY || "";
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const BUCKET = "opportunity-attachments";

interface SamAttachment {
    name: string;
    url: string;
    type?: string;
    size?: string;
}

function admin(): SupabaseClient {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
}

export async function POST(request: NextRequest) {
    const sb = await createSupabaseServerClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: { noticeId?: string; attachments?: SamAttachment[] } = {};
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const noticeId = body.noticeId?.trim();
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];
    if (!noticeId) return NextResponse.json({ error: "noticeId required" }, { status: 400 });
    if (attachments.length === 0) {
        return NextResponse.json({ error: "No attachments to analyze" }, { status: 400 });
    }

    const sbAdmin = admin();

    // Look up user_profile_id
    const { data: profile } = await sbAdmin
        .from("user_profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();
    if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

    const profileId = (profile as unknown as { id: string }).id;

    // Create job record
    const { data: job, error: jobErr } = await sbAdmin
        .from("attachment_analysis_jobs")
        .insert({
            notice_id: noticeId,
            user_profile_id: profileId,
            status: "pending",
            files_total: attachments.length,
            files_done: 0,
        })
        .select("id")
        .single();

    if (jobErr || !job) {
        console.error("Failed to create job:", jobErr);
        return NextResponse.json({ error: "Failed to create job" }, { status: 500 });
    }

    const jobId = (job as unknown as { id: string }).id;

    // Kick off processing without awaiting full completion
    processJob(jobId, noticeId, attachments).catch((err) => {
        console.error(`[analyze-all] job ${jobId} failed:`, err);
        admin()
            .from("attachment_analysis_jobs")
            .update({
                status: "failed",
                error: String(err).slice(0, 500),
                completed_at: new Date().toISOString(),
            })
            .eq("id", jobId)
            .then(() => { /* swallow */ });
    });

    return NextResponse.json({ jobId, status: "pending" });
}

/**
 * Downloads attachments, uploads to Storage, extracts text, calls OpenAI,
 * writes results + cache timestamp to opportunities.
 */
async function processJob(
    jobId: string,
    noticeId: string,
    attachments: SamAttachment[]
): Promise<void> {
    const sb = admin();
    const MAX_BYTES_PER_FILE = 15 * 1024 * 1024; // 15 MB
    const MAX_TEXT_PER_FILE = 40_000;
    const combinedTexts: string[] = [];
    let filesDone = 0;

    await sb.from("attachment_analysis_jobs")
        .update({ status: "downloading" })
        .eq("id", jobId);

    for (const att of attachments) {
        if (!att.url) {
            filesDone++;
            continue;
        }

        await sb.from("attachment_analysis_jobs")
            .update({ current_file: att.name, files_done: filesDone })
            .eq("id", jobId);

        try {
            // Build URL with SAM API key appended if it's a SAM.gov URL
            const fetchUrl = att.url.includes("sam.gov") && !att.url.includes("api_key=")
                ? `${att.url}${att.url.includes("?") ? "&" : "?"}api_key=${SAM_API_KEY}`
                : att.url;

            const res = await fetch(fetchUrl, {
                headers: SAM_API_KEY ? { "X-Api-Key": SAM_API_KEY } : {},
                signal: AbortSignal.timeout(45_000),
            });

            if (!res.ok) {
                console.warn(`[analyze-all] ${att.name} fetch failed: ${res.status}`);
                filesDone++;
                continue;
            }

            const contentType = res.headers.get("content-type") || "";
            const buffer = await res.arrayBuffer();
            if (buffer.byteLength > MAX_BYTES_PER_FILE) {
                console.warn(`[analyze-all] ${att.name} too large, skipping`);
                filesDone++;
                continue;
            }

            // Upload to storage (best-effort — don't fail the whole job if the bucket is missing)
            try {
                const safeName = att.name.replace(/[^\w\-. ]+/g, "_").slice(0, 200);
                const path = `${noticeId}/${safeName}`;
                await sb.storage.from(BUCKET).upload(path, buffer, {
                    contentType: contentType || "application/octet-stream",
                    upsert: true,
                });
            } catch (uploadErr) {
                console.warn(`[analyze-all] storage upload failed for ${att.name}:`, uploadErr);
            }

            // Extract text — use cheap ASCII-extraction approach (same as summarize-document route)
            const text = extractText(buffer, contentType, att.name);
            if (text && text.length > 50) {
                combinedTexts.push(`=== ${att.name} ===\n${text.substring(0, MAX_TEXT_PER_FILE)}`);
            }
        } catch (err) {
            console.warn(`[analyze-all] error on ${att.name}:`, err);
        }

        filesDone++;
        await sb.from("attachment_analysis_jobs")
            .update({ files_done: filesDone })
            .eq("id", jobId);
    }

    // Call OpenAI if we have any text
    await sb.from("attachment_analysis_jobs")
        .update({ status: "extracting", current_file: null })
        .eq("id", jobId);

    let extracted: Record<string, unknown> | null = null;
    if (combinedTexts.length > 0 && OPENAI_KEY) {
        try {
            extracted = await extractRequirementsWithOpenAI(combinedTexts.join("\n\n"));
        } catch (err) {
            console.error("[analyze-all] OpenAI extraction failed:", err);
        }
    }

    // Persist to opportunities + cache timestamp
    if (extracted) {
        const cachedUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        try {
            await sb.from("opportunities")
                .update({
                    structured_requirements: extracted,
                    attachments_cached_until: cachedUntil,
                })
                .eq("notice_id", noticeId);
        } catch (err) {
            console.error("[analyze-all] failed to persist requirements:", err);
        }
    }

    await sb.from("attachment_analysis_jobs")
        .update({
            status: "completed",
            extracted_requirements: extracted,
            completed_at: new Date().toISOString(),
            files_done: filesDone,
            current_file: null,
        })
        .eq("id", jobId);
}

/**
 * Lightweight text extraction — no heavy PDF library.
 * Based on the approach used in /api/ai/summarize-document.
 */
function extractText(buffer: ArrayBuffer, contentType: string, name: string): string {
    const ext = name.split(".").pop()?.toLowerCase() || "";
    const bytes = new Uint8Array(buffer);
    const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes);

    if (contentType.includes("text/html") || ext === "html" || ext === "htm") {
        return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }

    if (contentType.includes("text/") || ext === "txt" || ext === "md") {
        return raw.replace(/\s+/g, " ").trim();
    }

    // For PDF / DOCX / DOC / binary — grab printable ASCII runs >=30 chars
    // Stream/obj noise markers common in PDFs get stripped.
    const chunks = raw.match(/[\x20-\x7E]{30,}/g) || [];
    return chunks
        .filter((c) => !/^(stream|endstream|obj|endobj|xref|trailer|<<)/i.test(c))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
}

interface ExtractedRequirements {
    [key: string]: unknown;
}

async function extractRequirementsWithOpenAI(text: string): Promise<ExtractedRequirements | null> {
    const MAX_INPUT = 60_000; // conservative ceiling for gpt-4o-mini
    const slice = text.substring(0, MAX_INPUT);

    const systemPrompt = `You are an expert government contracting analyst. Extract structured requirements from the provided federal opportunity documents. Return ONLY a JSON object with this exact structure — set any field you can't find to null:
{
  "clearance_level": "None | Public Trust | Secret | Top Secret | TS/SCI",
  "years_experience": "string like '5 years' or null",
  "min_workforce": "string or null",
  "bonding_req": "description or 'Required' or null",
  "insurance_req": "description or 'Required' or null",
  "performance_period": "e.g. '12 months base + 4 option years' or null",
  "equipment_req": "string or null",
  "certifications": "string list of required certs/licenses or null",
  "past_performance_req": "description of past performance requirements or null",
  "eval_criteria_summary": "short summary of evaluation factors or null",
  "key_personnel": "string describing required key personnel or null",
  "place_of_performance": "string or null",
  "notable_flags": ["array of short strings (e.g. 'SDVOSB set-aside', 'DBE required')"]
}`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
            model: "gpt-4o-mini",
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: slice },
            ],
            max_tokens: 1500,
            temperature: 0.1,
        }),
        signal: AbortSignal.timeout(90_000),
    });

    if (!res.ok) {
        throw new Error(`OpenAI returned ${res.status}`);
    }

    const data = await res.json();
    const content: string | undefined = data.choices?.[0]?.message?.content;
    if (!content) return null;
    try {
        return JSON.parse(content) as ExtractedRequirements;
    } catch {
        return null;
    }
}

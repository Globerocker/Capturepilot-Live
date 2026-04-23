import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractFromUrl, isMistralConfigured } from "@/lib/llm/mistral-ocr";

export const maxDuration = 300;

function getDb() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
    );
}

const SAM_API_KEY = process.env.SAM_API_KEY || "";

/**
 * Deep Enrichment Cron — runs daily, processes in chunks.
 * Each run picks up where the last one left off.
 *
 * Pipeline per opportunity:
 * 1. Fetch description from SAM.gov URL → store as text
 * 2. Download PDF/DOCX attachments → extract text → store in bucket
 * 3. Extract requirements from description + attachment text
 * 4. Estimate value from text
 * 5. Mark as enriched
 *
 * Processes ~50 opportunities per run (within 5-min Vercel limit).
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();
    const startTime = Date.now();
    const stats = { descriptions: 0, attachments: 0, requirements: 0, values: 0, errors: 0 };

    try {
        // Get opportunities that need enrichment:
        // - description is a URL (starts with https://api.sam.gov)
        // - OR structured_requirements is empty {}
        // - AND is not archived
        // - ORDER by newest first (most relevant)
        // ?limit= override for manual backfill runs; default 80 per cron run.
        const limitParam = parseInt(req.nextUrl.searchParams.get("limit") || "80", 10);
        const { data: opps } = await db
            .from("opportunities")
            .select("notice_id, description, resource_links, structured_requirements, estimated_value")
            .eq("is_archived", false)
            .or("description.like.https://api.sam.gov%,structured_requirements.eq.{}")
            .order("posted_date", { ascending: false, nullsFirst: false })
            .limit(Math.min(Math.max(limitParam, 1), 200));

        if (!opps || opps.length === 0) {
            return NextResponse.json({ success: true, message: "Nothing to enrich", ...stats });
        }

        console.log(`Deep enriching ${opps.length} opportunities...`);

        for (const opp of opps) {
            // Time check — leave 30s buffer
            if (Date.now() - startTime > 250_000) break;

            const updates: Record<string, unknown> = {};
            let fullText = "";

            // ─── Step 1: Fetch description from SAM.gov URL ───
            // SAM's /v1/noticedesc returns JSON: {"description":"<HTML>"}.
            // We unwrap the JSON then strip HTML tags.
            const desc = opp.description || "";
            if (desc.startsWith("https://api.sam.gov")) {
                try {
                    const descRes = await fetch(desc, {
                        headers: SAM_API_KEY ? { "X-Api-Key": SAM_API_KEY, Accept: "application/json" } : { Accept: "application/json" },
                        signal: AbortSignal.timeout(20000),
                    });
                    if (descRes.ok) {
                        const raw = await descRes.text();
                        let innerText = raw;
                        try {
                            const parsed = JSON.parse(raw) as { description?: string };
                            if (typeof parsed?.description === "string") innerText = parsed.description;
                        } catch { /* fall through to raw */ }
                        const text = innerText.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim().substring(0, 8000);
                        if (text.length > 50) {
                            updates.description = text;
                            fullText += text + " ";
                            stats.descriptions++;
                        }
                    }
                } catch { stats.errors++; }
            } else if (desc.length > 50) {
                fullText += desc + " ";
            }

            // ─── Step 2: Download + parse PDF attachments ───
            // PRIMARY path: Mistral OCR (when MISTRAL_API_KEY is set). Produces
            // clean Markdown with preserved layout + tables. Far better than the
            // regex fallback for dense solicitations.
            // FALLBACK: regex-based text extraction from raw PDF bytes.
            const links = (opp.resource_links || []) as string[];
            for (const link of links.slice(0, 3)) { // max 3 attachments per opp
                if (Date.now() - startTime > 240_000) break;
                if (!link || typeof link !== "string") continue;

                // Only process PDF/DOCX links
                const isPdf = link.toLowerCase().includes(".pdf") || link.includes("download");
                if (!isPdf) continue;

                // ─ Mistral OCR primary path ─
                if (isMistralConfigured()) {
                    try {
                        const ocr = await extractFromUrl(link);
                        if (ocr.full_markdown && ocr.full_markdown.length > 200) {
                            fullText += ocr.full_markdown.slice(0, 20000) + " ";
                            stats.attachments++;
                            continue; // skip the regex fallback when OCR succeeded
                        }
                    } catch {
                        // Fall through to regex path
                        stats.errors++;
                    }
                }

                try {
                    const attRes = await fetch(link, {
                        headers: SAM_API_KEY ? { "X-Api-Key": SAM_API_KEY } : {},
                        signal: AbortSignal.timeout(15000),
                        redirect: "follow",
                    });
                    if (!attRes.ok) continue;

                    const contentType = attRes.headers.get("content-type") || "";
                    const buffer = await attRes.arrayBuffer();
                    const bytes = new Uint8Array(buffer);

                    // Check if it's actually a PDF (magic bytes: %PDF)
                    if (bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
                        // Store in Supabase storage
                        const filename = `${opp.notice_id}/${Date.now()}.pdf`;
                        await db.storage.from("opportunity-attachments").upload(filename, buffer, {
                            contentType: "application/pdf",
                            upsert: true,
                        });

                        // Regex-based fallback PDF text extraction
                        const rawText = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
                        const textChunks: string[] = [];
                        const btEtRegex = /BT\s*([\s\S]*?)\s*ET/g;
                        let match;
                        while ((match = btEtRegex.exec(rawText)) !== null) {
                            const chunk = match[1];
                            const tjRegex = /\(([^)]*)\)\s*Tj/g;
                            let tjMatch;
                            while ((tjMatch = tjRegex.exec(chunk)) !== null) {
                                textChunks.push(tjMatch[1]);
                            }
                        }
                        const asciiRegex = /[\x20-\x7E]{20,}/g;
                        let asciiMatch;
                        while ((asciiMatch = asciiRegex.exec(rawText)) !== null) {
                            if (!asciiMatch[0].includes("obj") && !asciiMatch[0].includes("endobj")) {
                                textChunks.push(asciiMatch[0]);
                            }
                        }

                        const extractedText = textChunks.join(" ").substring(0, 5000);
                        if (extractedText.length > 100) {
                            fullText += extractedText + " ";
                            stats.attachments++;
                        }
                    } else if (contentType.includes("html") || contentType.includes("text")) {
                        // HTML/text attachment
                        const text = new TextDecoder().decode(bytes);
                        const cleaned = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 5000);
                        if (cleaned.length > 100) {
                            fullText += cleaned + " ";
                            stats.attachments++;
                        }
                    }
                } catch { stats.errors++; }
            }

            // ─── Step 3: Extract requirements from combined text ───
            if (fullText.length > 100) {
                const textLower = fullText.toLowerCase();
                const reqs: Record<string, unknown> = {};

                // Bonding
                const bondMatch = textLower.match(/bond(?:ing|ed)?.*?\$([\d,]+)/);
                if (bondMatch) {
                    reqs.bonding_required = true;
                    reqs.bonding_amount = "$" + bondMatch[1];
                } else if (/\bbond(?:ing|ed)?\b/.test(textLower)) {
                    reqs.bonding_required = true;
                }

                // Insurance
                const insMatch = textLower.match(/insurance.*?\$([\d,]+)/);
                if (insMatch) {
                    reqs.insurance_required = true;
                    reqs.insurance_amount = "$" + insMatch[1];
                } else if (/insurance|liability|workers.?comp/i.test(textLower)) {
                    reqs.insurance_required = true;
                }

                // Security clearance
                const clearMatch = textLower.match(/(top secret|secret|ts\/sci|confidential)\s*(clearance)?/);
                if (clearMatch) reqs.security_clearance = clearMatch[1].toUpperCase();

                // Equipment
                const equipMatches = textLower.match(/\b(fleet|truck|excavat\w*|bulldoz\w*|crane|forklift|tractor|backhoe|dump truck|loader|grader)\b/g);
                if (equipMatches) reqs.equipment_required = [...new Set(equipMatches)];

                // Experience years
                const expMatch = textLower.match(/(\d+)\s*(?:years?|yrs?)\s*(?:of\s+)?(?:experience|exp)/);
                if (expMatch) reqs.min_experience_years = parseInt(expMatch[1]);

                // Certifications
                const certs: string[] = [];
                for (const cert of ["8(a)", "hubzone", "sdvosb", "wosb", "edwosb", "iso 9001", "iso 14001", "iso 45001"]) {
                    if (textLower.includes(cert)) certs.push(cert.toUpperCase());
                }
                if (certs.length > 0) reqs.certifications_required = certs;

                // Period of performance
                const popMatch = textLower.match(/(?:period of performance|pop|base period).*?(\d+)\s*(month|year|day)/);
                if (popMatch) reqs.period_of_performance = `${popMatch[1]} ${popMatch[2]}s`;

                // Workforce/employees
                const workforceMatch = textLower.match(/(?:minimum|at least|require)\s*(\d+)\s*(?:employee|worker|personnel|staff|fte)/);
                if (workforceMatch) reqs.min_workforce = parseInt(workforceMatch[1]);

                if (Object.keys(reqs).length > 0) {
                    updates.structured_requirements = reqs;
                    stats.requirements++;
                }

                // ─── Step 4: Extract estimated value ───
                if (!opp.estimated_value) {
                    const valuePatterns = [
                        /estimated\s*(?:total\s*)?(?:value|cost|amount|price).*?\$([\d,.]+)\s*(million|m|billion|b|thousand|k)?/i,
                        /(?:total|aggregate|ceiling|not.to.exceed|nte).*?\$([\d,.]+)\s*(million|m|billion|b|thousand|k)?/i,
                        /\$([\d,.]+)\s*(million|m|billion|b)\b/i,
                    ];
                    for (const pattern of valuePatterns) {
                        const valMatch = fullText.match(pattern);
                        if (valMatch) {
                            let val = parseFloat(valMatch[1].replace(/,/g, ""));
                            const mult = (valMatch[2] || "").toLowerCase();
                            if (mult === "million" || mult === "m") val *= 1_000_000;
                            else if (mult === "billion" || mult === "b") val *= 1_000_000_000;
                            else if (mult === "thousand" || mult === "k") val *= 1_000;
                            if (val >= 1000 && val <= 100_000_000_000) {
                                updates.estimated_value = val;
                                stats.values++;
                                break;
                            }
                        }
                    }
                }
            }

            // ─── Step 5: Update opportunity ───
            if (Object.keys(updates).length > 0) {
                updates.last_crawled_at = new Date().toISOString();
                await db.from("opportunities").update(updates).eq("notice_id", opp.notice_id);
            }
        }

        console.log("Deep enrichment complete:", stats);
        return NextResponse.json({ success: true, processed: opps.length, ...stats });

    } catch (e) {
        console.error("Deep enrich error:", e);
        return NextResponse.json({ error: (e as Error).message, ...stats }, { status: 500 });
    }
}

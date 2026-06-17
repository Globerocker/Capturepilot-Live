import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";
import { HUMAN_VOICE_RULES } from "@/lib/llm/humanizer";

export const maxDuration = 180;
export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * POST /api/ai/capability-statement-for-contractor
 *
 * Admin-only. Generates a federal Capability Statement on behalf of a LEAD —
 * a SAM.gov contractor row (NOT a logged-in user_profile). The cockpit operator
 * uses this to hand a prospect a polished cap statement during outreach.
 *
 * This mirrors /api/ai/capability-statement EXACTLY in its output contract
 * (the same SSE event stream of the same 6 sections) so the existing client +
 * pdfBuilder.ts work unchanged — the only difference is the data source:
 * a `contractors` row instead of a `user_profiles` row.
 *
 * Body: { contractor_id: string }
 *
 * Events (identical to the user-profile route):
 *   - meta           { metadata, sections_total }
 *   - section_start  { index, title, key }
 *   - section_done   { index, title, key, content, word_count }
 *   - done           { total_words }
 *   - error          { message }
 */

type SectionDef = { key: string; title: string; prompt: string };

const SECTIONS: SectionDef[] = [
    {
        key: "company_overview",
        title: "Company Overview",
        prompt:
            "Write a concise 2-paragraph company overview suitable for a federal Capability Statement. " +
            "Paragraph 1: what the company does, primary service areas, years in business, geographic reach. " +
            "Paragraph 2: why they are qualified for government work (certifications, ownership, key differentiators). " +
            "120-180 words total. Active voice, no marketing fluff.",
    },
    {
        key: "core_competencies",
        title: "Core Competencies",
        prompt:
            "Produce a bullet list of 6-10 core competencies aligned to the company's NAICS codes and services. " +
            "Each bullet must be 3-8 words, specific, and phrased as a capability a Contracting Officer would recognize. " +
            "Format: start each line with '- '. No numbering, no sub-bullets.",
    },
    {
        key: "differentiators",
        title: "Differentiators",
        prompt:
            "Write 4-6 bullets describing what sets this company apart from competitors. " +
            "Focus on: set-aside certifications, specialized equipment, response time, safety/quality record, " +
            "geographic coverage, staff credentials. Start each bullet with '- '. Keep each to 1-2 short sentences.",
    },
    {
        key: "past_performance",
        title: "Past Performance",
        prompt:
            "Write 2-3 past performance entries. Format each as a short paragraph with bold-style lead: " +
            "'Client Type — Scope / Value / Outcome'. Use real projects when mentioned, otherwise write 'Representative Project —' " +
            "and create plausible examples aligned to the company's NAICS and services. Keep each entry to 40-70 words.",
    },
    {
        key: "certifications_codes",
        title: "NAICS Codes & Certifications",
        prompt:
            "Output a clean two-section list. Section 1 titled 'NAICS Codes:' with one line per NAICS code in format " +
            "'<code> — <short description>'. Section 2 titled 'Certifications & Registrations:' with one line per item " +
            "(SBA certifications, UEI, CAGE, state/local registrations). Use '- ' bullets under each section header. " +
            "If no data, write 'None on file.'",
    },
    {
        key: "contact",
        title: "Contact Information",
        prompt:
            "Output a clean contact block: Company, Address, Phone, Email, Website, UEI, CAGE. " +
            "One label per line in 'Label: value' format. Skip any field with no value. No prose, no headings.",
    },
];

function sseEvent(event: string, data: unknown): Uint8Array {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    return new TextEncoder().encode(payload);
}

/** Coerce assorted array-of-objects/strings shapes into a flat string array. */
function toStrArray(v: unknown): string[] {
    if (!Array.isArray(v)) return [];
    return v
        .map((x) =>
            typeof x === "string"
                ? x
                : x && typeof x === "object"
                    ? String((x as any).type || (x as any).name || (x as any).label || "")
                    : "",
        )
        .filter(Boolean);
}

export async function POST(req: NextRequest) {
    // Admin gate first — this generates on behalf of a lead, never a self-serve user.
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const OPENAI_KEY = process.env.OPENAI_API_KEY;

    const body = await req.json().catch(() => ({}));
    const { contractor_id } = body as { contractor_id?: string };

    const stream = new ReadableStream({
        async start(controller) {
            const send = (event: string, data: unknown) => controller.enqueue(sseEvent(event, data));

            try {
                if (!OPENAI_KEY) {
                    send("error", { message: "OpenAI not configured" });
                    controller.close();
                    return;
                }
                if (!contractor_id) {
                    send("error", { message: "contractor_id required" });
                    controller.close();
                    return;
                }

                const db = createClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.SUPABASE_SERVICE_KEY!,
                    { auth: { persistSession: false } },
                );
                const { data: contractor } = await db
                    .from("contractors")
                    .select(
                        "id, uei, cage_code, company_name, website, email, primary_poc_name, primary_poc_email, primary_poc_title, " +
                        "phone, direct_phone, naics_codes, certifications, sba_certifications, state, city, address_line_1, address_line_2, zip_code, " +
                        "employee_count, years_in_business, federal_awards_count, capability_summary_ai",
                    )
                    .eq("id", contractor_id)
                    .single();

                if (!contractor) {
                    send("error", { message: "Contractor not found" });
                    controller.close();
                    return;
                }

                const c = contractor as any;
                const blob = (c.capability_summary_ai || {}) as any;

                // Assemble the capability narrative from the QC enrichment blob: services,
                // strengths, and the human-readable findings summary the match-drop pipeline
                // already wrote. These stand in for the user-supplied transcript / past
                // projects the self-serve route gets from its form.
                const services = toStrArray(blob.services);
                const strengths = toStrArray(blob.strengths);
                const naicsCodes = toStrArray(c.naics_codes);
                const certifications = [
                    ...toStrArray(c.sba_certifications),
                    ...toStrArray(c.certifications),
                ].filter((v, i, a) => a.indexOf(v) === i);
                const contactName = c.primary_poc_name || null;
                const contactEmail = c.email || c.primary_poc_email || null;
                const contactPhone = c.phone || c.direct_phone || null;
                const address = [c.address_line_1, c.address_line_2, c.city, c.state, c.zip_code].filter(Boolean).join(", ");

                const metadata = {
                    company_name: c.company_name,
                    naics_codes: naicsCodes,
                    certifications,
                    uei: c.uei,
                    cage_code: c.cage_code,
                    contact: contactName,
                    phone: contactPhone,
                    email: contactEmail,
                    website: c.website,
                    address,
                    logo_url: null,
                    primary_color: "#0a3d62",
                };

                send("meta", { metadata, sections_total: SECTIONS.length });

                const companyContext = `
COMPANY DATA (from SAM.gov contractor record):
Name: ${c.company_name}
Contact: ${contactName || "N/A"}${c.primary_poc_title ? ` (${c.primary_poc_title})` : ""}
Address: ${address || "N/A"}
Phone: ${contactPhone || "N/A"}
Email: ${contactEmail || "N/A"}
Website: ${c.website || "N/A"}
UEI: ${c.uei || "Not registered"}
CAGE: ${c.cage_code || "N/A"}
NAICS Codes: ${naicsCodes.join(", ") || "None listed"}
Certifications: ${certifications.join(", ") || "None"}
Employees: ${c.employee_count || "N/A"}
Years in Business: ${c.years_in_business || "N/A"}
Federal Awards: ${c.federal_awards_count || 0}

${services.length ? `SERVICES (from capability analysis):\n${services.slice(0, 20).join(", ")}\n` : ""}
${strengths.length ? `STRENGTHS (from capability analysis):\n${strengths.slice(0, 15).join("; ")}\n` : ""}
${blob.findings_summary ? `CAPABILITY FINDINGS:\n${String(blob.findings_summary)}\n` : ""}
${blob.capability_summary ? `CAPABILITY SUMMARY:\n${String(blob.capability_summary)}\n` : ""}`.trim();

                let totalWords = 0;

                for (let i = 0; i < SECTIONS.length; i++) {
                    const section = SECTIONS[i];
                    send("section_start", { index: i, key: section.key, title: section.title });

                    let content = "";
                    try {
                        const res = await fetch("https://api.openai.com/v1/chat/completions", {
                            method: "POST",
                            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_KEY}` },
                            body: JSON.stringify({
                                model: "gpt-4o-mini",
                                messages: [
                                    {
                                        role: "system",
                                        content:
                                            `${HUMAN_VOICE_RULES}\n\n` +
                                            "You are drafting Capability Statement sections that Contracting Officers expect: factual, specific, scannable. " +
                                            "Honor the formatting rules in the user prompt exactly (bullets with '- ', no numbering, etc.).",
                                    },
                                    { role: "user", content: `${section.prompt}\n\n${companyContext}` },
                                ],
                                max_tokens: 700,
                                temperature: 0.25,
                            }),
                        });

                        if (res.ok) {
                            const data = await res.json();
                            content = (data.choices?.[0]?.message?.content || "").trim();
                        } else {
                            const errText = await res.text().catch(() => "");
                            console.error(
                                `[cap-statement-for-contractor] OpenAI ${res.status} on section "${section.key}" for contractor ${contractor_id}: ${errText.slice(0, 500)}`,
                            );
                            content = `(Section failed: OpenAI returned ${res.status})`;
                        }
                    } catch (e) {
                        console.error(
                            `[cap-statement-for-contractor] OpenAI threw on section "${section.key}" for contractor ${contractor_id}:`,
                            e,
                        );
                        content = `(Section failed: ${(e as Error).message})`;
                    }

                    const wc = content.split(/\s+/).filter(Boolean).length;
                    totalWords += wc;
                    send("section_done", { index: i, key: section.key, title: section.title, content, word_count: wc });
                }

                send("done", { total_words: totalWords });
                controller.close();
            } catch (e) {
                console.error("[cap-statement-for-contractor] fatal:", e);
                send("error", { message: (e as Error).message });
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    });
}

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 180;
export const dynamic = "force-dynamic";

/**
 * POST /api/ai/capability-statement
 *
 * Streams Server-Sent Events so the UI can render a real progress bar.
 * Events:
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

export async function POST(req: NextRequest) {
    const OPENAI_KEY = process.env.OPENAI_API_KEY;

    const body = await req.json().catch(() => ({}));
    const {
        user_profile_id,
        voice_transcript,
        past_projects,
        differentiators,
        additional_text,
        brand,
    } = body as {
        user_profile_id?: string;
        voice_transcript?: string;
        past_projects?: string;
        differentiators?: string;
        additional_text?: string;
        brand?: {
            primary_color?: string;
            logo_url?: string;
            company_name?: string;
            description?: string;
            services?: string[];
            past_clients?: string[];
            project_portfolio?: string[];
        };
    };

    const stream = new ReadableStream({
        async start(controller) {
            const send = (event: string, data: unknown) => controller.enqueue(sseEvent(event, data));

            try {
                if (!OPENAI_KEY) {
                    send("error", { message: "OpenAI not configured" });
                    controller.close();
                    return;
                }
                if (!user_profile_id) {
                    send("error", { message: "user_profile_id required" });
                    controller.close();
                    return;
                }

                const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
                const { data: profile } = await db
                    .from("user_profiles")
                    .select("company_name, naics_codes, sba_certifications, state, city, address_line_1, zip_code, website, phone, email, contact_name, employee_count, revenue, years_in_business, federal_awards_count, company_description, uei, cage_code")
                    .eq("id", user_profile_id)
                    .single();

                if (!profile) {
                    send("error", { message: "Profile not found" });
                    controller.close();
                    return;
                }

                const metadata = {
                    company_name: brand?.company_name || profile.company_name,
                    naics_codes: profile.naics_codes || [],
                    certifications: profile.sba_certifications || [],
                    uei: profile.uei,
                    cage_code: profile.cage_code,
                    contact: profile.contact_name,
                    phone: profile.phone,
                    email: profile.email,
                    website: profile.website,
                    address: [profile.address_line_1, profile.city, profile.state, profile.zip_code].filter(Boolean).join(", "),
                    logo_url: brand?.logo_url || null,
                    primary_color: brand?.primary_color || "#0a3d62",
                };

                send("meta", { metadata, sections_total: SECTIONS.length });

                const companyContext = `
COMPANY DATA (from profile):
Name: ${profile.company_name}
Contact: ${profile.contact_name || "N/A"}
Address: ${[profile.address_line_1, profile.city, profile.state, profile.zip_code].filter(Boolean).join(", ") || "N/A"}
Phone: ${profile.phone || "N/A"}
Email: ${profile.email || "N/A"}
Website: ${profile.website || "N/A"}
UEI: ${profile.uei || "Not registered"}
CAGE: ${profile.cage_code || "N/A"}
NAICS Codes: ${(profile.naics_codes || []).join(", ") || "None listed"}
SBA Certifications: ${(profile.sba_certifications || []).join(", ") || "None"}
Employees: ${profile.employee_count || "N/A"}
Revenue: ${profile.revenue ? "$" + Number(profile.revenue).toLocaleString() : "N/A"}
Years in Business: ${profile.years_in_business || "N/A"}
Federal Awards: ${profile.federal_awards_count || 0}
Description (profile): ${profile.company_description || "N/A"}

${brand?.description ? `DESCRIPTION (from website crawl):\n${brand.description}\n` : ""}
${brand?.services?.length ? `SERVICES (from website crawl):\n${brand.services.slice(0, 20).join(", ")}\n` : ""}
${brand?.past_clients?.length ? `PAST CLIENTS (from website crawl):\n${brand.past_clients.slice(0, 15).join(", ")}\n` : ""}
${brand?.project_portfolio?.length ? `PROJECT PORTFOLIO (from website crawl):\n${brand.project_portfolio.slice(0, 10).join("; ")}\n` : ""}
${voice_transcript ? `OWNER'S DESCRIPTION (voice / transcript):\n${voice_transcript}\n` : ""}
${past_projects ? `PAST PROJECTS (user input):\n${past_projects}\n` : ""}
${differentiators ? `KEY DIFFERENTIATORS (user input):\n${differentiators}\n` : ""}
${additional_text ? `ADDITIONAL INFO:\n${additional_text}\n` : ""}`.trim();

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
                                            "You are an expert federal capture/proposal writer. You craft Capability Statement sections that Contracting Officers expect: factual, specific, scannable, no marketing fluff. " +
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
                        }
                    } catch (e) {
                        content = `(Section failed: ${(e as Error).message})`;
                    }

                    const wc = content.split(/\s+/).filter(Boolean).length;
                    totalWords += wc;
                    send("section_done", { index: i, key: section.key, title: section.title, content, word_count: wc });
                }

                send("done", { total_words: totalWords });
                controller.close();
            } catch (e) {
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

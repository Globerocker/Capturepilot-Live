import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 120;

/**
 * POST /api/ai/capability-statement
 * Generate a professional Capability Statement using AI.
 *
 * Body: {
 *   user_profile_id: string,
 *   voice_transcript?: string,    // transcribed voice input about capabilities
 *   past_projects?: string,       // text about past projects/performance
 *   differentiators?: string,     // what makes them unique
 *   additional_text?: string,     // any other input
 *   brand?: {                     // brand kit (from /api/brand)
 *     primary_color: string,
 *     logo_url: string,
 *     company_name: string,
 *   }
 * }
 *
 * Returns: {
 *   sections: Array<{ title, content }>,
 *   metadata: { company_name, naics_codes, certifications, ... },
 *   total_words: number,
 * }
 */
export async function POST(req: NextRequest) {
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) return NextResponse.json({ error: "OpenAI not configured" }, { status: 500 });

    try {
        const body = await req.json();
        const { user_profile_id, voice_transcript, past_projects, differentiators, additional_text, brand } = body;

        if (!user_profile_id) return NextResponse.json({ error: "user_profile_id required" }, { status: 400 });

        const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

        // Fetch profile
        const { data: profile } = await db.from("user_profiles")
            .select("company_name, naics_codes, sba_certifications, state, city, address_line_1, zip_code, website, phone, email, contact_name, employee_count, revenue, years_in_business, federal_awards_count, company_description, uei, cage_code")
            .eq("id", user_profile_id).single();

        if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

        // Build context from all sources
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
Description: ${profile.company_description || "N/A"}

${voice_transcript ? `OWNER'S DESCRIPTION (voice input):\n${voice_transcript}\n` : ""}
${past_projects ? `PAST PROJECTS:\n${past_projects}\n` : ""}
${differentiators ? `KEY DIFFERENTIATORS:\n${differentiators}\n` : ""}
${additional_text ? `ADDITIONAL INFO:\n${additional_text}\n` : ""}`;

        // Generate capability statement sections
        const sections = [
            {
                key: "company_overview",
                title: "Company Overview",
                prompt: "Write a compelling 2-3 paragraph company overview. Include: what the company does, how long they've been in business, their location, and what makes them qualified for government work. Be professional but accessible.",
            },
            {
                key: "core_competencies",
                title: "Core Competencies",
                prompt: "Create a bullet-point list of 6-10 core competencies based on the company's NAICS codes, services, and any mentioned capabilities. Each bullet should be a concise phrase (3-8 words). Make them specific and relevant to government contracting.",
            },
            {
                key: "past_performance",
                title: "Past Performance",
                prompt: "Write 2-3 past performance descriptions. If specific projects are mentioned, use those. Otherwise, create plausible examples based on the company's industry and capabilities. Each should include: client type, project scope, value range, outcome/results. Label any created examples as 'Representative Project'.",
            },
            {
                key: "differentiators",
                title: "Differentiators",
                prompt: "Write 3-5 key differentiators that set this company apart. Focus on: certifications, veteran/minority/women ownership, specialized equipment, geographic coverage, response time, quality certifications, safety record. Be specific.",
            },
            {
                key: "certifications_codes",
                title: "Certifications & Codes",
                prompt: "Create a clean formatted list showing: NAICS codes with descriptions, SBA certifications, UEI/CAGE codes, and any other relevant certifications or registrations. Format as a structured list.",
            },
        ];

        const generatedSections: Array<{ title: string; content: string; word_count: number }> = [];

        for (const section of sections) {
            try {
                const res = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_KEY}` },
                    body: JSON.stringify({
                        model: "gpt-4o-mini",
                        messages: [
                            {
                                role: "system",
                                content: `You are an expert government contracting consultant who writes Capability Statements for small businesses. Write professional, concise content suitable for a 1-2 page capability statement that will be shown to Contracting Officers. Use active voice. Be specific. No fluff.`,
                            },
                            {
                                role: "user",
                                content: `${section.prompt}\n\n${companyContext}`,
                            },
                        ],
                        max_tokens: 800,
                        temperature: 0.3,
                    }),
                });

                if (res.ok) {
                    const data = await res.json();
                    const content = data.choices?.[0]?.message?.content?.trim() || "";
                    generatedSections.push({
                        title: section.title,
                        content,
                        word_count: content.split(/\s+/).length,
                    });
                }
            } catch { /* skip failed section */ }
        }

        const totalWords = generatedSections.reduce((s, sec) => s + sec.word_count, 0);

        return NextResponse.json({
            success: true,
            sections: generatedSections,
            metadata: {
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
                primary_color: brand?.primary_color || "#000000",
            },
            total_words: totalWords,
            voice_input_used: !!voice_transcript,
        });

    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

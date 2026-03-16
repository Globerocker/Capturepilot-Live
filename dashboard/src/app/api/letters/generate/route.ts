import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const LETTER_PROMPTS: Record<string, string> = {
    capability_cover: `Write a Capability Statement Cover Letter. This letter accompanies a capability statement being sent to a contracting officer or agency. It should:
- Briefly introduce the company and its core competencies
- Reference relevant NAICS codes and certifications
- Express interest in upcoming opportunities
- Include a clear call-to-action to review the attached capability statement
- Professional, formal tone`,

    intro_co: `Write an Introduction Letter to a Contracting Officer. This is a first-touch outreach to build a relationship before a solicitation drops. It should:
- Introduce the company and relevant qualifications
- Show awareness of the agency's mission and needs
- Reference certifications and past performance areas
- Invite a meeting or call to discuss capabilities
- Warm but professional tone`,

    teaming_inquiry: `Write a Teaming Inquiry Letter. This letter explores a potential teaming or subcontracting arrangement with another company. It should:
- Introduce your company and complementary capabilities
- Explain the mutual benefit of teaming
- Reference the specific opportunity if provided
- Propose next steps (call, NDA, teaming agreement)
- Collaborative, professional tone`,

    intent_to_bid: `Write an Intent to Bid Letter. This is a formal notice of intent to submit a proposal for a specific opportunity. It should:
- State clearly the intent to bid
- Reference the solicitation number and title
- Briefly highlight relevant qualifications
- Confirm understanding of requirements
- Formal, confident tone`,

    past_perf_request: `Write a Past Performance Reference Request letter. This letter asks a previous client to serve as a past performance reference for a proposal. It should:
- Remind the recipient of the work performed
- Explain the new opportunity being pursued
- Specifically ask if they would serve as a reference
- Mention they may be contacted by the government
- Grateful, professional tone`,

    follow_up: `Write a Thank You / Follow-Up letter. This is a post-meeting or post-submission follow-up. It should:
- Thank the recipient for their time or consideration
- Recap key discussion points or proposal highlights
- Reiterate interest and next steps
- Keep it brief and warm
- Professional, appreciative tone`,
};

export async function POST(request: Request) {
    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );

    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { letterType, recipientName, recipientTitle, recipientOrg, opportunityTitle, additionalContext } = await request.json();
    if (!letterType || !recipientName || !recipientOrg) {
        return NextResponse.json({ error: "letterType, recipientName, and recipientOrg are required" }, { status: 400 });
    }

    const letterPrompt = LETTER_PROMPTS[letterType];
    if (!letterPrompt) {
        return NextResponse.json({ error: "Invalid letter type" }, { status: 400 });
    }

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: profile } = await admin
        .from("user_profiles")
        .select("company_name, naics_codes, sba_certifications, state, phone, website, email, city")
        .eq("auth_user_id", user.id)
        .single();

    if (!profile) {
        return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }
    const p = profile as unknown as Record<string, unknown>;

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
        return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
    }

    const companyName = (p.company_name as string) || "Our Company";
    const certs = ((p.sba_certifications as string[]) || []).join(", ") || "None";
    const naics = ((p.naics_codes as string[]) || []).join(", ") || "N/A";
    const state = (p.state as string) || "";
    const city = (p.city as string) || "";
    const phone = (p.phone as string) || "";
    const website = (p.website as string) || "";
    const email = (p.email as string) || user.email || "";

    const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    const prompt = `You are a professional government contracting correspondence writer with deep expertise in B2G (business-to-government) communications.

${letterPrompt}

SENDER (YOUR COMPANY):
- Company: ${companyName}
- NAICS Codes: ${naics}
- SBA Certifications: ${certs}
- Location: ${city ? `${city}, ` : ""}${state}
- Phone: ${phone || "N/A"}
- Website: ${website || "N/A"}
- Email: ${email || "N/A"}

RECIPIENT:
- Name: ${recipientName}
- Title: ${recipientTitle || ""}
- Organization: ${recipientOrg}

${opportunityTitle ? `REGARDING OPPORTUNITY: ${opportunityTitle}` : ""}
${additionalContext ? `ADDITIONAL CONTEXT: ${additionalContext}` : ""}

FORMAT REQUIREMENTS:
- Start with the date: ${today}
- Then recipient address block (Name, Title, Organization)
- Then "Dear ${recipientName}," salutation
- Body paragraphs (max 350 words total)
- Closing: "Sincerely," followed by a signature block with company name, phone, email
- Output ONLY the letter text, no commentary or explanations`;

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
                }),
            }
        );

        if (!response.ok) {
            const err = await response.text();
            console.error("Gemini API error:", err);
            return NextResponse.json({ error: "AI generation failed" }, { status: 500 });
        }

        const result = await response.json();
        const letterBody = result.candidates?.[0]?.content?.parts?.[0]?.text || "";

        if (!letterBody) {
            return NextResponse.json({ error: "Empty response from AI" }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            letter: {
                letterType,
                recipientName,
                recipientOrg,
                body: letterBody.trim(),
            },
        });
    } catch (err) {
        console.error("Letter generation error:", err);
        return NextResponse.json({ error: "Failed to generate letter" }, { status: 500 });
    }
}

with open("dashboard/src/app/api/ai/competitor-suggest/route.ts", "w") as f:
    f.write("""import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) return NextResponse.json({ error: "OpenAI API Key not configured" }, { status: 500 });

    try {
        const body = await req.json();
        let { domain, name, naics } = body as { domain?: string; name?: string; naics?: string[] };
        
        try {
            const authHeader = req.headers.get("authorization");
            if (authHeader) {
                const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
                    global: { headers: { Authorization: authHeader } }
                });
                const { data: { user } } = await db.auth.getUser();
                if (user) {
                    const { data: profile } = await db.from("user_profiles").select("company_name, website, naics_codes").eq("auth_user_id", user.id).single();
                    if (profile) {
                        domain = domain || profile.website;
                        name = name || profile.company_name;
                        naics = naics || profile.naics_codes;
                    }
                }
            }
        } catch { /* best-effort fallback */ }

        if (!domain && !name) {
            return NextResponse.json({ error: "Please provide a domain or company name." }, { status: 400 });
        }

        const promptContext = `
The user is a B2G (Business to Government) contractor.
Company Name: ${name || "Unknown"}
Website: ${domain || "Unknown"}
NAICS Codes: ${naics?.join(", ") || "Unknown"}

Suggest exactly 3 to 5 realistic federal contracting competitors for this company based on their domain and NAICS codes.
If the company is highly regional, try to infer the region from their name/domain or provide national competitors in the same niche.

Respond ONLY with valid JSON in this exact strict structure:
{
  "competitors": [
    {
      "name": "Competitor Name",
      "domain": "competitorwebsite.com",
      "reason": "Brief 1-sentence explanation of why they are a competitor (e.g. overlapping NAICS, same state, frequent bids)."
    }
  ]
}
`;

        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${OPENAI_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o",
                messages: [
                    { role: "system", content: "You are a federal contracting market research expert. You only output valid JSON arrays." },
                    { role: "user", content: promptContext }
                ],
                temperature: 0.3,
                max_tokens: 500,
                response_format: { type: "json_object" }
            })
        });

        if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`OpenAI API Error: ${res.status} ${errBody}`);
        }

        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || '{"competitors":[]}';
        let parsed;
        try {
            parsed = JSON.parse(content);
        } catch {
            return NextResponse.json({ error: "Failed to parse OpenAI response." }, { status: 500 });
        }

        return NextResponse.json({ success: true, competitors: parsed.competitors || [] });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
""")
print("endpoint fixed")

/**
 * POST /api/feature-request
 *
 * Accepts a user's feedback from FeatureRequestForm, creates a HubSpot
 * support ticket tagged with the 48hr SLA when urgency is important/blocking,
 * and also persists a row in the local feature_requests table so we can
 * surface them in /admin without depending on HubSpot uptime.
 *
 * Auth: requires a logged-in user via Supabase session. Anonymous feedback
 * is rejected — that's what HubSpot Conversations chat is for.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createSupportTicket } from "@/lib/hubspot";

export const runtime = "nodejs";

interface RequestBody {
    category?: "bug" | "feature" | "question" | "other";
    title?: string;
    description?: string;
    urgency?: "nice_to_have" | "important" | "blocking";
    context_feature?: string | null;
}

export async function POST(req: NextRequest) {
    // Read body first so we can validate before touching the DB.
    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const title = (body.title || "").trim();
    const description = (body.description || "").trim();
    const category = body.category || "other";
    const urgency = body.urgency || "nice_to_have";

    if (!title || title.length < 3) {
        return NextResponse.json({ error: "title required (min 3 chars)" }, { status: 400 });
    }
    if (!description || description.length < 10) {
        return NextResponse.json({ error: "description required (min 10 chars)" }, { status: 400 });
    }
    if (!["bug", "feature", "question", "other"].includes(category)) {
        return NextResponse.json({ error: "invalid category" }, { status: 400 });
    }
    if (!["nice_to_have", "important", "blocking"].includes(urgency)) {
        return NextResponse.json({ error: "invalid urgency" }, { status: 400 });
    }

    // Read the user from the Supabase session — refuse anonymous submissions.
    const cookieStore = await cookies();
    const sbAuth = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll: () => cookieStore.getAll(),
                setAll: () => {},
            },
        },
    );
    const { data: { user } } = await sbAuth.auth.getUser();
    if (!user || !user.email) {
        return NextResponse.json({ error: "must be signed in" }, { status: 401 });
    }

    // Pull profile context (company name + plan tier) for the ticket body.
    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
    const { data: profile } = await sb
        .from("user_profiles")
        .select("id, company_name, contact_name, plan_tier")
        .eq("auth_user_id", user.id)
        .maybeSingle() as { data: { id: string; company_name: string | null; contact_name: string | null; plan_tier: string | null } | null };

    // Fire the HubSpot ticket first (the slower op) — we still persist
    // locally even if HubSpot fails so the request isn't lost.
    const ticket = await createSupportTicket({
        subject: `[${category}] ${title}`,
        body: description,
        category,
        urgency,
        requester_email: user.email,
        requester_name: profile?.contact_name || null,
        plan_tier: profile?.plan_tier || null,
        context_feature: body.context_feature || null,
    });

    // Persist locally for /admin dashboards + as a HubSpot-outage fallback.
    // Insert is best-effort — if the table doesn't exist (migration not yet
    // run), we just skip the persist and rely on HubSpot.
    let localId: string | null = null;
    try {
        const { data: row } = await sb
            .from("feature_requests")
            .insert({
                user_profile_id: profile?.id || null,
                requester_email: user.email,
                category,
                title,
                description,
                urgency,
                context_feature: body.context_feature || null,
                hubspot_ticket_id: ticket?.id || null,
                status: "open",
            })
            .select("id")
            .single() as { data: { id: string } | null };
        localId = row?.id || null;
    } catch (e) {
        console.warn("[feature-request] local persist skipped:", (e as Error).message);
    }

    if (!ticket && !localId) {
        return NextResponse.json({ error: "Failed to record request — please try again" }, { status: 502 });
    }

    return NextResponse.json({
        ok: true,
        ticket_id: ticket?.id || localId,
        sla_promise_hours: urgency === "nice_to_have" ? null : 48,
    });
}

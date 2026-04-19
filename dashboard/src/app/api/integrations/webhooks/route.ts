import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

export const maxDuration = 30;

/**
 * Webhook subscription management (for Zapier + custom integrations).
 *
 *   GET    /api/integrations/webhooks               — list
 *   POST   /api/integrations/webhooks               — create
 *          body: { url, events: string[], secret?: string }
 *   DELETE /api/integrations/webhooks?id=<uuid>     — disable
 *
 * Also dual-hosts the Zapier REST hooks spec:
 *   POST /api/integrations/webhooks?zapier=subscribe
 *     auth: Bearer <zapier_token>  body: { target_url, event }
 *   DELETE ?zapier=unsubscribe&id=<uuid>
 */

async function getUserProfileId(): Promise<string | null> {
    const cookieStore = await cookies();
    const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data } = await admin.from("user_profiles").select("id").eq("auth_user_id", user.id).single();
    return (data?.id as string) || null;
}

// Token-based auth for Zapier
async function getUserProfileIdViaToken(req: NextRequest): Promise<string | null> {
    const { extractBearer, resolveToken } = await import("@/lib/api-token");
    const token = extractBearer(req.headers.get("authorization"));
    const resolved = await resolveToken(token, "zapier");
    return resolved?.userProfileId || null;
}

function admin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
}

export async function GET() {
    const userProfileId = await getUserProfileId();
    if (!userProfileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data } = await admin()
        .from("webhook_endpoints")
        .select("id, url, events, active, created_at")
        .eq("user_profile_id", userProfileId)
        .order("created_at", { ascending: false });

    return NextResponse.json({ webhooks: data || [] });
}

export async function POST(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const zapierMode = searchParams.get("zapier") === "subscribe";

    const userProfileId = zapierMode
        ? await getUserProfileIdViaToken(req)
        : await getUserProfileId();
    if (!userProfileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));

    const url = zapierMode ? (body.target_url as string) : (body.url as string);
    const events: string[] = zapierMode
        ? [(body.event as string) || "pursuit.added"]
        : (body.events as string[]) || ["pursuit.added"];

    if (!url || !/^https:\/\//.test(url)) {
        return NextResponse.json({ error: "https URL required" }, { status: 400 });
    }

    const secret = (body.secret as string) || randomBytes(24).toString("base64url");

    const { data, error } = await admin()
        .from("webhook_endpoints")
        .insert({
            user_profile_id: userProfileId,
            url,
            events,
            secret,
            active: true,
        })
        .select("id, url, events, active, created_at")
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
        id: data.id,
        url: data.url,
        events: data.events,
        secret: zapierMode ? undefined : secret,
    });
}

export async function DELETE(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const zapierMode = searchParams.get("zapier") === "unsubscribe";

    const userProfileId = zapierMode
        ? await getUserProfileIdViaToken(req)
        : await getUserProfileId();
    if (!userProfileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const { error } = await admin()
        .from("webhook_endpoints")
        .update({ active: false })
        .eq("id", id)
        .eq("user_profile_id", userProfileId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}

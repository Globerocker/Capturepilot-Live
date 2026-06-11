import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";
import { isSentiment } from "@/lib/outreach/sentiment";

export const dynamic = "force-dynamic";

function admin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );
}

/**
 * GET /api/admin/outreach/replies
 *   ?sentiment=positive|negative|...
 *   ?handled=true|false|unhandled
 *   ?campaign_id=<uuid>
 *   ?q=<search>
 *   ?unhandled=true        (shorthand for handled=false — used by the nav badge poller)
 *   ?count_only=true       (returns { total, unhandled } only)
 *   ?limit=<n>             (default 200, max 500)
 */
export async function GET(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const { searchParams } = new URL(req.url);
    const sentiment = searchParams.get("sentiment");
    const handledRaw = searchParams.get("handled");
    const unhandledShort = searchParams.get("unhandled") === "true";
    const campaignId = searchParams.get("campaign_id");
    const q = (searchParams.get("q") || "").trim();
    const countOnly = searchParams.get("count_only") === "true";
    const limit = Math.min(parseInt(searchParams.get("limit") || "200", 10) || 200, 500);

    const db = admin();

    if (countOnly) {
        const [total, unhandled] = await Promise.all([
            db.from("outreach_replies").select("id", { count: "exact", head: true }),
            db.from("outreach_replies").select("id", { count: "exact", head: true }).eq("is_handled", false),
        ]);
        return NextResponse.json({
            total: total.count || 0,
            unhandled: unhandled.count || 0,
        });
    }

    let query = db
        .from("outreach_replies")
        .select(
            `id, from_email, from_name, to_email, subject, snippet, body_text,
             received_at, sentiment, sentiment_source, intent, confidence,
             meeting_url, is_handled, handled_at, notes,
             campaign_id, contact_id, step_id,
             outreach_campaigns ( id, name ),
             outreach_contacts ( id, email, first_name, last_name, company_name )`
        )
        .order("received_at", { ascending: false })
        .limit(limit);

    if (sentiment && sentiment !== "all" && isSentiment(sentiment)) {
        query = query.eq("sentiment", sentiment);
    }
    if (unhandledShort) {
        query = query.eq("is_handled", false);
    } else if (handledRaw === "true") {
        query = query.eq("is_handled", true);
    } else if (handledRaw === "false" || handledRaw === "unhandled") {
        query = query.eq("is_handled", false);
    }
    if (campaignId) {
        query = query.eq("campaign_id", campaignId);
    }
    if (q) {
        // Escape commas/parens that PostgREST treats as syntax.
        const safe = q.replace(/[%(),]/g, " ").trim();
        if (safe) {
            query = query.or(
                `subject.ilike.%${safe}%,body_text.ilike.%${safe}%,snippet.ilike.%${safe}%,from_email.ilike.%${safe}%`
            );
        }
    }

    const { data, error } = await query;
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Unhandled count alongside the page so the badge stays in sync.
    const { count: unhandledCount } = await db
        .from("outreach_replies")
        .select("id", { count: "exact", head: true })
        .eq("is_handled", false);

    return NextResponse.json({
        replies: data || [],
        unhandled: unhandledCount || 0,
    });
}

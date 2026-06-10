/**
 * GET  /api/admin/outreach/contacts — filtered + paginated list
 * POST /api/admin/outreach/contacts — create a single contact
 *
 * Filters (all optional, all repeatable):
 *   ?source=apollo&source=sam_gov
 *   ?tag=cold-outreach&tag=fy25
 *   ?naics=541330                (prefix match, repeatable)
 *   ?state=VA&state=DC
 *   ?engagement=7d|30d|never
 *   ?status=subscribed|unsubscribed|bounced
 *   ?q=foo                       (matches email, name, company)
 *   ?list_id=<uuid>              (members of a saved list)
 *   ?limit=50&offset=0
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getServiceClient } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
    const { unauth } = await requireAdmin();
    if (unauth) return unauth;

    const sp = req.nextUrl.searchParams;
    const limit = Math.min(Number(sp.get("limit") || 50), 200);
    const offset = Math.max(Number(sp.get("offset") || 0), 0);

    const sources = sp.getAll("source").filter(Boolean);
    const tags = sp.getAll("tag").filter(Boolean);
    const naicsList = sp.getAll("naics").filter(Boolean);
    const states = sp.getAll("state").filter(Boolean);
    const engagement = sp.get("engagement");
    const status = sp.get("status");
    const q = sp.get("q")?.trim();
    const listId = sp.get("list_id");

    const sb = getServiceClient();

    // List membership filter first — fetches matching contact_ids, then we join.
    let listMemberIds: string[] | null = null;
    if (listId) {
        const { data: members } = await sb
            .from("outreach_list_members")
            .select("contact_id")
            .eq("list_id", listId)
            .limit(5000);
        listMemberIds = (members || []).map(m => m.contact_id);
        if (listMemberIds.length === 0) {
            return NextResponse.json({ contacts: [], total: 0, limit, offset });
        }
    }

    let query = sb
        .from("outreach_contacts")
        .select(
            "id, email, phone, first_name, last_name, company_name, title, naics_codes, state, source, tags, engagement_score, last_engagement_at, last_bounced_at, opted_out_at, created_at",
            { count: "estimated" }
        )
        .order("last_engagement_at", { ascending: false, nullsFirst: false })
        .range(offset, offset + limit - 1);

    if (sources.length) query = query.in("source", sources);
    if (states.length) query = query.in("state", states);
    if (tags.length) query = query.overlaps("tags", tags);
    if (listMemberIds) query = query.in("id", listMemberIds);

    // NAICS prefix match via OR of `naics_codes cs '{prefix...}'` — use ILIKE on text repr.
    if (naicsList.length) {
        // Postgres array prefix isn't trivial in PostgREST; we fan out OR clauses
        // that match any element that starts with the prefix.
        const orClauses = naicsList.map(p => `naics_codes.cs.{${p}}`).join(",");
        query = query.or(orClauses);
    }

    if (engagement === "7d") {
        const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
        query = query.gte("last_engagement_at", cutoff);
    } else if (engagement === "30d") {
        const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
        query = query.gte("last_engagement_at", cutoff);
    } else if (engagement === "never") {
        query = query.is("last_engagement_at", null);
    }

    if (status === "subscribed") {
        query = query.is("opted_out_at", null).is("last_bounced_at", null);
    } else if (status === "unsubscribed") {
        query = query.not("opted_out_at", "is", null);
    } else if (status === "bounced") {
        query = query.not("last_bounced_at", "is", null);
    }

    if (q) {
        const safe = q.replace(/[%,]/g, "");
        query = query.or(
            `email.ilike.%${safe}%,first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,company_name.ilike.%${safe}%`
        );
    }

    const { data, error, count } = await query;
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ contacts: data || [], total: count ?? 0, limit, offset });
}

export async function POST(req: NextRequest) {
    const { unauth } = await requireAdmin();
    if (unauth) return unauth;

    const body = await req.json().catch(() => ({}));
    const {
        email, phone, first_name, last_name, company_name, title,
        naics_codes, state, source, source_id, tags, custom_fields
    } = body || {};

    if (!email && !phone) {
        return NextResponse.json({ error: "email or phone required" }, { status: 400 });
    }

    const sb = getServiceClient();
    const row = {
        email: email ? String(email).toLowerCase() : null,
        phone: phone || null,
        first_name: first_name || null,
        last_name: last_name || null,
        company_name: company_name || null,
        title: title || null,
        naics_codes: Array.isArray(naics_codes) ? naics_codes : [],
        state: state || null,
        source: source || "manual_import",
        source_id: source_id || null,
        tags: Array.isArray(tags) ? tags : [],
        custom_fields: custom_fields || {},
    };

    const { data, error } = await sb
        .from("outreach_contacts")
        .upsert(row, { onConflict: "email", ignoreDuplicates: false })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ contact: data });
}

import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/backlinks/admin-client";
import { assertAdmin } from "@/lib/auth-admin";

/**
 * Full prospect detail: prospect row + all contacts + all outreach
 * (ordered newest first) + todos scoped to this prospect + any
 * acquired/observed links for the domain.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const unauth = await assertAdmin();
  if (unauth) return unauth;
  const { id } = await params;
  const admin = adminSupabase();

  const [{ data: prospect }, { data: contacts }, { data: outreach }, { data: todos }] = await Promise.all([
    admin.from("backlink_prospects").select("*").eq("id", id).maybeSingle(),
    admin.from("backlink_contacts").select("*").eq("prospect_id", id).order("created_at", { ascending: true }),
    admin.from("backlink_outreach").select("*").eq("prospect_id", id).order("created_at", { ascending: false }),
    admin.from("backlink_todos").select("*").eq("prospect_id", id).order("status").order("created_at", { ascending: false }),
  ]);

  if (!prospect) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Acquired-link records: match by source_url containing this domain.
  const { data: monitor } = await admin
    .from("backlink_monitor")
    .select("*")
    .ilike("source_url", `%${prospect.domain}%`)
    .order("first_seen", { ascending: false });

  return NextResponse.json({
    prospect,
    contacts: contacts || [],
    outreach: outreach || [],
    todos: todos || [],
    monitor: monitor || [],
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const unauth = await assertAdmin();
  if (unauth) return unauth;
  const { id } = await params;
  const patch = await req.json();
  const admin = adminSupabase();
  const { error } = await admin.from("backlink_prospects").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

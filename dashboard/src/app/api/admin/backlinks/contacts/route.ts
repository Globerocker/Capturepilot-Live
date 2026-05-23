import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/backlinks/admin-client";
import { assertAdmin } from "@/lib/auth-admin";

/**
 * Manual contact CRUD on backlink_contacts.
 *
 * POST with id     → patch existing
 * POST without id  → upsert (prospect_id + email is the unique key)
 * DELETE ?id=...   → remove
 */
export async function POST(req: NextRequest) {
  const unauth = await assertAdmin();
  if (unauth) return unauth;
  const body = await req.json();
  const admin = adminSupabase();

  if (body.id) {
    const { id, ...patch } = body;
    const { error } = await admin.from("backlink_contacts").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (!body.prospect_id || !body.email) {
    return NextResponse.json({ error: "prospect_id + email required" }, { status: 400 });
  }
  body.email = String(body.email).toLowerCase().trim();
  if (!body.source) body.source = "manual";
  if (!body.email_confidence) body.email_confidence = "verified";

  const { data, error } = await admin
    .from("backlink_contacts")
    .upsert(body, { onConflict: "prospect_id,email" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, contact: data });
}

export async function DELETE(req: NextRequest) {
  const unauth = await assertAdmin();
  if (unauth) return unauth;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const admin = adminSupabase();
  const { error } = await admin.from("backlink_contacts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

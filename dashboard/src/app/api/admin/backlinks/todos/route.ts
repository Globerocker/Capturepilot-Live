import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/backlinks/admin-client";
import { assertAdmin } from "@/lib/auth-admin";

export async function POST(req: NextRequest) {
  const unauth = await assertAdmin();
  if (unauth) return unauth;
  const body = await req.json();
  const admin = adminSupabase();
  if (body.id) {
    const { id, ...patch } = body;
    if (patch.status === "done" && !patch.completed_at) patch.completed_at = new Date().toISOString();
    const { error } = await admin.from("backlink_todos").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  const { data, error } = await admin.from("backlink_todos").insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, todo: data });
}

export async function DELETE(req: NextRequest) {
  const unauth = await assertAdmin();
  if (unauth) return unauth;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const admin = adminSupabase();
  const { error } = await admin.from("backlink_todos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

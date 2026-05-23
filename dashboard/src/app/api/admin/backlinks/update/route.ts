import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/backlinks/admin-client";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { id, ...patch } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const admin = adminSupabase();
  const { error } = await admin.from("backlink_prospects").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

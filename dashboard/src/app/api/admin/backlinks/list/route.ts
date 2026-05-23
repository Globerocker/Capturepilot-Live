import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/backlinks/admin-client";
import { assertAdmin } from "@/lib/auth-admin";

export async function GET(req: NextRequest) {
  const unauth = await assertAdmin();
  if (unauth) return unauth;
  const admin = adminSupabase();
  const tier = req.nextUrl.searchParams.get("tier");
  const status = req.nextUrl.searchParams.get("status");
  let q = admin
    .from("backlink_prospects")
    .select("*, backlink_contacts(*), backlink_outreach(*)")
    .order("tier", { ascending: true })
    .order("authority_score", { ascending: false, nullsFirst: false })
    .limit(500);
  if (tier) q = q.eq("tier", parseInt(tier, 10));
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const [{ data: agents }, { data: todos }] = await Promise.all([
    admin.from("backlink_agents").select("*").order("name"),
    admin.from("backlink_todos").select("*").order("status").order("priority", { ascending: false }),
  ]);

  return NextResponse.json({ prospects: data || [], agents: agents || [], todos: todos || [] });
}

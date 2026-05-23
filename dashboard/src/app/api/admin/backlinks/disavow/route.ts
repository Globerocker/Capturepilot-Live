import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/backlinks/admin-client";

export async function GET() {
  const admin = adminSupabase();
  const { data } = await admin
    .from("backlink_agents")
    .select("last_run_summary, last_run_at")
    .eq("name", "disavow_generator")
    .single();
  const lines = (data?.last_run_summary as { disavow_lines?: string[] } | null)?.disavow_lines || [
    "# No disavow run yet — trigger the disavow_generator agent first.",
  ];
  return new NextResponse(lines.join("\n"), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="disavow-${new Date().toISOString().slice(0,10)}.txt"`,
    },
  });
}

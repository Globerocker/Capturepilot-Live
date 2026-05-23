import { NextRequest, NextResponse } from "next/server";
import { adminSupabase, recordAgentRun, authorizeCron } from "@/lib/backlinks/admin-client";

export const maxDuration = 300;
const HTTP_TIMEOUT_MS = 10000;
const BATCH = 100;

async function fetchHtml(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (CapturePilot Link Monitor)" },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    return (await res.text()).slice(0, 500_000);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function hasLinkTo(html: string, target: string): boolean {
  const targetHost = (() => {
    try { return new URL(target).host; } catch { return target; }
  })();
  // Match either full URL or host-only mention inside an href
  const hrefRe = new RegExp(`href=["']https?://(?:www\\.)?${targetHost.replace(/\./g, "\\.")}[^"']*["']`, "i");
  return hrefRe.test(html);
}

export async function GET(req: NextRequest) {
  if (!authorizeCron(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const admin = adminSupabase();

  const { data: links } = await admin
    .from("backlink_monitor")
    .select("id, source_url, target_url, is_live")
    .order("last_checked", { ascending: true, nullsFirst: true })
    .limit(BATCH);

  const summary = {
    checked: 0,
    still_live: 0,
    newly_lost: 0,
    re_found: 0,
    errors: [] as string[],
  };

  for (const link of links || []) {
    summary.checked++;
    try {
      const html = await fetchHtml(link.source_url);
      const live = html ? hasLinkTo(html, link.target_url) : false;
      const now = new Date().toISOString();

      if (live && !link.is_live) {
        await admin.from("backlink_monitor").update({
          is_live: true, last_checked: now, lost_at: null,
        }).eq("id", link.id);
        summary.re_found++;
      } else if (!live && link.is_live) {
        await admin.from("backlink_monitor").update({
          is_live: false, last_checked: now, lost_at: now,
        }).eq("id", link.id);
        summary.newly_lost++;
      } else {
        await admin.from("backlink_monitor").update({ last_checked: now }).eq("id", link.id);
        if (live) summary.still_live++;
      }
    } catch (err) {
      summary.errors.push(`${link.source_url}: ${(err as Error).message}`);
    }
  }

  const status = summary.errors.length === 0
    ? "success"
    : summary.errors.length === summary.checked ? "failure" : "partial";
  await recordAgentRun("link_monitor", status, summary, Date.now() - started);
  return NextResponse.json({ ok: true, summary });
}

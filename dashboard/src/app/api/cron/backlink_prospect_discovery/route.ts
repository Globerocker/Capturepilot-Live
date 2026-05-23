import { NextRequest, NextResponse } from "next/server";
import { fetchRefDomains } from "@/lib/backlinks/semrush";
import { classify } from "@/lib/backlinks/classify";
import { adminSupabase, recordAgentRun, authorizeCron } from "@/lib/backlinks/admin-client";

export const maxDuration = 300;

const COMPETITORS = [
  "highergov.com",
  "govtribe.com",
  "govwin.com",
  "samsearch.com",
  "ezgovopps.com",
];

const PER_COMPETITOR_LIMIT = 100;

export async function GET(req: NextRequest) {
  if (!authorizeCron(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const admin = adminSupabase();

  const summary = {
    competitors_queried: 0,
    rows_seen: 0,
    new_prospects: 0,
    updated_prospects: 0,
    spam_skipped: 0,
    press_skipped: 0,
    errors: [] as string[],
  };

  for (const competitor of COMPETITORS) {
    try {
      const rows = await fetchRefDomains(competitor, PER_COMPETITOR_LIMIT);
      summary.competitors_queried++;
      summary.rows_seen += rows.length;

      for (const row of rows) {
        const cls = classify(row);

        // Skip spam outright — we don't even want them in the table.
        if (cls.isSpam) { summary.spam_skipped++; continue; }
        // Press_unreachable goes in once so we can SEE we filtered it, but
        // status = "lost" so it never enters the Kanban.
        const status = cls.category === "press_unreachable" ? "lost" : "discovered";
        if (cls.category === "press_unreachable") summary.press_skipped++;

        // Upsert: if domain exists, append competitor to overlap[]
        const { data: existing } = await admin
          .from("backlink_prospects")
          .select("id, competitor_overlap")
          .eq("domain", row.domain)
          .maybeSingle();

        if (existing) {
          const overlap = new Set(existing.competitor_overlap || []);
          overlap.add(competitor);
          await admin
            .from("backlink_prospects")
            .update({
              authority_score: row.domain_score,
              trust_score: row.domain_trust_score,
              backlinks_num: row.backlinks_num,
              last_seen: new Date().toISOString(),
              competitor_overlap: [...overlap],
            })
            .eq("id", existing.id);
          summary.updated_prospects++;
        } else {
          await admin
            .from("backlink_prospects")
            .insert({
              domain: row.domain,
              authority_score: row.domain_score,
              trust_score: row.domain_trust_score,
              backlinks_num: row.backlinks_num,
              category: cls.category,
              tier: cls.tier,
              status,
              refdomain_source: competitor,
              competitor_overlap: [competitor],
              notes: cls.reason,
            });
          summary.new_prospects++;
        }
      }
    } catch (err) {
      summary.errors.push(`${competitor}: ${(err as Error).message}`);
    }
  }

  const status = summary.errors.length === 0
    ? "success"
    : summary.errors.length === COMPETITORS.length ? "failure" : "partial";
  await recordAgentRun("prospect_discovery", status, summary, Date.now() - started);

  return NextResponse.json({ ok: true, summary });
}

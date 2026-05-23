import { NextRequest, NextResponse } from "next/server";
import { discoverContacts, guessEmailPatterns } from "@/lib/backlinks/contact-discovery";
import { adminSupabase, recordAgentRun, authorizeCron } from "@/lib/backlinks/admin-client";

export const maxDuration = 300;
const BATCH = 20;

export async function GET(req: NextRequest) {
  if (!authorizeCron(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const admin = adminSupabase();

  // Pull prospects with status=discovered or researching and no contacts yet
  const { data: prospects } = await admin
    .from("backlink_prospects")
    .select("id, domain, tier")
    .in("status", ["discovered", "researching"])
    .order("tier", { ascending: true })
    .order("authority_score", { ascending: false, nullsFirst: false })
    .limit(BATCH);

  const summary = {
    attempted: 0,
    contacts_found: 0,
    guessed_fallback: 0,
    moved_to_contact_found: 0,
    errors: [] as string[],
  };

  for (const p of prospects || []) {
    summary.attempted++;
    try {
      const contacts = await discoverContacts(p.domain);
      const now = new Date().toISOString();

      if (contacts.length > 0) {
        for (const c of contacts) {
          await admin.from("backlink_contacts").upsert({
            prospect_id: p.id,
            email: c.email,
            full_name: c.full_name,
            role: c.role,
            email_confidence: "crawled",
            source: c.source,
          }, { onConflict: "prospect_id,email" });
        }
        summary.contacts_found += contacts.length;
        await admin.from("backlink_prospects").update({
          status: "contact_found",
          enrichment_attempted_at: now,
          enrichment_completed_at: now,
        }).eq("id", p.id);
        summary.moved_to_contact_found++;
      } else {
        // No real contact found — seed guesses for the human to vet
        for (const guess of guessEmailPatterns(p.domain)) {
          await admin.from("backlink_contacts").upsert({
            prospect_id: p.id,
            email: guess,
            role: "general_inbox",
            email_confidence: "guessed",
            source: "pattern_guess",
          }, { onConflict: "prospect_id,email" });
        }
        summary.guessed_fallback++;
        await admin.from("backlink_prospects").update({
          status: "researching",
          enrichment_attempted_at: now,
        }).eq("id", p.id);
      }
    } catch (err) {
      summary.errors.push(`${p.domain}: ${(err as Error).message}`);
    }
  }

  const status = summary.errors.length === 0
    ? "success"
    : summary.errors.length === summary.attempted ? "failure" : "partial";
  await recordAgentRun("contact_enrichment", status, summary, Date.now() - started);
  return NextResponse.json({ ok: true, summary });
}

import { NextRequest, NextResponse } from "next/server";
import { discoverContacts, guessEmailPatterns } from "@/lib/backlinks/contact-discovery";
import { adminSupabase, recordAgentRun, authorizeCron } from "@/lib/backlinks/admin-client";
import { findContactsByDomain, roleFromJobTitle } from "@/lib/hubspot";

export const maxDuration = 300;
const BATCH = 20;

/**
 * Three-stage contact discovery:
 *   1. HubSpot CRM — free, verified emails, may include LinkedIn
 *   2. Crawler — /contact, /about, /team page scrape
 *   3. Pattern guesses — editor@, editorial@, tips@
 *
 * Stages run in order; we ALWAYS persist HubSpot hits even if the crawler
 * later finds more (a known editor we've emailed before is gold).
 */
export async function GET(req: NextRequest) {
  if (!authorizeCron(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const admin = adminSupabase();

  const { data: prospects } = await admin
    .from("backlink_prospects")
    .select("id, domain, tier")
    .in("status", ["discovered", "researching"])
    .order("tier", { ascending: true })
    .order("authority_score", { ascending: false, nullsFirst: false })
    .limit(BATCH);

  const summary = {
    attempted: 0,
    hubspot_hits: 0,
    crawled_hits: 0,
    guessed_fallback: 0,
    moved_to_contact_found: 0,
    errors: [] as string[],
  };

  for (const p of prospects || []) {
    summary.attempted++;
    try {
      const now = new Date().toISOString();
      let anyVerified = false;

      // ---- Stage 1: HubSpot CRM lookup -----------------------------
      const hsContacts = await findContactsByDomain(p.domain);
      for (const c of hsContacts) {
        await admin.from("backlink_contacts").upsert({
          prospect_id: p.id,
          email: c.email,
          full_name: c.full_name,
          role: roleFromJobTitle(c.job_title),
          email_confidence: "verified",
          source: "hubspot",
          linkedin_url: c.linkedin_url,
        }, { onConflict: "prospect_id,email" });
      }
      if (hsContacts.length > 0) {
        summary.hubspot_hits += hsContacts.length;
        anyVerified = true;
      }

      // ---- Stage 2: Crawler ----------------------------------------
      const crawled = await discoverContacts(p.domain);
      for (const c of crawled) {
        await admin.from("backlink_contacts").upsert({
          prospect_id: p.id,
          email: c.email,
          full_name: c.full_name,
          role: c.role,
          email_confidence: "crawled",
          source: c.source,
        }, { onConflict: "prospect_id,email" });
      }
      if (crawled.length > 0) {
        summary.crawled_hits += crawled.length;
        anyVerified = true;
      }

      // ---- Stage 3: Pattern guesses (only if nothing real found) ----
      if (!anyVerified) {
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
      }

      // ---- Move status ---------------------------------------------
      if (anyVerified) {
        await admin.from("backlink_prospects").update({
          status: "contact_found",
          enrichment_attempted_at: now,
          enrichment_completed_at: now,
        }).eq("id", p.id);
        summary.moved_to_contact_found++;
      } else {
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

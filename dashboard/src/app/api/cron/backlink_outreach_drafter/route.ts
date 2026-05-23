import { NextRequest, NextResponse } from "next/server";
import { generatePitch, gmailComposeUrl } from "@/lib/backlinks/draft-generator";
import { adminSupabase, recordAgentRun, authorizeCron } from "@/lib/backlinks/admin-client";

export const maxDuration = 300;
const BATCH = 10;
const DEFAULT_TARGET_URL = "https://capturepilot.com/resources/agency-pain-points";

export async function GET(req: NextRequest) {
  if (!authorizeCron(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const admin = adminSupabase();

  // Prospects with contact_found status and zero outreach yet
  const { data: prospects } = await admin
    .from("backlink_prospects")
    .select("id, domain, category, tier, pitch_angle, link_target_url, link_anchor_suggestion")
    .eq("status", "contact_found")
    .eq("outreach_count", 0)
    .order("tier", { ascending: true })
    .limit(BATCH);

  const summary = {
    attempted: 0,
    drafted: 0,
    no_contact_skipped: 0,
    errors: [] as string[],
  };

  for (const p of prospects || []) {
    summary.attempted++;
    try {
      // Pick the best contact: editor > pr > unknown > general_inbox
      const { data: contacts } = await admin
        .from("backlink_contacts")
        .select("id, email, full_name, role, email_confidence")
        .eq("prospect_id", p.id)
        .order("created_at", { ascending: true });

      const order = ["editor", "pr", "unknown", "general_inbox"];
      const sorted = (contacts || []).sort((a, b) => order.indexOf(a.role || "") - order.indexOf(b.role || ""));
      const best = sorted[0];
      if (!best?.email) { summary.no_contact_skipped++; continue; }

      const pitch = await generatePitch({
        prospect_domain: p.domain,
        prospect_category: p.category || "unknown",
        prospect_tier: p.tier || 3,
        contact_name: best.full_name,
        contact_role: best.role,
        pitch_angle: p.pitch_angle,
        link_target_url: p.link_target_url || DEFAULT_TARGET_URL,
        link_anchor_suggestion: p.link_anchor_suggestion,
      });

      const composeUrl = gmailComposeUrl(best.email, pitch.subject, pitch.body_text);

      await admin.from("backlink_outreach").insert({
        prospect_id: p.id,
        contact_id: best.id,
        channel: "email",
        step: 0,
        subject: pitch.subject,
        body_text: pitch.body_text,
        body_html: pitch.body_html,
        gmail_compose_url: composeUrl,
        status: "drafted",
        generated_by: "ai",
        ai_model: "gpt-4o-mini",
      });
      await admin.from("backlink_prospects").update({
        status: "outreach_drafted",
        outreach_count: 1,
      }).eq("id", p.id);

      summary.drafted++;
    } catch (err) {
      summary.errors.push(`${p.domain}: ${(err as Error).message}`);
    }
  }

  const status = summary.errors.length === 0
    ? "success"
    : summary.errors.length === summary.attempted ? "failure" : "partial";
  await recordAgentRun("outreach_drafter", status, summary, Date.now() - started);
  return NextResponse.json({ ok: true, summary });
}

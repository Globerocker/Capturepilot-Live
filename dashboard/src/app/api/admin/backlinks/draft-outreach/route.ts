import { NextRequest, NextResponse } from "next/server";
import { generatePitch, gmailComposeUrl } from "@/lib/backlinks/draft-generator";
import { adminSupabase } from "@/lib/backlinks/admin-client";
import { assertAdmin } from "@/lib/auth-admin";

const DEFAULT_TARGET_URL = "https://capturepilot.com/resources/agency-pain-points";

export async function POST(req: NextRequest) {
  const unauth = await assertAdmin();
  if (unauth) return unauth;
  const { prospect_id, contact_id, recent_context_snippet } = await req.json();
  if (!prospect_id) return NextResponse.json({ error: "prospect_id required" }, { status: 400 });

  const admin = adminSupabase();
  const { data: p } = await admin
    .from("backlink_prospects")
    .select("id, domain, category, tier, pitch_angle, link_target_url, link_anchor_suggestion")
    .eq("id", prospect_id)
    .single();
  if (!p) return NextResponse.json({ error: "prospect not found" }, { status: 404 });

  let contact = null as { id: string; email: string; full_name: string | null; role: string | null } | null;
  if (contact_id) {
    const { data } = await admin
      .from("backlink_contacts")
      .select("id, email, full_name, role")
      .eq("id", contact_id)
      .single();
    contact = data;
  } else {
    const { data } = await admin
      .from("backlink_contacts")
      .select("id, email, full_name, role")
      .eq("prospect_id", prospect_id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    contact = data;
  }
  if (!contact?.email) return NextResponse.json({ error: "no contact email" }, { status: 400 });

  const pitch = await generatePitch({
    prospect_domain: p.domain,
    prospect_category: p.category || "unknown",
    prospect_tier: p.tier || 3,
    contact_name: contact.full_name,
    contact_role: contact.role,
    pitch_angle: p.pitch_angle,
    link_target_url: p.link_target_url || DEFAULT_TARGET_URL,
    link_anchor_suggestion: p.link_anchor_suggestion,
    recent_context_snippet,
  });

  const composeUrl = gmailComposeUrl(contact.email, pitch.subject, pitch.body_text);

  const { data: inserted, error } = await admin.from("backlink_outreach").insert({
    prospect_id,
    contact_id: contact.id,
    channel: "email",
    step: 0,
    subject: pitch.subject,
    body_text: pitch.body_text,
    body_html: pitch.body_html,
    gmail_compose_url: composeUrl,
    status: "drafted",
    generated_by: "ai",
    ai_model: "gpt-4o-mini",
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("backlink_prospects").update({
    status: "outreach_drafted",
    outreach_count: 1,
  }).eq("id", prospect_id);

  return NextResponse.json({ ok: true, draft: inserted, compose_url: composeUrl });
}

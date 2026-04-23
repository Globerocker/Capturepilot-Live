import { createSupabaseServerClient } from "@/lib/supabase/server";
import OpportunitiesClient from "./OpportunitiesClient";

export const metadata = {
  title: "Opportunities | CapturePilot",
};

export default async function OpportunitiesPage() {
  const supabase = await createSupabaseServerClient();

  // Perform initial fetch for the default view:
  // page 1, limit 50, not archived, ordered by posted_date desc
  // Narrow column list — skips `raw_json` (heavy per row) and fields the
  // list view never reads. Shaves ~90% off the payload for a 50-row page.
  const LIST_COLS = "id, notice_id, title, agency, organization_code, notice_type, naics_code, response_deadline, posted_date, description, link, is_archived, estimated_value, award_amount, place_of_performance_state, place_of_performance_city, set_aside_code, incumbent_contractor_name, status, strategic_scoring";
  const { data, count, error } = await supabase
    .from("opportunities")
    .select(LIST_COLS, { count: 'estimated' })
    .eq("is_archived", false)
    .order("posted_date", { ascending: false, nullsFirst: false })
    .range(0, 49);

  if (error) {
    console.error("Error fetching initial opportunities:", error);
  }

  const calcDataScore = (op: any): number => {
    let score = 0;
    if (op.description) score += 20;
    if (op.agency) score += 10;
    if (op.naics_code) score += 10;
    if (op.notice_type) score += 5;
    if (op.place_of_performance_state) score += 10;
    if (op.place_of_performance_city) score += 5;
    if (op.set_aside_code) score += 10;
    if (op.award_amount) score += 15;
    if (op.response_deadline) score += 5;
    if (op.incumbent_contractor_name) score += 10;
    return score;
  };

  const initialOpportunities = (data || []).map((op: any) => ({
    ...op,
    _dataScore: calcDataScore(op)
  }));

  return (
    <OpportunitiesClient 
      initialOpportunities={initialOpportunities} 
      initialCount={count || 0} 
    />
  );
}

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import DashboardClient from "./DashboardClient";

export const metadata = {
  title: "Dashboard | CapturePilot",
};

/**
 * Dashboard server-render: ONLY fetches the profile (1 query, ~50ms).
 * The 13 KPI queries that previously ran here (some doing exact COUNT
 * over !inner joins on a 60k+ row opportunities table → 10-20s blocking)
 * now live at /api/dashboard/kpis and are fetched client-side by
 * DashboardClient after first paint. The page renders skeletons in
 * ~200ms; KPI tiles populate as the API returns.
 *
 * Net TTFB: ~200ms (was 10-20s). The slower KPI queries still cost the
 * same time but no longer block the page render.
 */
export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileData } = await supabase
    .from("user_profiles")
    .select("id, company_name, naics_codes, sba_certifications, state, target_states, uei, cage_code, website, phone, employee_count, years_in_business, federal_awards_count, notes")
    .eq("auth_user_id", user.id)
    .single();

  if (!profileData) redirect("/onboard");

  const profileNotes = (profileData as unknown as { notes: Record<string, unknown> | null }).notes;
  const initialLayout = (profileNotes?.dashboard_layout as { hidden?: string[]; order?: string[] } | undefined) || {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <DashboardClient profile={profileData as any} initialLayout={initialLayout as any} />;
}

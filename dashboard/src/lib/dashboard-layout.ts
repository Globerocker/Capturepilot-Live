/**
 * Dashboard widget registry + layout helpers.
 * Persists to user_profiles.notes.dashboard_layout as a simple
 *   { hidden: [widgetId], order: [widgetId...] }
 * blob — no migrations required. Layout is per-user.
 */

export type DashboardWidgetId =
    | "welcome"
    | "live_counter"
    | "kpi_cards"
    | "market_card"
    | "spend_radar"
    | "pipeline_forecast"
    | "quick_actions"
    | "top_opps"
    | "profile_summary"
    | "pipeline_summary"
    | "action_items_summary"
    | "competitors_cta";

export interface DashboardLayout {
    hidden?: DashboardWidgetId[];
    order?: DashboardWidgetId[];
}

export const WIDGETS: Array<{ id: DashboardWidgetId; label: string; description: string; defaultHidden?: boolean }> = [
    { id: "welcome", label: "Welcome header", description: "Greeting + company name + profile completeness" },
    { id: "live_counter", label: "Live opportunity counter", description: "Auto-refreshing total + federal / state / new-this-week breakdown" },
    { id: "kpi_cards", label: "KPI cards", description: "Opps / HOT / WARM / urgent match counters" },
    { id: "market_card", label: "Market card", description: "Live market signal for your top NAICS" },
    { id: "spend_radar", label: "Year-end spend radar", description: "Agencies with unobligated budgets matching your NAICS" },
    { id: "pipeline_forecast", label: "Pipeline forecast", description: "PWin-weighted revenue per fiscal quarter from active pursuits" },
    { id: "quick_actions", label: "Quick actions", description: "Shortcuts to Matches / Pipeline / AI tools" },
    { id: "top_opps", label: "Top matching opportunities", description: "Live sorted list of your best matches" },
    { id: "profile_summary", label: "Profile summary", description: "NAICS + certs + states at a glance" },
    { id: "pipeline_summary", label: "Pipeline summary", description: "Stage counts + recent stage changes" },
    { id: "action_items_summary", label: "Action items", description: "Next-7-days to-do items from pipeline" },
    { id: "competitors_cta", label: "Competitors shortcut", description: "Quick card linking to /competitors" },
];

export function isHidden(layout: DashboardLayout | null | undefined, id: DashboardWidgetId): boolean {
    return !!layout?.hidden?.includes(id);
}

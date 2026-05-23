import { redirect } from "next/navigation";

// /admin/prospects was the legacy prospect inbox. /admin/leads now serves
// the same data with bulk-enrich + HubSpot push + Apollo enrichment baked
// in. Old bookmarks still land on the active page.
export default function AdminProspectsLegacyRedirect() {
    redirect("/admin/leads");
}

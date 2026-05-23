import { redirect } from "next/navigation";

// /admin/lead-check was folded into /admin/leads — the leads page now
// handles both the "run a fresh check" form and the prospect inbox.
// Bookmarks still land somewhere useful.
export default function AdminLeadCheckLegacyRedirect() {
    redirect("/admin/leads");
}

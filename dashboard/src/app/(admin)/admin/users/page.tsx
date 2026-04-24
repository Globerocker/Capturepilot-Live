import { redirect } from "next/navigation";

// /admin/users was folded into /admin/clients ("People") with account-type tabs.
// Old bookmarks and in-app links still land somewhere useful.
export default function AdminUsersLegacyRedirect() {
    redirect("/admin/clients?tab=all");
}

import { redirect } from "next/navigation";

// /admin/push-opportunity is now integrated into /admin/opportunities —
// every row has a "Send" button that opens the same flow as a modal,
// pre-filled with the opportunity that was clicked. Old bookmarks land
// on the opportunities table.
export default function AdminPushOpportunityLegacyRedirect() {
    redirect("/admin/opportunities");
}

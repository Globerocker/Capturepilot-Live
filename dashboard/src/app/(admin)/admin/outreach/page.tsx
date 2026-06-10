import { redirect } from "next/navigation";

export default function OutreachIndex() {
    // The contacts tab is the default landing for the outreach hub.
    redirect("/admin/outreach/contacts");
}

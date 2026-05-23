import { redirect } from "next/navigation";

// /admin/lead-check/[analysisId] was the admin-side detail of a Quick
// Checker run. The public /check/[analysisId] view shows the same data
// (with the admin already authenticated in the cookie). Bookmarks like
// /admin/lead-check/abc123 forward to /check/abc123.
export default async function AdminLeadCheckDetailLegacyRedirect({
    params,
}: {
    params: Promise<{ analysisId: string }>;
}) {
    const { analysisId } = await params;
    redirect(`/check/${analysisId}`);
}

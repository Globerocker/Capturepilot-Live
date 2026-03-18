import { createSupabaseClient } from "@/lib/supabase/client";

const supabase = createSupabaseClient();

export function generateActionItems(noticeType: string, opportunityId: string, profileId: string) {
    const base = [
        { title: "Review opportunity description and requirements", category: "research", priority: "high" },
        { title: "Download and review all attachments", category: "research", priority: "high" },
        { title: "Verify your SAM.gov registration is active", category: "compliance", priority: "high" },
    ];

    const nt = (noticeType || "").toLowerCase();

    let specific: Array<{ title: string; category: string; priority: string }> = [];

    if (nt.includes("sources sought") || nt.includes("rfi")) {
        specific = [
            { title: "Draft capability statement tailored to this requirement", category: "document", priority: "high" },
            { title: "Identify contracting officer contact info", category: "outreach", priority: "medium" },
            { title: "Identify potential teaming partners if needed", category: "teaming", priority: "medium" },
            { title: "Submit response before deadline", category: "compliance", priority: "high" },
        ];
    } else if (nt.includes("presolicitation")) {
        specific = [
            { title: "Prepare capability statement", category: "document", priority: "high" },
            { title: "Research incumbent contractor for this requirement", category: "research", priority: "medium" },
            { title: "Identify potential teaming partners", category: "teaming", priority: "medium" },
            { title: "Begin assembling bid/no-bid analysis", category: "research", priority: "medium" },
        ];
    } else if (nt.includes("solicitation") || nt.includes("combined")) {
        specific = [
            { title: "Read the full solicitation document (SOW/PWS)", category: "research", priority: "high" },
            { title: "Complete go/no-go decision analysis", category: "research", priority: "high" },
            { title: "Draft technical approach / proposal", category: "document", priority: "high" },
            { title: "Prepare pricing / cost volume", category: "document", priority: "high" },
            { title: "Gather past performance references", category: "document", priority: "high" },
            { title: "Submit proposal before deadline", category: "compliance", priority: "high" },
        ];
    }

    return [...base, ...specific].map(item => ({
        user_profile_id: profileId,
        opportunity_id: opportunityId,
        title: item.title,
        category: item.category,
        priority: item.priority,
        status: "pending",
    }));
}

export async function createPursuit(
    opportunityId: string,
    noticeType: string,
    profileId: string
): Promise<{ success: boolean; pursuitId?: string; error?: string }> {
    // Check if already pursuing
    const { data: existing } = await supabase
        .from("user_pursuits")
        .select("id")
        .eq("user_profile_id", profileId)
        .eq("opportunity_id", opportunityId)
        .single();

    if (existing) {
        return { success: true, pursuitId: existing.id };
    }

    // Create pursuit
    const { data: newPursuit, error } = await supabase
        .from("user_pursuits")
        .insert({
            user_profile_id: profileId,
            opportunity_id: opportunityId,
            stage: "discovered",
            priority: "medium",
        })
        .select("id")
        .single();

    if (error) {
        return { success: false, error: error.message };
    }

    // Generate action items
    const actionItems = generateActionItems(noticeType, opportunityId, profileId);
    if (actionItems.length > 0) {
        await supabase.from("user_action_items").insert(actionItems);
    }

    return { success: true, pursuitId: newPursuit?.id };
}

export async function getUserProfileId(): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();

    return profile?.id || null;
}

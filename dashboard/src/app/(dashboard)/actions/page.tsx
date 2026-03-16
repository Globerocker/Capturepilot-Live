"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";
import { CheckSquare, Loader2, Target, Circle, CheckCircle2, AlertCircle, ArrowRight, HelpCircle } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import ServiceCTA from "@/components/ui/ServiceCTA";

const supabase = createSupabaseClient();

interface ActionItem {
    id: string;
    opportunity_id: string;
    title: string;
    category: string;
    priority: string;
    status: string;
    completed_at: string | null;
    created_at: string;
    opportunities: {
        id: string;
        title: string;
        agency: string;
        response_deadline: string;
    } | null;
}

const CATEGORY_COLORS: Record<string, string> = {
    research: "bg-blue-50 text-blue-700 border-blue-200",
    document: "bg-amber-50 text-amber-700 border-amber-200",
    outreach: "bg-purple-50 text-purple-700 border-purple-200",
    compliance: "bg-red-50 text-red-700 border-red-200",
    teaming: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const PRIORITY_ICONS: Record<string, string> = {
    high: "text-red-500",
    medium: "text-amber-500",
    low: "text-stone-400",
};

// Category-specific help CTAs
const CATEGORY_HELP: Record<string, { title: string; description: string }> = {
    document: {
        title: "Need help with proposal writing?",
        description: "Our team can draft technical approaches, pricing volumes, and past performance narratives.",
    },
    compliance: {
        title: "Unsure about compliance requirements?",
        description: "Get a compliance review from our GovCon specialists to make sure you meet all requirements.",
    },
    teaming: {
        title: "Looking for teaming partners?",
        description: "We can connect you with pre-vetted partners who complement your capabilities.",
    },
    outreach: {
        title: "Need help with customer engagement?",
        description: "Book a strategy call to learn how to build relationships with contracting officers.",
    },
};

export default function ActionItemsPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState<ActionItem[]>([]);
    const [profileId, setProfileId] = useState<string | null>(null);
    const [filter, setFilter] = useState<"all" | "pending" | "completed">("all");
    const [actionSort, setActionSort] = useState<"priority" | "deadline" | "category">("priority");

    useEffect(() => {
        async function load() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { router.push("/login"); return; }

            const { data: profile } = await supabase
                .from("user_profiles")
                .select("id")
                .eq("auth_user_id", user.id)
                .single();

            if (!profile) { router.push("/onboard"); return; }
            setProfileId(profile.id);
        }
        load();
    }, [router]);

    const fetchItems = useCallback(async () => {
        if (!profileId) return;
        setLoading(true);

        const { data } = await supabase
            .from("user_action_items")
            .select("*, opportunities(id, title, agency, response_deadline)")
            .eq("user_profile_id", profileId)
            .order("created_at", { ascending: true });

        setItems((data || []) as ActionItem[]);
        setLoading(false);
    }, [profileId]);

    useEffect(() => {
        if (profileId) fetchItems();
    }, [profileId, fetchItems]);

    const toggleItem = async (itemId: string, currentStatus: string) => {
        const newStatus = currentStatus === "completed" ? "pending" : "completed";
        const completedAt = newStatus === "completed" ? new Date().toISOString() : null;

        const { error } = await supabase
            .from("user_action_items")
            .update({ status: newStatus, completed_at: completedAt })
            .eq("id", itemId);

        if (!error) {
            setItems(prev => prev.map(item =>
                item.id === itemId ? { ...item, status: newStatus, completed_at: completedAt } : item
            ));
        }
    };

    // Filter items
    const filteredItems = items.filter(item => {
        if (filter === "pending") return item.status !== "completed";
        if (filter === "completed") return item.status === "completed";
        return true;
    });

    // Sort filtered items
    const sortedItems = [...filteredItems].sort((a, b) => {
        if (actionSort === "priority") {
            const order: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
            return (order[a.priority] ?? 2) - (order[b.priority] ?? 2);
        }
        if (actionSort === "deadline") {
            const dlA = a.opportunities?.response_deadline || "9999";
            const dlB = b.opportunities?.response_deadline || "9999";
            return dlA.localeCompare(dlB);
        }
        return a.category.localeCompare(b.category);
    });

    // Group by opportunity
    const grouped = sortedItems.reduce((acc, item) => {
        const oppId = item.opportunity_id || "general";
        if (!acc[oppId]) acc[oppId] = { opportunity: item.opportunities, items: [] };
        acc[oppId].items.push(item);
        return acc;
    }, {} as Record<string, { opportunity: ActionItem["opportunities"]; items: ActionItem[] }>);

    // Stats
    const totalItems = items.length;
    const completedItems = items.filter(i => i.status === "completed").length;
    const urgentItems = items.filter(i => i.priority === "high" && i.status !== "completed").length;

    if (loading && items.length === 0) {
        return (
            <div className="flex justify-center items-center min-h-[400px]">
                <Loader2 className="w-10 h-10 animate-spin text-stone-400" />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto pb-12 animate-in fade-in duration-500 px-1">
            <header className="mb-6">
                <h2 className="text-2xl sm:text-3xl font-bold font-typewriter tracking-tighter text-black flex items-center">
                    <CheckSquare className="mr-2 sm:mr-3 w-6 h-6 sm:w-8 sm:h-8" /> Action Items
                </h2>
                <p className="text-stone-500 mt-1 font-medium text-sm">
                    Guided steps to help you win contracts
                </p>
            </header>

            {items.length === 0 ? (
                <div className="space-y-4">
                    <div className="bg-white border border-stone-200 border-dashed rounded-[24px] sm:rounded-[32px] p-8 sm:p-12 text-center shadow-sm">
                        <CheckSquare className="w-12 h-12 text-stone-300 mx-auto mb-4" />
                        <h3 className="font-typewriter font-bold text-lg mb-2">No action items yet</h3>
                        <p className="text-stone-500 text-sm mb-6 max-w-md mx-auto">
                            Start pursuing an opportunity to get guided steps on how to win it.
                        </p>
                        <Link href="/opportunities"
                            className="inline-flex items-center bg-black text-white font-typewriter font-bold px-6 py-3 rounded-full hover:bg-stone-800 transition-all text-sm">
                            <Target className="w-4 h-4 mr-2" /> Browse Opportunities
                        </Link>
                    </div>
                    <ServiceCTA
                        title="Don't know where to start? Book a Strategy Call"
                        description="Our GovCon experts help you identify the right opportunities and build a winning capture plan."
                        variant="dark"
                    />
                </div>
            ) : (
                <>
                    {/* Stats bar */}
                    <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-4">
                        <div className="bg-white border border-stone-200 rounded-xl px-3 sm:px-4 py-2 text-xs font-typewriter">
                            <span className="font-bold text-black">{completedItems}</span>
                            <span className="text-stone-500"> / {totalItems} completed</span>
                        </div>
                        {urgentItems > 0 && (
                            <div className="bg-red-50 border border-red-200 rounded-xl px-3 sm:px-4 py-2 text-xs font-typewriter flex items-center">
                                <AlertCircle className="w-3 h-3 mr-1 text-red-500" />
                                <span className="font-bold text-red-700">{urgentItems} high priority</span>
                            </div>
                        )}

                        {/* Progress bar */}
                        <div className="flex-1 min-w-[100px]">
                            <div className="w-full bg-stone-200 rounded-full h-1.5">
                                <div className="bg-emerald-500 rounded-full h-1.5 transition-all duration-500"
                                    style={{ width: `${totalItems > 0 ? (completedItems / totalItems) * 100 : 0}%` }} />
                            </div>
                        </div>
                    </div>

                    {/* Filter tabs + Sort */}
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                        {(["all", "pending", "completed"] as const).map(f => (
                            <button key={f} type="button" onClick={() => setFilter(f)}
                                className={clsx(
                                    "text-xs font-typewriter font-bold uppercase tracking-widest px-3 py-2 rounded-full transition-all border",
                                    filter === f ? "bg-black text-white border-black" : "bg-white text-stone-600 border-stone-200 hover:bg-stone-100"
                                )}>
                                {f === "all" ? "All" : f === "pending" ? "Pending" : "Done"}
                            </button>
                        ))}
                        <span className="text-stone-300 mx-1">|</span>
                        <span className="text-[10px] font-typewriter text-stone-400 uppercase tracking-widest">Sort</span>
                        {([
                            { key: "priority" as const, label: "Priority" },
                            { key: "deadline" as const, label: "Deadline" },
                            { key: "category" as const, label: "Category" },
                        ]).map(opt => (
                            <button key={opt.key} type="button" onClick={() => setActionSort(opt.key)}
                                className={clsx("text-xs font-typewriter font-bold px-3 py-1.5 rounded-full border transition-all",
                                    actionSort === opt.key ? "bg-black text-white border-black" : "bg-white text-stone-500 border-stone-200 hover:bg-stone-100"
                                )}>
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    {/* Grouped items */}
                    <div className="space-y-4">
                        {Object.entries(grouped).map(([oppId, group]) => {
                            // Find categories with pending items in this group
                            const groupPendingCategories = new Set(
                                group.items.filter(i => i.status !== "completed").map(i => i.category)
                            );

                            return (
                                <div key={oppId} className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
                                    {/* Opportunity header */}
                                    {group.opportunity && (
                                        <Link href={`/opportunities/${group.opportunity.id}`}
                                            className="block bg-stone-50 border-b border-stone-100 px-4 sm:px-6 py-3 hover:bg-stone-100 transition-colors">
                                            <p className="font-bold text-sm text-black line-clamp-1">{group.opportunity.title}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <p className="text-xs text-stone-500 line-clamp-1">{group.opportunity.agency}</p>
                                                {group.opportunity.response_deadline && (
                                                    <span className="text-xs font-bold text-stone-600">
                                                        Due: {new Date(group.opportunity.response_deadline).toLocaleDateString()}
                                                    </span>
                                                )}
                                            </div>
                                        </Link>
                                    )}

                                    {/* Items */}
                                    <div className="divide-y divide-stone-100">
                                        {group.items.map(item => (
                                            <div key={item.id} className="flex items-start gap-3 px-4 sm:px-6 py-3 hover:bg-stone-50 transition-colors">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleItem(item.id, item.status)}
                                                    className="flex-shrink-0 mt-0.5"
                                                >
                                                    {item.status === "completed" ? (
                                                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                                    ) : (
                                                        <Circle className={clsx("w-5 h-5", PRIORITY_ICONS[item.priority] || "text-stone-400")} />
                                                    )}
                                                </button>
                                                <div className="flex-1 min-w-0">
                                                    <p className={clsx("text-sm", item.status === "completed" ? "text-stone-400 line-through" : "text-stone-800")}>
                                                        {item.title}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className={clsx("text-[9px] font-typewriter font-bold uppercase tracking-widest px-2 py-0.5 rounded border",
                                                            CATEGORY_COLORS[item.category] || "bg-stone-50 text-stone-500 border-stone-200")}>
                                                            {item.category}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Category-specific help CTAs for pending items */}
                                    {filter !== "completed" && Array.from(groupPendingCategories).map(cat => {
                                        const help = CATEGORY_HELP[cat];
                                        if (!help) return null;
                                        return (
                                            <div key={cat} className="border-t border-stone-100 px-4 sm:px-6 py-2.5 bg-stone-50/50">
                                                <ServiceCTA
                                                    title={help.title}
                                                    description={help.description}
                                                    variant="inline"
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>

                    {/* Bottom service CTA */}
                    <div className="mt-6">
                        <ServiceCTA
                            title="Feeling overwhelmed? Let us help"
                            description="From proposal writing to compliance reviews, our GovCon team can handle the heavy lifting so you can focus on running your business."
                            variant="dark"
                        />
                    </div>
                </>
            )}
        </div>
    );
}

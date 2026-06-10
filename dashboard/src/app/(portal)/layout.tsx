"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import Image from "next/image";
import {
    LayoutDashboard, ListTodo, Briefcase, FileText,
    LogOut, Loader2, Settings, Menu, X, Layers, FolderOpen, Users,
    MessageSquare, MoreHorizontal, Handshake, Home,
} from "lucide-react";
import clsx from "clsx";

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type NavItem = {
    href: string;
    icon: typeof LayoutDashboard;
    label: string;
    badge?: "tasks" | "messages";
};

// Full nav — used by desktop sidebar + the More sheet on mobile
const FULL_NAV: NavItem[] = [
    { href: "/portal", icon: LayoutDashboard, label: "Overview" },
    { href: "/portal/opportunities", icon: Briefcase, label: "Opportunities" },
    { href: "/portal/pipeline", icon: Layers, label: "Pipeline" },
    { href: "/portal/tasks", icon: ListTodo, label: "Tasks", badge: "tasks" },
    { href: "/portal/messages", icon: MessageSquare, label: "Messages", badge: "messages" },
    { href: "/portal/competitors", icon: Users, label: "Competitors" },
    { href: "/portal/partners", icon: Handshake, label: "Partners" },
    { href: "/portal/documents", icon: FolderOpen, label: "Documents" },
    { href: "/portal/capability-statement", icon: FileText, label: "Capability Statement" },
    { href: "/portal/settings", icon: Settings, label: "Account" },
];

// Mobile bottom-nav primaries — Home / Tasks / Docs / Messages / More
const BOTTOM_NAV: NavItem[] = [
    { href: "/portal", icon: Home, label: "Home" },
    { href: "/portal/tasks", icon: ListTodo, label: "Tasks", badge: "tasks" },
    { href: "/portal/documents", icon: FolderOpen, label: "Docs" },
    { href: "/portal/messages", icon: MessageSquare, label: "Messages", badge: "messages" },
];

// Pages that show up in the mobile "More" sheet (everything not in BOTTOM_NAV)
const MORE_SHEET: NavItem[] = [
    { href: "/portal/opportunities", icon: Briefcase, label: "Opportunities" },
    { href: "/portal/pipeline", icon: Layers, label: "Pipeline" },
    { href: "/portal/competitors", icon: Users, label: "Competitors" },
    { href: "/portal/partners", icon: Handshake, label: "Partners" },
    { href: "/portal/capability-statement", icon: FileText, label: "Capability Statement" },
    { href: "/portal/settings", icon: Settings, label: "Account" },
];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [companyName, setCompanyName] = useState("");
    const [brandLogo, setBrandLogo] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    const [unreadMessages, setUnreadMessages] = useState(0);
    const [unreadTasks, setUnreadTasks] = useState(0);

    const refreshBadges = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: profile } = await supabase
            .from("user_profiles")
            .select("id")
            .eq("auth_user_id", user.id)
            .single();
        if (!profile) return;

        const [msgRes, taskRes] = await Promise.all([
            supabase
                .from("client_messages")
                .select("id", { count: "exact", head: true })
                .eq("user_profile_id", profile.id)
                .eq("sender_type", "admin")
                .is("read_at", null),
            supabase
                .from("client_tasks")
                .select("id", { count: "exact", head: true })
                .eq("user_profile_id", profile.id)
                .not("status", "in", "(completed,cancelled)"),
        ]);
        setUnreadMessages(msgRes.count || 0);
        setUnreadTasks(taskRes.count || 0);
    }, []);

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                window.location.href = "/login";
                return;
            }

            // 48h auto-logout
            const SESSION_MAX_MS = 48 * 60 * 60 * 1000;
            const sessionStart = localStorage.getItem("cp_session_start");
            if (!sessionStart) {
                localStorage.setItem("cp_session_start", String(Date.now()));
            } else if (Date.now() - Number(sessionStart) > SESSION_MAX_MS) {
                localStorage.removeItem("cp_session_start");
                await supabase.auth.signOut();
                window.location.href = "/login";
                return;
            }

            const { data } = await supabase
                .from("user_profiles")
                .select("company_name, notes")
                .eq("auth_user_id", user.id)
                .single();

            if (data) {
                setCompanyName(data.company_name || "");
                // Optional white-label logo from notes.brand_tokens.logo
                const notes = (data.notes ?? {}) as { brand_tokens?: { logo?: string } };
                if (notes?.brand_tokens?.logo) setBrandLogo(notes.brand_tokens.logo);
            }
            await refreshBadges();
            setLoading(false);
        })();
    }, [refreshBadges]);

    // Poll every 60s (per spec)
    useEffect(() => {
        const interval = setInterval(refreshBadges, 60_000);
        return () => clearInterval(interval);
    }, [refreshBadges]);

    // Close the More sheet on route change
    useEffect(() => {
        setMoreOpen(false);
        setMobileOpen(false);
    }, [pathname]);

    if (loading) {
        return (
            <div className="min-h-screen bg-stone-50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-stone-400 animate-spin" />
            </div>
        );
    }

    const badgeCount = (key?: "tasks" | "messages") => {
        if (key === "tasks") return unreadTasks;
        if (key === "messages") return unreadMessages;
        return 0;
    };
    const totalUnread = unreadTasks + unreadMessages;

    const isActive = (href: string) =>
        pathname === href || (href !== "/portal" && pathname?.startsWith(href));

    return (
        <div className="min-h-screen bg-stone-50 flex">
            {/* Mobile top app bar (white-label slot) */}
            <header className="lg:hidden fixed top-0 inset-x-0 z-40 bg-stone-950 border-b border-stone-800/60 px-4 py-3 flex items-center gap-3">
                <button
                    type="button"
                    onClick={() => setMobileOpen(!mobileOpen)}
                    className="text-stone-300"
                    aria-label="Open menu"
                >
                    {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
                <Link href="/portal" className="flex items-center gap-2 flex-1 min-w-0">
                    {brandLogo ? (
                        // Client white-label logo
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={brandLogo} alt={companyName || "Client"} className="h-6 w-6 rounded object-contain bg-white" />
                    ) : (
                        <Image src="/logo.png" alt="CapturePilot" width={20} height={20} className="rounded" />
                    )}
                    <span className="font-semibold text-sm text-stone-200 truncate">
                        {companyName || "CapturePilot"}
                    </span>
                </Link>
                {totalUnread > 0 && (
                    <span className="bg-emerald-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1.5">
                        {totalUnread}
                    </span>
                )}
            </header>

            {/* Mobile overlay (for the slide-in sidebar) */}
            {mobileOpen && (
                <div
                    className="lg:hidden fixed inset-0 bg-black/30 backdrop-blur-sm z-30"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            {/* Sidebar (full nav on desktop, slide-in on mobile) */}
            <aside className={clsx(
                "w-64 bg-stone-950 flex flex-col z-40",
                "fixed lg:static inset-y-0 left-0 transition-transform duration-200",
                mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
            )}>
                <div className="h-0.5 bg-gradient-to-r from-emerald-500 via-emerald-400 to-transparent" />

                <div className="p-5 border-b border-stone-800/60">
                    <Link href="/portal" className="flex items-center gap-2">
                        {brandLogo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={brandLogo} alt={companyName || "Client"} className="h-5 w-5 rounded object-contain bg-white" />
                        ) : (
                            <Image src="/logo.png" alt="CapturePilot" width={20} height={20} className="rounded" />
                        )}
                        <span className="font-semibold text-sm text-stone-200">
                            {companyName || "CapturePilot"}
                        </span>
                        <span className="text-[9px] bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full uppercase border border-emerald-500/20">Client</span>
                    </Link>
                    {companyName && !brandLogo && (
                        <p className="text-xs text-stone-500 mt-1.5 truncate">{companyName}</p>
                    )}
                </div>

                <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
                    {FULL_NAV.map((item) => {
                        const active = isActive(item.href);
                        const count = badgeCount(item.badge);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={clsx(
                                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                                    active
                                        ? "bg-emerald-500/10 text-emerald-400 border-l-2 border-emerald-500"
                                        : "text-stone-500 hover:bg-stone-800/50 hover:text-stone-300 border-l-2 border-transparent"
                                )}
                            >
                                <item.icon className={clsx("w-4 h-4", active ? "text-emerald-400" : "text-stone-500")} />
                                {item.label}
                                {count > 0 && (
                                    <span className="ml-auto bg-emerald-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1">
                                        {count > 99 ? "99+" : count}
                                    </span>
                                )}
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-3 border-t border-stone-800/60">
                    <button
                        type="button"
                        onClick={async () => {
                            await supabase.auth.signOut({ scope: "global" });
                            localStorage.clear();
                            sessionStorage.clear();
                            document.cookie.split(";").forEach(c => {
                                document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
                            });
                            window.location.replace("/login");
                        }}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-stone-500 hover:bg-stone-800/50 hover:text-red-400 w-full transition-all duration-200"
                    >
                        <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 flex flex-col overflow-auto dot-grid-bg">
                <div className="bg-emerald-600 text-white text-center py-2 px-4 text-xs font-medium flex-shrink-0 mt-12 lg:mt-0">
                    Public Beta — All features unlocked free until May 9, 2026
                </div>
                <div className="w-full flex-1 p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8">
                    {children}
                </div>
            </main>

            {/* Mobile bottom nav */}
            <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-stone-950 border-t border-stone-800/60 grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
                {BOTTOM_NAV.map((item) => {
                    const active = isActive(item.href);
                    const count = badgeCount(item.badge);
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={clsx(
                                "flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium relative",
                                active ? "text-emerald-400" : "text-stone-400"
                            )}
                        >
                            <item.icon className="w-5 h-5" />
                            <span>{item.label}</span>
                            {count > 0 && (
                                <span className="absolute top-1.5 right-1/2 translate-x-3 bg-emerald-500 text-white text-[9px] font-bold min-w-[16px] h-[16px] rounded-full flex items-center justify-center px-1">
                                    {count > 99 ? "99+" : count}
                                </span>
                            )}
                        </Link>
                    );
                })}
                <button
                    type="button"
                    onClick={() => setMoreOpen(true)}
                    className={clsx(
                        "flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium",
                        moreOpen ? "text-emerald-400" : "text-stone-400"
                    )}
                >
                    <MoreHorizontal className="w-5 h-5" />
                    <span>More</span>
                </button>
            </nav>

            {/* Mobile "More" bottom sheet */}
            {moreOpen && (
                <>
                    <div
                        className="lg:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
                        onClick={() => setMoreOpen(false)}
                    />
                    <div className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-stone-950 border-t border-stone-800/60 rounded-t-2xl pb-[env(safe-area-inset-bottom)]">
                        <div className="flex items-center justify-between px-5 py-3 border-b border-stone-800/60">
                            <span className="text-sm font-semibold text-stone-200">More</span>
                            <button
                                type="button"
                                onClick={() => setMoreOpen(false)}
                                className="text-stone-400"
                                aria-label="Close"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-3 grid grid-cols-2 gap-2">
                            {MORE_SHEET.map((item) => {
                                const active = isActive(item.href);
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={clsx(
                                            "flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium",
                                            active
                                                ? "bg-emerald-500/10 text-emerald-400"
                                                : "bg-stone-900 text-stone-300 hover:bg-stone-800"
                                        )}
                                    >
                                        <item.icon className="w-4 h-4" />
                                        <span className="truncate">{item.label}</span>
                                    </Link>
                                );
                            })}
                        </div>
                        <div className="p-3 border-t border-stone-800/60">
                            <button
                                type="button"
                                onClick={async () => {
                                    await supabase.auth.signOut({ scope: "global" });
                                    localStorage.clear();
                                    sessionStorage.clear();
                                    document.cookie.split(";").forEach(c => {
                                        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
                                    });
                                    window.location.replace("/login");
                                }}
                                className="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20"
                            >
                                <LogOut className="w-4 h-4" /> Sign Out
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

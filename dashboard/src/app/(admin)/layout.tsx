"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import Image from "next/image";
import {
    LayoutDashboard, Users, Briefcase,
    Wrench, Settings, LogOut, Loader2, Search, ChevronRight, ChevronDown,
    Menu, X, MessageSquare, Mail, Sparkles, Activity,
    GraduationCap, ShieldCheck, Database, FileText,
    Send, ListChecks, Plug, Megaphone, Newspaper, Layers,
} from "lucide-react";
import clsx from "clsx";

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type NavItem = {
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    badge?: "unreadMessages";
};

type NavSection = {
    label: string;
    key: string;
    items: NavItem[];
    /** Whether the section is collapsed by default. */
    defaultCollapsed?: boolean;
};

// Sidebar reorg (2026-06-11) — collapsed from ~9 groups to 6 per user feedback:
// Pipeline removed entirely (we use HubSpot now), Legacy section killed
// (redirect stubs still resolve via direct URL, just no nav clutter),
// Content + Settings merged into a single collapsed group.
const NAV: NavSection[] = [
    {
        label: "Overview",
        key: "overview",
        items: [
            { href: "/admin/overview", icon: LayoutDashboard, label: "Dashboard" },
            { href: "/admin/health", icon: Activity, label: "Env Health" },
            { href: "/admin/db-health", icon: Database, label: "DB Health" },
            { href: "/admin/changelog", icon: Newspaper, label: "Changelog" },
        ],
    },
    {
        label: "People",
        key: "people",
        items: [
            { href: "/admin/clients", icon: Users, label: "Clients" },
            { href: "/admin/leads", icon: FileText, label: "Leads" },
            { href: "/admin/prospects", icon: Search, label: "Prospects" },
        ],
    },
    {
        label: "Opportunities",
        key: "opportunities",
        items: [
            { href: "/admin/opportunities", icon: Briefcase, label: "Opportunities" },
            { href: "/admin/matches", icon: Layers, label: "Matches" },
            { href: "/admin/push-opportunity", icon: Send, label: "Push Opportunity" },
        ],
    },
    {
        label: "Outreach",
        key: "outreach",
        items: [
            { href: "/admin/outreach", icon: Megaphone, label: "Outreach" },
        ],
    },
    {
        label: "Operations",
        key: "operations",
        defaultCollapsed: true,
        items: [
            { href: "/admin/jobs", icon: ListChecks, label: "Jobs" },
            { href: "/admin/queue", icon: Sparkles, label: "Queue" },
            { href: "/admin/crons", icon: Activity, label: "Crons" },
            { href: "/admin/tools", icon: Wrench, label: "Tools" },
        ],
    },
    {
        label: "Content + Settings",
        key: "content_settings",
        defaultCollapsed: true,
        items: [
            { href: "/admin/academy", icon: GraduationCap, label: "Academy" },
            { href: "/admin/messages", icon: MessageSquare, label: "Messages", badge: "unreadMessages" },
            { href: "/admin/emails", icon: Mail, label: "Emails" },
            { href: "/admin/connectors", icon: Plug, label: "Connectors" },
            { href: "/admin/settings", icon: Settings, label: "Settings" },
        ],
    },
];

// Breadcrumb label lookup — covers every nav item plus a few nested detail pages.
const LABELS: Record<string, string> = NAV.flatMap(s => s.items).reduce(
    (acc, it) => ({ ...acc, [it.href]: it.label }),
    {} as Record<string, string>
);

const STORAGE_KEY = "cp_admin_nav_collapsed_v1";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [loading, setLoading] = useState(true);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [unreadMessages, setUnreadMessages] = useState(0);
    const [adminEmail, setAdminEmail] = useState<string | null>(null);
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
        const initial: Record<string, boolean> = {};
        for (const s of NAV) if (s.defaultCollapsed) initial[s.key] = true;
        return initial;
    });

    // Auto-open the group containing the active route so the user always sees
    // where they are. Honors the user's manual collapse choices too.
    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw) as Record<string, boolean>;
                setCollapsed(prev => ({ ...prev, ...parsed }));
            }
        } catch {
            // ignore corrupt localStorage
        }
    }, []);

    useEffect(() => {
        if (!pathname) return;
        const section = NAV.find(s =>
            s.items.some(i => pathname === i.href || pathname.startsWith(i.href + "/"))
        );
        if (section && collapsed[section.key]) {
            setCollapsed(prev => ({ ...prev, [section.key]: false }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathname]);

    const toggleSection = (key: string) => {
        setCollapsed(prev => {
            const next = { ...prev, [key]: !prev[key] };
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            } catch {
                // ignore quota errors
            }
            return next;
        });
    };

    const fetchUnread = async () => {
        const { count } = await supabase
            .from("client_messages")
            .select("id", { count: "exact", head: true })
            .eq("sender_type", "client")
            .is("read_at", null);
        setUnreadMessages(count || 0);
    };

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { window.location.href = "/login"; return; }
            setAdminEmail(user.email || null);
            await fetchUnread();
            setLoading(false);
        })();
    }, []);

    useEffect(() => {
        const interval = setInterval(fetchUnread, 30000);
        return () => clearInterval(interval);
    }, []);

    const breadcrumbs = useMemo(() => {
        if (!pathname) return [] as { href: string; label: string }[];
        const parts = pathname.split("/").filter(Boolean);
        const trail: { href: string; label: string }[] = [];
        let acc = "";
        for (const p of parts) {
            acc += "/" + p;
            const label = LABELS[acc] || p.charAt(0).toUpperCase() + p.slice(1).replace(/-/g, " ");
            trail.push({ href: acc, label });
        }
        return trail.slice(1);
    }, [pathname]);

    if (loading) {
        return (
            <div className="min-h-screen bg-stone-50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
            </div>
        );
    }

    const sidebarContent = (
        <>
            <div className="p-4 border-b border-stone-800">
                <Link href="/admin/overview" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
                    <Image src="/logo.png" alt="CapturePilot" width={20} height={20} className="rounded" />
                    <span className="font-bold text-sm">CapturePilot</span>
                </Link>
                <p className="text-[10px] text-stone-500 mt-0.5 uppercase tracking-widest flex items-center gap-1">
                    <ShieldCheck className="w-2.5 h-2.5" /> Admin Console
                </p>
            </div>

            <nav className="flex-1 p-2 overflow-y-auto">
                {NAV.map((section, idx) => {
                    const isCollapsed = !!collapsed[section.key];
                    const hasActive = section.items.some(
                        i => pathname === i.href || (i.href !== "/admin/overview" && pathname?.startsWith(i.href + "/"))
                    );
                    return (
                        <div key={section.key} className={clsx(idx > 0 && "mt-3")}>
                            <button
                                type="button"
                                onClick={() => toggleSection(section.key)}
                                className={clsx(
                                    "flex items-center gap-1 w-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors",
                                    hasActive ? "text-stone-300" : "text-stone-500 hover:text-stone-300"
                                )}
                                aria-expanded={isCollapsed ? "false" : "true"}
                            >
                                <ChevronDown
                                    className={clsx(
                                        "w-3 h-3 transition-transform",
                                        isCollapsed && "-rotate-90"
                                    )}
                                />
                                <span>{section.label}</span>
                            </button>
                            {!isCollapsed && (
                                <div className="mt-0.5 space-y-0.5">
                                    {section.items.map((item) => {
                                        const isActive = pathname === item.href
                                            || (item.href !== "/admin/overview" && pathname?.startsWith(item.href + "/"));
                                        const Icon = item.icon;
                                        return (
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                onClick={() => setMobileOpen(false)}
                                                className={clsx(
                                                    "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                                                    isActive
                                                        ? "bg-white/10 text-white"
                                                        : "text-stone-400 hover:bg-white/5 hover:text-stone-200"
                                                )}
                                            >
                                                <Icon className="w-4 h-4 flex-shrink-0" />
                                                <span className="flex-1">{item.label}</span>
                                                {item.badge === "unreadMessages" && unreadMessages > 0 && (
                                                    <span className="bg-emerald-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1">
                                                        {unreadMessages}
                                                    </span>
                                                )}
                                            </Link>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </nav>

            <div className="p-2 border-t border-stone-800">
                {adminEmail && (
                    <div className="flex items-center gap-2 px-3 py-1.5 mb-1 text-[11px] text-stone-500 truncate">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                        <span className="truncate">{adminEmail}</span>
                    </div>
                )}
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
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-stone-500 hover:bg-white/5 hover:text-red-400 w-full transition-colors"
                >
                    <LogOut className="w-4 h-4" /> Sign Out
                </button>
            </div>
        </>
    );

    return (
        <div className="min-h-screen bg-stone-50 flex">
            {/* Mobile toggle */}
            <button
                type="button"
                onClick={() => setMobileOpen(!mobileOpen)}
                className="lg:hidden fixed top-4 left-4 z-50 bg-white border border-stone-200 rounded-xl p-2 shadow-sm"
            >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            {mobileOpen && <div className="lg:hidden fixed inset-0 bg-black/20 z-30" onClick={() => setMobileOpen(false)} />}

            {/* Sidebar */}
            <aside className={clsx(
                "w-60 bg-stone-900 text-white flex flex-col z-40",
                "fixed lg:static inset-y-0 left-0 transition-transform duration-200",
                mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
            )}>
                {sidebarContent}
            </aside>

            {/* Main */}
            <main className="flex-1 min-h-screen overflow-auto">
                {/* Breadcrumb strip — only on lg+, low chrome */}
                {breadcrumbs.length > 0 && (
                    <div className="hidden lg:flex items-center gap-1.5 px-6 h-10 border-b border-stone-200 bg-white/60 text-xs">
                        <span className="font-bold uppercase tracking-[0.16em] text-stone-400">Admin</span>
                        {breadcrumbs.map((c, i) => (
                            <span key={c.href} className="flex items-center gap-1.5">
                                <ChevronRight className="w-3 h-3 text-stone-300" />
                                {i === breadcrumbs.length - 1 ? (
                                    <span className="font-semibold text-stone-700">{c.label}</span>
                                ) : (
                                    <Link href={c.href} className="text-stone-500 hover:text-stone-700">{c.label}</Link>
                                )}
                            </span>
                        ))}
                    </div>
                )}
                <div className="p-4 sm:p-6 lg:p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}

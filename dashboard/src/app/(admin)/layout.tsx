"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import Image from "next/image";
import {
    LayoutDashboard, Users, Briefcase, Target,
    Wrench, Settings, LogOut, Loader2, Search, ChevronRight,
    Menu, X, MessageSquare, Mail, Gift, Sparkles, Activity,
    GraduationCap, ExternalLink, ShieldCheck, Globe, Eye,
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
    items: NavItem[];
};

// Section-grouped nav. Consolidated Apr 2026: Users was folded into People,
// Lead Check into Leads, and Push Opportunity into Opportunities. The old
// routes still resolve (we redirect /admin/users) so bookmarks don't break.
const NAV: NavSection[] = [
    {
        label: "Overview",
        items: [
            { href: "/admin/overview", icon: LayoutDashboard, label: "Dashboard" },
        ],
    },
    {
        label: "Customers",
        items: [
            { href: "/admin/clients", icon: Users, label: "People" },
            { href: "/admin/leads", icon: Search, label: "Leads" },
            { href: "/admin/beta-invites", icon: Gift, label: "Beta Invites" },
        ],
    },
    {
        label: "Pipeline",
        items: [
            { href: "/admin/opportunities", icon: Briefcase, label: "Opportunities" },
            { href: "/admin/pipeline", icon: Target, label: "Sales Pipeline" },
        ],
    },
    {
        label: "Content",
        items: [
            { href: "/admin/academy", icon: GraduationCap, label: "Academy" },
            { href: "/admin/emails", icon: Mail, label: "Emails" },
            { href: "/admin/messages", icon: MessageSquare, label: "Messages", badge: "unreadMessages" },
        ],
    },
    {
        label: "Growth",
        items: [
            { href: "/admin/backlinks", icon: Globe, label: "Backlinks" },
        ],
    },
    {
        label: "Operations",
        items: [
            { href: "/admin/enrich", icon: Sparkles, label: "Bulk Enrich" },
            { href: "/admin/health", icon: Activity, label: "Env Health" },
            { href: "/admin/crons", icon: Activity, label: "Cron Telemetry" },
            { href: "/admin/tools", icon: Wrench, label: "Tools" },
        ],
    },
    {
        label: "System",
        items: [
            { href: "/admin/settings", icon: Settings, label: "Settings" },
        ],
    },
];

// Breadcrumb label lookup — covers every nav item plus a few nested detail pages.
const LABELS: Record<string, string> = NAV.flatMap(s => s.items).reduce(
    (acc, it) => ({ ...acc, [it.href]: it.label }),
    {} as Record<string, string>
);

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [loading, setLoading] = useState(true);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [unreadMessages, setUnreadMessages] = useState(0);
    const [adminEmail, setAdminEmail] = useState<string | null>(null);

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

            // Gate the entire admin shell on account_type === "admin". The API
            // routes also enforce this, but checking here avoids rendering the
            // admin chrome to a non-admin user (which would just 403 every
            // request anyway).
            const { data: profile } = await supabase
                .from("user_profiles")
                .select("account_type")
                .eq("auth_user_id", user.id)
                .maybeSingle();
            if (profile?.account_type !== "admin") {
                window.location.href = "/dashboard";
                return;
            }

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
        // Drop the leading "/admin" crumb — it's implied by the Admin Console label.
        return trail.slice(1);
    }, [pathname]);

    if (loading) {
        return (
            <div className="min-h-screen bg-stone-950 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-stone-500" />
            </div>
        );
    }

    const sidebarContent = (
        <>
            {/* Emerald gradient accent line — matches SaaS dashboard */}
            <div className="h-0.5 bg-gradient-to-r from-emerald-500 via-emerald-400 to-transparent" />

            {/* Logo + admin pill */}
            <div className="px-6 lg:px-7 pt-5 mb-6 flex items-center justify-between">
                <Link href="/admin/overview" className="flex items-center gap-3 group" onClick={() => setMobileOpen(false)}>
                    <Image src="/logo.png" alt="CapturePilot" width={34} height={34} className="rounded-xl" />
                    <div className="flex flex-col">
                        <span className="text-base font-semibold tracking-tight text-stone-200 leading-none">CapturePilot</span>
                        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-400/80 leading-none mt-1.5 flex items-center gap-1">
                            <ShieldCheck className="w-2.5 h-2.5" /> Admin Console
                        </span>
                    </div>
                </Link>
                <button
                    type="button"
                    title="Close menu"
                    onClick={() => setMobileOpen(false)}
                    className="lg:hidden p-2 -mr-2 text-stone-500 hover:text-stone-300"
                >
                    <X className="h-5 w-5" />
                </button>
            </div>

            {/* Nav sections */}
            <nav className="flex-1 px-3 lg:px-4 overflow-y-auto scrollbar-thin scrollbar-thumb-stone-800 scrollbar-track-transparent pb-4">
                {NAV.map((section, idx) => (
                    <div key={section.label} className={clsx(idx > 0 && "mt-5")}>
                        <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-600">
                            {section.label}
                        </p>
                        <div className="space-y-0.5">
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
                                            "flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium transition-all duration-200 border-l-2",
                                            isActive
                                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500"
                                                : "text-stone-400 hover:bg-stone-800/50 hover:text-stone-200 border-transparent"
                                        )}
                                    >
                                        <Icon className={clsx("w-4 h-4 flex-shrink-0", isActive ? "text-emerald-400" : "text-stone-500")} />
                                        <span className="flex-1">{item.label}</span>
                                        {item.badge === "unreadMessages" && unreadMessages > 0 && (
                                            <span className="bg-emerald-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1.5">
                                                {unreadMessages}
                                            </span>
                                        )}
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </nav>

            {/* Bottom chip + sign out */}
            <div className="mt-auto px-3 lg:px-4 pt-3 pb-2 border-t border-stone-800/60">
                {adminEmail && (
                    <div className="flex items-center gap-2.5 px-3 py-2 mb-1 rounded-2xl bg-stone-900/60">
                        <div className="w-7 h-7 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-bold flex items-center justify-center">
                            {adminEmail.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-stone-500 leading-none">Signed in as</p>
                            <p className="text-xs text-stone-300 truncate mt-0.5 font-medium">{adminEmail}</p>
                        </div>
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
                    className="flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm text-stone-500 hover:bg-stone-800/60 hover:text-red-400 w-full transition-colors border-l-2 border-transparent"
                >
                    <LogOut className="w-4 h-4" /> Sign Out
                </button>
            </div>
        </>
    );

    return (
        <div className="flex bg-stone-50 min-h-screen lg:h-screen lg:overflow-hidden text-stone-900 selection:bg-emerald-500 selection:text-white">
            {/* Mobile sticky header */}
            <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-stone-950/95 backdrop-blur-md border-b border-stone-800 px-4 h-14 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <Image src="/logo.png" alt="CapturePilot" width={30} height={30} className="rounded-lg" />
                    <div>
                        <p className="text-sm font-semibold text-stone-200 leading-none">CapturePilot</p>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-400/80 leading-none mt-0.5">Admin</p>
                    </div>
                </div>
                <button
                    type="button"
                    title="Open menu"
                    onClick={() => setMobileOpen(true)}
                    className="p-2 -mr-1 text-stone-400 hover:text-stone-200"
                >
                    <Menu className="h-5 w-5" />
                </button>
            </div>

            {/* Mobile overlay */}
            {mobileOpen && (
                <div
                    className="lg:hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            {/* Mobile slide-out sidebar */}
            <aside
                className={clsx(
                    "lg:hidden fixed top-0 left-0 bottom-0 z-50 w-72 bg-stone-950 flex flex-col pb-6 shadow-2xl transition-transform duration-300 ease-in-out",
                    mobileOpen ? "translate-x-0" : "-translate-x-full"
                )}
            >
                {sidebarContent}
            </aside>

            {/* Desktop sidebar */}
            <aside className="hidden lg:flex w-64 flex-shrink-0 bg-stone-950 h-screen sticky top-0 flex-col pb-4">
                {sidebarContent}
            </aside>

            {/* Main */}
            <main className="flex-1 flex flex-col overflow-hidden lg:pl-2 pt-14 lg:pt-0">
                {/* Top bar: breadcrumbs + return-to-app link */}
                <div className="hidden lg:flex items-center justify-between px-6 h-12 flex-shrink-0 bg-stone-50 border-b border-stone-200/70">
                    <nav className="flex items-center gap-1.5 text-xs">
                        <span className="font-bold uppercase tracking-[0.18em] text-stone-400">Admin</span>
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
                    </nav>
                    {/* "View as customer" — drops the admin into their own
                        /dashboard so they can see what a SaaS user sees with
                        their own profile. To impersonate a SPECIFIC client,
                        open that client and click "View as user" — handled
                        per-row in /admin/clients. */}
                    <div className="flex items-center gap-3">
                        <Link
                            href="/portal"
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-emerald-600 transition-colors"
                            title="Open the consulting-portal view (admin's own portal)"
                        >
                            <Eye className="w-3.5 h-3.5" />
                            View as portal
                        </Link>
                        <Link
                            href="/dashboard"
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-emerald-600 transition-colors"
                            title="Open your customer-facing dashboard (admin's own SaaS view)"
                        >
                            <Eye className="w-3.5 h-3.5" />
                            View as customer
                        </Link>
                    </div>
                </div>

                {/* Inner rounded panel — matches SaaS dashboard "rounded-l-[40px]" look */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 lg:rounded-l-[40px] bg-gradient-to-br from-stone-100 via-stone-50 to-stone-100 lg:my-2 lg:mr-2 lg:border lg:border-stone-200/80 lg:shadow-inner dot-grid-bg">
                    {children}
                </div>
            </main>
        </div>
    );
}

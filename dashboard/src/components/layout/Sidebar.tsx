"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import {
    LayoutDashboard,
    Target,
    Layers,
    FileText,
    BarChart3,
    Mic,
    Users,
    Shield,
    CreditCard,
    Settings,
    LogOut,
    Menu,
    X,
    FolderOpen,
    Building2,
} from "lucide-react";
import clsx from "clsx";
import { createSupabaseClient } from "@/lib/supabase/client";
import QuickActions from "./QuickActions";

type NavItem = {
    name: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    /** Use exact-match instead of startsWith for active detection.
     *  Needed when a parent route (/ai-drafter) is its own page but also
     *  hosts children (/ai-drafter/proposals, /ai-drafter/capability-statement).
     */
    exact?: boolean;
};

type NavGroup = {
    label: string;
    items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
    {
        label: "Daily",
        items: [
            { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
            { name: "Matches", href: "/matches", icon: Target },
            { name: "Pipeline", href: "/pipeline", icon: Layers },
        ],
    },
    {
        label: "Sourcing",
        items: [
            { name: "Opportunities", href: "/opportunities", icon: Building2 },
            { name: "Partners", href: "/partners", icon: Users },
            { name: "Competitors", href: "/competitors", icon: Shield },
            { name: "Market Intel", href: "/intelligence", icon: BarChart3 },
        ],
    },
    {
        label: "Build",
        items: [
            { name: "AI Proposals", href: "/ai-drafter/proposals", icon: FileText },
            { name: "Cap Statement", href: "/ai-drafter/capability-statement", icon: Mic },
            { name: "Emails & Templates", href: "/ai-drafter", icon: FileText, exact: true },
            { name: "Documents", href: "/documents", icon: FolderOpen },
        ],
    },
];

const BOTTOM_LINKS: NavItem[] = [
    { name: "Billing", href: "/billing", icon: CreditCard },
    { name: "Settings", href: "/settings", icon: Settings },
];

function isActiveLink(pathname: string, item: NavItem): boolean {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export default function Sidebar() {
    const [mobileOpen, setMobileOpen] = useState(false);
    const pathname = usePathname();
    const supabase = createSupabaseClient();

    const handleSignOut = async () => {
        await supabase.auth.signOut({ scope: "global" });
        localStorage.clear();
        sessionStorage.clear();
        document.cookie.split(";").forEach(c => {
            document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });
        window.location.replace("/login");
    };

    const handleNavClick = () => {
        setMobileOpen(false);
    };

    const sidebarContent = (
        <>
            {/* Emerald gradient line at top */}
            <div className="h-0.5 bg-gradient-to-r from-emerald-500 via-emerald-400 to-transparent" />

            {/* Logo */}
            <div className="px-6 lg:px-8 mb-4 lg:mb-6 pt-5 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <Image src="/logo.png" alt="CapturePilot" width={36} height={36} className="rounded-xl" />
                    <h1 className="text-xl font-semibold tracking-tight text-stone-200">CapturePilot</h1>
                </div>
                <button
                    type="button"
                    title="Close menu"
                    onClick={() => setMobileOpen(false)}
                    className="lg:hidden p-2 -mr-2 text-stone-500 hover:text-stone-300"
                >
                    <X className="h-5 w-5" />
                </button>
            </div>

            {/* Quick Actions at the top — most-used flows, one click away */}
            <QuickActions onNavigate={handleNavClick} />

            {/* Grouped navigation */}
            <nav className="flex-1 overflow-y-auto px-3 lg:px-4 mt-2 space-y-5">
                {NAV_GROUPS.map((group) => (
                    <div key={group.label}>
                        <div className="px-2 mb-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-600">
                                {group.label}
                            </span>
                        </div>
                        <div className="space-y-0.5">
                            {group.items.map((item) => {
                                const Icon = item.icon;
                                const active = isActiveLink(pathname, item);
                                return (
                                    <Link
                                        key={item.name}
                                        href={item.href}
                                        onClick={handleNavClick}
                                        className={clsx(
                                            "flex items-center space-x-3 px-4 py-2.5 lg:py-2 rounded-2xl transition-all duration-200 font-medium text-sm",
                                            active
                                                ? "bg-emerald-500/10 text-emerald-400 border-l-2 border-emerald-500"
                                                : "text-stone-500 hover:bg-stone-800/50 hover:text-stone-300 border-l-2 border-transparent"
                                        )}
                                    >
                                        <Icon className={clsx("h-5 w-5", active ? "text-emerald-400" : "text-stone-500")} />
                                        <span className="font-medium">{item.name}</span>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </nav>

            {/* Bottom-anchored: Account links + sign out */}
            <div className="mt-auto px-3 lg:px-4 space-y-0.5 border-t border-stone-800/60 pt-3">
                <div className="px-2 mb-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-600">
                        Account
                    </span>
                </div>
                {BOTTOM_LINKS.map((item) => {
                    const Icon = item.icon;
                    const active = isActiveLink(pathname, item);
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            onClick={handleNavClick}
                            className={clsx(
                                "flex items-center space-x-3 px-4 py-2.5 lg:py-2 rounded-2xl transition-all duration-200 text-sm",
                                active
                                    ? "bg-emerald-500/10 text-emerald-400 border-l-2 border-emerald-500"
                                    : "text-stone-500 hover:bg-stone-800/50 hover:text-stone-300 border-l-2 border-transparent"
                            )}
                        >
                            <Icon className={clsx("h-5 w-5", active ? "text-emerald-400" : "text-stone-500")} />
                            <span className="font-medium">{item.name}</span>
                        </Link>
                    );
                })}
                <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full flex items-center space-x-3 px-4 py-2.5 lg:py-2 rounded-2xl text-stone-500 hover:bg-stone-800/50 hover:text-red-400 transition-all duration-200 text-sm border-l-2 border-transparent"
                >
                    <LogOut className="h-5 w-5" />
                    <span className="font-medium">Sign Out</span>
                </button>
            </div>
        </>
    );

    return (
        <>
            {/* Mobile header bar */}
            <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-stone-950/95 backdrop-blur-md border-b border-stone-800 px-4 h-14 flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                    <Image src="/logo.png" alt="CapturePilot" width={32} height={32} className="rounded-lg" />
                    <span className="text-base font-semibold text-stone-200">CapturePilot</span>
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

            {/* Mobile slide-out sidebar (full menu) */}
            <div
                className={clsx(
                    "lg:hidden fixed top-0 left-0 bottom-0 z-50 w-72 bg-stone-950 flex flex-col pb-24 shadow-2xl transition-transform duration-300 ease-in-out",
                    mobileOpen ? "translate-x-0" : "-translate-x-full"
                )}
            >
                {sidebarContent}
            </div>

            {/* Desktop sidebar */}
            <aside className="hidden lg:flex w-64 flex-shrink-0 bg-stone-950 h-screen sticky top-0 flex-col pb-6">
                {sidebarContent}
            </aside>
        </>
    );
}

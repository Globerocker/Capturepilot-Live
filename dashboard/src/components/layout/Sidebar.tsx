"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import Image from "next/image";
import {
    LayoutDashboard, Target, Layers, FileText, BarChart3, Mic, Users, Shield,
    CreditCard, Settings, LogOut, Menu, X, FolderOpen, Mail, Search, Pencil,
    Handshake, Clock, ChevronRight, Radar, Telescope, GraduationCap, Sparkles,
} from "lucide-react";
import clsx from "clsx";
import { createSupabaseClient } from "@/lib/supabase/client";
import QuickActions from "./QuickActions";

interface NavItem {
    name: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    children?: NavChildItem[];
}
interface NavChildItem {
    name: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    // For children with query-string routing (e.g. /partners?status=active), we
    // match on the full href; otherwise we prefix-match.
    matchExact?: boolean;
}

export default function Sidebar() {
    const [mobileOpen, setMobileOpen] = useState(false);
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const currentStatus = searchParams?.get("status") || null;
    const supabase = createSupabaseClient();

    const navLinks: NavItem[] = [
        { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        { name: "Matches", href: "/matches", icon: Target },
        { name: "Opportunities", href: "/opportunities", icon: Search },
        { name: "Pipeline", href: "/pipeline", icon: Layers },
        {
            name: "AI Drafter", href: "/ai-drafter/proposals", icon: Pencil,
            children: [
                { name: "AI Proposals", href: "/ai-drafter/proposals", icon: FileText },
                { name: "Cap Statement", href: "/ai-drafter/capability-statement", icon: Mic },
                { name: "Email Templates", href: "/ai-drafter", icon: Mail, matchExact: true },
            ],
        },
        { name: "Documents", href: "/documents", icon: FolderOpen },
        { name: "Market Intel", href: "/intelligence", icon: BarChart3 },
        {
            name: "Partners", href: "/partners", icon: Users,
            children: [
                { name: "All Partners", href: "/partners", icon: Users, matchExact: true },
                { name: "Active", href: "/partners?status=active", icon: Handshake },
                { name: "Potential", href: "/partners?status=potential", icon: Clock },
                { name: "Suggested", href: "/partners?status=suggested", icon: Sparkles },
            ],
        },
        { name: "Competitors", href: "/competitors", icon: Shield },
        { name: "Recompetes", href: "/recompetes", icon: Radar },
        { name: "Forecasts", href: "/forecasts", icon: Telescope },
        { name: "Academy", href: "/academy", icon: GraduationCap },
    ];

    const bottomLinks = [
        { name: "Billing", href: "/billing", icon: CreditCard },
        { name: "Settings", href: "/settings", icon: Settings },
    ];

    const handleSignOut = async () => {
        await supabase.auth.signOut({ scope: "global" });
        localStorage.clear();
        sessionStorage.clear();
        document.cookie.split(";").forEach(c => {
            document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });
        window.location.replace("/login");
    };

    const handleNavClick = () => { setMobileOpen(false); };

    // Active matcher with query-param awareness. Three sub-items can point to
    // /partners?status=active, /partners?status=potential, /partners (exact) —
    // usePathname() strips the query, so we also compare the target href's
    // ?status= against the live one; only the matching tab highlights.
    const isLinkActive = (href: string, matchExact = false): boolean => {
        const [hrefPath, hrefQuery] = href.split("?");
        const hrefStatus = hrefQuery ? new URLSearchParams(hrefQuery).get("status") : null;

        if (matchExact) {
            // "Exact" means: same path AND no ?status= (the "All" sub-item).
            return pathname === hrefPath && !currentStatus;
        }

        // /ai-drafter is the Email Templates leaf — exact path only.
        if (hrefPath === "/ai-drafter") return pathname === "/ai-drafter";

        // If this link carries a ?status= param, it only lights up when the
        // current URL has that same param. Otherwise the 3 partner tabs all
        // match /partners and highlight together.
        if (hrefStatus) return pathname === hrefPath && currentStatus === hrefStatus;

        // Plain path link: prefix match is fine (covers nested /pipeline/[id]).
        return pathname === hrefPath || pathname.startsWith(hrefPath + "/");
    };

    // A parent with children is active if any child matches OR its own path matches.
    const isParentActive = (item: NavItem): boolean => {
        if (item.children && item.children.some(c => isLinkActive(c.href, c.matchExact))) return true;
        return isLinkActive(item.href);
    };

    const renderNavItem = (item: NavItem) => {
        const Icon = item.icon;
        const hasChildren = !!item.children?.length;
        const isActive = isParentActive(item);

        if (!hasChildren) {
            return (
                <Link
                    key={item.name}
                    href={item.href}
                    onClick={handleNavClick}
                    className={clsx(
                        "flex items-center space-x-3 px-4 py-3.5 lg:py-3 rounded-2xl transition-all duration-200 font-medium text-sm",
                        isActive
                            ? "bg-emerald-500/10 text-emerald-400 border-l-2 border-emerald-500"
                            : "text-stone-500 hover:bg-stone-800/50 hover:text-stone-300 border-l-2 border-transparent",
                    )}
                >
                    <Icon className={clsx("h-5 w-5", isActive ? "text-emerald-400" : "text-stone-500")} />
                    <span className="font-medium">{item.name}</span>
                </Link>
            );
        }

        return (
            <div key={item.name} className="relative group">
                {/* Parent row — clicking goes to the default child. Hover reveals flyout on desktop. */}
                <Link
                    href={item.href}
                    onClick={handleNavClick}
                    className={clsx(
                        "flex items-center space-x-3 px-4 py-3.5 lg:py-3 rounded-2xl transition-all duration-200 font-medium text-sm",
                        isActive
                            ? "bg-emerald-500/10 text-emerald-400 border-l-2 border-emerald-500"
                            : "text-stone-500 hover:bg-stone-800/50 hover:text-stone-300 border-l-2 border-transparent",
                    )}
                >
                    <Icon className={clsx("h-5 w-5", isActive ? "text-emerald-400" : "text-stone-500")} />
                    <span className="font-medium flex-1">{item.name}</span>
                    <ChevronRight className="h-3.5 w-3.5 opacity-40 group-hover:opacity-80 transition-opacity hidden lg:block" />
                </Link>

                {/* Mobile: inline expanded children (no hover, tap-friendly). */}
                <div className="lg:hidden pl-8 mt-0.5 space-y-0.5">
                    {item.children!.map(child => {
                        const ChildIcon = child.icon;
                        const childActive = isLinkActive(child.href, child.matchExact);
                        return (
                            <Link
                                key={child.name}
                                href={child.href}
                                onClick={handleNavClick}
                                className={clsx(
                                    "flex items-center space-x-3 px-4 py-2 rounded-xl text-xs transition-colors",
                                    childActive
                                        ? "bg-emerald-500/10 text-emerald-400"
                                        : "text-stone-500 hover:bg-stone-800/50 hover:text-stone-300",
                                )}
                            >
                                <ChildIcon className="h-3.5 w-3.5" />
                                <span>{child.name}</span>
                            </Link>
                        );
                    })}
                </div>

                {/* Desktop: flyout menu anchored to the right of the sidebar. Visible on group hover.
                    `group-hover:block` on Tailwind; a small buffer (pl-2, -translate-x-2) bridges the
                    gap so the hover doesn't break when moving cursor between parent and panel. */}
                <div className="hidden lg:group-hover:block absolute left-full top-0 ml-1 z-40 pt-0 min-w-[220px]">
                    <div className="bg-stone-900 border border-stone-800 rounded-2xl shadow-2xl py-2">
                        <div className="px-4 pb-1.5 mb-1 border-b border-stone-800/60 flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5 text-stone-500" />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500">{item.name}</span>
                        </div>
                        {item.children!.map(child => {
                            const ChildIcon = child.icon;
                            const childActive = isLinkActive(child.href, child.matchExact);
                            return (
                                <Link
                                    key={child.name}
                                    href={child.href}
                                    onClick={handleNavClick}
                                    className={clsx(
                                        "flex items-center space-x-3 px-4 py-2.5 mx-1 rounded-xl transition-colors text-sm",
                                        childActive
                                            ? "bg-emerald-500/10 text-emerald-400"
                                            : "text-stone-400 hover:bg-stone-800/60 hover:text-stone-200",
                                    )}
                                >
                                    <ChildIcon className={clsx("h-4 w-4", childActive ? "text-emerald-400" : "text-stone-500")} />
                                    <span className="font-medium">{child.name}</span>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    };

    const sidebarContent = (
        <>
            {/* Emerald gradient line at top */}
            <div className="h-0.5 bg-gradient-to-r from-emerald-500 via-emerald-400 to-transparent" />

            {/* Logo */}
            <div className="px-6 lg:px-8 mb-8 lg:mb-12 pt-5 flex items-center justify-between">
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

            {/* Navigation */}
            <nav className="flex-1 px-3 lg:px-4 space-y-0.5 lg:overflow-visible overflow-y-auto">
                {navLinks.map(renderNavItem)}
            </nav>

            {/* Bottom-anchored section: Quick Actions + nav footer */}
            <div className="mt-auto">
                {/* Quick Actions */}
                <QuickActions onNavigate={handleNavClick} />

                {/* Bottom links */}
                <div className="px-3 lg:px-4 space-y-0.5 border-t border-stone-800/60 pt-3">
                    {bottomLinks.map((link) => {
                        const Icon = link.icon;
                        const isActive = pathname.startsWith(link.href);
                        return (
                            <Link
                                key={link.name}
                                href={link.href}
                                onClick={handleNavClick}
                                className={clsx(
                                    "flex items-center space-x-3 px-4 py-3.5 lg:py-3 rounded-2xl transition-all duration-200 text-sm",
                                    isActive
                                        ? "bg-emerald-500/10 text-emerald-400 border-l-2 border-emerald-500"
                                        : "text-stone-500 hover:bg-stone-800/50 hover:text-stone-300 border-l-2 border-transparent",
                                )}
                            >
                                <Icon className={clsx("h-5 w-5", isActive ? "text-emerald-400" : "text-stone-500")} />
                                <span className="font-medium">{link.name}</span>
                            </Link>
                        );
                    })}
                    <button
                        type="button"
                        onClick={handleSignOut}
                        className="w-full flex items-center space-x-3 px-4 py-3.5 lg:py-3 rounded-2xl text-stone-500 hover:bg-stone-800/50 hover:text-red-400 transition-all duration-200 text-sm border-l-2 border-transparent"
                    >
                        <LogOut className="h-5 w-5" />
                        <span className="font-medium">Sign Out</span>
                    </button>
                </div>
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

            {/* Mobile slide-out sidebar */}
            <div
                className={clsx(
                    "lg:hidden fixed top-0 left-0 bottom-0 z-50 w-72 bg-stone-950 flex flex-col pb-6 shadow-2xl transition-transform duration-300 ease-in-out",
                    mobileOpen ? "translate-x-0" : "-translate-x-full",
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

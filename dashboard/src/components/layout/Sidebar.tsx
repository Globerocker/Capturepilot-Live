"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Target, Zap, Layers, CheckSquare, Settings, LogOut, Menu, X, BarChart3, Crosshair, CreditCard, PenTool, Lock } from "lucide-react";
import clsx from "clsx";
import { createSupabaseClient } from "@/lib/supabase/client";

export default function Sidebar() {
    const [mobileOpen, setMobileOpen] = useState(false);
    const pathname = usePathname();
    const router = useRouter();
    const supabase = createSupabaseClient();

    const navLinks = [
        { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        { name: "My Matches", href: "/matches", icon: Zap },
        { name: "Pipeline", href: "/pipeline", icon: Layers },
        { name: "Opportunities", href: "/opportunities", icon: Target },
        { name: "Action Items", href: "/actions", icon: CheckSquare },
        { name: "Capture Intel", href: "/capture-intel", icon: Crosshair },
        { name: "Letters", href: "/letters", icon: PenTool },
        { name: "Analytics", href: "/analytics", icon: BarChart3 },
        { name: "Billing", href: "/billing", icon: CreditCard },
    ];

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        const marketingUrl = process.env.NEXT_PUBLIC_MARKETING_URL || "/";
        window.location.href = marketingUrl;
    };

    const handleLock = () => {
        window.dispatchEvent(new Event("lock-session"));
        setMobileOpen(false);
    };

    const handleNavClick = () => {
        setMobileOpen(false);
    };

    const sidebarContent = (
        <>
            {/* Logo */}
            <div className="px-6 lg:px-8 mb-8 lg:mb-12 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-xl bg-black flex items-center justify-center shadow-lg shadow-stone-300">
                        <Zap className="h-4 w-4 text-white" />
                    </div>
                    <h1 className="text-xl font-bold font-typewriter tracking-tight">CapturePilot</h1>
                </div>
                <button
                    type="button"
                    title="Close menu"
                    onClick={() => setMobileOpen(false)}
                    className="lg:hidden p-2 -mr-2 text-stone-400 hover:text-stone-900"
                >
                    <X className="h-5 w-5" />
                </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 lg:px-4 space-y-1.5">
                {navLinks.map((link) => {
                    const Icon = link.icon;
                    const isActive = pathname.startsWith(link.href);

                    return (
                        <Link
                            key={link.name}
                            href={link.href}
                            onClick={handleNavClick}
                            className={clsx(
                                "flex items-center space-x-3 px-4 py-3.5 lg:py-3 rounded-2xl transition-all duration-300 font-medium text-sm",
                                isActive
                                    ? "bg-black text-white shadow-lg shadow-stone-400/30"
                                    : "text-stone-500 hover:bg-stone-100 hover:text-stone-900 active:bg-stone-200"
                            )}
                        >
                            <Icon className="h-5 w-5" />
                            <span className="font-typewriter">{link.name}</span>
                        </Link>
                    );
                })}
            </nav>

            {/* Bottom links */}
            <div className="px-3 lg:px-4 mt-auto space-y-1">
                <Link
                    href="/settings"
                    onClick={handleNavClick}
                    className={clsx(
                        "flex items-center space-x-3 px-4 py-3.5 lg:py-3 rounded-2xl transition-all duration-200 text-sm",
                        pathname.startsWith("/settings")
                            ? "bg-black text-white shadow-lg shadow-stone-400/30"
                            : "text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                    )}
                >
                    <Settings className="h-5 w-5" />
                    <span className="font-typewriter font-medium">Settings</span>
                </Link>
                <button
                    type="button"
                    onClick={handleLock}
                    className="w-full flex items-center space-x-3 px-4 py-3.5 lg:py-3 rounded-2xl text-stone-400 hover:bg-amber-50 hover:text-amber-600 transition-all duration-200 text-sm"
                >
                    <Lock className="h-5 w-5" />
                    <span className="font-typewriter font-medium">Lock</span>
                </button>
                <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full flex items-center space-x-3 px-4 py-3.5 lg:py-3 rounded-2xl text-stone-400 hover:bg-red-50 hover:text-red-600 transition-all duration-200 text-sm"
                >
                    <LogOut className="h-5 w-5" />
                    <span className="font-typewriter font-medium">Sign Out</span>
                </button>
            </div>
        </>
    );

    return (
        <>
            {/* Mobile header bar */}
            <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200 px-4 h-14 flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-lg bg-black flex items-center justify-center">
                        <Zap className="h-3.5 w-3.5 text-white" />
                    </div>
                    <span className="text-base font-bold font-typewriter">CapturePilot</span>
                </div>
                <button
                    type="button"
                    title="Open menu"
                    onClick={() => setMobileOpen(true)}
                    className="p-2 -mr-1 text-stone-600 hover:text-stone-900"
                >
                    <Menu className="h-5 w-5" />
                </button>
            </div>

            {/* Mobile overlay */}
            {mobileOpen && (
                <div
                    className="lg:hidden fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            {/* Mobile slide-out sidebar */}
            <div
                className={clsx(
                    "lg:hidden fixed top-0 left-0 bottom-0 z-50 w-72 bg-white flex flex-col pt-6 pb-6 shadow-2xl transition-transform duration-300 ease-in-out",
                    mobileOpen ? "translate-x-0" : "-translate-x-full"
                )}
            >
                {sidebarContent}
            </div>

            {/* Desktop sidebar */}
            <aside className="hidden lg:flex w-64 flex-shrink-0 bg-gradient-to-b from-white via-white to-stone-50 border-r border-stone-200 h-screen sticky top-0 flex-col pt-6 pb-6 shadow-sm rounded-r-[40px]">
                {sidebarContent}
            </aside>
        </>
    );
}

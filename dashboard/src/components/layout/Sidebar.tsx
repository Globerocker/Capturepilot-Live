"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { LayoutDashboard, Target, Layers, FileText, BarChart3, Mic, Users, Shield, CreditCard, Settings, LogOut, Menu, X, Lock, FolderOpen, Pencil } from "lucide-react";
import clsx from "clsx";
import { createSupabaseClient } from "@/lib/supabase/client";

export default function Sidebar() {
    const [mobileOpen, setMobileOpen] = useState(false);
    const pathname = usePathname();
    const router = useRouter();
    const supabase = createSupabaseClient();

    const navLinks = [
        { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        { name: "Opportunities", href: "/matches", icon: Target },
        { name: "Pipeline", href: "/pipeline", icon: Layers },
        { name: "AI Proposals", href: "/proposals", icon: FileText },
        { name: "AI Drafter", href: "/ai-drafter", icon: Pencil },
        { name: "Documents", href: "/documents", icon: FolderOpen },
        { name: "Market Intel", href: "/intelligence", icon: BarChart3 },
        { name: "Cap Statement", href: "/capability-statement", icon: Mic },
        { name: "Partners", href: "/partners", icon: Users },
        { name: "Competitors", href: "/competitors", icon: Shield },
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

    const handleLock = () => {
        window.dispatchEvent(new Event("lock-session"));
        setMobileOpen(false);
    };

    const handleNavClick = () => {
        setMobileOpen(false);
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
            <nav className="flex-1 px-3 lg:px-4 space-y-0.5">
                {navLinks.map((link) => {
                    const Icon = link.icon;
                    const isActive = pathname.startsWith(link.href);

                    return (
                        <Link
                            key={link.name}
                            href={link.href}
                            onClick={handleNavClick}
                            className={clsx(
                                "flex items-center space-x-3 px-4 py-3.5 lg:py-3 rounded-2xl transition-all duration-200 font-medium text-sm",
                                isActive
                                    ? "bg-emerald-500/10 text-emerald-400 border-l-2 border-emerald-500"
                                    : "text-stone-500 hover:bg-stone-800/50 hover:text-stone-300 border-l-2 border-transparent"
                            )}
                        >
                            <Icon className={clsx("h-5 w-5", isActive ? "text-emerald-400" : "text-stone-500")} />
                            <span className="font-medium">{link.name}</span>
                        </Link>
                    );
                })}
            </nav>

            {/* Bottom links */}
            <div className="px-3 lg:px-4 mt-auto space-y-0.5 border-t border-stone-800/60 pt-3">
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
                                    : "text-stone-500 hover:bg-stone-800/50 hover:text-stone-300 border-l-2 border-transparent"
                            )}
                        >
                            <Icon className={clsx("h-5 w-5", isActive ? "text-emerald-400" : "text-stone-500")} />
                            <span className="font-medium">{link.name}</span>
                        </Link>
                    );
                })}
                <button
                    type="button"
                    onClick={handleLock}
                    className="w-full flex items-center space-x-3 px-4 py-3.5 lg:py-3 rounded-2xl text-stone-500 hover:bg-stone-800/50 hover:text-amber-400 transition-all duration-200 text-sm border-l-2 border-transparent"
                >
                    <Lock className="h-5 w-5" />
                    <span className="font-medium">Lock</span>
                </button>
                <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full flex items-center space-x-3 px-4 py-3.5 lg:py-3 rounded-2xl text-stone-500 hover:bg-stone-800/50 hover:text-red-400 transition-all duration-200 text-sm border-l-2 border-transparent"
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

            {/* Mobile slide-out sidebar */}
            <div
                className={clsx(
                    "lg:hidden fixed top-0 left-0 bottom-0 z-50 w-72 bg-stone-950 flex flex-col pb-6 shadow-2xl transition-transform duration-300 ease-in-out",
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

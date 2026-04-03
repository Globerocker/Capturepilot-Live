"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import {
    Zap, LayoutDashboard, Users, Briefcase, Target, UserCog,
    Wrench, Settings, LogOut, Loader2, Search, ChevronDown,
    Menu, X, FileText, Bell,
} from "lucide-react";
import clsx from "clsx";

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const NAV = [
    { href: "/admin/overview", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/admin/clients", icon: Users, label: "Clients" },
    { href: "/admin/opportunities", icon: Briefcase, label: "Opportunities" },
    { href: "/admin/prospects", icon: Search, label: "Lead Pipeline" },
    { href: "/admin/users", icon: UserCog, label: "Users" },
    { href: "/admin/tools", icon: Wrench, label: "Tools" },
    { href: "/admin/settings", icon: Settings, label: "Settings" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [loading, setLoading] = useState(true);
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { window.location.href = "/login"; return; }
            setLoading(false);
        })();
    }, []);

    if (loading) {
        return <div className="min-h-screen bg-stone-50 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-stone-400" /></div>;
    }

    return (
        <div className="min-h-screen bg-stone-50 flex">
            {/* Mobile toggle */}
            <button type="button" onClick={() => setMobileOpen(!mobileOpen)}
                className="lg:hidden fixed top-4 left-4 z-50 bg-white border border-stone-200 rounded-xl p-2 shadow-sm">
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            {mobileOpen && <div className="lg:hidden fixed inset-0 bg-black/20 z-30" onClick={() => setMobileOpen(false)} />}

            {/* Sidebar */}
            <aside className={clsx(
                "w-56 bg-stone-900 text-white flex flex-col z-40",
                "fixed lg:static inset-y-0 left-0 transition-transform duration-200",
                mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
            )}>
                <div className="p-4 border-b border-stone-800">
                    <Link href="/admin/overview" className="flex items-center gap-2">
                        <Zap className="w-5 h-5 text-emerald-400" />
                        <span className="font-typewriter font-bold text-sm">CapturePilot</span>
                    </Link>
                    <p className="text-[10px] text-stone-500 font-typewriter mt-0.5 uppercase tracking-widest">Admin Console</p>
                </div>

                <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
                    {NAV.map((item) => {
                        const isActive = pathname === item.href || (item.href !== "/admin/overview" && pathname?.startsWith(item.href));
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => setMobileOpen(false)}
                                className={clsx(
                                    "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                                    isActive ? "bg-white/10 text-white" : "text-stone-400 hover:bg-white/5 hover:text-stone-200"
                                )}
                            >
                                <item.icon className="w-4 h-4" />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-2 border-t border-stone-800">
                    <Link href="/check" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-stone-400 hover:bg-white/5 hover:text-white transition-colors">
                        <FileText className="w-4 h-4" /> Quick Check
                    </Link>
                    <button
                        type="button"
                        onClick={async () => { await supabase.auth.signOut(); window.location.href = "/login"; }}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-stone-500 hover:bg-white/5 hover:text-red-400 w-full transition-colors"
                    >
                        <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                </div>
            </aside>

            {/* Main */}
            <main className="flex-1 min-h-screen overflow-auto">
                <div className="p-4 sm:p-6 lg:p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}

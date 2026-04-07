"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import Image from "next/image";
import {
    LayoutDashboard, ListTodo, Briefcase, FileText,
    LogOut, Loader2, Settings, Menu, X, Layers, FolderOpen, Users,
} from "lucide-react";
import clsx from "clsx";

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const NAV_ITEMS = [
    { href: "/portal", icon: LayoutDashboard, label: "Overview" },
    { href: "/portal/opportunities", icon: Briefcase, label: "Opportunities" },
    { href: "/portal/pipeline", icon: Layers, label: "Pipeline" },
    { href: "/portal/tasks", icon: ListTodo, label: "Tasks" },
    { href: "/portal/competitors", icon: Users, label: "Competitors" },
    { href: "/portal/documents", icon: FolderOpen, label: "Documents" },
    { href: "/portal/capability-statement", icon: FileText, label: "Capability Statement" },
    { href: "/portal/settings", icon: Settings, label: "Account" },
];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [companyName, setCompanyName] = useState("");
    const [loading, setLoading] = useState(true);
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                window.location.href = "/login";
                return;
            }

            // 48h auto-logout: check when session started
            const SESSION_MAX_MS = 48 * 60 * 60 * 1000; // 48 hours
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
                .select("company_name, account_type")
                .eq("auth_user_id", user.id)
                .single();

            if (data) setCompanyName(data.company_name || "");
            setLoading(false);
        })();
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen bg-stone-50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-stone-400 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-stone-50 flex">
            {/* Mobile menu button */}
            <button type="button" onClick={() => setMobileOpen(!mobileOpen)}
                className="lg:hidden fixed top-4 left-4 z-50 bg-white border border-stone-200 rounded-xl p-2 shadow-sm">
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            {/* Mobile overlay */}
            {mobileOpen && <div className="lg:hidden fixed inset-0 bg-black/20 z-30" onClick={() => setMobileOpen(false)} />}

            {/* Sidebar */}
            <aside className={clsx(
                "w-64 bg-white border-r border-stone-200 flex flex-col z-40",
                "fixed lg:static inset-y-0 left-0 transition-transform duration-200",
                mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
            )}>
                <div className="p-5 border-b border-stone-100">
                    <Link href="/portal" className="flex items-center gap-2">
                        <Image src="/logo.png" alt="CapturePilot" width={20} height={20} className="rounded" />
                        <span className="font-typewriter font-bold text-sm">CapturePilot</span>
                        <span className="text-[9px] font-typewriter bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full uppercase">Client</span>
                    </Link>
                    {companyName && (
                        <p className="text-xs text-stone-500 mt-1 truncate">{companyName}</p>
                    )}
                </div>

                <nav className="flex-1 p-3 space-y-1">
                    {NAV_ITEMS.map((item) => {
                        const isActive = pathname === item.href || (item.href !== "/portal" && pathname?.startsWith(item.href));
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={clsx(
                                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                                    isActive
                                        ? "bg-black text-white"
                                        : "text-stone-600 hover:bg-stone-100"
                                )}
                            >
                                <item.icon className="w-4 h-4" />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-3 border-t border-stone-100">
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
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-stone-500 hover:bg-stone-100 w-full transition-colors"
                    >
                        <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">
                <div className="w-full">
                    {children}
                </div>
            </main>
        </div>
    );
}

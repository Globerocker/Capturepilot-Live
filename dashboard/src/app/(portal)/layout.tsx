"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import Image from "next/image";
import {
    LayoutDashboard, ListTodo, Briefcase, FileText,
    LogOut, Loader2, Settings, Menu, X, Layers, FolderOpen, Users,
    MessageSquare,
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
    { href: "/portal/messages", icon: MessageSquare, label: "Messages" },
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
    const [unreadMessages, setUnreadMessages] = useState(0);

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

            if (data) {
                setCompanyName(data.company_name || "");

                // Fetch unread message count
                const { data: profile } = await supabase
                    .from("user_profiles")
                    .select("id")
                    .eq("auth_user_id", user.id)
                    .single();

                if (profile) {
                    const { count } = await supabase
                        .from("client_messages")
                        .select("id", { count: "exact", head: true })
                        .eq("user_profile_id", profile.id)
                        .eq("sender_type", "admin")
                        .is("read_at", null);
                    setUnreadMessages(count || 0);
                }
            }
            setLoading(false);
        })();
    }, []);

    // Poll unread count every 30 seconds
    useEffect(() => {
        const interval = setInterval(async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data: profile } = await supabase
                .from("user_profiles")
                .select("id")
                .eq("auth_user_id", user.id)
                .single();
            if (profile) {
                const { count } = await supabase
                    .from("client_messages")
                    .select("id", { count: "exact", head: true })
                    .eq("user_profile_id", profile.id)
                    .eq("sender_type", "admin")
                    .is("read_at", null);
                setUnreadMessages(count || 0);
            }
        }, 30000);
        return () => clearInterval(interval);
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
                className="lg:hidden fixed top-4 left-4 z-50 bg-stone-900 border border-stone-700 rounded-xl p-2 shadow-sm text-stone-300">
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            {/* Mobile overlay */}
            {mobileOpen && <div className="lg:hidden fixed inset-0 bg-black/30 backdrop-blur-sm z-30" onClick={() => setMobileOpen(false)} />}

            {/* Sidebar */}
            <aside className={clsx(
                "w-64 bg-stone-950 flex flex-col z-40",
                "fixed lg:static inset-y-0 left-0 transition-transform duration-200",
                mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
            )}>
                {/* Emerald gradient line at top */}
                <div className="h-0.5 bg-gradient-to-r from-emerald-500 via-emerald-400 to-transparent" />

                <div className="p-5 border-b border-stone-800/60">
                    <Link href="/portal" className="flex items-center gap-2">
                        <Image src="/logo.png" alt="CapturePilot" width={20} height={20} className="rounded" />
                        <span className="font-typewriter font-semibold text-sm text-stone-200">CapturePilot</span>
                        <span className="text-[9px] font-typewriter bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full uppercase border border-emerald-500/20">Client</span>
                    </Link>
                    {companyName && (
                        <p className="text-xs text-stone-500 mt-1.5 truncate">{companyName}</p>
                    )}
                </div>

                <nav className="flex-1 p-3 space-y-0.5">
                    {NAV_ITEMS.map((item) => {
                        const isActive = pathname === item.href || (item.href !== "/portal" && pathname?.startsWith(item.href));
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={clsx(
                                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                                    isActive
                                        ? "bg-emerald-500/10 text-emerald-400 border-l-2 border-emerald-500"
                                        : "text-stone-500 hover:bg-stone-800/50 hover:text-stone-300 border-l-2 border-transparent"
                                )}
                            >
                                <item.icon className={clsx("w-4 h-4", isActive ? "text-emerald-400" : "text-stone-500")} />
                                {item.label}
                                {item.label === "Messages" && unreadMessages > 0 && (
                                    <span className="ml-auto bg-emerald-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1">
                                        {unreadMessages}
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

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-auto dot-grid-bg">
                <div className="bg-emerald-600 text-white text-center py-2 px-4 text-xs font-medium flex-shrink-0">
                    🚀 Public Beta — All features unlocked free until May 8, 2026
                </div>
                <div className="w-full flex-1 p-4 sm:p-6 lg:p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}

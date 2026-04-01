"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import {
    Zap, LayoutDashboard, ListTodo, Briefcase, FileText, Users,
    LogOut, Loader2,
} from "lucide-react";
import clsx from "clsx";

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const NAV_ITEMS = [
    { href: "/portal", icon: LayoutDashboard, label: "Overview" },
    { href: "/portal/tasks", icon: ListTodo, label: "Tasks" },
    { href: "/portal/opportunities", icon: Briefcase, label: "Opportunities" },
    { href: "/portal/documents", icon: FileText, label: "Documents" },
    { href: "/portal/competitors", icon: Users, label: "Competitors" },
];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [companyName, setCompanyName] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
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
            {/* Sidebar */}
            <aside className="w-64 bg-white border-r border-stone-200 flex flex-col">
                <div className="p-5 border-b border-stone-100">
                    <Link href="/portal" className="flex items-center gap-2">
                        <Zap className="w-5 h-5 text-black" />
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
                            await supabase.auth.signOut();
                            window.location.href = "/login";
                        }}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-stone-500 hover:bg-stone-100 w-full transition-colors"
                    >
                        <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 p-6 sm:p-8 overflow-auto">
                {children}
            </main>
        </div>
    );
}

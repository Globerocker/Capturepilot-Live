"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Target, Zap, CheckSquare, Settings, LogOut } from "lucide-react";
import clsx from "clsx";
import { createSupabaseClient } from "@/lib/supabase/client";

export default function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const supabase = createSupabaseClient();

    const navLinks = [
        { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        { name: "My Matches", href: "/matches", icon: Zap },
        { name: "Opportunities", href: "/opportunities", icon: Target },
        { name: "Action Items", href: "/actions", icon: CheckSquare },
    ];

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push("/");
    };

    return (
        <aside className="w-64 flex-shrink-0 bg-gradient-to-b from-white via-white to-stone-50 border-r border-stone-200 h-screen sticky top-0 flex flex-col pt-6 pb-6 shadow-sm rounded-r-[40px]">
            {/* Logo */}
            <div className="px-8 mb-12 flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-black flex items-center justify-center shadow-lg shadow-stone-300">
                    <Zap className="h-4 w-4 text-white" />
                </div>
                <h1 className="text-xl font-bold font-typewriter tracking-tight">CapturePilot</h1>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-4 space-y-2">
                {navLinks.map((link) => {
                    const Icon = link.icon;
                    const isActive = pathname.startsWith(link.href);

                    return (
                        <Link
                            key={link.name}
                            href={link.href}
                            className={clsx(
                                "flex items-center space-x-3 px-4 py-3 rounded-2xl transition-all duration-300 font-medium text-sm",
                                isActive
                                    ? "bg-black text-white shadow-lg shadow-stone-400/30"
                                    : "text-stone-500 hover:bg-stone-100 hover:text-stone-900 hover:translate-x-0.5"
                            )}
                        >
                            <Icon className="h-5 w-5" />
                            <span className="font-typewriter">{link.name}</span>
                        </Link>
                    );
                })}
            </nav>

            {/* Bottom links */}
            <div className="px-4 mt-auto space-y-1">
                <Link
                    href="/settings"
                    className={clsx(
                        "flex items-center space-x-3 px-4 py-3 rounded-2xl transition-all duration-200 text-sm",
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
                    onClick={handleSignOut}
                    className="w-full flex items-center space-x-3 px-4 py-3 rounded-2xl text-stone-400 hover:bg-red-50 hover:text-red-600 transition-all duration-200 text-sm"
                >
                    <LogOut className="h-5 w-5" />
                    <span className="font-typewriter font-medium">Sign Out</span>
                </button>
            </div>
        </aside>
    );
}

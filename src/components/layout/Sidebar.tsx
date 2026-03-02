"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Target, Activity, Settings, Zap, Briefcase } from "lucide-react";
import clsx from "clsx";

export default function Sidebar() {
    const pathname = usePathname();

    const navLinks = [
        { name: "Overview", href: "/", icon: LayoutDashboard },
        { name: "Opportunities", href: "/opportunities", icon: Target },
        { name: "Matches", href: "/matches", icon: Zap },
        { name: "Contractors", href: "/contractors", icon: Users },
        { name: "Pipeline", href: "/pipeline", icon: Briefcase },
        { name: "Intelligence", href: "/intelligence", icon: Activity },
    ];

    return (
        <aside className="w-64 flex-shrink-0 bg-white border-r border-stone-200 h-screen flex flex-col pt-6 pb-6 shadow-sm rounded-r-[40px]">
            {/* Logo */}
            <div className="px-8 mb-12 flex items-center space-x-3">
                <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center">
                    <Zap className="h-4 w-4 text-white" />
                </div>
                <h1 className="text-xl font-bold font-typewriter tracking-tight">Capture.OS</h1>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-4 space-y-2">
                {navLinks.map((link) => {
                    const Icon = link.icon;
                    const isActive = pathname === link.href;

                    return (
                        <Link
                            key={link.name}
                            href={link.href}
                            className={clsx(
                                "flex items-center space-x-3 px-4 py-3 rounded-2xl transition-all duration-200 font-medium text-sm",
                                isActive
                                    ? "bg-black text-white shadow-md shadow-stone-300"
                                    : "text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                            )}
                        >
                            <Icon className="h-5 w-5" />
                            <span className="font-typewriter">{link.name}</span>
                        </Link>
                    );
                })}
            </nav>

            {/* Settings */}
            <div className="px-4 mt-auto">
                <Link
                    href="/settings"
                    className="flex items-center space-x-3 px-4 py-3 rounded-2xl text-stone-500 hover:bg-stone-100 hover:text-stone-900 transition-all duration-200 text-sm"
                >
                    <Settings className="h-5 w-5" />
                    <span className="font-typewriter font-medium">Settings</span>
                </Link>
            </div>
        </aside>
    );
}

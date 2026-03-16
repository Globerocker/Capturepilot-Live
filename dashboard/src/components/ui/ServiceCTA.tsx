"use client";

import { Phone, Calendar, ArrowRight } from "lucide-react";
import clsx from "clsx";

interface ServiceCTAProps {
    title: string;
    description: string;
    variant?: "default" | "dark" | "amber" | "inline";
    href?: string;
    icon?: "phone" | "calendar";
}

const BOOKING_URL = "https://calendly.com/americurial/intro-call";

export default function ServiceCTA({ title, description, variant = "default", href, icon = "calendar" }: ServiceCTAProps) {
    const Icon = icon === "phone" ? Phone : Calendar;
    const link = href || BOOKING_URL;

    if (variant === "inline") {
        return (
            <a href={link} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs font-typewriter font-bold text-blue-600 hover:text-blue-800 transition-colors group">
                <Icon className="w-3.5 h-3.5" />
                <span className="group-hover:underline">{title}</span>
                <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
        );
    }

    return (
        <a href={link} target="_blank" rel="noopener noreferrer"
            className={clsx(
                "block rounded-2xl p-4 sm:p-5 border transition-all hover:shadow-md group",
                variant === "dark" ? "bg-gradient-to-br from-stone-900 to-stone-800 border-stone-700 text-white" :
                variant === "amber" ? "bg-gradient-to-br from-amber-50 to-white border-amber-200" :
                "bg-gradient-to-br from-blue-50 to-white border-blue-200"
            )}>
            <div className="flex items-start gap-3">
                <div className={clsx(
                    "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0",
                    variant === "dark" ? "bg-emerald-500/20 text-emerald-400" :
                    variant === "amber" ? "bg-amber-100 text-amber-600" :
                    "bg-blue-100 text-blue-600"
                )}>
                    <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className={clsx(
                        "font-typewriter font-bold text-sm mb-0.5 flex items-center gap-1.5",
                        variant === "dark" ? "text-white" : "text-stone-900"
                    )}>
                        {title}
                        <ArrowRight className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </p>
                    <p className={clsx(
                        "text-xs leading-relaxed",
                        variant === "dark" ? "text-stone-400" :
                        variant === "amber" ? "text-amber-700" :
                        "text-blue-700"
                    )}>
                        {description}
                    </p>
                </div>
            </div>
        </a>
    );
}

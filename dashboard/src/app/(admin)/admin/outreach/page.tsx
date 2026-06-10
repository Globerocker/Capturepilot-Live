"use client";

import { useState } from "react";
import clsx from "clsx";
import { Sparkles, FileText, ShieldX, Settings } from "lucide-react";
import ProspectsTab from "./components/ProspectsTab";
import TemplatesTab from "./components/TemplatesTab";
import SuppressionTab from "./components/SuppressionTab";
import SettingsTab from "./components/SettingsTab";

type TabKey = "prospects" | "templates" | "suppression" | "settings";

const TABS: Array<{ key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { key: "prospects", label: "Prospects", icon: Sparkles },
    { key: "templates", label: "Templates", icon: FileText },
    { key: "suppression", label: "Suppression", icon: ShieldX },
    { key: "settings", label: "Settings", icon: Settings },
];

export default function OutreachAdminPage() {
    const [tab, setTab] = useState<TabKey>("prospects");

    return (
        <div className="max-w-[1600px] mx-auto p-6 space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                    <Sparkles className="w-6 h-6 text-emerald-600" /> Outreach
                </h1>
                <p className="text-sm text-stone-500 mt-1">
                    Cold-outreach pipeline: prospects, templates, suppression list, and sender defaults.
                </p>
            </div>

            {/* Tab strip */}
            <div className="border-b border-stone-200 flex items-center gap-1 overflow-x-auto">
                {TABS.map(t => {
                    const Icon = t.icon;
                    const active = tab === t.key;
                    return (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => setTab(t.key)}
                            className={clsx(
                                "inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition-colors -mb-px",
                                active
                                    ? "text-black border-black"
                                    : "text-stone-500 border-transparent hover:text-stone-800 hover:border-stone-300",
                            )}
                        >
                            <Icon className="w-4 h-4" />
                            {t.label}
                        </button>
                    );
                })}
            </div>

            {tab === "prospects" && <ProspectsTab />}
            {tab === "templates" && <TemplatesTab />}
            {tab === "suppression" && <SuppressionTab />}
            {tab === "settings" && <SettingsTab />}
        </div>
    );
}

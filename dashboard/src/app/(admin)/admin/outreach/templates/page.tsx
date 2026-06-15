"use client";

import { FileText } from "lucide-react";
import OutreachNav from "@/components/outreach/OutreachNav";
import TemplatesTab from "../components/TemplatesTab";

export default function OutreachTemplatesPage() {
    return (
        <div className="min-h-screen bg-stone-50">
            <header className="bg-white border-b border-stone-200 px-4 sm:px-6 pt-4">
                <div className="max-w-[1600px] mx-auto">
                    <h1 className="font-bold text-lg flex items-center gap-2 mb-3">
                        <FileText className="w-5 h-5" /> Outreach Templates
                    </h1>
                    <OutreachNav active="templates" />
                </div>
            </header>
            <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
                <TemplatesTab />
            </main>
        </div>
    );
}

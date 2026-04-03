"use client";

import { Settings, Database, Globe, Key, Server } from "lucide-react";

export default function AdminSettings() {
    return (
        <div className="w-full space-y-6">
            <h1 className="text-xl font-bold font-typewriter flex items-center gap-2">
                <Settings className="w-5 h-5" /> System Settings
            </h1>

            {/* URLs */}
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-5 py-3 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-stone-400" />
                    <h2 className="font-bold text-sm">URLs & Domains</h2>
                </div>
                <div className="p-5 space-y-2 text-sm">
                    <div className="flex justify-between py-1.5 border-b border-stone-50"><span className="text-stone-500">App</span><span className="font-mono text-stone-700">app.capturepilot.com</span></div>
                    <div className="flex justify-between py-1.5 border-b border-stone-50"><span className="text-stone-500">Admin</span><span className="font-mono text-stone-700">admin.capturepilot.com</span></div>
                    <div className="flex justify-between py-1.5 border-b border-stone-50"><span className="text-stone-500">Quick Check</span><span className="font-mono text-stone-700">app.capturepilot.com/check</span></div>
                    <div className="flex justify-between py-1.5 border-b border-stone-50"><span className="text-stone-500">Client Portal</span><span className="font-mono text-stone-700">app.capturepilot.com/portal</span></div>
                    <div className="flex justify-between py-1.5"><span className="text-stone-500">Vercel</span><a href="https://vercel.com/celluiq/capturepilot-v3" target="_blank" rel="noopener noreferrer" className="font-mono text-blue-600 hover:underline">vercel.com/celluiq/capturepilot-v3</a></div>
                </div>
            </div>

            {/* Database */}
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-5 py-3 flex items-center gap-2">
                    <Database className="w-4 h-4 text-stone-400" />
                    <h2 className="font-bold text-sm">Database (Supabase)</h2>
                </div>
                <div className="p-5 space-y-2 text-sm">
                    <div className="flex justify-between py-1.5 border-b border-stone-50"><span className="text-stone-500">Dashboard</span><a href="https://supabase.com/dashboard/project/ryxgjzehoijjvczqkhwr" target="_blank" rel="noopener noreferrer" className="font-mono text-blue-600 hover:underline">supabase.com/dashboard</a></div>
                    <div className="flex justify-between py-1.5 border-b border-stone-50"><span className="text-stone-500">Plan</span><span className="text-stone-700">Pro</span></div>
                    <div className="flex justify-between py-1.5 border-b border-stone-50"><span className="text-stone-500">Region</span><span className="text-stone-700">US East (IAD)</span></div>
                    <div className="flex justify-between py-1.5"><span className="text-stone-500">Storage Buckets</span><span className="text-stone-700">client-docs, opportunity-attachments</span></div>
                </div>
            </div>

            {/* API Keys */}
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-5 py-3 flex items-center gap-2">
                    <Key className="w-4 h-4 text-stone-400" />
                    <h2 className="font-bold text-sm">API Keys (Vercel Env Vars)</h2>
                </div>
                <div className="p-5 space-y-2 text-sm">
                    {["SAM_API_KEY", "SUPABASE_SERVICE_KEY", "OPENAI_API_KEY", "APOLLO_API_KEY", "RESEND_API_KEY", "GEMINI_API_KEY", "CRON_SECRET"].map(k => (
                        <div key={k} className="flex justify-between py-1.5 border-b border-stone-50 last:border-0">
                            <span className="font-mono text-stone-600">{k}</span>
                            <span className="text-emerald-600 text-xs font-bold">Configured</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Infrastructure */}
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-5 py-3 flex items-center gap-2">
                    <Server className="w-4 h-4 text-stone-400" />
                    <h2 className="font-bold text-sm">Infrastructure</h2>
                </div>
                <div className="p-5 space-y-2 text-sm">
                    <div className="flex justify-between py-1.5 border-b border-stone-50"><span className="text-stone-500">Framework</span><span className="text-stone-700">Next.js 16.1.6 (Turbopack)</span></div>
                    <div className="flex justify-between py-1.5 border-b border-stone-50"><span className="text-stone-500">Node.js</span><span className="text-stone-700">20.x LTS</span></div>
                    <div className="flex justify-between py-1.5 border-b border-stone-50"><span className="text-stone-500">Hosting</span><span className="text-stone-700">Vercel (Pro)</span></div>
                    <div className="flex justify-between py-1.5 border-b border-stone-50"><span className="text-stone-500">Email</span><span className="text-stone-700">Resend</span></div>
                    <div className="flex justify-between py-1.5 border-b border-stone-50"><span className="text-stone-500">AI</span><span className="text-stone-700">OpenAI (GPT-4o-mini) + Gemini Flash</span></div>
                    <div className="flex justify-between py-1.5"><span className="text-stone-500">Enrichment</span><span className="text-stone-700">Apollo.io + USASpending + SAM.gov</span></div>
                </div>
            </div>
        </div>
    );
}

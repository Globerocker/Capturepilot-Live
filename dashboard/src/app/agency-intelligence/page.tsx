"use client";

// Force rebuild for intelligence route detection
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Loader2, Activity, BrainCircuit, BarChart, FileText, Layers, Target } from "lucide-react";
import clsx from "clsx";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ryxgjzehoijjvczqkhwr.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5eGdqemVob2lqanZjenFraHdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNDg0NTUsImV4cCI6MjA4NzYyNDQ1NX0.q0HivHixjE-A2MuQZlmlZOO2eLpQEm8c6XhQQQKaJsY"
);

export default function IntelligencePage() {
    const [loading, setLoading] = useState(true);
    const [logs, setLogs] = useState<any[]>([]);

    useEffect(() => {
        async function fetchLogs() {
            const { data, error } = await supabase
                .from("agency_intelligence_logs")
                .select("*")
                .order("week_start", { ascending: false })
                .limit(4);

            if (data) setLogs(data);
            setLoading(false);
        }
        fetchLogs();
    }, []);

    return (
        <div className="flex h-full gap-6 max-w-[1600px] mx-auto pb-12 overflow-hidden">
            <div className="w-full flex flex-col h-full animate-in fade-in duration-500">
                <header className="flex items-end justify-between mb-8 flex-shrink-0">
                    <div>
                        <h2 className="text-3xl font-bold font-typewriter tracking-tighter text-black flex items-center">
                            <Activity className="mr-3 w-8 h-8" /> Agency Intelligence
                        </h2>
                        <p className="text-stone-500 mt-2 font-medium">
                            Weekly market insights and behavior trends
                        </p>
                    </div>
                </header>

                {loading ? (
                    <div className="flex justify-center p-12">
                        <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
                    </div>
                ) : logs.length === 0 ? (
                    <div className="bg-white rounded-[40px] border border-stone-200 shadow-sm p-12 text-center flex-1 flex flex-col items-center justify-center">
                        <BarChart className="w-12 h-12 text-stone-300 mb-4" />
                        <h3 className="font-bold text-lg mb-2 text-stone-800">No Intelligence Data Yet</h3>
                        <p className="text-stone-500 font-typewriter max-w-sm">The background engine has not yet generated weekly intelligence logs. They will appear here once processed.</p>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        <div className="grid gap-6 grid-cols-1 xl:grid-cols-2">
                            {logs.map((log) => (
                                <div key={log.week_start} className="bg-white rounded-[40px] border border-stone-200 shadow-sm p-8 bg-gradient-to-br from-white to-stone-50">
                                    <div className="flex justify-between items-center border-b border-stone-100 pb-4 mb-6">
                                        <h3 className="font-bold text-xl text-black flex items-center">
                                            <FileText className="w-5 h-5 mr-2 text-stone-500" />
                                            Week of {new Date(log.week_start).toLocaleDateString()}
                                        </h3>
                                        <span className="bg-stone-100 text-stone-600 font-typewriter text-[10px] px-3 py-1.5 rounded-full border border-stone-200 uppercase tracking-wider font-bold">
                                            Generated {new Date(log.generated_at).toLocaleDateString()}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm">
                                            <h4 className="font-typewriter font-bold text-xs mb-3 text-stone-500 uppercase flex items-center">
                                                <Layers className="w-4 h-4 mr-1" /> Top Agencies
                                            </h4>
                                            <div className="space-y-2">
                                                {log.top_agencies ? Object.entries(log.top_agencies).map(([agency, count]: any, i) => (
                                                    <div key={i} className="flex justify-between items-center text-sm">
                                                        <span className="font-medium text-stone-800 truncate pr-2" title={agency}>{agency}</span>
                                                        <span className="font-mono bg-stone-100 px-2 rounded-md border border-stone-200 whitespace-nowrap">{count} opps</span>
                                                    </div>
                                                )) : <span className="text-stone-400 italic text-sm">No data</span>}
                                            </div>
                                        </div>

                                        <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm">
                                            <h4 className="font-typewriter font-bold text-xs mb-3 text-stone-500 uppercase flex items-center">
                                                <Target className="w-4 h-4 mr-1" /> Top NAICS Codes
                                            </h4>
                                            <div className="space-y-2">
                                                {log.top_naics ? Object.entries(log.top_naics).map(([naics, count]: any, i) => (
                                                    <div key={i} className="flex justify-between items-center text-sm">
                                                        <span className="font-mono font-medium text-black">{naics}</span>
                                                        <span className="text-stone-500 text-xs">{count} times</span>
                                                    </div>
                                                )) : <span className="text-stone-400 italic text-sm">No data</span>}
                                            </div>
                                        </div>

                                        <div className="col-span-2 bg-stone-900 text-white p-6 rounded-3xl shadow-lg relative overflow-hidden">
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-stone-700/30 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>

                                            <h4 className="font-typewriter font-bold text-xs mb-4 text-stone-400 uppercase flex items-center">
                                                <Activity className="w-4 h-4 mr-2" /> AI Observations
                                            </h4>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="bg-black/30 border border-stone-700 p-4 rounded-xl">
                                                    <p className="text-[10px] text-stone-500 font-typewriter uppercase tracking-wider mb-2">Competition Trends</p>
                                                    <p className="text-sm font-medium leading-relaxed">
                                                        {log.competition_trends?.summary || "No significant trends observed in recent data drops."}
                                                    </p>
                                                </div>
                                                <div className="bg-black/30 border border-stone-700 p-4 rounded-xl">
                                                    <p className="text-[10px] text-stone-500 font-typewriter uppercase tracking-wider mb-2">Certification Value Map</p>
                                                    <ul className="space-y-1">
                                                        {log.certification_performance ? Object.entries(log.certification_performance).slice(0, 3).map(([cert, perf]: any, i) => (
                                                            <li key={i} className="flex justify-between text-xs">
                                                                <span className="font-mono">{cert}</span>
                                                                <span className={clsx(perf.trend === 'up' ? "text-green-400" : "text-stone-400")}>
                                                                    {perf.trend === 'up' ? '↗' : '→'} {perf.mentions} reqs
                                                                </span>
                                                            </li>
                                                        )) : <li className="text-stone-500 text-xs italic">Awaiting data</li>}
                                                    </ul>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

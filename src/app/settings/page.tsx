"use client";

import { useState, useEffect, useRef } from "react";
import { Settings, Server, Key, Database, Cpu, BrainCircuit, Network, Download, UploadCloud, Loader2, CheckCircle2 } from "lucide-react";
import clsx from "clsx";
import { importOpportunitiesBatch, importContractorsBatch } from "../actions/import";

export default function SettingsPage() {
    const [activeModel, setActiveModel] = useState("gemini-1.5-pro");
    const [uploadStatus, setUploadStatus] = useState<{ type: 'opps' | 'contractors' | null, progress: number, status: 'idle' | 'parsing' | 'uploading' | 'done' | 'error', error?: string }>({ type: null, progress: 0, status: 'idle' });
    const oppsInputRef = useRef<HTMLInputElement>(null);
    const contractorsInputRef = useRef<HTMLInputElement>(null);

    // Inject PapaParse globally via CDN to bypass package permission errors
    useEffect(() => {
        if (!document.getElementById("papaparse-script")) {
            const script = document.createElement("script");
            script.id = "papaparse-script";
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js";
            script.async = true;
            document.head.appendChild(script);
        }
    }, []);

    const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>, type: 'opps' | 'contractors') => {
        const file = event.target.files?.[0];
        if (!file) return;

        setUploadStatus({ type, progress: 0, status: 'parsing' });

        const Papa = (window as any).Papa;
        if (!Papa) {
            setUploadStatus({ type, progress: 0, status: 'error', error: "CSV Parser not loaded. Please refresh the page." });
            return;
        }

        let batch: any[] = [];
        const BATCH_SIZE = 1000;
        let totalProcessed = 0;

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            worker: true,
            step: async function (results: any, parser: any) {
                const data = results.data;
                // Basic mapping based on type
                if (type === 'opps') {
                    batch.push({
                        notice_id: data['NoticeId'],
                        title: data['Title'] || "Untitled",
                        agency: data['Department/Ind.Agency'] || "Unknown Agency",
                        department: data['Department/Ind.Agency'] || "",
                        sub_tier: data['Sub-Tier'] || "",
                        office: data['Office'] || "",
                        published_date: data['PostedDate'] ? new Date(data['PostedDate']).toISOString() : null,
                        response_deadline: data['ResponseDeadLine'] ? new Date(data['ResponseDeadLine']).toISOString() : null,
                        naics_code: data['NaicsCode'] || "",
                        description: data['Description'] || "",
                        set_aside: data['SetASide'] || "",
                        type: data['Type'] || "",
                        is_active: data['Active'] === 'Yes' ? true : false
                    });
                } else if (type === 'contractors') {
                    batch.push({
                        uei: data['UEI'] || data['Unique Entity ID'],
                        cage_code: data['CAGE/NCAGE'] || data['CAGE Code'],
                        company_name: data['Legal Business Name'],
                        dba_name: data['Doing Business As Name'] || "",
                        state: data['Physical Address State/Province'] || "",
                        naics_codes: data['NAICS Code String'] ? data['NAICS Code String'].split(',') : [],
                        certifications: data['SBA Certification String'] ? data['SBA Certification String'].split(',') : [],
                        is_sam_registered: true
                    });
                }

                if (batch.length >= BATCH_SIZE) {
                    parser.pause();
                    const currentBatch = [...batch];
                    batch = [];

                    setUploadStatus(prev => ({ ...prev, status: 'uploading' }));
                    const res = type === 'opps' ? await importOpportunitiesBatch(currentBatch) : await importContractorsBatch(currentBatch);

                    if (!res.success) {
                        setUploadStatus({ type, progress: 0, status: 'error', error: res.error });
                        parser.abort();
                        return;
                    }

                    totalProcessed += currentBatch.length;
                    setUploadStatus({ type, progress: Math.min(99, Math.round((totalProcessed / 10000) * 100)), status: 'parsing' }); // Fake progress maxing out at 99%
                    parser.resume();
                }
            },
            complete: async function () {
                if (batch.length > 0) {
                    setUploadStatus(prev => ({ ...prev, status: 'uploading' }));
                    const res = type === 'opps' ? await importOpportunitiesBatch(batch) : await importContractorsBatch(batch);
                    if (!res.success) {
                        setUploadStatus({ type, progress: 0, status: 'error', error: res.error });
                        return;
                    }
                }
                setUploadStatus({ type, progress: 100, status: 'done' });
                if (event.target) event.target.value = '';
            },
            error: function (err: any) {
                setUploadStatus({ type, progress: 0, status: 'error', error: err.message });
            }
        });
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500 pb-12">
            <header className="mb-10 flex items-end justify-between">
                <div>
                    <h2 className="text-3xl font-bold font-typewriter tracking-tighter text-black flex items-center">
                        <Settings className="mr-3 w-8 h-8" /> System Configuration
                    </h2>
                    <p className="text-stone-500 mt-2 font-medium">
                        Manage B.L.A.S.T Protocol API Keys & Models
                    </p>
                </div>
            </header>

            <div className="space-y-6">

                {/* Core Engine Settings */}
                <div className="bg-white rounded-[40px] border border-stone-200 shadow-sm p-8">
                    <div className="flex items-center space-x-3 mb-6">
                        <Cpu className="w-6 h-6 text-black" />
                        <h3 className="font-bold text-xl font-typewriter text-black">Deterministic Engine</h3>
                    </div>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center py-4 border-b border-stone-100">
                            <div>
                                <p className="font-medium text-stone-800">Match Tolerance Threshold</p>
                                <p className="text-sm text-stone-500">Minimum score required for WARM classification.</p>
                            </div>
                            <div className="bg-stone-100 px-4 py-2 rounded-full font-mono text-sm border border-stone-200 focus-within:ring-2 focus-within:ring-black">
                                <input type="number" defaultValue={0.33} step={0.01} className="bg-transparent outline-none w-16 text-center font-bold" />
                            </div>
                        </div>

                        <div className="flex justify-between items-center py-4 border-b border-stone-100">
                            <div>
                                <p className="font-medium text-stone-800">HOT Match Threshold</p>
                                <p className="text-sm text-stone-500">Minimum score required for HOT classification & AI Drafting.</p>
                            </div>
                            <div className="bg-stone-100 px-4 py-2 rounded-full font-mono text-sm border border-stone-200 focus-within:ring-2 focus-within:ring-black">
                                <input type="number" defaultValue={0.66} step={0.01} className="bg-transparent outline-none w-16 text-center font-bold" />
                            </div>
                        </div>

                        <div className="flex justify-between items-center py-4">
                            <div>
                                <p className="font-medium text-stone-800">Auto-Drafting Mode</p>
                                <p className="text-sm text-stone-500">Automatically generate drafts for all HOT matches during Sync.</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" value="" className="sr-only peer" defaultChecked />
                                <div className="w-11 h-6 bg-stone-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            {/* Crawling Configuration */}
            <div className="bg-white rounded-[40px] border border-stone-200 shadow-sm p-8">
                <div className="flex items-center space-x-3 mb-6">
                    <Network className="w-6 h-6 text-black" />
                    <h3 className="font-bold text-xl font-typewriter text-black">Crawling Configuration</h3>
                </div>
                <div className="space-y-4">
                    <div className="flex justify-between items-center py-4 border-b border-stone-100">
                        <div>
                            <p className="font-medium text-stone-800">Max Service Providers</p>
                            <p className="text-sm text-stone-500">Global cap on contractors evaluated per opportunity.</p>
                        </div>
                        <div className="bg-stone-100 px-4 py-2 rounded-full font-mono text-sm border border-stone-200">
                            <input type="number" defaultValue={250} className="bg-transparent outline-none w-16 text-right font-bold" />
                        </div>
                    </div>

                    <div className="flex justify-between items-center py-4 border-b border-stone-100">
                        <div>
                            <p className="font-medium text-stone-800">Max Opportunities / Day</p>
                            <p className="text-sm text-stone-500">Ingestion limit to prevent API rate limiting.</p>
                        </div>
                        <div className="bg-stone-100 px-4 py-2 rounded-full font-mono text-sm border border-stone-200">
                            <input type="number" defaultValue={5000} className="bg-transparent outline-none w-16 text-right font-bold" />
                        </div>
                    </div>

                    <div className="flex justify-between items-center py-4 border-b border-stone-100">
                        <div>
                            <p className="font-medium text-stone-800">Historical Timeframe</p>
                            <p className="text-sm text-stone-500">How far back the crawler should check SAM.gov natively.</p>
                        </div>
                        <div className="bg-stone-100 px-4 py-2 rounded-full font-mono text-sm border border-stone-200">
                            <select className="bg-transparent outline-none font-bold text-right cursor-pointer" defaultValue="7d">
                                <option value="1d">Last 24 Hours</option>
                                <option value="7d">Past 7 Days</option>
                                <option value="30d">Past 30 Days</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex justify-between items-center py-4">
                        <div>
                            <p className="font-medium text-stone-800">Data Retention Expiration</p>
                            <p className="text-sm text-stone-500">Days to hold un-matched items before system purge.</p>
                        </div>
                        <div className="bg-stone-100 px-4 py-2 rounded-full font-mono text-sm border border-stone-200 flex items-center">
                            <input type="number" defaultValue={90} className="bg-transparent outline-none w-12 text-right font-bold mr-1" />
                            <span className="font-typewriter text-stone-500 text-[10px] uppercase">Days</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bulk Data Ingestion */}
            <div className="bg-white rounded-[40px] border border-stone-200 shadow-sm p-8">
                <div className="flex items-center space-x-3 mb-6">
                    <Database className="w-6 h-6 text-black" />
                    <h3 className="font-bold text-xl font-typewriter text-black">Historical Data Ingestion</h3>
                </div>
                <div className="space-y-4">
                    <p className="text-stone-500 text-sm mb-6">
                        To accelerate system initialization and minimize API load, download the daily/weekly CSV files from SAM.gov Data Services and upload them here. The system will parse and seed the database natively.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                        {/* Opportunities Upload */}
                        <div
                            onClick={() => uploadStatus.status !== 'parsing' && uploadStatus.status !== 'uploading' && oppsInputRef.current?.click()}
                            className={clsx(
                                "border-2 border-dashed rounded-3xl p-6 flex flex-col items-center justify-center text-center transition-all cursor-pointer group",
                                uploadStatus.type === 'opps' && uploadStatus.status === 'done' ? "border-green-500 bg-green-50" :
                                    (uploadStatus.status === 'parsing' || uploadStatus.status === 'uploading') && uploadStatus.type === 'opps' ? "border-black bg-stone-50 cursor-wait opacity-80" : "border-stone-200 hover:border-black hover:bg-stone-50"
                            )}
                        >
                            <input type="file" ref={oppsInputRef} className="hidden" accept=".csv" onChange={(e) => handleUpload(e, 'opps')} />

                            <div className={clsx("w-12 h-12 rounded-full flex items-center justify-center mb-4 transition-colors", uploadStatus.type === 'opps' && uploadStatus.status === 'done' ? "bg-green-500 text-white" : "bg-stone-100 group-hover:bg-black text-stone-500 group-hover:text-white")}>
                                {uploadStatus.type === 'opps' && (uploadStatus.status === 'parsing' || uploadStatus.status === 'uploading') ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : uploadStatus.type === 'opps' && uploadStatus.status === 'done' ? (
                                    <CheckCircle2 className="w-5 h-5" />
                                ) : (
                                    <UploadCloud className="w-5 h-5" />
                                )}
                            </div>
                            <h4 className="font-bold font-typewriter mb-1 text-sm">Contract Opportunities</h4>

                            {uploadStatus.type === 'opps' && uploadStatus.status === 'error' ? (
                                <p className="text-xs text-red-500 mb-4 px-4 font-bold">{uploadStatus.error}</p>
                            ) : uploadStatus.type === 'opps' && uploadStatus.status === 'done' ? (
                                <p className="text-xs text-green-700 mb-4 px-4 font-bold tracking-widest font-typewriter uppercase">Batch Upload Complete</p>
                            ) : uploadStatus.type === 'opps' && (uploadStatus.status === 'parsing' || uploadStatus.status === 'uploading') ? (
                                <p className="text-xs text-stone-500 mb-4 px-4 font-mono">Processing... {uploadStatus.progress}%</p>
                            ) : (
                                <p className="text-xs text-stone-400 mb-4 px-4">Download the latest CSV from the <span className="font-mono text-black font-bold">Contract Opportunities</span> folder on SAM.gov Data Services.</p>
                            )}

                            <button className="bg-white border border-stone-200 shadow-sm px-4 py-2 rounded-full text-xs font-bold font-typewriter group-hover:border-black transition-colors pointer-events-none">
                                Select CSV File
                            </button>
                        </div>

                        {/* Contractors Upload */}
                        <div
                            onClick={() => uploadStatus.status !== 'parsing' && uploadStatus.status !== 'uploading' && contractorsInputRef.current?.click()}
                            className={clsx(
                                "border-2 border-dashed rounded-3xl p-6 flex flex-col items-center justify-center text-center transition-all cursor-pointer group",
                                uploadStatus.type === 'contractors' && uploadStatus.status === 'done' ? "border-green-500 bg-green-50" :
                                    (uploadStatus.status === 'parsing' || uploadStatus.status === 'uploading') && uploadStatus.type === 'contractors' ? "border-black bg-stone-50 cursor-wait opacity-80" : "border-stone-200 hover:border-black hover:bg-stone-50"
                            )}
                        >
                            <input type="file" ref={contractorsInputRef} className="hidden" accept=".csv" onChange={(e) => handleUpload(e, 'contractors')} />

                            <div className={clsx("w-12 h-12 rounded-full flex items-center justify-center mb-4 transition-colors", uploadStatus.type === 'contractors' && uploadStatus.status === 'done' ? "bg-green-500 text-white" : "bg-stone-100 group-hover:bg-black text-stone-500 group-hover:text-white")}>
                                {uploadStatus.type === 'contractors' && (uploadStatus.status === 'parsing' || uploadStatus.status === 'uploading') ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : uploadStatus.type === 'contractors' && uploadStatus.status === 'done' ? (
                                    <CheckCircle2 className="w-5 h-5" />
                                ) : (
                                    <UploadCloud className="w-5 h-5" />
                                )}
                            </div>
                            <h4 className="font-bold font-typewriter mb-1 text-sm">Entity Registrations</h4>

                            {uploadStatus.type === 'contractors' && uploadStatus.status === 'error' ? (
                                <p className="text-xs text-red-500 mb-4 px-4 font-bold">{uploadStatus.error}</p>
                            ) : uploadStatus.type === 'contractors' && uploadStatus.status === 'done' ? (
                                <p className="text-xs text-green-700 mb-4 px-4 font-bold tracking-widest font-typewriter uppercase">Batch Upload Complete</p>
                            ) : uploadStatus.type === 'contractors' && (uploadStatus.status === 'parsing' || uploadStatus.status === 'uploading') ? (
                                <p className="text-xs text-stone-500 mb-4 px-4 font-mono">Processing... {uploadStatus.progress}%</p>
                            ) : (
                                <p className="text-xs text-stone-400 mb-4 px-4">Download the latest CSV from the <span className="font-mono text-black font-bold">Entity Registrations</span> folder to seed vendor profiles.</p>
                            )}

                            <button className="bg-white border border-stone-200 shadow-sm px-4 py-2 rounded-full text-xs font-bold font-typewriter group-hover:border-black transition-colors pointer-events-none">
                                Select CSV File
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* AI Models */}
            <div className="bg-white rounded-[40px] border border-stone-200 shadow-sm p-8">
                <div className="flex items-center space-x-3 mb-6">
                    <BrainCircuit className="w-6 h-6 text-black" />
                    <h3 className="font-bold text-xl font-typewriter text-black">Intelligence AI Models</h3>
                </div>
                <div className="space-y-4 text-sm">
                    <p className="text-stone-500 mb-4">Select the foundational model used for opportunity summarization and email drafting. Switching models requires a valid API key.</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <button
                            onClick={() => setActiveModel("gemini-2.5-flash")}
                            className={clsx("p-4 rounded-2xl border text-left transition-all", activeModel === "gemini-2.5-flash" ? "border-black bg-stone-50 shadow-sm" : "border-stone-200 hover:border-stone-300")}
                        >
                            <div className="flex justify-between items-center mb-2">
                                <span className="font-bold">Gemini 2.5 Flash</span>
                                {activeModel === "gemini-2.5-flash" && <span className="w-3 h-3 bg-black rounded-full"></span>}
                            </div>
                            <p className="text-xs text-stone-500 font-mono">Current Default</p>
                        </button>
                        <button
                            onClick={() => setActiveModel("claude-3.5-sonnet")}
                            className={clsx("p-4 rounded-2xl border text-left transition-all", activeModel === "claude-3.5-sonnet" ? "border-black bg-stone-50 shadow-sm" : "border-stone-200 hover:border-stone-300")}
                        >
                            <div className="flex justify-between items-center mb-2">
                                <span className="font-bold">Claude 3.5 Sonnet</span>
                                {activeModel === "claude-3.5-sonnet" && <span className="w-3 h-3 bg-black rounded-full"></span>}
                            </div>
                            <p className="text-xs text-stone-500 font-mono">Requires Anthropic Key</p>
                        </button>
                        <button
                            onClick={() => setActiveModel("gpt-4o")}
                            className={clsx("p-4 rounded-2xl border text-left transition-all", activeModel === "gpt-4o" ? "border-black bg-stone-50 shadow-sm" : "border-stone-200 hover:border-stone-300")}
                        >
                            <div className="flex justify-between items-center mb-2">
                                <span className="font-bold">GPT-4o</span>
                                {activeModel === "gpt-4o" && <span className="w-3 h-3 bg-black rounded-full"></span>}
                            </div>
                            <p className="text-xs text-stone-500 font-mono">Requires OpenAI Key</p>
                        </button>
                    </div>
                </div>
            </div>

            {/* API Connections */}
            <div className="bg-white rounded-[40px] border border-stone-200 shadow-sm p-8">
                <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center space-x-3">
                        <Server className="w-6 h-6 text-black" />
                        <h3 className="font-bold text-xl font-typewriter text-black">Data Sources & API Integrations</h3>
                    </div>
                    <button className="text-xs font-bold font-typewriter bg-stone-100 hover:bg-stone-200 px-4 py-2 rounded-full transition-colors hidden md:block">
                        + Add Custom Provider
                    </button>
                </div>
                <div className="space-y-4 text-sm">
                    <ApiRow
                        title="Supabase PostgreSQL"
                        icon={Database}
                        status="CONNECTED"
                        description="Primary deterministic data warehouse."
                        defaultKey="••••••••••••••••••••••••••••••"
                    />
                    <ApiRow
                        title="SAM.gov Search API V2"
                        icon={Key}
                        status="CONNECTED"
                        description="Federal Opportunities Stream V2."
                        defaultKey="SAM-6507bbc9-•••••••••••••••••"
                    />
                    <ApiRow
                        title="Clearbit / ZoomInfo Enrichment (Optional)"
                        icon={Network}
                        status="DISCONNECTED"
                        description="Enrich Contractor Profiles with firmographic and contact data."
                        defaultKey=""
                        placeholder="Paste API Key here..."
                    />
                    <ApiRow
                        title="GovTribe / GovWin Database (Optional)"
                        icon={Download}
                        status="DISCONNECTED"
                        description="Alternative local government database extraction APIs."
                        defaultKey=""
                        placeholder="Paste API Key here..."
                    />
                    <ApiRow
                        title="OpenAI / Anthropic Keys"
                        icon={BrainCircuit}
                        status="DISCONNECTED"
                        description="Provide keys if switching from the default Gemini Engine."
                        defaultKey=""
                        placeholder="sk-ant-api03-..."
                    />
                </div>
            </div>

        </div >
    );
}

function ApiRow({ title, icon: Icon, status, description, defaultKey, placeholder }: any) {
    const isConnected = status === "CONNECTED";
    return (
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-stone-50 p-5 rounded-3xl border border-stone-200 space-y-4 md:space-y-0 text-left">
            <div className="flex-1 pr-4">
                <div className="flex items-center space-x-3 mb-1">
                    <Icon className={clsx("w-5 h-5", isConnected ? "text-green-600" : "text-stone-400")} />
                    <span className="font-bold text-base">{title}</span>
                    <span className={clsx(
                        "font-typewriter text-[9px] px-2 py-0.5 rounded font-bold tracking-widest uppercase",
                        isConnected ? "bg-green-100 text-green-800" : "bg-stone-200 text-stone-600"
                    )}>
                        {status}
                    </span>
                </div>
                <p className="text-stone-500 text-xs">{description}</p>
            </div>
            <div className="w-full md:w-auto flex-shrink-0">
                <input
                    type="password"
                    defaultValue={defaultKey}
                    placeholder={placeholder}
                    className="w-full md:w-64 bg-white border border-stone-200 rounded-xl px-4 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-black placeholder:text-stone-300 transition-all font-bold"
                />
            </div>
        </div>
    );
}

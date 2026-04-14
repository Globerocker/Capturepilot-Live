// @ts-nocheck
"use client";

import { useEffect, useState, useCallback } from "react";
import { createSupabaseClient } from "@/lib/supabase/client";
import {
    Mic, MicOff, Loader2, FileText, Palette, Download, Sparkles,
    Globe, Save, Upload, CheckCircle2, Trash2, Edit3,
} from "lucide-react";
import clsx from "clsx";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import jsPDF from "jspdf";

const supabase = createSupabaseClient();

function sectionsToHtml(sections: Array<{ title: string; content: string }>, meta: Record<string, unknown>, primaryColor: string): string {
    const header = `<h1 style="color: ${primaryColor}">${meta.company_name || "Capability Statement"}</h1>`;
    const body = sections.map(s => `<h2 style="color: ${primaryColor}">${s.title}</h2><p>${(s.content || "").replace(/\n/g, "<br/>")}</p>`).join("");
    const footer = `<hr/><p><strong>Contact:</strong> ${meta.contact || ""} &nbsp; <strong>Email:</strong> ${meta.email || ""} &nbsp; <strong>Phone:</strong> ${meta.phone || ""}</p><p><strong>UEI:</strong> ${meta.uei || ""} &nbsp; <strong>CAGE:</strong> ${meta.cage_code || ""} &nbsp; <strong>Web:</strong> ${meta.website || ""}</p>`;
    return header + body + footer;
}

function htmlToPlainText(html: string): string {
    if (typeof document === "undefined") return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const div = document.createElement("div");
    div.innerHTML = html;
    return (div.innerText || div.textContent || "").trim();
}

export default function CapabilityStatementPage() {
    const [profileId, setProfileId] = useState("");
    const [website, setWebsite] = useState("");
    const [loading, setLoading] = useState(true);

    // Voice
    const [isRecording, setIsRecording] = useState(false);
    const [transcript, setTranscript] = useState("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [recognition, setRecognition] = useState<any>(null);

    // Inputs
    const [pastProjects, setPastProjects] = useState("");
    const [differentiators, setDifferentiators] = useState("");

    // Brand
    const [brandLoading, setBrandLoading] = useState(false);
    const [brand, setBrand] = useState<Record<string, unknown> | null>(null);
    const [primaryColor, setPrimaryColor] = useState("#000000");

    // Result + editor
    const [generating, setGenerating] = useState(false);
    const [editableHtml, setEditableHtml] = useState<string>("");
    const [meta, setMeta] = useState<Record<string, unknown>>({});
    const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

    // Uploaded file (alternative to generated)
    const [uploadedFile, setUploadedFile] = useState<{ name: string; url: string } | null>(null);
    const [uploading, setUploading] = useState(false);

    const editor = useEditor({
        extensions: [StarterKit, Underline, Link.configure({ openOnClick: false })],
        content: editableHtml,
        editorProps: {
            attributes: {
                class: "prose prose-sm max-w-none min-h-[300px] focus:outline-none",
            },
        },
        immediatelyRender: false,
    });

    // Sync editor content when editableHtml changes (e.g. after generate or load).
    useEffect(() => {
        if (editor && editableHtml && editor.getHTML() !== editableHtml) {
            editor.commands.setContent(editableHtml);
        }
    }, [editor, editableHtml]);

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data } = await supabase
                .from("user_profiles")
                .select("id, website, capability_statement, capability_statement_html, capability_statement_file_url, capability_statement_file_name")
                .eq("auth_user_id", user.id)
                .single();
            if (data) {
                setProfileId(data.id);
                setWebsite(data.website || "");
                if (data.capability_statement_html) {
                    setEditableHtml(data.capability_statement_html);
                }
                if (data.capability_statement_file_url) {
                    setUploadedFile({
                        name: data.capability_statement_file_name || "Uploaded statement",
                        url: data.capability_statement_file_url,
                    });
                }
            }
            setLoading(false);
        })();

        // Init Speech Recognition
        if (typeof window !== "undefined") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const w = window as any;
            const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
            if (SR) {
                const rec = new SR();
                rec.continuous = true;
                rec.interimResults = true;
                rec.lang = "en-US";
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                rec.onresult = (e: any) => {
                    let text = "";
                    for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
                    setTranscript(text);
                };
                rec.onerror = () => setIsRecording(false);
                rec.onend = () => setIsRecording(false);
                setRecognition(rec);
            }
        }
    }, []);

    const toggleRecording = () => {
        if (!recognition) return;
        if (isRecording) {
            recognition.stop();
            setIsRecording(false);
        } else {
            setTranscript("");
            recognition.start();
            setIsRecording(true);
        }
    };

    const extractBrand = async () => {
        if (!website) return;
        setBrandLoading(true);
        const res = await fetch("/api/brand", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ website, user_profile_id: profileId }),
        });
        const data = await res.json();
        if (data.success) {
            setBrand(data.brand);
            setPrimaryColor(String((data.brand.colors as Record<string, string>)?.primary || "#000000"));

            // Autofill transcript / differentiators from extracted brand intel if fields are empty.
            const brandData = data.brand as Record<string, unknown>;
            const services = (brandData.services as string[]) || [];
            const companyDesc = brandData.company_description as string;
            const diff = brandData.differentiators as string;
            if (!transcript && (services.length > 0 || companyDesc)) {
                const block = [
                    companyDesc,
                    services.length > 0 ? `Services: ${services.join(", ")}.` : "",
                ].filter(Boolean).join("\n\n");
                setTranscript(block);
            }
            if (!differentiators && diff) setDifferentiators(diff);
        }
        setBrandLoading(false);
    };

    const generateStatement = async () => {
        if (!profileId) return;
        setGenerating(true);
        const res = await fetch("/api/ai/capability-statement", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                user_profile_id: profileId,
                voice_transcript: transcript || undefined,
                past_projects: pastProjects || undefined,
                differentiators: differentiators || undefined,
                brand: brand ? { primary_color: primaryColor, logo_url: (brand as Record<string, unknown>).logo_url, company_name: (brand as Record<string, unknown>).company_name } : undefined,
            }),
        });
        const data = await res.json();
        if (data.success) {
            const html = sectionsToHtml(data.sections || [], data.metadata || {}, primaryColor);
            setEditableHtml(html);
            setMeta(data.metadata || {});
            editor?.commands.setContent(html);
        }
        setGenerating(false);
    };

    const saveToProfile = useCallback(async () => {
        if (!profileId || !editor) return;
        setSaveStatus("saving");
        const html = editor.getHTML();
        const text = htmlToPlainText(html);
        const { error } = await supabase
            .from("user_profiles")
            .update({
                capability_statement: text,
                capability_statement_html: html,
                capability_statement_updated_at: new Date().toISOString(),
            })
            .eq("id", profileId);
        setSaveStatus(error ? "error" : "saved");
        if (!error) setTimeout(() => setSaveStatus("idle"), 2000);
    }, [editor, profileId]);

    const downloadPDF = () => {
        if (!editor) return;
        const html = editor.getHTML();
        const text = htmlToPlainText(html);
        const doc = new jsPDF({ unit: "pt", format: "letter" });
        const margin = 48;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const maxWidth = pageWidth - margin * 2;

        doc.setFontSize(18);
        doc.setTextColor(primaryColor);
        doc.text(String(meta.company_name || "Capability Statement"), margin, margin + 10);
        doc.setTextColor("#000");
        doc.setFontSize(11);

        const lines = doc.splitTextToSize(text, maxWidth);
        let y = margin + 50;
        for (const line of lines) {
            if (y > pageHeight - margin) {
                doc.addPage();
                y = margin;
            }
            doc.text(line, margin, y);
            y += 14;
        }

        const filename = `capability-statement-${(meta.company_name || "company").toString().replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;
        doc.save(filename);
    };

    const uploadOwnStatement = async (file: File) => {
        if (!profileId || !file) return;
        setUploading(true);
        const ext = file.name.split(".").pop() || "pdf";
        const path = `capability-statements/${profileId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("client-docs").upload(path, file, { upsert: true });
        if (upErr) {
            alert("Upload failed: " + upErr.message);
            setUploading(false);
            return;
        }
        const { data: urlData } = supabase.storage.from("client-docs").getPublicUrl(path);
        await supabase
            .from("user_profiles")
            .update({
                capability_statement_file_url: urlData.publicUrl,
                capability_statement_file_name: file.name,
                capability_statement_updated_at: new Date().toISOString(),
            })
            .eq("id", profileId);
        setUploadedFile({ name: file.name, url: urlData.publicUrl });
        setUploading(false);
    };

    const removeUpload = async () => {
        if (!profileId) return;
        await supabase
            .from("user_profiles")
            .update({
                capability_statement_file_url: null,
                capability_statement_file_name: null,
            })
            .eq("id", profileId);
        setUploadedFile(null);
    };

    if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-stone-400" /></div>;

    return (
        <div className="max-w-4xl mx-auto space-y-6 pb-12">
            <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <FileText className="w-6 h-6" /> Capability Statement
                </h1>
                <p className="text-sm text-stone-500 mt-1">
                    Build, edit, and save your capability statement. Upload your own PDF or generate one from your profile.
                </p>
            </div>

            {/* Upload your own cap statement */}
            <div className="bg-white border border-stone-200 rounded-2xl p-5">
                <h2 className="font-bold text-sm flex items-center gap-2 mb-3">
                    <Upload className="w-4 h-4 text-stone-400" /> Upload Your Own Statement
                </h2>
                {uploadedFile ? (
                    <div className="flex items-center justify-between bg-stone-50 border border-stone-200 rounded-xl p-3">
                        <div className="flex items-center gap-2 min-w-0">
                            <FileText className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                            <a href={uploadedFile.url} target="_blank" rel="noopener noreferrer" className="font-medium text-sm text-black hover:underline truncate">
                                {uploadedFile.name}
                            </a>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <a href={uploadedFile.url} target="_blank" rel="noopener noreferrer" className="p-2 text-stone-400 hover:text-black" title="View">
                                <Download className="w-4 h-4" />
                            </a>
                            <button type="button" onClick={removeUpload} className="p-2 text-stone-400 hover:text-red-600" title="Remove">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ) : (
                    <label className="flex items-center justify-center gap-2 bg-stone-50 hover:bg-stone-100 border border-dashed border-stone-300 rounded-xl p-4 cursor-pointer text-sm font-bold text-stone-700 transition-colors">
                        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        {uploading ? "Uploading..." : "Upload PDF or Word doc"}
                        <input
                            type="file"
                            accept=".pdf,.doc,.docx"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) uploadOwnStatement(file);
                            }}
                        />
                    </label>
                )}
                <p className="text-[11px] text-stone-400 mt-2">Already have a capability statement? Upload it here. Stored securely and attached to your profile.</p>
            </div>

            {/* Step 1: Brand Kit */}
            <div className="bg-white border border-stone-200 rounded-2xl p-5">
                <h2 className="font-bold text-sm flex items-center gap-2 mb-3">
                    <Palette className="w-4 h-4 text-stone-400" /> Or generate one — Step 1: Brand Colors & Logo
                </h2>
                <div className="flex gap-3 items-end">
                    <div className="flex-1">
                        <label className="text-[10px] text-stone-400 uppercase block mb-1">Website</label>
                        <input value={website} onChange={e => setWebsite(e.target.value)} placeholder="yourcompany.com"
                            className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm" />
                    </div>
                    <button type="button" onClick={extractBrand} disabled={brandLoading || !website}
                        className="bg-black text-white px-4 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50 h-[38px]">
                        {brandLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                        {brandLoading ? "Extracting..." : "Extract Brand"}
                    </button>
                </div>
                {brand && (
                    <div className="mt-4 flex items-center gap-4">
                        {(brand as Record<string, unknown>).logo_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={String((brand as Record<string, unknown>).logo_url)} alt="Logo" className="h-12 w-auto rounded border border-stone-200" />
                        )}
                        <div className="flex gap-2">
                            {((brand as Record<string, unknown>).all_colors as string[] || []).slice(0, 5).map((c, i) => (
                                <button key={i} type="button" onClick={() => setPrimaryColor(c)}
                                    className={clsx("w-8 h-8 rounded-lg border-2 transition-all",
                                        primaryColor === c ? "border-black scale-110" : "border-stone-200"
                                    )} style={{ backgroundColor: c }} title={c} />
                            ))}
                            <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} title="Custom color"
                                className="w-8 h-8 rounded-lg border border-stone-200 cursor-pointer" />
                        </div>
                        <span className="text-xs font-mono text-stone-400">{primaryColor}</span>
                    </div>
                )}
            </div>

            {/* Step 2: Company Information Input */}
            <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-4">
                <h2 className="font-bold text-sm flex items-center gap-2">
                    <Mic className="w-4 h-4 text-stone-400" /> Step 2: Tell Us About Your Business
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button type="button" onClick={toggleRecording} disabled={!recognition}
                        className={clsx("py-4 rounded-xl text-sm font-bold inline-flex flex-col items-center justify-center gap-2 transition-all border",
                            isRecording ? "bg-red-500 text-white border-red-500 animate-pulse" : "bg-stone-50 text-stone-700 hover:bg-stone-100 border-stone-200"
                        )}>
                        {isRecording ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                        {isRecording ? "Stop Recording" : "Record Now"}
                        <span className="text-[10px] font-normal opacity-70">Talk about your company</span>
                    </button>
                    <button type="button" onClick={() => {
                        const text = prompt("Paste your call transcript or notes here:");
                        if (text) setTranscript(prev => (prev ? prev + "\n\n" : "") + text);
                    }}
                        className="py-4 rounded-xl text-sm font-bold inline-flex flex-col items-center justify-center gap-2 bg-stone-50 text-stone-700 hover:bg-stone-100 border border-stone-200 transition-all">
                        <FileText className="w-6 h-6" />
                        Paste Transcript
                        <span className="text-[10px] font-normal opacity-70">From a discovery call</span>
                    </button>
                </div>
                <div>
                    <label className="text-[10px] text-stone-400 uppercase block mb-1">
                        Transcript / Notes {transcript ? `(${transcript.split(/\s+/).length} words)` : ""}
                    </label>
                    <textarea value={transcript} onChange={e => setTranscript(e.target.value)}
                        placeholder="Your company description, capabilities, past projects, and differentiators. You can type or paste directly..."
                        className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm h-32 resize-none" />
                </div>
            </div>

            {/* Step 3: Additional Details */}
            <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-3">
                <h2 className="font-bold text-sm flex items-center gap-2 mb-1">
                    <FileText className="w-4 h-4 text-stone-400" /> Step 3: Additional Details (Optional)
                </h2>
                <div>
                    <label className="text-[10px] text-stone-400 uppercase block mb-1">Past Projects & Performance</label>
                    <textarea value={pastProjects} onChange={e => setPastProjects(e.target.value)}
                        placeholder="Describe 2-3 relevant projects. Include: client, scope, value, results..."
                        className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm h-20 resize-none" />
                </div>
                <div>
                    <label className="text-[10px] text-stone-400 uppercase block mb-1">What Makes You Different?</label>
                    <textarea value={differentiators} onChange={e => setDifferentiators(e.target.value)}
                        placeholder="Special equipment, certifications, response time, quality, safety record..."
                        className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm h-16 resize-none" />
                </div>
            </div>

            {/* Generate Button */}
            <button type="button" onClick={generateStatement} disabled={generating || !profileId}
                className="w-full bg-black text-white py-4 rounded-2xl text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-stone-800 transition-colors">
                {generating ? <><Loader2 className="w-5 h-5 animate-spin" /> Generating Your Capability Statement...</> : <><Sparkles className="w-5 h-5" /> Generate Capability Statement</>}
            </button>

            {/* Editable result */}
            {(editableHtml || editor?.getText()) && (
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 className="font-bold text-lg flex items-center gap-2">
                            <Edit3 className="w-5 h-5" /> Edit & Save
                        </h2>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className={clsx(
                                "text-xs font-medium transition-opacity",
                                saveStatus === "idle" && "opacity-0",
                                saveStatus === "saving" && "text-stone-500",
                                saveStatus === "saved" && "text-emerald-600",
                                saveStatus === "error" && "text-red-600",
                            )}>
                                {saveStatus === "saving" && "Saving..."}
                                {saveStatus === "saved" && "✓ Saved"}
                                {saveStatus === "error" && "Save failed"}
                            </span>
                            <button type="button" onClick={saveToProfile} disabled={saveStatus === "saving"}
                                className="inline-flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2 rounded-full text-xs font-bold hover:bg-emerald-700 disabled:opacity-50">
                                {saveStatus === "saving" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                Save to Profile
                            </button>
                            <button type="button" onClick={downloadPDF}
                                className="inline-flex items-center gap-1.5 bg-black text-white px-4 py-2 rounded-full text-xs font-bold hover:bg-stone-800">
                                <Download className="w-3.5 h-3.5" /> Download PDF
                            </button>
                        </div>
                    </div>

                    {/* Simple toolbar */}
                    {editor && (
                        <div className="flex flex-wrap gap-1 bg-stone-50 border border-stone-200 rounded-xl p-2">
                            <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={clsx("px-2.5 py-1 rounded text-xs font-bold", editor.isActive("bold") ? "bg-black text-white" : "hover:bg-stone-200")}>B</button>
                            <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={clsx("px-2.5 py-1 rounded text-xs italic", editor.isActive("italic") ? "bg-black text-white" : "hover:bg-stone-200")}>I</button>
                            <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={clsx("px-2.5 py-1 rounded text-xs underline", editor.isActive("underline") ? "bg-black text-white" : "hover:bg-stone-200")}>U</button>
                            <div className="w-px bg-stone-300 mx-1" />
                            <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={clsx("px-2.5 py-1 rounded text-xs font-bold", editor.isActive("heading", { level: 2 }) ? "bg-black text-white" : "hover:bg-stone-200")}>H2</button>
                            <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={clsx("px-2.5 py-1 rounded text-xs", editor.isActive("bulletList") ? "bg-black text-white" : "hover:bg-stone-200")}>• List</button>
                            <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={clsx("px-2.5 py-1 rounded text-xs", editor.isActive("orderedList") ? "bg-black text-white" : "hover:bg-stone-200")}>1. List</button>
                        </div>
                    )}

                    <div className="bg-white border-2 rounded-2xl p-5 sm:p-7" style={{ borderColor: primaryColor }}>
                        <EditorContent editor={editor} />
                    </div>
                </div>
            )}
        </div>
    );
}

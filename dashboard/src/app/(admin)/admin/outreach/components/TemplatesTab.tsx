"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
    Loader2, Plus, Mail, MessageSquare, Pencil, Trash2,
    X, ShieldAlert, Eye, RefreshCw, Send,
} from "lucide-react";

interface OutreachTemplate {
    id: string;
    name: string;
    channel: "email" | "sms";
    subject: string | null;
    body: string;
    merge_tags: string[];
    category: string | null;
    description?: string | null;
    created_at: string;
    updated_at: string;
}

interface SpamFinding {
    rule: string;
    snippet?: string;
    weight: number;
}
interface SpamResult {
    score: number;
    severity: "ok" | "warn" | "bad";
    findings: SpamFinding[];
}

const DEFAULT_MERGE_TAGS = ["first_name", "company", "naics", "state", "sender_name", "unsubscribe_url"];

export default function TemplatesTab({
    onUseInCampaign,
}: {
    onUseInCampaign?: (template: OutreachTemplate) => void;
}) {
    const [templates, setTemplates] = useState<OutreachTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<OutreachTemplate | null>(null);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [channelFilter, setChannelFilter] = useState<"all" | "email" | "sms">("all");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/outreach/templates");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            setTemplates((json.templates || []) as OutreachTemplate[]);
            setError(null);
        } catch (e) {
            setError((e as Error).message);
        }
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const filtered = useMemo(() => {
        if (channelFilter === "all") return templates;
        return templates.filter(t => t.channel === channelFilter);
    }, [templates, channelFilter]);

    const startCreate = (channel: "email" | "sms" = "email") => {
        setEditing({
            id: "",
            name: "",
            channel,
            subject: channel === "email" ? "" : null,
            body: "",
            merge_tags: ["first_name", "company"],
            category: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });
        setCreating(true);
    };

    const remove = async (id: string) => {
        if (!confirm("Delete this template? Cannot be undone.")) return;
        const res = await fetch(`/api/admin/outreach/templates/${id}`, { method: "DELETE" });
        if (res.ok) load();
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm text-stone-500">
                    Reusable email + SMS bodies. Click any template to edit, preview, or run a spam check.
                </p>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => startCreate("email")}
                        className="bg-black text-white text-xs font-bold px-4 py-2 rounded-xl inline-flex items-center gap-2"
                    >
                        <Plus className="w-3.5 h-3.5" /> New email template
                    </button>
                    <button
                        type="button"
                        onClick={() => startCreate("sms")}
                        className="bg-stone-900 text-white text-xs font-bold px-4 py-2 rounded-xl inline-flex items-center gap-2"
                    >
                        <Plus className="w-3.5 h-3.5" /> New SMS template
                    </button>
                    <button
                        type="button"
                        onClick={load}
                        className="text-xs font-bold text-stone-600 bg-white border border-stone-200 px-3 py-2 rounded-xl inline-flex items-center gap-1.5 hover:bg-stone-50"
                    >
                        <RefreshCw className="w-3.5 h-3.5" /> Refresh
                    </button>
                </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                {(["all", "email", "sms"] as const).map(c => (
                    <button
                        key={c}
                        type="button"
                        onClick={() => setChannelFilter(c)}
                        className={clsx(
                            "text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border",
                            channelFilter === c
                                ? "bg-black text-white border-black"
                                : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50",
                        )}
                    >
                        {c === "all" ? "All channels" : c}
                    </button>
                ))}
                <span className="ml-auto text-xs text-stone-500">{filtered.length} templates</span>
            </div>

            {error && (
                <div className="text-xs px-3 py-2 rounded-lg border bg-rose-50 text-rose-700 border-rose-200">
                    {error}
                </div>
            )}

            <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
                {loading ? (
                    <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>
                ) : filtered.length === 0 ? (
                    <div className="py-12 text-center text-sm text-stone-500">
                        No templates yet. Click <strong>New email template</strong> to create the first one.
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-stone-50 border-b border-stone-200">
                            <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-stone-500">
                                <th className="px-3 py-2">Name</th>
                                <th className="px-3 py-2">Channel</th>
                                <th className="px-3 py-2">Category</th>
                                <th className="px-3 py-2">Subject / Preview</th>
                                <th className="px-3 py-2">Updated</th>
                                <th className="px-3 py-2 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(t => (
                                <tr key={t.id} className="border-b border-stone-100 hover:bg-stone-50">
                                    <td className="px-3 py-2 font-bold align-top">
                                        {t.name}
                                        {t.description && (
                                            <span className="block font-normal text-[11px] text-stone-400 mt-0.5 max-w-[320px] leading-snug whitespace-normal">{t.description}</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2">
                                        <span className={clsx(
                                            "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border inline-flex items-center gap-1",
                                            t.channel === "email" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-purple-50 text-purple-700 border-purple-200",
                                        )}>
                                            {t.channel === "email" ? <Mail className="w-2.5 h-2.5" /> : <MessageSquare className="w-2.5 h-2.5" />}
                                            {t.channel}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-stone-500">{t.category || "—"}</td>
                                    <td className="px-3 py-2 text-xs text-stone-600 max-w-[420px] truncate">
                                        {t.channel === "email" && t.subject ? <strong>{t.subject}</strong> : null}
                                        {t.channel === "email" && t.subject ? " · " : ""}
                                        <span className="text-stone-500">{t.body.slice(0, 80)}</span>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-stone-500">{new Date(t.updated_at).toLocaleDateString()}</td>
                                    <td className="px-3 py-2 text-right">
                                        <div className="inline-flex items-center gap-1">
                                            {onUseInCampaign && (
                                                <button type="button" onClick={() => onUseInCampaign(t)}
                                                    className="p-1.5 rounded text-emerald-600 hover:bg-emerald-50" title="Use in campaign">
                                                    <Send className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                            <button type="button" onClick={() => { setEditing(t); setCreating(false); }}
                                                className="p-1.5 rounded text-stone-600 hover:bg-stone-100" title="Edit">
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button type="button" onClick={() => remove(t.id)}
                                                className="p-1.5 rounded text-rose-600 hover:bg-rose-50" title="Delete">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {editing && (
                <EditModal
                    template={editing}
                    isCreate={creating}
                    onClose={() => { setEditing(null); setCreating(false); }}
                    onSaved={() => { setEditing(null); setCreating(false); load(); }}
                />
            )}
        </div>
    );
}

function EditModal({
    template,
    isCreate,
    onClose,
    onSaved,
}: {
    template: OutreachTemplate;
    isCreate: boolean;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [name, setName] = useState(template.name);
    const [subject, setSubject] = useState(template.subject || "");
    const [body, setBody] = useState(template.body);
    const [mergeTagsRaw, setMergeTagsRaw] = useState(template.merge_tags.join(", "));
    const [category, setCategory] = useState(template.category || "");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [spam, setSpam] = useState<SpamResult | null>(null);
    const [spamLoading, setSpamLoading] = useState(false);

    const mergeTags = useMemo(
        () => mergeTagsRaw.split(",").map(s => s.trim()).filter(Boolean),
        [mergeTagsRaw],
    );

    const preview = useMemo(() => {
        // Render merge tags with sample values for the preview pane
        const samples: Record<string, string> = {
            first_name: "Sarah",
            company: "Acme Federal Solutions",
            naics: "541512",
            state: "VA",
            sender_name: "CapturePilot",
            unsubscribe_url: "https://app/unsubscribe?email=sample",
        };
        let renderedSubject = subject;
        let renderedBody = body;
        for (const [k, v] of Object.entries(samples)) {
            const rx = new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g");
            renderedSubject = renderedSubject.replace(rx, v);
            renderedBody = renderedBody.replace(rx, v);
        }
        return { subject: renderedSubject, body: renderedBody };
    }, [subject, body]);

    const runSpamCheck = async () => {
        setSpamLoading(true);
        try {
            const res = await fetch("/api/admin/outreach/templates/spam-check", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subject, body, channel: template.channel }),
            });
            if (res.ok) setSpam(await res.json());
        } catch { /* non-fatal */ }
        setSpamLoading(false);
    };

    const save = async () => {
        setSaving(true);
        setError(null);
        try {
            const payload = {
                name,
                channel: template.channel,
                subject: template.channel === "email" ? subject : null,
                body,
                merge_tags: mergeTags,
                category: category || null,
            };
            const res = isCreate
                ? await fetch("/api/admin/outreach/templates", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                })
                : await fetch(`/api/admin/outreach/templates/${template.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                throw new Error(j.error || `HTTP ${res.status}`);
            }
            onSaved();
        } catch (e) {
            setError((e as Error).message);
        }
        setSaving(false);
    };

    const insertTag = (tag: string) => {
        setBody(b => `${b}{{${tag}}}`);
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
                <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200">
                    <h2 className="text-lg font-bold">
                        {isCreate ? "New" : "Edit"} {template.channel === "email" ? "email" : "SMS"} template
                    </h2>
                    <button type="button" onClick={onClose} className="p-1 text-stone-400 hover:text-stone-900">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 overflow-y-auto flex-1">
                    <div className="p-6 space-y-4 border-r border-stone-200">
                        <div>
                            <label className="text-xs font-bold uppercase tracking-widest text-stone-500">Name</label>
                            <input type="text" value={name} onChange={e => setName(e.target.value)}
                                className="mt-1 w-full px-3 py-2 border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-black"
                                placeholder="e.g. Cold intro for 8(a) leads"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold uppercase tracking-widest text-stone-500">Category</label>
                            <input type="text" value={category} onChange={e => setCategory(e.target.value)}
                                className="mt-1 w-full px-3 py-2 border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-black"
                                placeholder="e.g. cold_intro, follow_up_1"
                            />
                        </div>
                        {template.channel === "email" && (
                            <div>
                                <label className="text-xs font-bold uppercase tracking-widest text-stone-500">Subject</label>
                                <input type="text" value={subject} onChange={e => setSubject(e.target.value)}
                                    className="mt-1 w-full px-3 py-2 border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-black"
                                    placeholder="e.g. Quick question about {{company}}'s upcoming pursuits"
                                />
                            </div>
                        )}
                        <div>
                            <label className="text-xs font-bold uppercase tracking-widest text-stone-500">Body</label>
                            <textarea value={body} onChange={e => setBody(e.target.value)}
                                rows={template.channel === "email" ? 12 : 4}
                                className="mt-1 w-full px-3 py-2 border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-black font-mono"
                                placeholder={template.channel === "email"
                                    ? "Hi {{first_name}},\n\nQuick note about {{company}}…"
                                    : "Hi {{first_name}}, quick note from {{sender_name}}. Reply STOP to opt out."}
                            />
                            {template.channel === "sms" && (
                                <p className="text-[10px] text-stone-400 mt-1">
                                    SMS body is {body.length} chars. Most carriers split &gt;160 chars into multiple segments.
                                </p>
                            )}
                        </div>
                        <div>
                            <label className="text-xs font-bold uppercase tracking-widest text-stone-500">Merge tags</label>
                            <input type="text" value={mergeTagsRaw} onChange={e => setMergeTagsRaw(e.target.value)}
                                className="mt-1 w-full px-3 py-2 border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-black font-mono"
                                placeholder="first_name, company, naics"
                            />
                            <div className="flex flex-wrap gap-1 mt-2">
                                {DEFAULT_MERGE_TAGS.map(t => (
                                    <button key={t} type="button" onClick={() => insertTag(t)}
                                        className="text-[10px] font-mono bg-stone-100 hover:bg-stone-200 text-stone-700 px-2 py-0.5 rounded">
                                        {`{{${t}}}`}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center gap-2 pt-2">
                            <button type="button" onClick={runSpamCheck} disabled={spamLoading || !body}
                                className="text-xs font-bold text-stone-600 bg-white border border-stone-200 px-3 py-2 rounded-lg inline-flex items-center gap-1.5 hover:bg-stone-50 disabled:opacity-50">
                                {spamLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                                Spam check
                            </button>
                        </div>

                        {spam && (
                            <div className={clsx(
                                "rounded-lg border p-3 text-xs",
                                spam.severity === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                                    : spam.severity === "warn" ? "bg-amber-50 border-amber-200 text-amber-800"
                                    : "bg-rose-50 border-rose-200 text-rose-800",
                            )}>
                                <p className="font-bold mb-1">Score: {spam.score}/100 ({spam.severity})</p>
                                {spam.findings.length === 0 ? (
                                    <p>No flags detected. Safe to ship.</p>
                                ) : (
                                    <ul className="space-y-0.5">
                                        {spam.findings.map((f, i) => (
                                            <li key={i}>· <strong>{f.rule}</strong>{f.snippet ? ` — ${f.snippet}` : ""} <span className="text-stone-500">(+{f.weight})</span></li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="p-6 bg-stone-50 space-y-3">
                        <div className="text-xs font-bold uppercase tracking-widest text-stone-500 inline-flex items-center gap-1.5">
                            <Eye className="w-3 h-3" /> Live preview
                        </div>
                        {template.channel === "email" && (
                            <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-2">
                                <p className="text-xs text-stone-500">Subject</p>
                                <p className="text-sm font-bold">{preview.subject || <span className="text-stone-300">—</span>}</p>
                                <hr className="border-stone-100" />
                                <div className="text-sm whitespace-pre-wrap text-stone-800">{preview.body || <span className="text-stone-300">—</span>}</div>
                            </div>
                        )}
                        {template.channel === "sms" && (
                            <div className="bg-white border border-stone-200 rounded-xl p-4">
                                <div className="bg-stone-900 text-white rounded-2xl p-3 max-w-[280px] text-sm whitespace-pre-wrap">
                                    {preview.body || <span className="text-stone-500">—</span>}
                                </div>
                                <p className="text-[10px] text-stone-400 mt-2">
                                    {preview.body.length} chars · {Math.ceil(preview.body.length / 160) || 1} segment(s)
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {error && (
                    <div className="px-6 py-2 bg-rose-50 border-t border-rose-200 text-xs text-rose-700">
                        {error}
                    </div>
                )}
                <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-stone-200 bg-white">
                    <button type="button" onClick={onClose}
                        className="text-xs font-bold text-stone-600 px-4 py-2 rounded-lg hover:bg-stone-100">
                        Cancel
                    </button>
                    <button type="button" onClick={save} disabled={saving || !name || !body}
                        className="text-xs font-bold bg-black text-white px-4 py-2 rounded-lg disabled:opacity-50 inline-flex items-center gap-1.5">
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        {isCreate ? "Create template" : "Save changes"}
                    </button>
                </div>
            </div>
        </div>
    );
}

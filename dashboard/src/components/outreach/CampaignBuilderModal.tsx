"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
    X, ChevronRight, ChevronLeft, Mail, MessageSquare, Clock, Plus, Trash2,
    Loader2, Save, PlayCircle, Send, AlertTriangle, Check, GitBranch, Sparkles,
} from "lucide-react";
import { NAICS_CODES } from "@/lib/naics-codes";
import { FAKE_CONTACT, renderMergeFields } from "@/lib/outreach-merge";

type Channel = "email" | "sms" | "wait";
type DelayUnit = "minutes" | "hours" | "days";

interface CampaignStep {
    step_index: number;
    channel: Channel;
    delay_value: number;
    delay_unit: DelayUnit;
    after_step: number | null;
    subject: string;
    subject_b: string;
    body: string;
    body_b: string;
    body_format: "text" | "html" | "markdown";
    skip_if_replied: boolean;
    skip_if_clicked: boolean;
    variant_key: string;
    variant_weight: number;
}

interface CampaignDraft {
    name: string;
    description: string;
    channels: Channel[];
    sender_email: string;
    sender_name: string;
    target_segment: {
        naics: string[];
        states: string[];
        certs: string[];
        tags: string[];
        custom_filter: string;
        list_id: string | null;
    };
    throttle_per_hour: number;
    send_window_start: string;
    send_window_end: string;
    send_window_tz: string;
    physical_address: string;
    unsubscribe_footer: string;
    steps: CampaignStep[];
}

interface Props {
    open: boolean;
    onClose: () => void;
    onSaved: () => void;
    editingId?: string;
}

const STEPS = [
    { key: "basics", label: "Basics" },
    { key: "audience", label: "Audience" },
    { key: "cadence", label: "Cadence" },
    { key: "send", label: "Send settings" },
    { key: "review", label: "Review + Save" },
] as const;

const CERTS = ["8(a)", "HUBZone", "SDVOSB", "WOSB", "EDWOSB", "VOSB"];
const STATE_CODES = [
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
    "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
    "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
    "VA","WA","WV","WI","WY","DC",
];

const MERGE_TAGS = [
    "firstName", "lastName", "company", "email", "phone", "title", "city", "state",
];

function blankStep(idx: number, after: number | null = null): CampaignStep {
    return {
        step_index: idx,
        channel: "email",
        delay_value: idx === 0 ? 0 : 2,
        delay_unit: idx === 0 ? "hours" : "days",
        after_step: after,
        subject: "",
        subject_b: "",
        body: "",
        body_b: "",
        body_format: "text",
        skip_if_replied: true,
        skip_if_clicked: false,
        variant_key: "A",
        variant_weight: 100,
    };
}

function blankDraft(): CampaignDraft {
    return {
        name: "",
        description: "",
        channels: ["email"],
        sender_email: "",
        sender_name: "",
        target_segment: {
            naics: [],
            states: [],
            certs: [],
            tags: [],
            custom_filter: "",
            list_id: null,
        },
        throttle_per_hour: 60,
        send_window_start: "09:00",
        send_window_end: "17:00",
        send_window_tz: "America/New_York",
        physical_address: "",
        unsubscribe_footer: "You received this because we found you in public SAM.gov records. Unsubscribe: {{unsubscribe_url}}",
        steps: [blankStep(0)],
    };
}

interface SpamResult {
    score: number;
    severity: "good" | "warn" | "bad";
    reasons: string[];
}

export default function CampaignBuilderModal({ open, onClose, onSaved, editingId }: Props) {
    const [stepKey, setStepKey] = useState<typeof STEPS[number]["key"]>("basics");
    const [draft, setDraft] = useState<CampaignDraft>(blankDraft());
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(false);
    const [activeStepIdx, setActiveStepIdx] = useState(0);
    const [spam, setSpam] = useState<Record<number, SpamResult | null>>({});
    const [testRecipient, setTestRecipient] = useState("");
    const [testStatus, setTestStatus] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    // Load editing campaign
    useEffect(() => {
        if (!open) return;
        if (!editingId) { setDraft(blankDraft()); setStepKey("basics"); setActiveStepIdx(0); setErr(null); return; }
        let cancelled = false;
        setLoading(true);
        (async () => {
            try {
                const res = await fetch(`/api/admin/outreach/campaigns/${editingId}`);
                if (!res.ok) throw new Error(`Load failed (${res.status})`);
                const body = await res.json() as {
                    campaign: Partial<CampaignDraft> & { target_segment?: Partial<CampaignDraft["target_segment"]> };
                    steps: CampaignStep[];
                };
                if (cancelled) return;
                const segDefault = blankDraft().target_segment;
                setDraft({
                    ...blankDraft(),
                    ...body.campaign,
                    target_segment: { ...segDefault, ...(body.campaign.target_segment || {}) },
                    steps: body.steps.length > 0 ? body.steps : [blankStep(0)],
                });
            } catch (e) {
                if (!cancelled) setErr((e as Error).message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [open, editingId]);

    // Escape closes
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, saving, onClose]);

    // Debounced spam check for the active step
    useEffect(() => {
        const step = draft.steps[activeStepIdx];
        if (!step || step.channel !== "email") return;
        const handle = setTimeout(async () => {
            try {
                const res = await fetch("/api/admin/outreach/spam-check", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ subject: step.subject, body: step.body }),
                });
                if (!res.ok) return;
                const result = await res.json() as SpamResult;
                setSpam(prev => ({ ...prev, [activeStepIdx]: result }));
            } catch { /* non-fatal */ }
        }, 500);
        return () => clearTimeout(handle);
    }, [draft.steps, activeStepIdx]);

    const update = useCallback(<K extends keyof CampaignDraft>(key: K, value: CampaignDraft[K]) => {
        setDraft(d => ({ ...d, [key]: value }));
    }, []);

    const updateStep = useCallback((idx: number, patch: Partial<CampaignStep>) => {
        setDraft(d => ({ ...d, steps: d.steps.map((s, i) => i === idx ? { ...s, ...patch } : s) }));
    }, []);

    const addStep = useCallback(() => {
        setDraft(d => ({
            ...d,
            steps: [...d.steps, blankStep(d.steps.length, d.steps.length - 1)],
        }));
        setActiveStepIdx(draft.steps.length);
    }, [draft.steps.length]);

    const removeStep = useCallback((idx: number) => {
        setDraft(d => {
            const next = d.steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step_index: i }));
            return { ...d, steps: next.length === 0 ? [blankStep(0)] : next };
        });
        setActiveStepIdx(i => Math.max(0, i - 1));
    }, []);

    const save = useCallback(async (activate: boolean) => {
        setSaving(true);
        setErr(null);
        try {
            const url = editingId
                ? `/api/admin/outreach/campaigns/${editingId}`
                : `/api/admin/outreach/campaigns`;
            const method = editingId ? "PATCH" : "POST";
            const payload = {
                ...draft,
                activate,
                status: editingId && activate ? "active" : undefined,
            };
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const e = await res.json().catch(() => ({})) as { error?: string };
                throw new Error(e.error || `Save failed (${res.status})`);
            }
            onSaved();
            onClose();
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setSaving(false);
        }
    }, [draft, editingId, onClose, onSaved]);

    const testSend = useCallback(async () => {
        if (!editingId) { setTestStatus("Save the campaign first, then test send."); return; }
        if (!testRecipient.trim()) { setTestStatus("Enter a recipient email."); return; }
        setTestStatus("Sending…");
        try {
            const res = await fetch(`/api/admin/outreach/campaigns/${editingId}/test-send`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ recipient_email: testRecipient.trim(), step_index: activeStepIdx }),
            });
            const body = await res.json() as { ok?: boolean; error?: string };
            if (!res.ok) throw new Error(body.error || "Send failed");
            setTestStatus(`Sent to ${testRecipient.trim()}`);
        } catch (e) { setTestStatus((e as Error).message); }
    }, [editingId, testRecipient, activeStepIdx]);

    const previewBody = useMemo(() => {
        const step = draft.steps[activeStepIdx];
        if (!step) return { subject: "", body: "" };
        return {
            subject: renderMergeFields(step.subject, FAKE_CONTACT),
            body: renderMergeFields(step.body, FAKE_CONTACT),
        };
    }, [draft.steps, activeStepIdx]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="border-b border-stone-200 px-6 py-4 flex items-center gap-4">
                    <div className="flex-1">
                        <h2 className="text-lg font-bold tracking-tight">
                            {editingId ? "Edit campaign" : "Create campaign"}
                        </h2>
                        <p className="text-xs text-stone-500">
                            {draft.name || "Untitled campaign"} · {draft.steps.length} step{draft.steps.length === 1 ? "" : "s"}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 rounded hover:bg-stone-100" aria-label="Close">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Step tabs */}
                <div className="px-6 py-3 border-b border-stone-100 flex items-center gap-1 flex-wrap">
                    {STEPS.map((s, i) => (
                        <button
                            key={s.key}
                            type="button"
                            onClick={() => setStepKey(s.key)}
                            className={clsx(
                                "text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border transition-colors",
                                stepKey === s.key
                                    ? "bg-black text-white border-black"
                                    : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50",
                            )}
                        >
                            <span className="text-stone-400 mr-1">{i + 1}.</span>{s.label}
                        </button>
                    ))}
                </div>

                {/* Body */}
                <div className="flex-1 overflow-auto">
                    {loading ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
                        </div>
                    ) : (
                        <>
                            {stepKey === "basics" && (
                                <BasicsStep draft={draft} update={update} />
                            )}
                            {stepKey === "audience" && (
                                <AudienceStep draft={draft} update={update} />
                            )}
                            {stepKey === "cadence" && (
                                <CadenceStep
                                    draft={draft}
                                    activeIdx={activeStepIdx}
                                    setActiveIdx={setActiveStepIdx}
                                    updateStep={updateStep}
                                    addStep={addStep}
                                    removeStep={removeStep}
                                    spam={spam[activeStepIdx]}
                                    preview={previewBody}
                                    testRecipient={testRecipient}
                                    setTestRecipient={setTestRecipient}
                                    testStatus={testStatus}
                                    testSend={testSend}
                                />
                            )}
                            {stepKey === "send" && (
                                <SendSettingsStep draft={draft} update={update} />
                            )}
                            {stepKey === "review" && (
                                <ReviewStep draft={draft} previewBody={previewBody} />
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-stone-200 px-6 py-3 flex items-center gap-3">
                    {err && (
                        <span className="text-xs text-rose-700 inline-flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" />{err}
                        </span>
                    )}
                    <div className="flex-1" />
                    {stepKey !== "basics" && (
                        <button
                            type="button"
                            onClick={() => {
                                const idx = STEPS.findIndex(s => s.key === stepKey);
                                if (idx > 0) setStepKey(STEPS[idx - 1].key);
                            }}
                            className="text-xs font-bold text-stone-600 px-3 py-2 rounded-lg hover:bg-stone-50 inline-flex items-center gap-1"
                        >
                            <ChevronLeft className="w-3.5 h-3.5" /> Back
                        </button>
                    )}
                    {stepKey !== "review" ? (
                        <button
                            type="button"
                            onClick={() => {
                                const idx = STEPS.findIndex(s => s.key === stepKey);
                                if (idx < STEPS.length - 1) setStepKey(STEPS[idx + 1].key);
                            }}
                            className="text-xs font-bold bg-black text-white px-4 py-2 rounded-lg inline-flex items-center gap-1"
                        >
                            Next <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={() => save(false)}
                                disabled={saving || !draft.name.trim()}
                                className="text-xs font-bold text-stone-700 bg-white border border-stone-200 px-4 py-2 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50 hover:bg-stone-50"
                            >
                                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                Save as draft
                            </button>
                            <button
                                type="button"
                                onClick={() => save(true)}
                                disabled={saving || !draft.name.trim() || draft.steps.length === 0}
                                className="text-xs font-bold bg-emerald-600 text-white px-4 py-2 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50 hover:bg-emerald-700"
                            >
                                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
                                Save + activate
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// ============================================================
// Step 1 — Basics
// ============================================================
function BasicsStep({
    draft,
    update,
}: {
    draft: CampaignDraft;
    update: <K extends keyof CampaignDraft>(key: K, value: CampaignDraft[K]) => void;
}) {
    const toggleChannel = (c: Channel) => {
        if (c === "wait") return;
        const has = draft.channels.includes(c);
        const next = has ? draft.channels.filter(x => x !== c) : [...draft.channels, c];
        update("channels", next.length === 0 ? ["email"] : next);
    };

    return (
        <div className="p-6 max-w-2xl space-y-5">
            <div>
                <label className="text-xs font-bold uppercase tracking-widest text-stone-500 block mb-1.5">
                    Campaign name
                </label>
                <input
                    type="text"
                    placeholder="e.g. New 8(a) registrations — June outreach"
                    value={draft.name}
                    onChange={e => update("name", e.target.value)}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-black"
                />
            </div>

            <div>
                <label className="text-xs font-bold uppercase tracking-widest text-stone-500 block mb-1.5">
                    Internal description
                </label>
                <textarea
                    placeholder="What's this campaign for?"
                    value={draft.description}
                    onChange={e => update("description", e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-black resize-none"
                />
            </div>

            <div>
                <label className="text-xs font-bold uppercase tracking-widest text-stone-500 block mb-1.5">
                    Channels
                </label>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => toggleChannel("email")}
                        className={clsx(
                            "text-xs font-bold px-3 py-2 rounded-lg border inline-flex items-center gap-1.5",
                            draft.channels.includes("email")
                                ? "bg-black text-white border-black"
                                : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50",
                        )}
                    >
                        <Mail className="w-3.5 h-3.5" /> Email
                    </button>
                    <button
                        type="button"
                        onClick={() => toggleChannel("sms")}
                        className={clsx(
                            "text-xs font-bold px-3 py-2 rounded-lg border inline-flex items-center gap-1.5",
                            draft.channels.includes("sms")
                                ? "bg-black text-white border-black"
                                : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50",
                        )}
                    >
                        <MessageSquare className="w-3.5 h-3.5" /> SMS
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-stone-500 block mb-1.5">
                        Sender name
                    </label>
                    <input
                        type="text"
                        placeholder="Andre at CapturePilot"
                        value={draft.sender_name}
                        onChange={e => update("sender_name", e.target.value)}
                        className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-black"
                    />
                </div>
                <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-stone-500 block mb-1.5">
                        Sender email
                    </label>
                    <input
                        type="email"
                        placeholder="andre@capturepilot.com"
                        value={draft.sender_email}
                        onChange={e => update("sender_email", e.target.value)}
                        className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-black"
                    />
                </div>
            </div>
        </div>
    );
}

// ============================================================
// Step 2 — Audience
// ============================================================
function AudienceStep({
    draft,
    update,
}: {
    draft: CampaignDraft;
    update: <K extends keyof CampaignDraft>(key: K, value: CampaignDraft[K]) => void;
}) {
    const segment = draft.target_segment;
    const setSegment = (patch: Partial<typeof segment>) =>
        update("target_segment", { ...segment, ...patch });

    const [naicsQuery, setNaicsQuery] = useState("");
    const naicsHits = useMemo(() => {
        const q = naicsQuery.trim().toLowerCase();
        if (q.length < 2) return [];
        return NAICS_CODES.filter(n =>
            (n.code.startsWith(q) || n.label.toLowerCase().includes(q))
            && !segment.naics.includes(n.code)
        ).slice(0, 12);
    }, [naicsQuery, segment.naics]);

    const toggleArr = (arr: string[], val: string) =>
        arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];

    return (
        <div className="p-6 max-w-3xl space-y-5">
            <p className="text-xs text-stone-500">
                Targets approved prospects matching any combo of NAICS, states, certs, and tags.
            </p>

            {/* NAICS */}
            <div>
                <label className="text-xs font-bold uppercase tracking-widest text-stone-500 block mb-1.5">
                    NAICS codes
                </label>
                {segment.naics.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                        {segment.naics.map(code => {
                            const meta = NAICS_CODES.find(n => n.code === code);
                            return (
                                <span key={code} className="inline-flex items-center gap-1 bg-stone-100 text-stone-700 text-xs font-mono px-2 py-1 rounded">
                                    {code} {meta && <span className="text-stone-500 font-sans">{meta.label}</span>}
                                    <button type="button" onClick={() => setSegment({ naics: segment.naics.filter(c => c !== code) })}>
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            );
                        })}
                    </div>
                )}
                <input
                    type="text"
                    placeholder="Search NAICS (e.g. 541, janitorial)…"
                    value={naicsQuery}
                    onChange={e => setNaicsQuery(e.target.value)}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-black"
                />
                {naicsHits.length > 0 && (
                    <div className="border border-stone-200 rounded-lg mt-1.5 divide-y divide-stone-100 max-h-48 overflow-auto">
                        {naicsHits.map(n => (
                            <button
                                key={n.code}
                                type="button"
                                onClick={() => { setSegment({ naics: [...segment.naics, n.code] }); setNaicsQuery(""); }}
                                className="w-full text-left px-3 py-1.5 hover:bg-stone-50 text-xs flex items-center gap-2"
                            >
                                <span className="font-mono text-stone-500">{n.code}</span>
                                <span className="flex-1">{n.label}</span>
                                <Plus className="w-3 h-3 text-stone-400" />
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* States */}
            <div>
                <label className="text-xs font-bold uppercase tracking-widest text-stone-500 block mb-1.5">
                    States
                </label>
                <div className="flex items-center gap-1 mb-2">
                    <button
                        type="button"
                        onClick={() => setSegment({ states: [...STATE_CODES] })}
                        className="text-[10px] font-bold text-stone-600 px-2 py-0.5 rounded border border-stone-200 hover:bg-stone-50"
                    >Select all 50</button>
                    <button
                        type="button"
                        onClick={() => setSegment({ states: [] })}
                        className="text-[10px] font-bold text-stone-600 px-2 py-0.5 rounded border border-stone-200 hover:bg-stone-50"
                    >Clear</button>
                </div>
                <div className="flex flex-wrap gap-1">
                    {STATE_CODES.map(s => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => setSegment({ states: toggleArr(segment.states, s) })}
                            className={clsx(
                                "text-[10px] font-bold px-2 py-1 rounded border",
                                segment.states.includes(s)
                                    ? "bg-black text-white border-black"
                                    : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50",
                            )}
                        >{s}</button>
                    ))}
                </div>
            </div>

            {/* Certifications */}
            <div>
                <label className="text-xs font-bold uppercase tracking-widest text-stone-500 block mb-1.5">
                    Certifications
                </label>
                <div className="flex flex-wrap gap-1.5">
                    {CERTS.map(c => (
                        <button
                            key={c}
                            type="button"
                            onClick={() => setSegment({ certs: toggleArr(segment.certs, c) })}
                            className={clsx(
                                "text-xs font-bold px-3 py-1.5 rounded border",
                                segment.certs.includes(c)
                                    ? "bg-emerald-600 text-white border-emerald-600"
                                    : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50",
                            )}
                        >{c}</button>
                    ))}
                </div>
            </div>

            {/* Tags */}
            <div>
                <label className="text-xs font-bold uppercase tracking-widest text-stone-500 block mb-1.5">
                    Tags (comma separated)
                </label>
                <input
                    type="text"
                    placeholder="e.g. new-registration, follow-up, q3-push"
                    value={segment.tags.join(", ")}
                    onChange={e => setSegment({ tags: e.target.value.split(",").map(t => t.trim()).filter(Boolean) })}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-black"
                />
            </div>

            {/* Custom filter */}
            <div>
                <label className="text-xs font-bold uppercase tracking-widest text-stone-500 block mb-1.5">
                    Custom filter (raw SQL where-clause)
                </label>
                <textarea
                    placeholder="primary_email is not null and registration_date > now() - interval '14 days'"
                    value={segment.custom_filter}
                    onChange={e => setSegment({ custom_filter: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-black resize-none"
                />
                <p className="text-[10px] text-stone-400 mt-1">Advanced. Validated server-side before enrollment.</p>
            </div>
        </div>
    );
}

// ============================================================
// Step 3 — Cadence (the big one)
// ============================================================
function CadenceStep({
    draft,
    activeIdx,
    setActiveIdx,
    updateStep,
    addStep,
    removeStep,
    spam,
    preview,
    testRecipient,
    setTestRecipient,
    testStatus,
    testSend,
}: {
    draft: CampaignDraft;
    activeIdx: number;
    setActiveIdx: (i: number) => void;
    updateStep: (idx: number, patch: Partial<CampaignStep>) => void;
    addStep: () => void;
    removeStep: (idx: number) => void;
    spam: SpamResult | null | undefined;
    preview: { subject: string; body: string };
    testRecipient: string;
    setTestRecipient: (v: string) => void;
    testStatus: string | null;
    testSend: () => void;
}) {
    const step = draft.steps[activeIdx];

    const insertTag = (tag: string) => {
        if (!step) return;
        const next = (step.body || "") + ` {{${tag}}}`;
        updateStep(activeIdx, { body: next });
    };

    return (
        <div className="flex h-full">
            {/* Left: step list */}
            <div className="w-64 border-r border-stone-200 overflow-auto p-3 space-y-2">
                {draft.steps.map((s, i) => (
                    <div key={i}>
                        <button
                            type="button"
                            onClick={() => setActiveIdx(i)}
                            className={clsx(
                                "w-full text-left p-2.5 rounded-lg border transition-colors",
                                activeIdx === i
                                    ? "border-black bg-stone-50"
                                    : "border-stone-200 hover:bg-stone-50",
                            )}
                        >
                            <div className="flex items-center gap-1.5">
                                {s.channel === "email" && <Mail className="w-3.5 h-3.5 text-stone-600" />}
                                {s.channel === "sms" && <MessageSquare className="w-3.5 h-3.5 text-stone-600" />}
                                {s.channel === "wait" && <Clock className="w-3.5 h-3.5 text-stone-600" />}
                                <span className="text-xs font-bold">Step {i + 1}</span>
                                {s.variant_key && s.variant_key !== "A" && (
                                    <span className="text-[9px] font-black bg-purple-100 text-purple-700 px-1 rounded">{s.variant_key}</span>
                                )}
                            </div>
                            <p className="text-[10px] text-stone-500 mt-0.5 truncate">
                                {s.delay_value > 0 ? `+${s.delay_value} ${s.delay_unit}` : "Immediate"} · {s.subject || "(no subject)"}
                            </p>
                        </button>
                    </div>
                ))}
                <button
                    type="button"
                    onClick={addStep}
                    className="w-full text-xs font-bold text-stone-600 border border-dashed border-stone-300 rounded-lg p-2.5 hover:bg-stone-50 inline-flex items-center justify-center gap-1"
                >
                    <Plus className="w-3.5 h-3.5" /> Add step
                </button>
            </div>

            {/* Middle: editor */}
            <div className="flex-1 overflow-auto p-5 space-y-4 border-r border-stone-200">
                {step && (
                    <>
                        <div className="flex items-center gap-2 flex-wrap">
                            <label className="text-xs font-bold uppercase tracking-widest text-stone-500">
                                Channel
                            </label>
                            {(["email", "sms", "wait"] as Channel[]).map(c => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => updateStep(activeIdx, { channel: c })}
                                    className={clsx(
                                        "text-xs font-bold px-3 py-1.5 rounded-lg border inline-flex items-center gap-1.5",
                                        step.channel === c
                                            ? "bg-black text-white border-black"
                                            : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50",
                                    )}
                                >
                                    {c === "email" && <Mail className="w-3 h-3" />}
                                    {c === "sms" && <MessageSquare className="w-3 h-3" />}
                                    {c === "wait" && <Clock className="w-3 h-3" />}
                                    {c.toUpperCase()}
                                </button>
                            ))}
                            <div className="ml-auto" />
                            {draft.steps.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() => removeStep(activeIdx)}
                                    className="text-xs text-rose-600 hover:bg-rose-50 px-2 py-1 rounded inline-flex items-center gap-1"
                                >
                                    <Trash2 className="w-3 h-3" /> Remove
                                </button>
                            )}
                        </div>

                        {/* Timing */}
                        <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 flex items-center gap-2 flex-wrap text-xs">
                            <span className="text-stone-500">Send</span>
                            <input
                                type="number"
                                min={0}
                                value={step.delay_value}
                                onChange={e => updateStep(activeIdx, { delay_value: Math.max(0, Number(e.target.value)) })}
                                className="w-16 px-2 py-1 border border-stone-200 rounded text-center"
                                aria-label="Delay value"
                            />
                            <select
                                value={step.delay_unit}
                                onChange={e => updateStep(activeIdx, { delay_unit: e.target.value as DelayUnit })}
                                className="px-2 py-1 border border-stone-200 rounded"
                                aria-label="Delay unit"
                            >
                                <option value="minutes">minutes</option>
                                <option value="hours">hours</option>
                                <option value="days">days</option>
                            </select>
                            <span className="text-stone-500">after</span>
                            <select
                                value={step.after_step ?? ""}
                                onChange={e => updateStep(activeIdx, { after_step: e.target.value === "" ? null : Number(e.target.value) })}
                                className="px-2 py-1 border border-stone-200 rounded"
                                aria-label="After step"
                            >
                                <option value="">campaign start</option>
                                {draft.steps.slice(0, activeIdx).map((_, i) => (
                                    <option key={i} value={i}>step {i + 1}</option>
                                ))}
                            </select>
                        </div>

                        {/* Email content */}
                        {step.channel === "email" && (
                            <>
                                <div>
                                    <label className="text-xs font-bold uppercase tracking-widest text-stone-500 block mb-1.5">
                                        Subject
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Quick question about your new SAM registration"
                                        value={step.subject}
                                        onChange={e => updateStep(activeIdx, { subject: e.target.value })}
                                        className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-black"
                                    />
                                </div>
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <label className="text-xs font-bold uppercase tracking-widest text-stone-500">
                                            Body
                                        </label>
                                        <div className="flex items-center gap-1 flex-wrap">
                                            {MERGE_TAGS.map(tag => (
                                                <button
                                                    key={tag}
                                                    type="button"
                                                    onClick={() => insertTag(tag)}
                                                    className="text-[10px] font-mono bg-stone-100 text-stone-600 hover:bg-stone-200 px-1.5 py-0.5 rounded"
                                                >{`{{${tag}}}`}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <textarea
                                        placeholder={`Hi {{firstName}},\n\nNoticed {{company}} just registered on SAM.gov…`}
                                        value={step.body}
                                        onChange={e => updateStep(activeIdx, { body: e.target.value })}
                                        rows={9}
                                        className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-black resize-none"
                                    />
                                </div>
                                {/* Variant B — 50/50 split at send time */}
                                <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold uppercase tracking-widest text-amber-700 inline-flex items-center gap-1.5">
                                            <GitBranch className="w-3.5 h-3.5" /> Variant B — 50/50 split test
                                        </span>
                                        <span className="text-[10px] text-amber-600">{(step.subject_b || step.body_b) ? "ON" : "leave blank to send A only"}</span>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Subject B (falls back to A if blank)"
                                        value={step.subject_b}
                                        onChange={e => updateStep(activeIdx, { subject_b: e.target.value })}
                                        className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                                    />
                                    <textarea
                                        placeholder="Body B — a different hook. Falls back to A body if blank."
                                        value={step.body_b}
                                        onChange={e => updateStep(activeIdx, { body_b: e.target.value })}
                                        rows={7}
                                        className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-amber-400 bg-white resize-none"
                                    />
                                </div>
                            </>
                        )}

                        {step.channel === "sms" && (
                            <div>
                                <label className="text-xs font-bold uppercase tracking-widest text-stone-500 block mb-1.5">
                                    SMS body (160 chars)
                                </label>
                                <textarea
                                    placeholder="Hey {{firstName}} — quick question about your SAM reg. Got 30s?"
                                    value={step.body}
                                    onChange={e => updateStep(activeIdx, { body: e.target.value.slice(0, 320) })}
                                    rows={3}
                                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-black resize-none"
                                />
                                <p className="text-[10px] text-stone-400 mt-1">{step.body.length}/320 chars · {Math.ceil(step.body.length / 160)} segment(s)</p>
                                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-2">
                                    <span className="text-xs font-bold uppercase tracking-widest text-amber-700 inline-flex items-center gap-1.5">
                                        <GitBranch className="w-3.5 h-3.5" /> Variant B — 50/50 split
                                    </span>
                                    <textarea
                                        placeholder="SMS body B (falls back to A if blank)"
                                        value={step.body_b}
                                        onChange={e => updateStep(activeIdx, { body_b: e.target.value.slice(0, 320) })}
                                        rows={3}
                                        className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-400 bg-white resize-none"
                                    />
                                </div>
                            </div>
                        )}

                        {step.channel === "wait" && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                                Wait step pauses the cadence by the delay above before continuing to the next step.
                            </div>
                        )}

                        {/* Skip toggles */}
                        <div className="flex items-center gap-4 text-xs">
                            <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={step.skip_if_replied}
                                    onChange={e => updateStep(activeIdx, { skip_if_replied: e.target.checked })}
                                />
                                Skip if replied
                            </label>
                            <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={step.skip_if_clicked}
                                    onChange={e => updateStep(activeIdx, { skip_if_clicked: e.target.checked })}
                                />
                                Skip if clicked
                            </label>
                            {step.variant_key && step.variant_key !== "A" && (
                                <label className="inline-flex items-center gap-1.5 ml-auto">
                                    Variant {step.variant_key} weight
                                    <input
                                        type="range"
                                        min={0}
                                        max={100}
                                        value={step.variant_weight}
                                        onChange={e => updateStep(activeIdx, { variant_weight: Number(e.target.value) })}
                                    />
                                    <span className="font-mono w-8">{step.variant_weight}%</span>
                                </label>
                            )}
                        </div>

                        {/* Spam check */}
                        {step.channel === "email" && spam && (
                            <div className={clsx(
                                "border rounded-lg p-3 text-xs space-y-1",
                                spam.severity === "good" && "bg-emerald-50 border-emerald-200 text-emerald-800",
                                spam.severity === "warn" && "bg-amber-50 border-amber-200 text-amber-800",
                                spam.severity === "bad" && "bg-rose-50 border-rose-200 text-rose-800",
                            )}>
                                <div className="flex items-center gap-2 font-bold">
                                    <Sparkles className="w-3.5 h-3.5" />
                                    Spam score: {spam.score}/100
                                    <span className="uppercase text-[10px] tracking-widest">({spam.severity})</span>
                                </div>
                                <ul className="list-disc pl-4 space-y-0.5">
                                    {spam.reasons.map((r, i) => <li key={i}>{r}</li>)}
                                </ul>
                            </div>
                        )}

                        {/* Test send */}
                        <div className="border-t border-stone-200 pt-3 flex items-center gap-2">
                            <input
                                type="email"
                                placeholder="you@example.com"
                                value={testRecipient}
                                onChange={e => setTestRecipient(e.target.value)}
                                className="flex-1 px-3 py-1.5 border border-stone-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-black"
                            />
                            <button
                                type="button"
                                onClick={testSend}
                                className="text-xs font-bold bg-white border border-stone-200 text-stone-700 px-3 py-1.5 rounded-lg hover:bg-stone-50 inline-flex items-center gap-1"
                            >
                                <Send className="w-3 h-3" /> Test send
                            </button>
                            {testStatus && <span className="text-[10px] text-stone-500">{testStatus}</span>}
                        </div>
                    </>
                )}
            </div>

            {/* Right: live preview */}
            <div className="w-[360px] bg-stone-50 overflow-auto p-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">
                    Preview · {FAKE_CONTACT.firstName} at {FAKE_CONTACT.company}
                </div>
                {step?.channel === "email" && (
                    <div className="bg-white border border-stone-200 rounded-lg p-3 text-xs space-y-2 shadow-sm">
                        <p className="font-bold text-stone-900 break-words">{preview.subject || "(no subject)"}</p>
                        <p className="text-stone-500 text-[10px]">From: {draft.sender_name || "—"} &lt;{draft.sender_email || "—"}&gt;</p>
                        <div className="border-t border-stone-100 pt-2 whitespace-pre-wrap text-stone-700">
                            {preview.body || <span className="text-stone-300">(empty body)</span>}
                        </div>
                    </div>
                )}
                {step?.channel === "sms" && (
                    <div className="bg-white border border-stone-200 rounded-lg p-3 text-xs">
                        <div className="bg-stone-100 rounded-lg p-2 whitespace-pre-wrap text-stone-800">
                            {preview.body || <span className="text-stone-300">(empty SMS)</span>}
                        </div>
                    </div>
                )}
                {step?.channel === "wait" && (
                    <div className="bg-white border border-stone-200 rounded-lg p-3 text-xs text-stone-500">
                        Wait {step.delay_value} {step.delay_unit} before the next step.
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================================
// Step 4 — Send settings
// ============================================================
function SendSettingsStep({
    draft,
    update,
}: {
    draft: CampaignDraft;
    update: <K extends keyof CampaignDraft>(key: K, value: CampaignDraft[K]) => void;
}) {
    return (
        <div className="p-6 max-w-2xl space-y-5">
            <div>
                <label className="text-xs font-bold uppercase tracking-widest text-stone-500 block mb-1.5">
                    Throttle (max sends per hour)
                </label>
                <input
                    type="number"
                    min={1}
                    max={1000}
                    value={draft.throttle_per_hour}
                    onChange={e => update("throttle_per_hour", Math.max(1, Number(e.target.value)))}
                    className="w-32 px-3 py-2 border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-black"
                />
                <p className="text-[10px] text-stone-400 mt-1">Lower = better sender reputation. Start at 30-60/hr for new domains.</p>
            </div>

            <div>
                <label className="text-xs font-bold uppercase tracking-widest text-stone-500 block mb-1.5">
                    Send window
                </label>
                <div className="flex items-center gap-2">
                    <input
                        type="time"
                        value={draft.send_window_start}
                        onChange={e => update("send_window_start", e.target.value)}
                        className="px-3 py-2 border border-stone-200 rounded-lg text-sm"
                        aria-label="Window start"
                    />
                    <span className="text-xs text-stone-500">to</span>
                    <input
                        type="time"
                        value={draft.send_window_end}
                        onChange={e => update("send_window_end", e.target.value)}
                        className="px-3 py-2 border border-stone-200 rounded-lg text-sm"
                        aria-label="Window end"
                    />
                    <select
                        value={draft.send_window_tz}
                        onChange={e => update("send_window_tz", e.target.value)}
                        className="px-3 py-2 border border-stone-200 rounded-lg text-sm"
                        aria-label="Timezone"
                    >
                        <option value="America/New_York">Eastern</option>
                        <option value="America/Chicago">Central</option>
                        <option value="America/Denver">Mountain</option>
                        <option value="America/Los_Angeles">Pacific</option>
                        <option value="UTC">UTC</option>
                    </select>
                </div>
            </div>

            <div>
                <label className="text-xs font-bold uppercase tracking-widest text-stone-500 block mb-1.5">
                    CAN-SPAM physical address
                </label>
                <textarea
                    placeholder="CapturePilot, 1234 K Street NW, Washington DC 20005"
                    value={draft.physical_address}
                    onChange={e => update("physical_address", e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-black resize-none"
                />
                <p className="text-[10px] text-stone-400 mt-1">Required by CAN-SPAM. Auto-appended to every email.</p>
            </div>

            <div>
                <label className="text-xs font-bold uppercase tracking-widest text-stone-500 block mb-1.5">
                    Unsubscribe footer
                </label>
                <textarea
                    value={draft.unsubscribe_footer}
                    onChange={e => update("unsubscribe_footer", e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-black resize-none"
                />
                <p className="text-[10px] text-stone-400 mt-1">{`Use {{unsubscribe_url}} — gets replaced with a per-contact one-click link.`}</p>
            </div>
        </div>
    );
}

// ============================================================
// Step 5 — Review
// ============================================================
function ReviewStep({
    draft,
    previewBody,
}: {
    draft: CampaignDraft;
    previewBody: { subject: string; body: string };
}) {
    const seg = draft.target_segment;
    const segParts = [
        seg.naics.length > 0 && `${seg.naics.length} NAICS`,
        seg.states.length > 0 && `${seg.states.length} states`,
        seg.certs.length > 0 && seg.certs.join(", "),
        seg.tags.length > 0 && `tags: ${seg.tags.join(", ")}`,
    ].filter(Boolean);

    return (
        <div className="p-6 max-w-3xl space-y-4">
            <div className="bg-stone-50 border border-stone-200 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm">{draft.name || "Untitled"}</h3>
                    <span className="text-[10px] uppercase font-bold tracking-widest bg-stone-200 px-1.5 py-0.5 rounded">Draft</span>
                </div>
                {draft.description && <p className="text-xs text-stone-600">{draft.description}</p>}
                <p className="text-xs text-stone-500">
                    Channels: {draft.channels.join(" + ")} · {draft.steps.length} step{draft.steps.length === 1 ? "" : "s"}
                </p>
                <p className="text-xs text-stone-500">Segment: {segParts.length > 0 ? segParts.join(" · ") : "(empty — will skip enrollment)"}</p>
                <p className="text-xs text-stone-500">Throttle: {draft.throttle_per_hour}/hr · Window {draft.send_window_start}–{draft.send_window_end} {draft.send_window_tz}</p>
            </div>

            <div className="border border-stone-200 rounded-lg overflow-hidden">
                <div className="bg-stone-100 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-stone-500">
                    Preview · step 1 for {FAKE_CONTACT.firstName} at {FAKE_CONTACT.company}
                </div>
                <div className="p-4 space-y-2 text-xs">
                    <p className="font-bold text-stone-900">{previewBody.subject || "(no subject)"}</p>
                    <p className="text-stone-500 text-[10px]">From: {draft.sender_name || "—"} &lt;{draft.sender_email || "—"}&gt;</p>
                    <div className="border-t border-stone-100 pt-2 whitespace-pre-wrap text-stone-700">
                        {previewBody.body || <span className="text-stone-300">(empty body)</span>}
                    </div>
                    {draft.physical_address && (
                        <p className="text-[10px] text-stone-400 mt-2 whitespace-pre-wrap">{draft.physical_address}</p>
                    )}
                </div>
            </div>

            <div className="text-xs text-stone-500 space-y-1">
                <p className="inline-flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-600" /> Unsubscribe link auto-injected.</p>
                <p className="inline-flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-600" /> Suppression list (outreach_optouts) checked before every send.</p>
                <p className="inline-flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-600" /> Send-window + throttle enforced server-side.</p>
            </div>
        </div>
    );
}

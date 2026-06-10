"use client";

import { useCallback, useEffect, useState } from "react";
import {
    X, Mail, Phone, Building2, Briefcase, MapPin, Tag, Hash, Clock,
    Send, Loader2, MessageSquare, Mailbox, AlertCircle, Save, Edit3,
    Flame, TrendingUp, Target,
} from "lucide-react";
import clsx from "clsx";
import { getCompositeLeadScore, HIGH_INTENT_THRESHOLD } from "@/lib/outreach-engagement-scoring";

interface Props {
    contactId: string;
    onClose: () => void;
    onChange: () => void;
}

interface Timeline {
    contact: any | null;
    events: any[];
    sends: any[];
    replies: any[];
    memberships: any[];
    lead_score?: {
        score: number;
        fit_score: number;
        intent_score: number;
        composite: number;
        updated_at: string;
    } | null;
}

export default function ContactDrawer({ contactId, onClose, onChange }: Props) {
    const [data, setData] = useState<Timeline | null>(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<any>(null);
    const [saving, setSaving] = useState(false);
    const [noteDraft, setNoteDraft] = useState("");

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/admin/outreach/contacts/${contactId}/timeline`);
            const body = await res.json();
            setData(body);
            setDraft(body.contact ? { ...body.contact } : null);
            setNoteDraft((body.contact?.custom_fields?.notes as string) || "");
        } catch {
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [contactId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const save = async () => {
        if (!draft) return;
        setSaving(true);
        try {
            const customFields = { ...(draft.custom_fields || {}), notes: noteDraft };
            const res = await fetch(`/api/admin/outreach/contacts/${contactId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: draft.email,
                    phone: draft.phone,
                    first_name: draft.first_name,
                    last_name: draft.last_name,
                    company_name: draft.company_name,
                    title: draft.title,
                    state: draft.state,
                    tags: draft.tags,
                    custom_fields: customFields,
                }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || "Save failed");
            setEditing(false);
            onChange();
            fetchData();
        } catch (e: any) {
            alert(e.message);
        } finally {
            setSaving(false);
        }
    };

    const suppress = async () => {
        if (!window.confirm("Suppress this contact from all future sends?")) return;
        await fetch(`/api/admin/outreach/contacts/bulk-action`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "suppress", ids: [contactId] }),
        });
        onChange();
        fetchData();
    };

    const enroll = async () => {
        const campaignId = window.prompt("Campaign ID:")?.trim();
        if (!campaignId) return;
        const res = await fetch(`/api/admin/outreach/contacts/bulk-action`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "add_to_campaign", ids: [contactId], payload: { campaign_id: campaignId } }),
        });
        const body = await res.json();
        if (body.error) return alert(body.error);
        fetchData();
    };

    const merged = mergeTimeline(data);
    const c = data?.contact;
    const tagDraftInput = (draft?.tags || []).join(", ");

    // R3-M5.1: prefer the persisted lead-score row (composite + fit + intent
    // from outreach_lead_scores). Fall back to the lib-side calculation off the
    // contact's engagement_score when the row hasn't landed yet (new contact,
    // pre-first-cron-run, etc).
    const scoreDisplay = c
        ? data?.lead_score
            ? {
                engagement: Math.round(data.lead_score.intent_score),
                fit: Math.round(data.lead_score.fit_score),
                composite: Math.round(data.lead_score.composite ?? data.lead_score.score),
            }
            : getCompositeLeadScore(c)
        : null;

    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={onClose}>
            <div className="bg-white w-full max-w-md sm:max-w-lg h-full overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
                <header className="sticky top-0 bg-white border-b border-stone-200 px-5 py-3 flex items-center justify-between z-10">
                    <h2 className="font-bold text-sm">Contact details</h2>
                    <button onClick={onClose} className="text-stone-400 hover:text-black"><X className="w-5 h-5" /></button>
                </header>

                {loading ? (
                    <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>
                ) : !c ? (
                    <div className="p-6 text-sm text-stone-500">Contact not found.</div>
                ) : (
                    <div className="p-5 space-y-6">
                        {/* R3-M5.1: lead-score scorecard. Three pills above the
                            profile block so the AE sees intent/fit at a glance
                            before scrolling the timeline. */}
                        {scoreDisplay && (
                            <section className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xs font-bold uppercase tracking-wide text-stone-500 inline-flex items-center gap-1">
                                        <TrendingUp className="w-3.5 h-3.5" /> Lead score
                                    </h3>
                                    {scoreDisplay.engagement >= HIGH_INTENT_THRESHOLD && (
                                        <span className="text-[10px] font-bold bg-rose-50 text-rose-700 rounded px-1.5 py-0.5 inline-flex items-center gap-1">
                                            <Flame className="w-3 h-3" /> HIGH INTENT
                                        </span>
                                    )}
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    <ScorePill
                                        label="Engagement"
                                        value={scoreDisplay.engagement}
                                        icon={Flame}
                                        tone="orange"
                                    />
                                    <ScorePill
                                        label="Fit"
                                        value={scoreDisplay.fit}
                                        icon={Target}
                                        tone="blue"
                                    />
                                    <ScorePill
                                        label="Composite"
                                        value={scoreDisplay.composite}
                                        icon={TrendingUp}
                                        tone="emerald"
                                    />
                                </div>
                                {data?.lead_score?.updated_at && (
                                    <p className="text-[10px] text-stone-400">
                                        Updated {new Date(data.lead_score.updated_at).toLocaleString()}
                                    </p>
                                )}
                            </section>
                        )}

                        {/* Profile block */}
                        <section className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xs font-bold uppercase tracking-wide text-stone-500">Profile</h3>
                                {!editing ? (
                                    <button onClick={() => setEditing(true)} className="text-xs text-stone-500 inline-flex items-center gap-1 hover:text-black"><Edit3 className="w-3 h-3" /> Edit</button>
                                ) : (
                                    <button onClick={save} disabled={saving} className="text-xs bg-black hover:bg-stone-800 text-white font-bold px-3 py-1 rounded inline-flex items-center gap-1 disabled:opacity-50">
                                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
                                    </button>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <Field icon={Mail} label="Email" value={editing ? null : c.email}>
                                    {editing && <input value={draft.email || ""} onChange={e => setDraft({ ...draft, email: e.target.value })} className="w-full px-2 py-1 text-xs border border-stone-200 rounded" />}
                                </Field>
                                <Field icon={Phone} label="Phone" value={editing ? null : c.phone}>
                                    {editing && <input value={draft.phone || ""} onChange={e => setDraft({ ...draft, phone: e.target.value })} className="w-full px-2 py-1 text-xs border border-stone-200 rounded" />}
                                </Field>
                                <Field label="First name" value={editing ? null : c.first_name}>
                                    {editing && <input value={draft.first_name || ""} onChange={e => setDraft({ ...draft, first_name: e.target.value })} className="w-full px-2 py-1 text-xs border border-stone-200 rounded" />}
                                </Field>
                                <Field label="Last name" value={editing ? null : c.last_name}>
                                    {editing && <input value={draft.last_name || ""} onChange={e => setDraft({ ...draft, last_name: e.target.value })} className="w-full px-2 py-1 text-xs border border-stone-200 rounded" />}
                                </Field>
                                <Field icon={Building2} label="Company" value={editing ? null : c.company_name}>
                                    {editing && <input value={draft.company_name || ""} onChange={e => setDraft({ ...draft, company_name: e.target.value })} className="w-full px-2 py-1 text-xs border border-stone-200 rounded" />}
                                </Field>
                                <Field icon={Briefcase} label="Title" value={editing ? null : c.title}>
                                    {editing && <input value={draft.title || ""} onChange={e => setDraft({ ...draft, title: e.target.value })} className="w-full px-2 py-1 text-xs border border-stone-200 rounded" />}
                                </Field>
                                <Field icon={MapPin} label="State" value={editing ? null : c.state}>
                                    {editing && <input value={draft.state || ""} onChange={e => setDraft({ ...draft, state: e.target.value })} className="w-full px-2 py-1 text-xs border border-stone-200 rounded" />}
                                </Field>
                                <Field icon={Hash} label="Source" value={c.source} />
                            </div>

                            <div>
                                <p className="text-[10px] font-bold uppercase text-stone-500 mb-1">Tags</p>
                                {editing ? (
                                    <input
                                        value={tagDraftInput}
                                        onChange={e => setDraft({ ...draft, tags: e.target.value.split(/,\s*/).filter(Boolean) })}
                                        placeholder="comma separated"
                                        className="w-full px-2 py-1 text-xs border border-stone-200 rounded"
                                    />
                                ) : (
                                    <div className="flex flex-wrap gap-1">
                                        {(c.tags || []).length === 0 && <span className="text-xs text-stone-400">no tags</span>}
                                        {(c.tags || []).map((t: string) => (
                                            <span key={t} className="text-[10px] bg-stone-100 text-stone-700 rounded px-1.5 py-0.5">{t}</span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-2 pt-1">
                                <button onClick={enroll} className="bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">
                                    <Send className="w-3.5 h-3.5" /> Add to campaign
                                </button>
                                <button onClick={suppress} className="bg-white hover:bg-rose-50 border border-rose-200 text-rose-700 font-bold text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">
                                    <AlertCircle className="w-3.5 h-3.5" /> Suppress
                                </button>
                            </div>
                        </section>

                        {/* Campaigns */}
                        <section>
                            <h3 className="text-xs font-bold uppercase tracking-wide text-stone-500 mb-2 inline-flex items-center gap-1"><Mailbox className="w-3.5 h-3.5" /> Campaigns ({data.memberships.length})</h3>
                            {data.memberships.length === 0 ? (
                                <p className="text-xs text-stone-400">No campaign memberships yet.</p>
                            ) : (
                                <div className="space-y-1.5">
                                    {data.memberships.map(m => (
                                        <div key={m.id} className="flex items-center justify-between border border-stone-200 rounded-lg px-3 py-2 text-xs">
                                            <div>
                                                <p className="font-bold text-stone-800">{m.outreach_campaigns?.name || m.campaign_id}</p>
                                                <p className="text-stone-500">Step {m.current_step} · {m.status}</p>
                                            </div>
                                            <span className="text-[10px] text-stone-400">{new Date(m.added_at).toLocaleDateString()}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        {/* Replies */}
                        {data.replies.length > 0 && (
                            <section>
                                <h3 className="text-xs font-bold uppercase tracking-wide text-stone-500 mb-2 inline-flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5" /> Replies ({data.replies.length})</h3>
                                <div className="space-y-2">
                                    {data.replies.map(r => (
                                        <div key={r.id} className="border border-stone-200 rounded-lg px-3 py-2 text-xs">
                                            <div className="flex items-center justify-between">
                                                <span className="font-bold text-stone-800">{r.subject || "(no subject)"}</span>
                                                <span className={clsx(
                                                    "text-[9px] font-bold px-1.5 py-0.5 rounded",
                                                    r.sentiment === "positive" ? "bg-emerald-50 text-emerald-700" :
                                                    r.sentiment === "negative" ? "bg-rose-50 text-rose-700" :
                                                    r.sentiment === "unsubscribe" ? "bg-stone-100 text-stone-600" :
                                                    "bg-stone-50 text-stone-500"
                                                )}>{r.sentiment || "?"}</span>
                                            </div>
                                            <p className="text-stone-600 mt-1 line-clamp-3">{r.body_text}</p>
                                            <span className="text-[10px] text-stone-400">{new Date(r.received_at).toLocaleString()}</span>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Timeline */}
                        <section>
                            <h3 className="text-xs font-bold uppercase tracking-wide text-stone-500 mb-2 inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Engagement timeline ({merged.length})</h3>
                            {merged.length === 0 ? (
                                <p className="text-xs text-stone-400">No engagement events yet.</p>
                            ) : (
                                <ol className="space-y-2 border-l-2 border-stone-200 pl-4 ml-1">
                                    {merged.slice(0, 50).map(ev => (
                                        <li key={ev.id} className="relative text-xs">
                                            <div className={clsx(
                                                "absolute -left-[1.30rem] top-1 w-2 h-2 rounded-full border-2 border-white",
                                                ev.kind === "reply" ? "bg-emerald-500" :
                                                ev.kind === "send" ? "bg-blue-500" :
                                                ev.kind === "open" ? "bg-amber-500" :
                                                ev.kind === "click" ? "bg-fuchsia-500" :
                                                "bg-stone-400"
                                            )} />
                                            <p className="text-stone-700"><strong>{ev.label}</strong> {ev.subtitle && <span className="text-stone-500">— {ev.subtitle}</span>}</p>
                                            <p className="text-[10px] text-stone-400">{new Date(ev.at).toLocaleString()}</p>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </section>

                        {/* Notes */}
                        <section>
                            <h3 className="text-xs font-bold uppercase tracking-wide text-stone-500 mb-2">Notes</h3>
                            <textarea
                                value={noteDraft}
                                onChange={e => setNoteDraft(e.target.value)}
                                placeholder="Manual notes about this contact…"
                                rows={3}
                                className="w-full px-2 py-2 text-xs rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400"
                            />
                            <button
                                onClick={save}
                                disabled={saving}
                                className="text-xs bg-white hover:bg-stone-100 border border-stone-200 px-3 py-1.5 rounded-lg inline-flex items-center gap-1 mt-1 disabled:opacity-50"
                            >
                                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save notes
                            </button>
                        </section>
                    </div>
                )}
            </div>
        </div>
    );
}

function Field({ icon: Icon, label, value, children }: { icon?: any; label: string; value?: any; children?: any }) {
    return (
        <div>
            <p className="text-[10px] font-bold uppercase text-stone-400 inline-flex items-center gap-1">
                {Icon && <Icon className="w-3 h-3" />} {label}
            </p>
            {children ?? <p className="text-stone-700 truncate">{value || <span className="text-stone-300">—</span>}</p>}
        </div>
    );
}

/**
 * R3-M5.1 — small numeric scorecard pill used by the lead-score header.
 */
function ScorePill({
    label, value, icon: Icon, tone,
}: {
    label: string;
    value: number;
    icon: any;
    tone: "orange" | "blue" | "emerald";
}) {
    const toneClass =
        tone === "orange" ? "bg-orange-50 text-orange-800 border-orange-200" :
        tone === "blue" ? "bg-blue-50 text-blue-800 border-blue-200" :
        "bg-emerald-50 text-emerald-800 border-emerald-200";
    return (
        <div className={clsx("border rounded-lg px-2 py-2 text-center", toneClass)}>
            <div className="inline-flex items-center gap-1 text-[10px] font-bold uppercase opacity-70">
                <Icon className="w-3 h-3" /> {label}
            </div>
            <div className="text-lg font-bold tabular-nums leading-none mt-1">{value}</div>
        </div>
    );
}

interface TLItem {
    id: string;
    at: string;
    kind: "event" | "send" | "open" | "click" | "reply" | "bounce";
    label: string;
    subtitle?: string;
}

function mergeTimeline(data: Timeline | null): TLItem[] {
    if (!data) return [];
    const out: TLItem[] = [];

    for (const e of data.events || []) {
        out.push({
            id: `ev-${e.id}`,
            at: e.captured_at,
            kind: ((): TLItem["kind"] => {
                if (e.event_type === "opened") return "open";
                if (e.event_type === "clicked") return "click";
                if (e.event_type === "replied") return "reply";
                if (e.event_type === "bounced") return "bounce";
                return "event";
            })(),
            label: e.event_type,
            subtitle: e.payload?.subject || e.payload?.url || "",
        });
    }

    for (const s of data.sends || []) {
        if (s.sent_at) out.push({ id: `s-${s.id}`, at: s.sent_at, kind: "send", label: `${s.channel} sent`, subtitle: s.rendered_subject });
        if (s.opened_at) out.push({ id: `o-${s.id}`, at: s.opened_at, kind: "open", label: "Opened", subtitle: s.rendered_subject });
        if (s.first_click_at) out.push({ id: `c-${s.id}`, at: s.first_click_at, kind: "click", label: "Clicked link", subtitle: s.rendered_subject });
        if (s.bounced_at) out.push({ id: `b-${s.id}`, at: s.bounced_at, kind: "bounce", label: "Bounced", subtitle: s.rendered_subject });
    }

    for (const r of data.replies || []) {
        out.push({ id: `r-${r.id}`, at: r.received_at, kind: "reply", label: `Replied (${r.sentiment || "unsure"})`, subtitle: r.subject });
    }

    return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

"use client";

/**
 * Feature-request form — drops a ticket into HubSpot tagged with a
 * 48-hour SLA. We promise users a response within 48h for any feature
 * request that's not architecturally complex. The form captures:
 *   - category (bug / feature / question / other)
 *   - title (one-line)
 *   - description (free text)
 *   - urgency (nice-to-have / important / blocking)
 *   - what tier they're on (auto-filled — informs prioritization)
 *
 * On submit → POST /api/feature-request → creates HubSpot ticket on the
 * support pipeline, tagged "48hr_sla" if urgency != nice-to-have.
 *
 * Two render modes:
 *   <FeatureRequestForm trigger="button" />   — small button bottom-right
 *                                                 of a feature page; opens
 *                                                 modal on click
 *   <FeatureRequestForm trigger="inline" />   — embedded form (Settings page)
 */

import { useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle, X, MessageSquare, Lightbulb, Bug, HelpCircle, Send } from "lucide-react";
import clsx from "clsx";

type Category = "bug" | "feature" | "question" | "other";
type Urgency = "nice_to_have" | "important" | "blocking";

interface Props {
    trigger?: "button" | "inline";
    /** Optional: pre-fill the feature/page context so the user doesn't have to. */
    contextFeature?: string;
}

const CATEGORIES: { value: Category; label: string; icon: typeof Bug }[] = [
    { value: "feature", label: "Feature request", icon: Lightbulb },
    { value: "bug", label: "Bug report", icon: Bug },
    { value: "question", label: "Question", icon: HelpCircle },
    { value: "other", label: "Other", icon: MessageSquare },
];

const URGENCIES: { value: Urgency; label: string; description: string }[] = [
    { value: "nice_to_have", label: "Nice to have", description: "No rush — pick it up when you can" },
    { value: "important", label: "Important", description: "Blocking my workflow but I have a workaround" },
    { value: "blocking", label: "Blocking my work", description: "I can't continue until this is fixed" },
];

export default function FeatureRequestForm({ trigger = "button", contextFeature }: Props) {
    const [open, setOpen] = useState(trigger === "inline");
    const [category, setCategory] = useState<Category>("feature");
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [urgency, setUrgency] = useState<Urgency>("nice_to_have");
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<{ ok: boolean; message: string; ticketId?: string } | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!title.trim() || !description.trim()) return;
        setSubmitting(true);
        setResult(null);
        try {
            const res = await fetch("/api/feature-request", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    category,
                    title: title.trim(),
                    description: description.trim(),
                    urgency,
                    context_feature: contextFeature || null,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setResult({ ok: false, message: data.error || "Submit failed" });
            } else {
                setResult({
                    ok: true,
                    message: urgency === "nice_to_have"
                        ? "Thanks! We'll review and add to the backlog."
                        : "Thanks! You'll hear back within 48 hours.",
                    ticketId: data.ticket_id,
                });
                setTitle("");
                setDescription("");
            }
        } catch {
            setResult({ ok: false, message: "Network error — please try again" });
        } finally {
            setSubmitting(false);
        }
    }

    if (trigger === "button" && !open) {
        return (
            <button
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-600 hover:text-stone-900 border border-stone-300 hover:border-stone-400 bg-white px-3 py-1.5 rounded-lg transition-colors"
            >
                <MessageSquare className="w-3.5 h-3.5" /> Suggest improvement
            </button>
        );
    }

    const formCore = (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="text-xs font-bold text-stone-700 uppercase tracking-wide mb-1.5 block">
                    Type
                </label>
                <div className="grid grid-cols-4 gap-2">
                    {CATEGORIES.map(c => {
                        const Icon = c.icon;
                        return (
                            <button
                                type="button"
                                key={c.value}
                                onClick={() => setCategory(c.value)}
                                className={clsx(
                                    "text-xs font-bold border rounded-lg px-2 py-2.5 inline-flex flex-col items-center gap-1 transition-colors",
                                    category === c.value
                                        ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                                        : "bg-white border-stone-300 text-stone-600 hover:border-stone-400"
                                )}
                            >
                                <Icon className="w-3.5 h-3.5" />
                                {c.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div>
                <label className="text-xs font-bold text-stone-700 uppercase tracking-wide mb-1.5 block">
                    One-line summary
                </label>
                <input
                    type="text"
                    required
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. 'Add CSV export to Pipeline page'"
                    className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                />
            </div>

            <div>
                <label className="text-xs font-bold text-stone-700 uppercase tracking-wide mb-1.5 block">
                    Details
                </label>
                <textarea
                    required
                    rows={4}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="What were you trying to do? What did you expect to happen? What actually happened?"
                    className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none resize-y"
                />
            </div>

            <div>
                <label className="text-xs font-bold text-stone-700 uppercase tracking-wide mb-1.5 block">
                    Urgency
                </label>
                <div className="space-y-2">
                    {URGENCIES.map(u => (
                        <label
                            key={u.value}
                            className={clsx(
                                "flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors",
                                urgency === u.value
                                    ? "bg-emerald-50 border-emerald-300"
                                    : "bg-white border-stone-200 hover:border-stone-300"
                            )}
                        >
                            <input
                                type="radio"
                                name="urgency"
                                value={u.value}
                                checked={urgency === u.value}
                                onChange={e => setUrgency(e.target.value as Urgency)}
                                className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                                <div className="font-bold text-sm text-stone-900">{u.label}</div>
                                <div className="text-xs text-stone-500 mt-0.5">{u.description}</div>
                            </div>
                        </label>
                    ))}
                </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-900 leading-relaxed">
                <strong className="text-emerald-700">48-hour promise:</strong> We respond to all
                <em> important</em> and <em>blocking</em> reports within 48 hours. If the change is
                small enough we'll ship it inside that window — many feature requests have shipped
                same-day.
            </div>

            {result && (
                <div
                    className={clsx(
                        "rounded-lg p-3 text-sm inline-flex items-start gap-2",
                        result.ok
                            ? "bg-emerald-50 border border-emerald-200 text-emerald-900"
                            : "bg-red-50 border border-red-200 text-red-900"
                    )}
                >
                    {result.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                    <div>
                        {result.message}
                        {result.ticketId && <div className="text-xs opacity-80 mt-0.5">Ticket #{result.ticketId}</div>}
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between gap-3">
                {trigger === "button" && (
                    <button
                        type="button"
                        onClick={() => setOpen(false)}
                        className="text-sm text-stone-500 hover:text-stone-900 font-medium"
                    >
                        Cancel
                    </button>
                )}
                <button
                    type="submit"
                    disabled={submitting || !title.trim() || !description.trim()}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold inline-flex items-center gap-2 disabled:opacity-50 transition-colors ml-auto"
                >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {submitting ? "Sending…" : "Send to product team"}
                </button>
            </div>
        </form>
    );

    if (trigger === "inline") {
        return (
            <div className="bg-white border border-stone-200 rounded-xl p-5">
                <h3 className="text-lg font-bold text-stone-900 mb-1">Tell us what to build next</h3>
                <p className="text-sm text-stone-500 mb-4">
                    Every request goes straight into our HubSpot pipeline and gets a 48-hour response.
                </p>
                {formCore}
            </div>
        );
    }

    // Modal
    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
            <div
                className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h3 className="text-lg font-bold text-stone-900">Suggest improvement</h3>
                        <p className="text-xs text-stone-500 mt-0.5">Goes to our product team within minutes</p>
                    </div>
                    <button onClick={() => setOpen(false)} className="text-stone-400 hover:text-stone-700">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                {formCore}
            </div>
        </div>
    );
}

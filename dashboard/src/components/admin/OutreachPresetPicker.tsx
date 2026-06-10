"use client";

/**
 * Outreach Sequence Preset Picker (R3-M5.3)
 *
 * Modal launched from the M3.2 step builder via a "Start from a preset" button.
 * Lists the 5 ready-to-use presets on the left, shows a full preview on the right,
 * and emits the cloned step list to the parent on "Use this preset".
 *
 * Usage (in the step builder modal):
 *
 *   const [pickerOpen, setPickerOpen] = useState(false);
 *   ...
 *   <button onClick={() => setPickerOpen(true)}>Start from a preset</button>
 *   <OutreachPresetPicker
 *     open={pickerOpen}
 *     onClose={() => setPickerOpen(false)}
 *     onApply={(preset, steps) => {
 *       setCampaignSteps(steps);
 *       setCampaignName(preset.name);
 *       setPickerOpen(false);
 *     }}
 *   />
 */

import { useState } from "react";
import { Mail, MessageSquare, Clock, X, CheckCircle2, ListOrdered } from "lucide-react";
import {
    OUTREACH_SEQUENCE_PRESETS,
    clonePresetSteps,
    type OutreachSequencePreset,
    type OutreachPresetStep,
} from "@/lib/outreach-sequence-presets";

interface OutreachPresetPickerProps {
    open: boolean;
    onClose: () => void;
    onApply: (preset: OutreachSequencePreset, steps: OutreachPresetStep[]) => void;
}

export default function OutreachPresetPicker({
    open,
    onClose,
    onApply,
}: OutreachPresetPickerProps) {
    const [selectedId, setSelectedId] = useState<string>(
        OUTREACH_SEQUENCE_PRESETS[0]?.id ?? ""
    );

    if (!open) return null;

    const selected = OUTREACH_SEQUENCE_PRESETS.find((p) => p.id === selectedId) ?? null;

    function channelBadge(channel: OutreachSequencePreset["channel"]) {
        if (channel === "email") {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                    <Mail className="w-3 h-3" /> Email
                </span>
            );
        }
        if (channel === "sms") {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
                    <MessageSquare className="w-3 h-3" /> SMS
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-xs font-medium">
                <Mail className="w-3 h-3" />
                <MessageSquare className="w-3 h-3" /> Mixed
            </span>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">
                            Start from a preset
                        </h2>
                        <p className="text-sm text-slate-500 mt-0.5">
                            Pick a ready-made sequence, then customize the steps for your campaign.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body — split layout */}
                <div className="flex-1 overflow-hidden flex">
                    {/* Left: preset list */}
                    <div className="w-72 border-r border-slate-200 overflow-y-auto">
                        <ul className="divide-y divide-slate-100">
                            {OUTREACH_SEQUENCE_PRESETS.map((preset) => {
                                const active = preset.id === selectedId;
                                return (
                                    <li key={preset.id}>
                                        <button
                                            onClick={() => setSelectedId(preset.id)}
                                            className={`w-full text-left px-4 py-3 transition-colors ${
                                                active
                                                    ? "bg-blue-50 border-l-4 border-blue-600"
                                                    : "hover:bg-slate-50 border-l-4 border-transparent"
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="font-medium text-sm text-slate-900 leading-snug">
                                                    {preset.name}
                                                </div>
                                                {active && (
                                                    <CheckCircle2 className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                                                )}
                                            </div>
                                            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                                                {channelBadge(preset.channel)}
                                                <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                                                    <ListOrdered className="w-3 h-3" />
                                                    {preset.steps.length} steps
                                                </span>
                                                <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                                                    <Clock className="w-3 h-3" />
                                                    {preset.days_duration} days
                                                </span>
                                            </div>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>

                    {/* Right: preview */}
                    <div className="flex-1 overflow-y-auto p-6">
                        {selected ? (
                            <div>
                                <h3 className="text-base font-semibold text-slate-900">
                                    {selected.name}
                                </h3>
                                <p className="text-sm text-slate-600 mt-1">
                                    {selected.description}
                                </p>

                                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                                    <div className="bg-slate-50 rounded px-3 py-2">
                                        <div className="text-slate-500">Use case</div>
                                        <div className="text-slate-900 font-medium mt-0.5">
                                            {selected.use_case}
                                        </div>
                                    </div>
                                    <div className="bg-slate-50 rounded px-3 py-2">
                                        <div className="text-slate-500">Industry</div>
                                        <div className="text-slate-900 font-medium mt-0.5">
                                            {selected.industry}
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-5 space-y-3">
                                    {selected.steps.map((step) => (
                                        <div
                                            key={step.order}
                                            className="border border-slate-200 rounded-lg p-3"
                                        >
                                            <div className="flex items-center justify-between gap-2 mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-semibold">
                                                        {step.order}
                                                    </span>
                                                    {step.channel === "email" ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                                                            <Mail className="w-3 h-3" /> Email
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
                                                            <MessageSquare className="w-3 h-3" /> SMS
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-xs text-slate-500 inline-flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {step.delay_days === 0
                                                        ? "Send immediately"
                                                        : `Wait ${step.delay_days} day${step.delay_days !== 1 ? "s" : ""}`}
                                                </span>
                                            </div>
                                            {step.subject && (
                                                <div className="text-xs font-medium text-slate-700 mb-1">
                                                    Subject: {step.subject}
                                                </div>
                                            )}
                                            <pre className="text-xs text-slate-600 whitespace-pre-wrap font-sans leading-relaxed">
                                                {step.body_template}
                                            </pre>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="text-sm text-slate-500">
                                Pick a preset on the left to preview it.
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50 rounded-b-lg">
                    <div className="text-xs text-slate-500">
                        Steps are fully editable after you clone. Merge tags use the{" "}
                        <code className="px-1 bg-slate-200 rounded">{`{{tag}}`}</code> syntax.
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-md"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => {
                                if (!selected) return;
                                onApply(selected, clonePresetSteps(selected.id));
                            }}
                            disabled={!selected}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 rounded-md"
                        >
                            Use this preset
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

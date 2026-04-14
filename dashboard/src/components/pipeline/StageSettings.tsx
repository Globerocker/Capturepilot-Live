"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, RotateCcw, Save, Settings, X } from "lucide-react";
import clsx from "clsx";
import { DEFAULT_STAGES, type PipelineStage, serializeStagesToNotes } from "@/lib/pipeline-stages";
import { createSupabaseClient } from "@/lib/supabase/client";

const supabase = createSupabaseClient();

interface StageSettingsProps {
    open: boolean;
    onClose: () => void;
    profileId: string;
    currentStages: PipelineStage[];
    currentNotes: string | null;
    onSaved: (stages: PipelineStage[], newNotes: string) => void;
}

export default function StageSettings({ open, onClose, profileId, currentStages, currentNotes, onSaved }: StageSettingsProps) {
    const [working, setWorking] = useState<PipelineStage[]>(currentStages);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            setWorking(currentStages);
            setError(null);
        }
    }, [open, currentStages]);

    if (!open) return null;

    const move = (idx: number, dir: -1 | 1) => {
        const target = idx + dir;
        if (target < 0 || target >= working.length) return;
        const next = [...working];
        [next[idx], next[target]] = [next[target], next[idx]];
        setWorking(next);
    };

    const rename = (idx: number, label: string) => {
        setWorking(prev => prev.map((s, i) => (i === idx ? { ...s, label } : s)));
    };

    const resetDefaults = () => setWorking(DEFAULT_STAGES);

    const save = async () => {
        setSaving(true);
        setError(null);
        const newNotes = serializeStagesToNotes(currentNotes, working);
        const { error: upErr } = await supabase
            .from("user_profiles")
            .update({ notes: newNotes })
            .eq("id", profileId);
        setSaving(false);
        if (upErr) {
            setError(upErr.message);
            return;
        }
        onSaved(working, newNotes);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-[24px] w-full max-w-md p-6 shadow-xl animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                        <Settings className="w-4 h-4" /> Pipeline Stages
                    </h3>
                    <button type="button" title="Close" onClick={onClose} className="p-1.5 text-stone-400 hover:text-black rounded-lg hover:bg-stone-100">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <p className="text-xs text-stone-500 mb-4">
                    Rename and reorder your pipeline stages. Stage keys can&apos;t be removed in this version.
                </p>

                <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                    {working.map((stage, idx) => (
                        <div key={stage.key} className="flex items-center gap-2 p-2 border border-stone-200 rounded-xl bg-stone-50">
                            <div className={clsx("w-2 h-2 rounded-full flex-shrink-0", stage.dot)} />
                            <input
                                type="text"
                                value={stage.label}
                                onChange={e => rename(idx, e.target.value)}
                                className="flex-1 bg-white border border-stone-200 rounded-lg px-2 py-1.5 text-sm font-medium outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                                aria-label={`Rename stage ${stage.key}`}
                            />
                            <span className="text-[10px] font-mono text-stone-400 w-16 truncate" title={stage.key}>{stage.key}</span>
                            <div className="flex flex-col gap-0.5">
                                <button
                                    type="button"
                                    title="Move up"
                                    onClick={() => move(idx, -1)}
                                    disabled={idx === 0}
                                    className="p-0.5 text-stone-400 hover:text-black disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    <ArrowUp className="w-3 h-3" />
                                </button>
                                <button
                                    type="button"
                                    title="Move down"
                                    onClick={() => move(idx, 1)}
                                    disabled={idx === working.length - 1}
                                    className="p-0.5 text-stone-400 hover:text-black disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    <ArrowDown className="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {error && (
                    <p className="text-xs text-red-600 mt-3">{error}</p>
                )}

                <div className="flex items-center gap-2 mt-4">
                    <button
                        type="button"
                        onClick={resetDefaults}
                        className="flex items-center gap-1 text-xs text-stone-500 hover:text-black font-medium"
                    >
                        <RotateCcw className="w-3 h-3" /> Reset defaults
                    </button>
                    <div className="flex-1" />
                    <button
                        type="button"
                        onClick={onClose}
                        className="bg-stone-100 text-stone-700 px-4 py-2 rounded-xl font-bold text-xs hover:bg-stone-200 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={save}
                        disabled={saving}
                        className="bg-black text-white px-4 py-2 rounded-xl font-bold text-xs hover:bg-stone-800 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
}

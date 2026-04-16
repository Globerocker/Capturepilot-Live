"use client";

import { useCallback, useEffect, useState } from "react";
import { Bookmark, Plus, X, Pencil, Check, Loader2, GripHorizontal } from "lucide-react";
import clsx from "clsx";
import {
    DndContext,
    DragEndEvent,
    PointerSensor,
    useSensor,
    useSensors,
    closestCenter,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    horizontalListSortingStrategy,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface SavedView {
    id: string;
    name: string;
    filter_state: Record<string, unknown>;
    sort_order: number;
}

interface Props {
    page: "matches" | "opportunities";
    // The current filter state for the page. Used when the user clicks "Save current view".
    currentFilterState: Record<string, unknown>;
    // Fired when a view is loaded — the page should apply the returned state.
    onApply: (state: Record<string, unknown>, viewId: string) => void;
    // Fired when the active view filter drifts out of sync and the user clicks "All" to clear.
    onClear: () => void;
    // ID of the currently active view, or null for "All" (no view).
    activeViewId: string | null;
}

/**
 * HubSpot-style saved-view tab bar. Users can save their current filter state
 * as a named view, drag tabs to reorder, rename, and delete.
 *
 * The component owns the tab UI + API calls; the parent page owns the filter
 * state shape and applies `view.filter_state` back to its own state when the
 * user clicks a tab.
 */
export default function SavedViews({ page, currentFilterState, onApply, onClear, activeViewId }: Props) {
    const [views, setViews] = useState<SavedView[]>([]);
    const [loading, setLoading] = useState(true);
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [newName, setNewName] = useState("");
    const [saving, setSaving] = useState(false);
    const [renameId, setRenameId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

    const loadViews = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/user-views?page=${page}`);
            if (res.ok) {
                const body = await res.json() as { views: SavedView[] };
                setViews(body.views || []);
            }
        } catch { /* non-fatal */ }
        setLoading(false);
    }, [page]);

    useEffect(() => { loadViews(); }, [loadViews]);

    const handleSaveNew = async () => {
        if (!newName.trim()) return;
        setSaving(true);
        try {
            const res = await fetch("/api/user-views", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ page, name: newName.trim(), filter_state: currentFilterState }),
            });
            if (res.ok) {
                await loadViews();
                setNewName("");
                setShowSaveDialog(false);
            }
        } catch { /* ignore */ }
        setSaving(false);
    };

    const handleRename = async (id: string) => {
        if (!renameValue.trim()) { setRenameId(null); return; }
        await fetch(`/api/user-views/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: renameValue.trim() }),
        });
        setRenameId(null);
        setRenameValue("");
        loadViews();
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this view? This can't be undone.")) return;
        await fetch(`/api/user-views/${id}`, { method: "DELETE" });
        if (activeViewId === id) onClear();
        loadViews();
    };

    // Persist reordered list after a drag completes. We optimistically update
    // the local list first so the UI doesn't flicker, then fire the PATCHes.
    const handleDragEnd = async (e: DragEndEvent) => {
        const { active, over } = e;
        if (!over || active.id === over.id) return;
        const oldIdx = views.findIndex(v => v.id === active.id);
        const newIdx = views.findIndex(v => v.id === over.id);
        if (oldIdx < 0 || newIdx < 0) return;
        const next = arrayMove(views, oldIdx, newIdx).map((v, i) => ({ ...v, sort_order: i }));
        setViews(next);
        await Promise.all(next.map(v =>
            fetch(`/api/user-views/${v.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sort_order: v.sort_order }),
            })
        ));
    };

    return (
        <div className="mb-3">
            <div className="flex items-center gap-2 flex-wrap">
                <button
                    type="button"
                    onClick={onClear}
                    className={clsx(
                        "text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border transition-colors",
                        activeViewId === null
                            ? "bg-black text-white border-black"
                            : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50",
                    )}
                >
                    All
                </button>

                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={views.map(v => v.id)} strategy={horizontalListSortingStrategy}>
                        <div className="flex items-center gap-2 flex-wrap">
                            {views.map(v => (
                                <ViewTab
                                    key={v.id}
                                    view={v}
                                    isActive={activeViewId === v.id}
                                    isRenaming={renameId === v.id}
                                    renameValue={renameValue}
                                    onRenameChange={setRenameValue}
                                    onRenameSubmit={() => handleRename(v.id)}
                                    onRenameStart={() => { setRenameId(v.id); setRenameValue(v.name); }}
                                    onRenameCancel={() => { setRenameId(null); setRenameValue(""); }}
                                    onApply={() => onApply(v.filter_state, v.id)}
                                    onDelete={() => handleDelete(v.id)}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>

                {!loading && (
                    <button
                        type="button"
                        onClick={() => setShowSaveDialog(true)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-stone-500 hover:text-black px-2 py-1 border border-dashed border-stone-300 hover:border-stone-500 rounded-full"
                    >
                        <Plus className="w-3 h-3" /> Save current as view
                    </button>
                )}
            </div>

            {showSaveDialog && (
                <div className="mt-2 flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-xl p-2">
                    <Bookmark className="w-3.5 h-3.5 text-stone-500 ml-1" />
                    <input
                        type="text"
                        autoFocus
                        placeholder="View name — e.g. 'IT in TX closing soon'"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === "Enter") handleSaveNew();
                            if (e.key === "Escape") { setShowSaveDialog(false); setNewName(""); }
                        }}
                        className="flex-1 bg-white border border-stone-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-black"
                    />
                    <button
                        type="button"
                        onClick={handleSaveNew}
                        disabled={saving || !newName.trim()}
                        className="bg-black text-white px-3 py-1.5 rounded-lg text-[11px] font-bold disabled:opacity-50 inline-flex items-center gap-1"
                    >
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                    </button>
                    <button
                        type="button"
                        onClick={() => { setShowSaveDialog(false); setNewName(""); }}
                        className="p-1.5 text-stone-400 hover:text-black"
                        title="Cancel"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}
        </div>
    );
}

function ViewTab({
    view, isActive, isRenaming, renameValue, onRenameChange,
    onRenameSubmit, onRenameStart, onRenameCancel, onApply, onDelete,
}: {
    view: SavedView;
    isActive: boolean;
    isRenaming: boolean;
    renameValue: string;
    onRenameChange: (v: string) => void;
    onRenameSubmit: () => void;
    onRenameStart: () => void;
    onRenameCancel: () => void;
    onApply: () => void;
    onDelete: () => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: view.id });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    if (isRenaming) {
        return (
            <div ref={setNodeRef} style={style} className="inline-flex items-center gap-1 bg-white border border-stone-200 rounded-full px-2 py-1">
                <input
                    type="text"
                    autoFocus
                    value={renameValue}
                    onChange={e => onRenameChange(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === "Enter") onRenameSubmit();
                        if (e.key === "Escape") onRenameCancel();
                    }}
                    className="text-xs outline-none border-b border-stone-200 w-32"
                />
                <button type="button" onClick={onRenameSubmit} className="text-emerald-600 hover:text-emerald-800" title="Save">
                    <Check className="w-3 h-3" />
                </button>
                <button type="button" onClick={onRenameCancel} className="text-stone-400 hover:text-black" title="Cancel">
                    <X className="w-3 h-3" />
                </button>
            </div>
        );
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={clsx(
                "inline-flex items-center gap-1 rounded-full border transition-colors group",
                isActive
                    ? "bg-black text-white border-black"
                    : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50",
            )}
        >
            <span
                {...attributes}
                {...listeners}
                className="pl-2 py-1.5 cursor-grab active:cursor-grabbing opacity-50 hover:opacity-100"
                title="Drag to reorder"
            >
                <GripHorizontal className="w-3 h-3" />
            </span>
            <button
                type="button"
                onClick={onApply}
                className="text-xs font-bold uppercase tracking-widest py-1.5 pr-1"
            >
                {view.name}
            </button>
            <button
                type="button"
                onClick={onRenameStart}
                className={clsx(
                    "p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity",
                    isActive ? "hover:bg-white/20" : "hover:bg-stone-100",
                )}
                title="Rename"
            >
                <Pencil className="w-2.5 h-2.5" />
            </button>
            <button
                type="button"
                onClick={onDelete}
                className={clsx(
                    "p-1 pr-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity",
                    isActive ? "hover:bg-white/20" : "hover:bg-rose-50 hover:text-rose-600",
                )}
                title="Delete"
            >
                <X className="w-3 h-3" />
            </button>
        </div>
    );
}

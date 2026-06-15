"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
    Users, Plus, Trash2, Edit3, Save, Loader2, ChevronRight, X,
} from "lucide-react";
import clsx from "clsx";
import OutreachNav from "@/components/outreach/OutreachNav";

interface OutreachList {
    id: string;
    name: string;
    description: string | null;
    filter: Record<string, unknown>;
    contact_count: number;
    created_at: string;
    updated_at: string;
}

export default function OutreachListsPage() {
    const [lists, setLists] = useState<OutreachList[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const [newDescription, setNewDescription] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editDraft, setEditDraft] = useState<{ name: string; description: string }>({ name: "", description: "" });

    const fetchLists = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/outreach/lists");
            const data = await res.json();
            setLists(data.lists || []);
        } catch {
            setLists([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchLists(); }, [fetchLists]);

    const createList = async () => {
        if (!newName.trim()) return;
        const res = await fetch("/api/admin/outreach/lists", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: newName.trim(), description: newDescription.trim() || null }),
        });
        const data = await res.json();
        if (!res.ok) return alert(data.error || "Could not create");
        setCreating(false);
        setNewName("");
        setNewDescription("");
        fetchLists();
    };

    const saveEdit = async (id: string) => {
        await fetch(`/api/admin/outreach/lists/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(editDraft),
        });
        setEditingId(null);
        fetchLists();
    };

    const deleteList = async (id: string) => {
        if (!window.confirm("Delete this list? Contacts stay, only the list goes.")) return;
        await fetch(`/api/admin/outreach/lists/${id}`, { method: "DELETE" });
        fetchLists();
    };

    return (
        <div className="min-h-screen bg-stone-50">
            <header className="bg-white border-b border-stone-200 px-4 sm:px-6 py-4">
                <div className="max-w-[1600px] mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href="/admin/outreach/contacts" className="text-xs text-stone-500 hover:text-black inline-flex items-center gap-1">
                            <ChevronRight className="w-3 h-3 rotate-180" /> Contacts
                        </Link>
                        <span className="text-stone-300">/</span>
                        <h1 className="font-bold text-lg flex items-center gap-2"><Users className="w-5 h-5" /> Lists</h1>
                    </div>
                    <button
                        type="button"
                        onClick={() => setCreating(true)}
                        className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-4 py-2 rounded-lg inline-flex items-center gap-2 text-sm"
                    >
                        <Plus className="w-4 h-4" /> New list
                    </button>
                </div>
            </header>

            <OutreachNav active="lists" />

            <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
                {creating && (
                    <div className="bg-white border border-stone-200 rounded-2xl p-4 mb-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <h2 className="font-bold text-sm">New list</h2>
                            <button onClick={() => setCreating(false)} className="text-stone-400 hover:text-black"><X className="w-4 h-4" /></button>
                        </div>
                        <input
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            placeholder="List name"
                            className="w-full px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400"
                        />
                        <textarea
                            value={newDescription}
                            onChange={e => setNewDescription(e.target.value)}
                            placeholder="Description (optional)"
                            rows={2}
                            className="w-full px-3 py-2 text-sm rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400"
                        />
                        <p className="text-xs text-stone-500">
                            Add contacts later from the contacts table — select rows and click <strong>Add to list</strong>.
                        </p>
                        <button
                            type="button"
                            onClick={createList}
                            className="bg-black hover:bg-stone-800 text-white font-bold px-4 py-2 rounded-lg text-sm"
                        >
                            Create list
                        </button>
                    </div>
                )}

                {loading ? (
                    <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>
                ) : lists.length === 0 ? (
                    <div className="bg-white border border-dashed border-stone-300 rounded-2xl p-12 text-center text-stone-500 text-sm">
                        No lists yet. Create one to start grouping contacts.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {lists.map(l => (
                            <div key={l.id} className="bg-white border border-stone-200 rounded-2xl p-4">
                                {editingId === l.id ? (
                                    <div className="space-y-2">
                                        <input value={editDraft.name} onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))} className="w-full px-2 py-1.5 text-sm rounded border border-stone-200" />
                                        <textarea value={editDraft.description} onChange={e => setEditDraft(d => ({ ...d, description: e.target.value }))} rows={2} className="w-full px-2 py-1.5 text-sm rounded border border-stone-200" />
                                        <div className="flex gap-2">
                                            <button onClick={() => saveEdit(l.id)} className="bg-black text-white font-bold px-3 py-1.5 rounded inline-flex items-center gap-1.5 text-xs"><Save className="w-3 h-3" /> Save</button>
                                            <button onClick={() => setEditingId(null)} className="px-3 py-1.5 text-xs text-stone-500">Cancel</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between gap-4 flex-wrap">
                                        <div className="flex-1 min-w-0">
                                            <Link href={`/admin/outreach/contacts?list=${l.id}`} className="font-bold text-sm hover:underline">{l.name}</Link>
                                            <p className="text-xs text-stone-500 mt-0.5">{l.description || "—"}</p>
                                            <p className="text-[10px] text-stone-400 mt-1">{l.contact_count.toLocaleString()} contacts · updated {new Date(l.updated_at).toLocaleDateString()}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => { setEditingId(l.id); setEditDraft({ name: l.name, description: l.description || "" }); }}
                                                className="text-stone-500 hover:text-black p-1.5 rounded hover:bg-stone-100"
                                            >
                                                <Edit3 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => deleteList(l.id)}
                                                className="text-rose-600 hover:text-rose-700 p-1.5 rounded hover:bg-rose-50"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}

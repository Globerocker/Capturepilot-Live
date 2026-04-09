"use client";

import { useEffect, useState } from "react";
import { UserCog, Loader2, Key, Mail, Trash2, Shield } from "lucide-react";
import clsx from "clsx";

interface UserData {
    auth_id: string;
    email: string;
    created_at: string;
    last_sign_in: string | null;
    email_confirmed: boolean;
    profile: {
        id: string;
        company_name: string;
        account_type: string;
        client_status: string;
        onboarding_complete: boolean;
    } | null;
}

export default function AdminUsers() {
    const [users, setUsers] = useState<UserData[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [newEmail, setNewEmail] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [newAccountType, setNewAccountType] = useState("");
    const [message, setMessage] = useState("");

    const loadUsers = async () => {
        const res = await fetch("/api/admin/users");
        const data = await res.json();
        setUsers(data.users || []);
        setLoading(false);
    };

    useEffect(() => { loadUsers(); }, []);

    const handleUpdate = async (authId: string) => {
        const updates: Record<string, string> = { auth_id: authId };
        if (newEmail) updates.email = newEmail;
        if (newPassword) updates.password = newPassword;

        const res = await fetch("/api/admin/users", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
        });
        const data = await res.json();

        // Also update account_type if changed
        if (newAccountType) {
            const user = users.find(u => u.auth_id === authId);
            if (user?.profile?.id) {
                await fetch("/api/admin/clients", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ user_profile_id: user.profile.id, account_type: newAccountType }),
                });
            }
        }

        setMessage(data.success ? `Updated: ${(data.updated || []).join(", ")}${newAccountType ? " + account type" : ""}` : `Error: ${data.error}`);
        setEditingId(null);
        setNewEmail("");
        setNewPassword("");
        setNewAccountType("");
        loadUsers();
    };

    const handleDelete = async (authId: string, email: string) => {
        if (!confirm(`Delete user ${email}? This cannot be undone.`)) return;
        await fetch("/api/admin/users", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ auth_id: authId }),
        });
        loadUsers();
    };

    const timeAgo = (d: string | null) => {
        if (!d) return "Never";
        const diff = Date.now() - new Date(d).getTime();
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return `${Math.floor(diff / 86400000)}d ago`;
    };

    if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>;

    return (
        <div className="w-full space-y-5">
            <h1 className="text-xl font-bold flex items-center gap-2">
                <UserCog className="w-5 h-5" /> User Management
            </h1>

            {message && <div className={clsx("p-3 rounded-lg text-sm", message.startsWith("Error") ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700")}>{message}</div>}

            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-stone-100 text-[10px] text-stone-400 uppercase">
                            <th className="text-left px-4 py-2.5">User</th>
                            <th className="text-center px-3 py-2.5">Type</th>
                            <th className="text-center px-3 py-2.5">Status</th>
                            <th className="text-center px-3 py-2.5">Last Login</th>
                            <th className="text-center px-3 py-2.5">Verified</th>
                            <th className="px-3 py-2.5">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-50">
                        {users.map(u => (
                            <tr key={u.auth_id}>
                                <td className="px-4 py-3">
                                    <p className="font-medium">{u.profile?.company_name || "No Profile"}</p>
                                    <p className="text-[10px] text-stone-400">{u.email}</p>
                                </td>
                                <td className="text-center px-3">
                                    <span className={clsx("text-[9px] font-bold px-2 py-0.5 rounded uppercase",
                                        u.profile?.account_type === "admin" ? "bg-red-100 text-red-700" :
                                        u.profile?.account_type === "consulting" ? "bg-violet-100 text-violet-700" :
                                        "bg-stone-100 text-stone-600"
                                    )}>{u.profile?.account_type || "none"}</span>
                                </td>
                                <td className="text-center px-3">
                                    <span className={clsx("text-[9px] font-bold px-2 py-0.5 rounded uppercase",
                                        u.profile?.client_status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-500"
                                    )}>{u.profile?.client_status || "—"}</span>
                                </td>
                                <td className="text-center px-3 text-xs text-stone-500">{timeAgo(u.last_sign_in)}</td>
                                <td className="text-center px-3">
                                    {u.email_confirmed ? <Shield className="w-3.5 h-3.5 text-emerald-500 mx-auto" /> : <span className="text-[9px] text-red-500">Unverified</span>}
                                </td>
                                <td className="px-3">
                                    {editingId === u.auth_id ? (
                                        <div className="flex gap-1.5 flex-wrap">
                                            <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="New email" className="w-32 border rounded px-2 py-1 text-xs" />
                                            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New pass" className="w-24 border rounded px-2 py-1 text-xs" />
                                            <select title="Account Type" value={newAccountType} onChange={e => setNewAccountType(e.target.value)} className="border rounded px-2 py-1 text-xs">
                                                <option value="">Account Type</option>
                                                <option value="self_service">Self-Service</option>
                                                <option value="consulting">Consulting</option>
                                                <option value="admin">Admin</option>
                                            </select>
                                            <button type="button" onClick={() => handleUpdate(u.auth_id)} className="text-xs bg-black text-white px-2 py-1 rounded font-bold">Save</button>
                                            <button type="button" onClick={() => { setEditingId(null); setNewAccountType(""); }} className="text-xs text-stone-400">Cancel</button>
                                        </div>
                                    ) : (
                                        <div className="flex gap-1.5">
                                            <button type="button" onClick={() => setEditingId(u.auth_id)} className="text-xs text-blue-600 hover:text-blue-800 inline-flex items-center gap-0.5">
                                                <Key className="w-3 h-3" /> Edit
                                            </button>
                                            <button type="button" onClick={() => handleDelete(u.auth_id, u.email)} className="text-xs text-red-500 hover:text-red-700 inline-flex items-center gap-0.5">
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

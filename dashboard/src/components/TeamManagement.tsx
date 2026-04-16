"use client";

import { useCallback, useEffect, useState } from "react";
import { UserPlus, Loader2, Mail, Clock, Shield, Trash2, Crown, CheckCircle2, AlertCircle } from "lucide-react";
import clsx from "clsx";

interface Member {
    id: string;
    auth_user_id: string;
    email: string | null;
    role: "owner" | "admin" | "member" | "viewer";
    feature_access: Record<string, boolean>;
    invited_at: string;
    accepted_at: string | null;
}

interface Invitation {
    id: string;
    email: string;
    role: string;
    invited_at: string;
    expires_at: string;
}

const ROLE_LABELS: Record<string, string> = {
    owner: "Owner",
    admin: "Admin",
    member: "Member",
    viewer: "Viewer (read-only)",
};

const SEAT_LIMITS_DISPLAY: Record<string, number> = {
    free: 1, free_beta: 3, starter: 3, pro: 10, consulting: 10, enterprise: 999,
};

/**
 * Team management UI rendered inside Settings. Shows:
 *   - Current members (with the owner pinned at the top).
 *   - Pending invitations.
 *   - An invite form with role selector.
 *   - Seat usage indicator tied to the owner's plan.
 */
export default function TeamManagement() {
    const [loading, setLoading] = useState(true);
    const [members, setMembers] = useState<Member[]>([]);
    const [invitations, setInvitations] = useState<Invitation[]>([]);
    const [ownerEmail, setOwnerEmail] = useState<string | null>(null);
    const [ownerName, setOwnerName] = useState<string | null>(null);
    const [planTier, setPlanTier] = useState<string | null>(null);
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState<"admin" | "member" | "viewer">("member");
    const [submitting, setSubmitting] = useState(false);
    const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/team/members");
            if (!res.ok) { setLoading(false); return; }
            const body = await res.json() as {
                members: Member[]; invitations: Invitation[];
                owner_email: string | null; owner_name: string | null; plan_tier: string | null;
            };
            setMembers(body.members || []);
            setInvitations(body.invitations || []);
            setOwnerEmail(body.owner_email);
            setOwnerName(body.owner_name);
            setPlanTier(body.plan_tier);
        } catch { /* non-fatal */ }
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const seatCap = SEAT_LIMITS_DISPLAY[planTier || "free"] ?? 1;
    const seatsUsed = 1 + members.length + invitations.length;

    const invite = async () => {
        if (!inviteEmail.trim()) return;
        setSubmitting(true);
        setMsg(null);
        try {
            const res = await fetch("/api/team/invite", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
            });
            const body = await res.json() as {
                success?: boolean; error?: string;
                email_status?: "sent" | "failed"; email_error?: string | null;
            };
            if (res.ok && body.success) {
                setMsg({
                    type: "success",
                    text: body.email_status === "sent"
                        ? `Invite sent to ${inviteEmail}.`
                        : `Invite created but email failed: ${body.email_error}. You can resend from the pending list.`,
                });
                setInviteEmail("");
                load();
            } else {
                setMsg({ type: "error", text: body.error || "Failed to send invite" });
            }
        } catch (e) {
            setMsg({ type: "error", text: (e as Error).message });
        }
        setSubmitting(false);
        setTimeout(() => setMsg(null), 6000);
    };

    const removeMember = async (id: string) => {
        if (!confirm("Remove this team member? They'll lose access immediately.")) return;
        await fetch(`/api/team/members/${id}`, { method: "DELETE" });
        load();
    };

    const updateRole = async (id: string, role: string) => {
        await fetch(`/api/team/members/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role }),
        });
        load();
    };

    const cancelInvite = async (id: string) => {
        if (!confirm("Cancel this pending invitation?")) return;
        // Use the generic admin path — we don't expose a dedicated DELETE for invites,
        // just delete via the members service client's policy (owner-only).
        await fetch(`/api/team/invitations/${id}`, { method: "DELETE" }).catch(() => {});
        load();
    };

    return (
        <section className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7" id="team">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="font-bold text-base sm:text-lg flex items-center">
                    <UserPlus className="w-5 h-5 mr-2 text-stone-400" /> Team Members
                </h3>
                <span className="text-[11px] text-stone-500">
                    {seatsUsed} / {seatCap === 999 ? "∞" : seatCap} seats used
                    {planTier && <span className="ml-2 text-stone-400">· {planTier} plan</span>}
                </span>
            </div>

            {/* Owner + members list */}
            <div className="space-y-2 mb-4">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                    <div className="w-8 h-8 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center flex-shrink-0">
                        <Crown className="w-4 h-4 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-black truncate">{ownerName || ownerEmail || "You"}</p>
                        <p className="text-xs text-stone-500 truncate">{ownerEmail}</p>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full bg-amber-200 text-amber-900">Owner</span>
                </div>

                {loading ? (
                    <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-stone-400" /></div>
                ) : members.length === 0 ? null : members.map(m => (
                    <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-stone-50 border border-stone-200">
                        <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center flex-shrink-0 text-xs font-bold text-stone-600">
                            {(m.email || "?").slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm text-black truncate">{m.email || "—"}</p>
                            <p className="text-xs text-stone-500">
                                {m.accepted_at ? `Joined ${new Date(m.accepted_at).toLocaleDateString()}` : "Not yet accepted"}
                            </p>
                        </div>
                        <select
                            value={m.role}
                            onChange={e => updateRole(m.id, e.target.value)}
                            aria-label="Role"
                            className="text-[11px] font-bold bg-white border border-stone-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-black outline-none"
                        >
                            <option value="admin">Admin</option>
                            <option value="member">Member</option>
                            <option value="viewer">Viewer</option>
                        </select>
                        <button
                            type="button"
                            onClick={() => removeMember(m.id)}
                            className="p-1.5 rounded text-stone-400 hover:text-rose-600 hover:bg-rose-50"
                            title="Remove member"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                ))}

                {invitations.map(inv => (
                    <div key={inv.id} className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 border border-blue-200">
                        <div className="w-8 h-8 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center flex-shrink-0">
                            <Clock className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm text-black truncate">{inv.email}</p>
                            <p className="text-xs text-stone-500">
                                Pending · expires {new Date(inv.expires_at).toLocaleDateString()}
                            </p>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full bg-blue-100 text-blue-800">{ROLE_LABELS[inv.role] || inv.role}</span>
                        <button
                            type="button"
                            onClick={() => cancelInvite(inv.id)}
                            className="p-1.5 rounded text-stone-400 hover:text-rose-600 hover:bg-rose-50"
                            title="Cancel invitation"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                ))}
            </div>

            {/* Invite form */}
            <div className="border-t border-stone-100 pt-4">
                <p className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-2">Invite a teammate</p>
                <div className="flex flex-col sm:flex-row gap-2">
                    <input
                        type="email"
                        placeholder="teammate@example.com"
                        value={inviteEmail}
                        onChange={e => setInviteEmail(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") invite(); }}
                        disabled={submitting || seatsUsed >= seatCap}
                        className="flex-1 px-3 py-2 border border-stone-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black disabled:bg-stone-100"
                    />
                    <select
                        value={inviteRole}
                        onChange={e => setInviteRole(e.target.value as typeof inviteRole)}
                        aria-label="Role"
                        className="px-3 py-2 border border-stone-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black bg-white"
                    >
                        <option value="admin">Admin (full access)</option>
                        <option value="member">Member (default)</option>
                        <option value="viewer">Viewer (read-only)</option>
                    </select>
                    <button
                        type="button"
                        onClick={invite}
                        disabled={submitting || !inviteEmail.trim() || seatsUsed >= seatCap}
                        className="bg-black text-white px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50 inline-flex items-center gap-1.5"
                    >
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                        Send Invite
                    </button>
                </div>
                {seatsUsed >= seatCap && (
                    <p className="mt-2 text-xs text-amber-700 flex items-center gap-1">
                        <Shield className="w-3 h-3" /> Seat limit reached on the {planTier || "free"} plan. Upgrade to add more teammates.
                    </p>
                )}
            </div>

            {msg && (
                <div className={clsx(
                    "mt-3 text-xs px-3 py-2 rounded-lg border flex items-center gap-2",
                    msg.type === "success" ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200",
                )}>
                    {msg.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    {msg.text}
                </div>
            )}
        </section>
    );
}

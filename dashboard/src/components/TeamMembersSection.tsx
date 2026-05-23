"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Mail, Trash2, Loader2, AlertCircle, Crown, Copy, CheckCircle2 } from "lucide-react";
import clsx from "clsx";

type TeamRole = "owner" | "collaborator" | "viewer";

interface TeamMember {
    kind: "owner" | "member";
    id?: string;
    auth_user_id: string;
    email?: string | null;
    contact_name?: string | null;
    invited_email?: string | null;
    role: TeamRole;
    accepted_at: string | null;
}

interface TeamResponse {
    team: {
        owner: TeamMember;
        members: TeamMember[];
    } | null;
}

/**
 * Settings → Team panel. Owner-only by design (the API rejects non-owner
 * writes). Surfaces:
 *   - Owner + accepted members + pending invites
 *   - "Invite teammate" form (email + role)
 *   - Per-row role change + remove
 *
 * Plan-tier gate is enforced in /api/team. 402 surfaces a "upgrade your
 * plan" CTA inline.
 */
export function TeamMembersSection() {
    const [team, setTeam] = useState<TeamResponse["team"]>(null);
    const [loading, setLoading] = useState(true);
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState<"collaborator" | "viewer">("collaborator");
    const [inviting, setInviting] = useState(false);
    const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [limitInfo, setLimitInfo] = useState<{ limit: number; tier: string } | null>(null);
    const [copiedToken, setCopiedToken] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/team", { cache: "no-store" });
            if (!res.ok) {
                setTeam(null);
                return;
            }
            const body = await res.json() as TeamResponse;
            setTeam(body.team);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const onInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg(null);
        setLimitInfo(null);
        setLastInviteUrl(null);
        setInviting(true);
        try {
            const res = await fetch("/api/team", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
            });
            const body = await res.json();
            if (res.status === 402) {
                setErrorMsg(body.message);
                setLimitInfo({ limit: body.limit, tier: body.tier });
            } else if (!res.ok) {
                setErrorMsg(body.error || `HTTP ${res.status}`);
            } else {
                setLastInviteUrl(body.invite_url);
                setInviteEmail("");
                await load();
            }
        } catch (e) {
            setErrorMsg((e as Error).message);
        } finally {
            setInviting(false);
        }
    };

    const onRemove = async (id: string) => {
        if (!confirm("Remove this teammate from the account?")) return;
        await fetch(`/api/team?id=${id}`, { method: "DELETE" });
        await load();
    };

    const onChangeRole = async (id: string, role: "collaborator" | "viewer") => {
        await fetch(`/api/team?id=${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role }),
        });
        await load();
    };

    const onCopyUrl = async (url: string) => {
        await navigator.clipboard.writeText(url);
        setCopiedToken(url);
        setTimeout(() => setCopiedToken(null), 1500);
    };

    if (loading) {
        return (
            <section className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7">
                <p className="text-xs text-stone-500 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading team…
                </p>
            </section>
        );
    }
    if (!team) return null;

    return (
        <section className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7">
            <div className="flex items-center gap-2 mb-4">
                <Users className="w-4 h-4 text-stone-500" />
                <h2 className="font-bold text-sm">Team members</h2>
                <span className="text-[10px] text-stone-400 font-bold uppercase tracking-widest ml-auto">
                    {1 + team.members.length} active
                </span>
            </div>

            {/* Member list */}
            <div className="space-y-2 mb-5">
                {/* Owner row */}
                <div className="flex items-center gap-3 p-3 bg-stone-50 rounded-xl border border-stone-100">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
                        <Crown className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-stone-900 truncate">
                            {team.owner.contact_name || team.owner.email || "Account owner"}
                        </p>
                        <p className="text-xs text-stone-500 truncate">{team.owner.email}</p>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                        Owner
                    </span>
                </div>

                {/* Collaborators / viewers / pending invites */}
                {team.members.length === 0 && (
                    <p className="text-xs text-stone-400 text-center py-4">
                        No teammates yet. Invite one below.
                    </p>
                )}
                {team.members.map(m => (
                    <div key={m.id} className="flex items-center gap-3 p-3 border border-stone-200 rounded-xl">
                        <div className="w-8 h-8 rounded-full bg-stone-100 text-stone-500 flex items-center justify-center flex-shrink-0">
                            <Mail className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-stone-900 truncate">{m.invited_email}</p>
                            <p className="text-xs text-stone-500">
                                {m.accepted_at
                                    ? `Accepted ${new Date(m.accepted_at).toLocaleDateString()}`
                                    : "Pending — waiting for invite acceptance"}
                            </p>
                        </div>
                        <select
                            value={m.role}
                            onChange={e => onChangeRole(m.id!, e.target.value as "collaborator" | "viewer")}
                            className="text-xs border border-stone-200 rounded-lg px-2 py-1 bg-white"
                        >
                            <option value="collaborator">Collaborator</option>
                            <option value="viewer">Viewer</option>
                        </select>
                        <button
                            type="button"
                            onClick={() => onRemove(m.id!)}
                            title="Remove"
                            className="text-stone-300 hover:text-rose-600 p-1"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>

            {/* Invite form */}
            <form onSubmit={onInvite} className="border-t border-stone-100 pt-5 space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Invite teammate</p>
                <div className="flex flex-col sm:flex-row gap-2">
                    <input
                        type="email"
                        required
                        value={inviteEmail}
                        onChange={e => setInviteEmail(e.target.value)}
                        placeholder="colleague@yourcompany.com"
                        className="flex-1 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-stone-400"
                    />
                    <select
                        value={inviteRole}
                        onChange={e => setInviteRole(e.target.value as "collaborator" | "viewer")}
                        className="border border-stone-200 rounded-lg px-3 py-2 text-sm bg-white"
                    >
                        <option value="collaborator">Collaborator (edit)</option>
                        <option value="viewer">Viewer (read-only)</option>
                    </select>
                    <button
                        type="submit"
                        disabled={inviting || !inviteEmail.includes("@")}
                        className="inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-4 py-2 rounded-lg disabled:opacity-50"
                    >
                        {inviting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                        Invite
                    </button>
                </div>

                {errorMsg && (
                    <div className="text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2 flex items-start gap-2">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                            {errorMsg}
                            {limitInfo && (
                                <Link href="/pricing" className="block mt-1 font-bold text-rose-800 underline">
                                    Upgrade from {limitInfo.tier} (current limit: {limitInfo.limit} seats) →
                                </Link>
                            )}
                        </div>
                    </div>
                )}

                {lastInviteUrl && (
                    <div className="text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                        <p className="text-emerald-900 font-bold mb-1">Invite sent.</p>
                        <p className="text-emerald-700 mb-2">If your teammate doesn&apos;t see the email, copy this link and send it manually:</p>
                        <div className="flex items-center gap-1">
                            <code className="flex-1 truncate text-[10px] font-mono text-emerald-900 bg-white border border-emerald-100 px-2 py-1 rounded">
                                {lastInviteUrl}
                            </code>
                            <button
                                type="button"
                                onClick={() => onCopyUrl(lastInviteUrl)}
                                className={clsx(
                                    "px-2 py-1 rounded text-[10px] font-bold",
                                    copiedToken === lastInviteUrl ? "bg-emerald-600 text-white" : "bg-white border border-emerald-200 text-emerald-700",
                                )}
                            >
                                {copiedToken === lastInviteUrl ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            </button>
                        </div>
                    </div>
                )}
            </form>
        </section>
    );
}

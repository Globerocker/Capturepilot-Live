"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import {
  ArrowLeft, ExternalLink, Mail, Sparkles, Loader2, Plus, Trash2,
  CheckCircle2, Circle, Send, Link as LinkIcon, AlertTriangle,
  TrendingUp, Building2, Tag, Clock, User, Edit3, Save,
  ChevronDown, ChevronUp, Globe,
} from "lucide-react";

interface Contact {
  id: string;
  email: string;
  full_name: string | null;
  role: string | null;
  email_confidence: string | null;
  linkedin_url: string | null;
  source: string | null;
  created_at: string;
}
interface Outreach {
  id: string;
  step: number;
  subject: string;
  body_text: string;
  body_html: string;
  gmail_compose_url: string | null;
  status: string;
  sent_at: string | null;
  replied_at: string | null;
  generated_by: string | null;
  ai_model: string | null;
  created_at: string;
}
interface Todo {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  created_at: string;
  completed_at: string | null;
}
interface MonitorRow {
  id: string;
  source_url: string;
  target_url: string;
  anchor_text: string | null;
  is_dofollow: boolean | null;
  is_live: boolean;
  last_checked: string;
  lost_at: string | null;
}
interface Prospect {
  id: string;
  domain: string;
  authority_score: number | null;
  trust_score: number | null;
  backlinks_num: number | null;
  category: string | null;
  tier: number | null;
  status: string;
  refdomain_source: string | null;
  competitor_overlap: string[] | null;
  link_target_url: string | null;
  link_anchor_suggestion: string | null;
  pitch_angle: string | null;
  notes: string | null;
  outreach_count: number;
  first_seen: string;
  last_seen: string;
  enrichment_completed_at: string | null;
  reply_received_at: string | null;
  link_acquired_at: string | null;
}

const STATUSES = [
  { key: "discovered", label: "Discovered" },
  { key: "researching", label: "Researching" },
  { key: "contact_found", label: "Contact Found" },
  { key: "outreach_drafted", label: "Drafted" },
  { key: "outreach_sent", label: "Sent" },
  { key: "replied", label: "Replied" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
  { key: "nurture", label: "Nurture" },
];

export default function BacklinkDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [outreach, setOutreach] = useState<Outreach[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [monitor, setMonitor] = useState<MonitorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [expandedDraft, setExpandedDraft] = useState<string | null>(null);

  const [newContact, setNewContact] = useState({ email: "", full_name: "", role: "editor" });
  const [showAddContact, setShowAddContact] = useState(false);
  const [newTodo, setNewTodo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/backlinks/${id}`);
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const data = await res.json();
    setProspect(data.prospect);
    setContacts(data.contacts);
    setOutreach(data.outreach);
    setTodos(data.todos);
    setMonitor(data.monitor);
    setLoading(false);
  }, [id]);

  useEffect(() => { if (id) load(); }, [id, load]);

  const patchProspect = async (field: keyof Prospect, value: string | null) => {
    if (!prospect) return;
    setSaving(field);
    await fetch(`/api/admin/backlinks/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    setProspect({ ...prospect, [field]: value as never });
    setSaving(null);
  };

  const addContact = async () => {
    if (!newContact.email.trim()) return;
    const res = await fetch("/api/admin/backlinks/contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prospect_id: id,
        email: newContact.email,
        full_name: newContact.full_name || null,
        role: newContact.role,
      }),
    });
    if (res.ok) {
      setNewContact({ email: "", full_name: "", role: "editor" });
      setShowAddContact(false);
      await load();
    }
  };

  const deleteContact = async (cid: string) => {
    if (!confirm("Delete this contact?")) return;
    await fetch(`/api/admin/backlinks/contacts?id=${cid}`, { method: "DELETE" });
    setContacts(prev => prev.filter(c => c.id !== cid));
  };

  const generateDraft = async (contactId?: string) => {
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/backlinks/draft-outreach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prospect_id: id, contact_id: contactId }),
      });
      const body = await res.json();
      if (!res.ok) { alert(body.error || "Draft failed"); return; }
      await load();
    } finally {
      setGenerating(false);
    }
  };

  const addTodo = async () => {
    if (!newTodo.trim()) return;
    await fetch("/api/admin/backlinks/todos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: newTodo.trim(), prospect_id: id }),
    });
    setNewTodo("");
    await load();
  };

  const toggleTodo = async (todo: Todo) => {
    const status = todo.status === "done" ? "open" : "done";
    await fetch("/api/admin/backlinks/todos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: todo.id, status }),
    });
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, status } : t));
  };

  const deleteTodo = async (tid: string) => {
    await fetch(`/api/admin/backlinks/todos?id=${tid}`, { method: "DELETE" });
    setTodos(prev => prev.filter(t => t.id !== tid));
  };

  const markOutreachSent = async () => {
    await patchProspect("status", "outreach_sent");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-stone-500" />
      </div>
    );
  }
  if (!prospect) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center text-stone-500">
        Prospect not found
      </div>
    );
  }

  // Timeline events
  const timeline = [
    { ts: prospect.first_seen, label: "Discovered", icon: Sparkles },
    prospect.enrichment_completed_at && { ts: prospect.enrichment_completed_at, label: "Contact enrichment completed", icon: Mail },
    ...outreach.flatMap(o => [
      { ts: o.created_at, label: `Draft generated: "${o.subject}"`, icon: Edit3 },
      o.sent_at && { ts: o.sent_at, label: "Email sent", icon: Send },
      o.replied_at && { ts: o.replied_at, label: "Reply received", icon: CheckCircle2 },
    ].filter(Boolean) as { ts: string; label: string; icon: typeof Mail }[]),
    prospect.link_acquired_at && { ts: prospect.link_acquired_at, label: "Link acquired", icon: LinkIcon },
  ].filter(Boolean) as { ts: string; label: string; icon: typeof Mail }[];
  timeline.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 px-4 sm:px-6 py-3 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/admin/backlinks" className="text-stone-400 hover:text-stone-700">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <Globe className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold text-stone-900 truncate">{prospect.domain}</h1>
                <a href={`https://${prospect.domain}`} target="_blank" rel="noreferrer"
                  className="text-stone-400 hover:text-emerald-600">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-stone-500">
                {prospect.category && <span>{prospect.category}</span>}
                {prospect.tier && <span>· Tier {prospect.tier}</span>}
                {prospect.authority_score !== null && <span>· AS {prospect.authority_score}</span>}
                {prospect.trust_score !== null && <span>· TS {prospect.trust_score}</span>}
                {prospect.backlinks_num !== null && <span>· {prospect.backlinks_num.toLocaleString()} BL</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <select
              value={prospect.status}
              onChange={e => patchProspect("status", e.target.value)}
              className="text-xs border border-stone-200 rounded-md px-2 py-1.5 bg-white"
            >
              {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            {saving === "status" && <Loader2 className="w-3 h-3 animate-spin text-stone-400" />}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Main column */}
        <div className="space-y-5">
          {/* Overview */}
          <Card title="Overview" icon={Building2}>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Field label="Source competitor" value={prospect.refdomain_source} />
              <Field label="Outreach count" value={String(prospect.outreach_count)} />
              <Field label="First seen" value={fmt(prospect.first_seen)} />
              <Field label="Last seen" value={fmt(prospect.last_seen)} />
            </div>
            {(prospect.competitor_overlap?.length ?? 0) > 0 && (
              <div className="mt-3">
                <div className="text-[10px] font-medium text-stone-500 uppercase tracking-wide mb-1">
                  Also linked from competitors
                </div>
                <div className="flex flex-wrap gap-1">
                  {prospect.competitor_overlap!.map(c => (
                    <span key={c} className="text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded">{c}</span>
                  ))}
                </div>
              </div>
            )}
            {prospect.notes && (
              <div className="mt-3 text-[11px] text-stone-600 bg-amber-50 rounded px-2 py-1.5 flex items-start gap-1.5">
                <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 text-amber-500" />
                {prospect.notes}
              </div>
            )}
          </Card>

          {/* Pitch config */}
          <Card title="Pitch configuration" icon={Edit3}>
            <div className="space-y-3">
              <EditableTextarea
                label="Pitch angle"
                value={prospect.pitch_angle}
                onSave={v => patchProspect("pitch_angle", v)}
                placeholder="Hook for the email — e.g. 'guest post on agency pain points', 'data story about Q4 spend velocity'"
                saving={saving === "pitch_angle"}
                rows={3}
              />
              <EditableInput
                label="Link target URL"
                value={prospect.link_target_url}
                onSave={v => patchProspect("link_target_url", v)}
                placeholder="https://capturepilot.com/resources/..."
                saving={saving === "link_target_url"}
              />
              <EditableInput
                label="Anchor text suggestion"
                value={prospect.link_anchor_suggestion}
                onSave={v => patchProspect("link_anchor_suggestion", v)}
                placeholder="e.g. 'federal opportunity intelligence tool'"
                saving={saving === "link_anchor_suggestion"}
              />
            </div>
          </Card>

          {/* Contacts */}
          <Card title={`Contacts (${contacts.length})`} icon={User}>
            <div className="space-y-2">
              {contacts.map(c => (
                <div key={c.id} className="bg-stone-50 rounded-lg p-3 group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <a href={`mailto:${c.email}`} className="text-sm font-semibold text-stone-900 hover:text-emerald-700 truncate">
                          {c.email}
                        </a>
                        <span className={clsx(
                          "text-[9px] px-1.5 py-0.5 rounded font-medium",
                          c.email_confidence === "verified" && "bg-emerald-100 text-emerald-700",
                          c.email_confidence === "crawled" && "bg-blue-100 text-blue-700",
                          c.email_confidence === "guessed" && "bg-amber-100 text-amber-700",
                        )}>{c.email_confidence}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-stone-200 text-stone-700">{c.role}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-stone-500 mt-0.5">
                        {c.full_name && <span>{c.full_name}</span>}
                        {c.source && <span>· source: {c.source}</span>}
                        {c.linkedin_url && (
                          <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">LinkedIn</a>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={() => generateDraft(c.id)}
                        disabled={generating}
                        className="px-2 py-1 text-[10px] font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded inline-flex items-center gap-1"
                      >
                        {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        Draft
                      </button>
                      <button onClick={() => deleteContact(c.id)} className="text-stone-400 hover:text-rose-600 p-1">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {contacts.length === 0 && (
                <div className="text-[11px] text-stone-400 italic text-center py-2">
                  No contacts yet — run Contact Enrichment agent or add manually below.
                </div>
              )}

              {showAddContact ? (
                <div className="border border-stone-200 rounded-lg p-3 space-y-2 bg-white">
                  <input
                    value={newContact.email}
                    onChange={e => setNewContact({ ...newContact, email: e.target.value })}
                    placeholder="editor@example.com"
                    className="w-full text-xs border border-stone-200 rounded px-2 py-1.5"
                  />
                  <input
                    value={newContact.full_name}
                    onChange={e => setNewContact({ ...newContact, full_name: e.target.value })}
                    placeholder="Full name (optional)"
                    className="w-full text-xs border border-stone-200 rounded px-2 py-1.5"
                  />
                  <select
                    value={newContact.role}
                    onChange={e => setNewContact({ ...newContact, role: e.target.value })}
                    className="w-full text-xs border border-stone-200 rounded px-2 py-1.5"
                  >
                    <option value="editor">Editor</option>
                    <option value="pr">PR / Media</option>
                    <option value="general_inbox">General inbox</option>
                    <option value="unknown">Unknown</option>
                  </select>
                  <div className="flex gap-1">
                    <button onClick={addContact} className="flex-1 text-xs font-medium px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded">
                      Save
                    </button>
                    <button onClick={() => setShowAddContact(false)} className="text-xs px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddContact(true)}
                  className="w-full text-xs text-stone-600 hover:text-stone-900 border border-dashed border-stone-300 rounded-lg py-2 inline-flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Add contact manually
                </button>
              )}
            </div>
          </Card>

          {/* Outreach history */}
          <Card title={`Outreach (${outreach.length})`} icon={Send}>
            <div className="space-y-2">
              {outreach.map(o => {
                const expanded = expandedDraft === o.id;
                return (
                  <div key={o.id} className={clsx(
                    "border rounded-lg",
                    o.status === "drafted" && "bg-purple-50 border-purple-200",
                    o.status === "sent" && "bg-indigo-50 border-indigo-200",
                    o.status === "replied" && "bg-cyan-50 border-cyan-200",
                    o.status === "bounced" && "bg-rose-50 border-rose-200",
                  )}>
                    <button
                      onClick={() => setExpandedDraft(expanded ? null : o.id)}
                      className="w-full flex items-center justify-between gap-2 p-3 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold uppercase text-stone-600">
                            Step {o.step} · {o.status}
                          </span>
                          <span className="text-[10px] text-stone-400">{fmt(o.created_at)}</span>
                        </div>
                        <div className="text-sm font-semibold text-stone-900 mt-0.5 truncate">{o.subject}</div>
                      </div>
                      {expanded ? <ChevronUp className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
                    </button>
                    {expanded && (
                      <div className="px-3 pb-3 space-y-2 border-t border-stone-200/60">
                        <div className="text-xs text-stone-700 whitespace-pre-wrap pt-2 bg-white rounded p-2">
                          {o.body_text}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {o.gmail_compose_url && (
                            <a
                              href={o.gmail_compose_url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={markOutreachSent}
                              className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded"
                            >
                              <Mail className="w-3 h-3" /> Open in Gmail
                            </a>
                          )}
                          {o.status === "sent" && (
                            <button
                              onClick={() => patchProspect("status", "replied")}
                              className="text-[11px] font-medium px-2.5 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded"
                            >
                              Mark replied
                            </button>
                          )}
                          {o.status === "replied" && (
                            <button
                              onClick={() => patchProspect("status", "won")}
                              className="text-[11px] font-medium px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded"
                            >
                              Mark won (link acquired)
                            </button>
                          )}
                          {o.generated_by === "ai" && (
                            <span className="text-[10px] text-stone-500 ml-auto">via {o.ai_model}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {outreach.length === 0 && (
                <div className="text-[11px] text-stone-400 italic text-center py-2">
                  No outreach yet. Generate a pitch from a contact above.
                </div>
              )}
              {contacts.length > 0 && (
                <button
                  onClick={() => generateDraft()}
                  disabled={generating}
                  className="w-full text-xs font-medium px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-md inline-flex items-center justify-center gap-1.5"
                >
                  {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {generating ? "Drafting…" : `Generate ${outreach.length === 0 ? "first" : "new"} pitch`}
                </button>
              )}
            </div>
          </Card>

          {/* Acquired links */}
          {monitor.length > 0 && (
            <Card title={`Acquired links (${monitor.length})`} icon={LinkIcon}>
              <div className="space-y-1.5">
                {monitor.map(m => (
                  <div key={m.id} className="flex items-center gap-2 text-xs">
                    <span className={clsx(
                      "w-2 h-2 rounded-full flex-shrink-0",
                      m.is_live ? "bg-emerald-500" : "bg-rose-500",
                    )} />
                    <a href={m.source_url} target="_blank" rel="noreferrer" className="text-stone-700 hover:text-emerald-700 truncate flex-1">
                      {m.source_url}
                    </a>
                    {m.anchor_text && <span className="text-[10px] text-stone-500 italic truncate max-w-[140px]">"{m.anchor_text}"</span>}
                    <span className="text-[10px] text-stone-400">{fmt(m.last_checked)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar: tasks + timeline */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card title="Tasks" icon={CheckCircle2}>
            <div className="space-y-2">
              <div className="flex gap-1">
                <input
                  value={newTodo}
                  onChange={e => setNewTodo(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addTodo(); }}
                  placeholder="New task for this prospect…"
                  className="flex-1 text-xs border border-stone-200 rounded-md px-2 py-1.5"
                />
                <button onClick={addTodo} className="px-2 py-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded-md">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-1.5">
                {todos.filter(t => t.status !== "done").map(t => (
                  <div key={t.id} className="flex items-start gap-2 group">
                    <button onClick={() => toggleTodo(t)} className="mt-0.5">
                      <Circle className="w-4 h-4 text-stone-300 hover:text-emerald-600" />
                    </button>
                    <div className="flex-1 text-xs text-stone-800">{t.title}</div>
                    <button onClick={() => deleteTodo(t.id)} className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-rose-600">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {todos.filter(t => t.status === "done").map(t => (
                  <div key={t.id} className="flex items-start gap-2 group opacity-60">
                    <button onClick={() => toggleTodo(t)} className="mt-0.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    </button>
                    <div className="flex-1 text-xs text-stone-600 line-through">{t.title}</div>
                    <button onClick={() => deleteTodo(t.id)} className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-rose-600">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {todos.length === 0 && (
                  <div className="text-[11px] text-stone-400 italic">No tasks yet.</div>
                )}
              </div>
            </div>
          </Card>

          <Card title="Timeline" icon={Clock}>
            <div className="space-y-2">
              {timeline.length === 0 && (
                <div className="text-[11px] text-stone-400 italic">No activity yet.</div>
              )}
              {timeline.map((evt, i) => {
                const Icon = evt.icon;
                return (
                  <div key={i} className="flex items-start gap-2 text-[11px]">
                    <Icon className="w-3 h-3 mt-0.5 text-stone-400 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-stone-700 truncate">{evt.label}</div>
                      <div className="text-stone-400 text-[10px]">{fmt(evt.ts)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Card({ title, icon: Icon, children }: { title: string; icon: typeof Mail; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-stone-200 rounded-xl">
      <header className="px-4 py-3 border-b border-stone-100">
        <h2 className="text-xs font-semibold text-stone-900 uppercase tracking-wide flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5 text-emerald-600" />
          {title}
        </h2>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-[10px] font-medium text-stone-400 uppercase tracking-wide">{label}</div>
      <div className="text-stone-800 mt-0.5 truncate">{value || "—"}</div>
    </div>
  );
}

function EditableInput({
  label, value, onSave, placeholder, saving,
}: { label: string; value: string | null; onSave: (v: string) => void; placeholder?: string; saving: boolean }) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => { setDraft(value ?? ""); }, [value]);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[10px] font-medium text-stone-500 uppercase tracking-wide">{label}</label>
        {saving && <Loader2 className="w-3 h-3 animate-spin text-stone-400" />}
      </div>
      <input
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { if (draft !== (value ?? "")) onSave(draft); }}
        placeholder={placeholder}
        className="w-full text-xs border border-stone-200 rounded-md px-2 py-1.5"
      />
    </div>
  );
}

function EditableTextarea({
  label, value, onSave, placeholder, saving, rows = 3,
}: { label: string; value: string | null; onSave: (v: string) => void; placeholder?: string; saving: boolean; rows?: number }) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => { setDraft(value ?? ""); }, [value]);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[10px] font-medium text-stone-500 uppercase tracking-wide">{label}</label>
        {saving && <Loader2 className="w-3 h-3 animate-spin text-stone-400" />}
      </div>
      <textarea
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { if (draft !== (value ?? "")) onSave(draft); }}
        placeholder={placeholder}
        rows={rows}
        className="w-full text-xs border border-stone-200 rounded-md px-2 py-1.5 resize-none"
      />
    </div>
  );
}

function fmt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

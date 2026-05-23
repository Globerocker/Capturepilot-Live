"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  Bot, Play, Loader2, ExternalLink, Mail, Sparkles, CheckCircle2, Circle,
  AlertTriangle, TrendingUp, Download, Plus, Trash2, RefreshCw, Link as LinkIcon,
  ShieldAlert, Globe,
} from "lucide-react";

interface Contact {
  id: string;
  email: string;
  full_name: string | null;
  role: string | null;
  email_confidence: string | null;
}
interface Outreach {
  id: string;
  subject: string;
  body_text: string;
  gmail_compose_url: string | null;
  status: string;
  step: number;
  sent_at: string | null;
  replied_at: string | null;
  created_at: string;
}
interface Prospect {
  id: string;
  domain: string;
  authority_score: number | null;
  trust_score: number | null;
  category: string | null;
  tier: number | null;
  status: string;
  refdomain_source: string | null;
  competitor_overlap: string[] | null;
  pitch_angle: string | null;
  notes: string | null;
  outreach_count: number;
  backlink_contacts: Contact[];
  backlink_outreach: Outreach[];
}
interface Agent {
  id: string;
  name: string;
  display_name: string | null;
  description: string | null;
  cron_schedule: string | null;
  enabled: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_summary: Record<string, unknown> | null;
  last_run_duration_ms: number | null;
}
interface Todo {
  id: string;
  prospect_id: string | null;
  title: string;
  description: string | null;
  assignee: string | null;
  priority: string;
  status: string;
  due_at: string | null;
}

const COLUMNS: { key: string; label: string; color: string }[] = [
  { key: "discovered", label: "Discovered", color: "bg-stone-100 text-stone-700" },
  { key: "researching", label: "Researching", color: "bg-blue-100 text-blue-700" },
  { key: "contact_found", label: "Contact Found", color: "bg-amber-100 text-amber-700" },
  { key: "outreach_drafted", label: "Drafted", color: "bg-purple-100 text-purple-700" },
  { key: "outreach_sent", label: "Sent", color: "bg-indigo-100 text-indigo-700" },
  { key: "replied", label: "Replied", color: "bg-cyan-100 text-cyan-700" },
  { key: "won", label: "Won", color: "bg-emerald-100 text-emerald-700" },
  { key: "lost", label: "Lost", color: "bg-rose-100 text-rose-700" },
];

const AGENT_ICONS: Record<string, typeof Bot> = {
  prospect_discovery: Sparkles,
  contact_enrichment: Mail,
  outreach_drafter: Bot,
  link_monitor: LinkIcon,
  disavow_generator: ShieldAlert,
};

export default function BacklinksPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningAgent, setRunningAgent] = useState<string | null>(null);
  const [filterTier, setFilterTier] = useState<number | null>(null);
  const [selected, setSelected] = useState<Prospect | null>(null);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [newTodoTitle, setNewTodoTitle] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/backlinks/list");
    const data = await res.json();
    setProspects(data.prospects || []);
    setAgents(data.agents || []);
    setTodos(data.todos || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const runAgent = async (name: string) => {
    setRunningAgent(name);
    try {
      await fetch("/api/admin/backlinks/run-agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agent: name }),
      });
      await load();
    } finally {
      setRunningAgent(null);
    }
  };

  const updateProspect = async (id: string, patch: Partial<Prospect>) => {
    await fetch("/api/admin/backlinks/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    setProspects(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, ...patch } : prev);
  };

  const generateDraft = async (prospect: Prospect, contactId?: string) => {
    setGeneratingDraft(true);
    try {
      const res = await fetch("/api/admin/backlinks/draft-outreach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prospect_id: prospect.id, contact_id: contactId }),
      });
      const body = await res.json();
      if (!res.ok) { alert(body.error || "Draft failed"); return; }
      await load();
    } finally {
      setGeneratingDraft(false);
    }
  };

  const addTodo = async () => {
    if (!newTodoTitle.trim()) return;
    await fetch("/api/admin/backlinks/todos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: newTodoTitle.trim(),
        prospect_id: selected?.id ?? null,
      }),
    });
    setNewTodoTitle("");
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

  const deleteTodo = async (id: string) => {
    await fetch(`/api/admin/backlinks/todos?id=${id}`, { method: "DELETE" });
    setTodos(prev => prev.filter(t => t.id !== id));
  };

  const filtered = useMemo(() => {
    if (filterTier === null) return prospects;
    return prospects.filter(p => p.tier === filterTier);
  }, [prospects, filterTier]);

  const grouped = useMemo(() => {
    const map: Record<string, Prospect[]> = Object.fromEntries(COLUMNS.map(c => [c.key, []]));
    for (const p of filtered) {
      const key = COLUMNS.find(c => c.key === p.status) ? p.status : "discovered";
      map[key].push(p);
    }
    return map;
  }, [filtered]);

  const stats = useMemo(() => {
    const total = prospects.length;
    const live = prospects.filter(p => p.status === "won").length;
    const drafted = prospects.filter(p => p.status === "outreach_drafted").length;
    const replied = prospects.filter(p => p.status === "replied").length;
    const sent = prospects.filter(p => p.status === "outreach_sent").length;
    return { total, live, drafted, replied, sent };
  }, [prospects]);

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-stone-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 px-4 sm:px-6 py-4">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-stone-900 flex items-center gap-2">
              <Globe className="w-6 h-6 text-emerald-600" /> Backlinks
            </h1>
            <p className="text-sm text-stone-500 mt-0.5">
              Acquisition pipeline · {stats.total} prospects · {stats.live} won · {stats.replied} replied · {stats.drafted + stats.sent} in outreach
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/api/admin/backlinks/disavow"
              className="px-3 py-2 text-xs font-medium rounded-lg border border-stone-200 bg-white hover:bg-stone-50 inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> disavow.txt
            </a>
            <button
              onClick={load}
              className="px-3 py-2 text-xs font-medium rounded-lg border border-stone-200 bg-white hover:bg-stone-50 inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Left: agents + kanban */}
        <div className="space-y-6">
          {/* Agents row */}
          <section>
            <h2 className="text-sm font-semibold text-stone-900 mb-3 flex items-center gap-1.5">
              <Bot className="w-4 h-4 text-emerald-600" /> Agents
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {agents.map(a => {
                const Icon = AGENT_ICONS[a.name] || Bot;
                const summary = a.last_run_summary as Record<string, unknown> | null;
                const isRunning = runningAgent === a.name;
                return (
                  <div key={a.id} className="bg-white border border-stone-200 rounded-xl p-3">
                    <div className="flex items-start justify-between mb-2">
                      <Icon className="w-4 h-4 text-emerald-600" />
                      <span className={clsx(
                        "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                        a.last_run_status === "success" && "bg-emerald-50 text-emerald-700",
                        a.last_run_status === "partial" && "bg-amber-50 text-amber-700",
                        a.last_run_status === "failure" && "bg-rose-50 text-rose-700",
                        !a.last_run_status && "bg-stone-100 text-stone-500",
                      )}>
                        {a.last_run_status || "idle"}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-stone-900 mb-0.5">
                      {a.display_name || a.name}
                    </div>
                    <div className="text-[11px] text-stone-500 line-clamp-2 mb-2 min-h-[28px]">
                      {a.description}
                    </div>
                    {summary && (
                      <div className="text-[10px] text-stone-600 bg-stone-50 rounded p-1.5 mb-2 font-mono leading-tight max-h-12 overflow-hidden">
                        {Object.entries(summary).slice(0, 3).map(([k, v]) => (
                          <div key={k} className="truncate">
                            {k}: {Array.isArray(v) ? v.length : String(v)}
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => runAgent(a.name)}
                      disabled={isRunning}
                      className="w-full px-2 py-1.5 text-[11px] font-medium rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white inline-flex items-center justify-center gap-1"
                    >
                      {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                      {isRunning ? "Running…" : "Run now"}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Tier filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-stone-500">Tier:</span>
            {[null, 1, 2, 3, 4].map(t => (
              <button
                key={String(t)}
                onClick={() => setFilterTier(t)}
                className={clsx(
                  "px-2.5 py-1 text-xs rounded-md font-medium",
                  filterTier === t ? "bg-stone-900 text-white" : "bg-white border border-stone-200 text-stone-700 hover:bg-stone-50",
                )}
              >
                {t === null ? "All" : `Tier ${t}`}
              </button>
            ))}
          </div>

          {/* Kanban */}
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-3 min-w-max">
              {COLUMNS.map(col => (
                <div key={col.key} className="w-64 flex-shrink-0">
                  <div className="flex items-center justify-between mb-2">
                    <span className={clsx("text-xs font-semibold px-2 py-0.5 rounded", col.color)}>
                      {col.label}
                    </span>
                    <span className="text-xs text-stone-400">{grouped[col.key].length}</span>
                  </div>
                  <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
                    {grouped[col.key].map(p => (
                      <button
                        key={p.id}
                        onClick={() => setSelected(p)}
                        className={clsx(
                          "w-full text-left bg-white border rounded-lg p-2.5 hover:border-emerald-300 transition-colors",
                          selected?.id === p.id ? "border-emerald-400 ring-1 ring-emerald-200" : "border-stone-200",
                        )}
                      >
                        <div className="flex items-start justify-between mb-1">
                          <span className="text-xs font-semibold text-stone-900 truncate flex-1">{p.domain}</span>
                          {p.tier && (
                            <span className={clsx(
                              "text-[10px] px-1 py-0.5 rounded ml-1 font-medium",
                              p.tier === 1 && "bg-emerald-50 text-emerald-700",
                              p.tier === 2 && "bg-blue-50 text-blue-700",
                              p.tier === 3 && "bg-amber-50 text-amber-700",
                              p.tier === 4 && "bg-stone-100 text-stone-600",
                              p.tier === 5 && "bg-rose-50 text-rose-700",
                            )}>T{p.tier}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-stone-500">
                          {p.authority_score !== null && (
                            <span className="inline-flex items-center gap-0.5">
                              <TrendingUp className="w-2.5 h-2.5" /> AS {p.authority_score}
                            </span>
                          )}
                          {p.backlink_contacts?.length > 0 && (
                            <span className="inline-flex items-center gap-0.5">
                              <Mail className="w-2.5 h-2.5" /> {p.backlink_contacts.length}
                            </span>
                          )}
                          {p.backlink_outreach?.length > 0 && (
                            <span className="text-purple-600 font-medium">draft</span>
                          )}
                        </div>
                      </button>
                    ))}
                    {grouped[col.key].length === 0 && (
                      <div className="text-[11px] text-stone-400 italic text-center py-4">empty</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: selected prospect OR todos */}
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          {selected ? (
            <SelectedPanel
              prospect={selected}
              onClose={() => setSelected(null)}
              onUpdate={updateProspect}
              onGenerateDraft={() => generateDraft(selected)}
              generating={generatingDraft}
            />
          ) : (
            <TodosPanel
              todos={todos}
              onAdd={addTodo}
              onToggle={toggleTodo}
              onDelete={deleteTodo}
              newTitle={newTodoTitle}
              setNewTitle={setNewTodoTitle}
            />
          )}

          {selected && todos.length > 0 && (
            <TodosPanel
              todos={todos}
              onAdd={addTodo}
              onToggle={toggleTodo}
              onDelete={deleteTodo}
              newTitle={newTodoTitle}
              setNewTitle={setNewTodoTitle}
              compact
            />
          )}
        </aside>
      </div>
    </div>
  );
}

function SelectedPanel({
  prospect, onClose, onUpdate, onGenerateDraft, generating,
}: {
  prospect: Prospect;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<Prospect>) => void;
  onGenerateDraft: () => void;
  generating: boolean;
}) {
  const latestDraft = prospect.backlink_outreach
    ?.slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

  return (
    <div className="bg-white border border-stone-200 rounded-xl">
      <div className="p-4 border-b border-stone-100 flex items-start justify-between">
        <div>
          <div className="text-sm font-semibold text-stone-900 flex items-center gap-1.5">
            {prospect.domain}
            <a
              href={`https://${prospect.domain}`}
              target="_blank"
              rel="noreferrer"
              className="text-stone-400 hover:text-emerald-600"
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="text-[11px] text-stone-500 mt-0.5">
            {prospect.category} · Tier {prospect.tier} · AS {prospect.authority_score ?? "?"}
          </div>
        </div>
        <button onClick={onClose} className="text-stone-400 hover:text-stone-700 text-xs">✕</button>
      </div>

      <div className="p-4 space-y-3">
        <div>
          <label className="text-[11px] font-medium text-stone-500 uppercase tracking-wide">Status</label>
          <select
            value={prospect.status}
            onChange={e => onUpdate(prospect.id, { status: e.target.value })}
            className="mt-1 w-full text-xs border border-stone-200 rounded-md px-2 py-1.5"
          >
            {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            <option value="nurture">Nurture</option>
          </select>
        </div>

        {prospect.refdomain_source && (
          <div className="text-[11px] text-stone-500">
            Found via <span className="text-stone-700">{prospect.refdomain_source}</span>
            {(prospect.competitor_overlap?.length ?? 0) > 1 && (
              <span className="text-emerald-600 font-medium ml-1">
                +{(prospect.competitor_overlap?.length ?? 1) - 1} other competitors
              </span>
            )}
          </div>
        )}

        <div>
          <label className="text-[11px] font-medium text-stone-500 uppercase tracking-wide">Pitch angle</label>
          <textarea
            defaultValue={prospect.pitch_angle ?? ""}
            onBlur={e => onUpdate(prospect.id, { pitch_angle: e.target.value })}
            rows={3}
            placeholder="What's the hook? e.g. 'guest post on agency pain-points'"
            className="mt-1 w-full text-xs border border-stone-200 rounded-md px-2 py-1.5"
          />
        </div>

        <div>
          <label className="text-[11px] font-medium text-stone-500 uppercase tracking-wide">
            Contacts ({prospect.backlink_contacts?.length ?? 0})
          </label>
          <div className="mt-1 space-y-1">
            {(prospect.backlink_contacts ?? []).slice(0, 5).map(c => (
              <div key={c.id} className="text-[11px] bg-stone-50 rounded px-2 py-1 flex items-center justify-between">
                <div className="truncate">
                  <span className="font-medium text-stone-800">{c.email}</span>
                  {c.full_name && <span className="text-stone-500"> · {c.full_name}</span>}
                </div>
                <span className={clsx(
                  "text-[9px] px-1 rounded font-medium ml-1 flex-shrink-0",
                  c.email_confidence === "crawled" && "bg-emerald-100 text-emerald-700",
                  c.email_confidence === "guessed" && "bg-amber-100 text-amber-700",
                )}>{c.role || "?"}</span>
              </div>
            ))}
            {(prospect.backlink_contacts?.length ?? 0) === 0 && (
              <div className="text-[11px] text-stone-400 italic">No contacts yet — run Contact Enrichment agent.</div>
            )}
          </div>
        </div>

        {latestDraft && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-2.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-purple-900">Drafted pitch</span>
              <span className="text-[10px] text-purple-600 uppercase">{latestDraft.status}</span>
            </div>
            <div className="text-xs font-semibold text-stone-900 mb-1">{latestDraft.subject}</div>
            <div className="text-[11px] text-stone-700 whitespace-pre-wrap line-clamp-6 mb-2">
              {latestDraft.body_text}
            </div>
            {latestDraft.gmail_compose_url && (
              <a
                href={latestDraft.gmail_compose_url}
                target="_blank"
                rel="noreferrer"
                onClick={() => onUpdate(prospect.id, { status: "outreach_sent" })}
                className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded"
              >
                <Mail className="w-3 h-3" /> Open in Gmail
              </a>
            )}
          </div>
        )}

        <div className="flex gap-2">
          {(prospect.backlink_contacts?.length ?? 0) > 0 && (
            <button
              onClick={onGenerateDraft}
              disabled={generating}
              className="flex-1 text-xs font-medium px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-md inline-flex items-center justify-center gap-1.5"
            >
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {generating ? "Drafting…" : latestDraft ? "Re-draft" : "Draft pitch"}
            </button>
          )}
        </div>

        {prospect.notes && (
          <div className="text-[11px] text-stone-600 bg-stone-50 rounded px-2 py-1.5 flex items-start gap-1.5">
            <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 text-stone-400" />
            {prospect.notes}
          </div>
        )}
      </div>
    </div>
  );
}

function TodosPanel({
  todos, onAdd, onToggle, onDelete, newTitle, setNewTitle, compact = false,
}: {
  todos: Todo[];
  onAdd: () => void;
  onToggle: (t: Todo) => void;
  onDelete: (id: string) => void;
  newTitle: string;
  setNewTitle: (s: string) => void;
  compact?: boolean;
}) {
  const open = todos.filter(t => t.status !== "done");
  const done = todos.filter(t => t.status === "done");

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Human todos
          {open.length > 0 && (
            <span className="text-[10px] bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded">{open.length}</span>
          )}
        </h3>
      </div>

      {!compact && (
        <div className="flex gap-1 mb-3">
          <input
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") onAdd(); }}
            placeholder="New todo…"
            className="flex-1 text-xs border border-stone-200 rounded-md px-2 py-1.5"
          />
          <button
            onClick={onAdd}
            className="px-2 py-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded-md"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="space-y-1.5 max-h-80 overflow-y-auto">
        {open.map(t => (
          <div key={t.id} className="flex items-start gap-2 group">
            <button onClick={() => onToggle(t)} className="mt-0.5">
              <Circle className="w-4 h-4 text-stone-300 hover:text-emerald-600" />
            </button>
            <div className="flex-1 text-xs text-stone-800">{t.title}</div>
            <button onClick={() => onDelete(t.id)} className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-rose-600">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
        {open.length === 0 && (
          <div className="text-[11px] text-stone-400 italic">No open todos.</div>
        )}
        {done.length > 0 && (
          <>
            <div className="text-[10px] text-stone-400 uppercase tracking-wide pt-2">Done</div>
            {done.slice(0, 5).map(t => (
              <div key={t.id} className="flex items-start gap-2 group opacity-60">
                <button onClick={() => onToggle(t)} className="mt-0.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </button>
                <div className="flex-1 text-xs text-stone-600 line-through">{t.title}</div>
                <button onClick={() => onDelete(t.id)} className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-rose-600">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

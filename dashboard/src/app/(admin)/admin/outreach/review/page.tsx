"use client";

import { useEffect, useState, useCallback } from "react";
import {
  CheckCircle2, XCircle, AlertTriangle, ShieldCheck, Loader2, Mail,
  Video, RefreshCw, Pencil, Send, SkipForward,
} from "lucide-react";

type Item = {
  qa_id: string;
  to: string;
  company_before: string;
  company_after: string;
  first_before: string | null;
  first_after: string | null;
  greeting: string;
  verdict: "pass" | "warn" | "block";
  match_fit: string;
  issues: { type: string; severity: string; reason: string }[];
  learnings: string | null;
  loom_url: string | null;
  subject: string;
  body: string;
  released: boolean;
};

const VERDICT: Record<string, { cls: string; label: string; Icon: typeof CheckCircle2 }> = {
  pass: { cls: "bg-emerald-100 text-emerald-800 border-emerald-200", label: "PASS", Icon: ShieldCheck },
  warn: { cls: "bg-amber-100 text-amber-800 border-amber-200", label: "WARN", Icon: AlertTriangle },
  block: { cls: "bg-red-100 text-red-800 border-red-200", label: "BLOCK", Icon: XCircle },
};

export default function OutreachReviewPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [edit, setEdit] = useState<Record<string, { company_after: string; first_after: string; greeting: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/outreach/review");
      const j = await r.json();
      setItems(j.items || []);
      setCounts(j.counts || {});
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(qa_id: string, action: "approve" | "skip" | "edit", edits?: unknown) {
    setBusy(qa_id + action);
    try {
      await fetch("/api/admin/outreach/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qa_id, action, edits }),
      });
      if (action === "approve" || action === "skip") {
        setItems((prev) => prev.filter((i) => i.qa_id !== qa_id));
      } else {
        await load();
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-stone-900 flex items-center gap-2">
            <Mail className="w-6 h-6 text-emerald-600" /> Outreach Review
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            Match-Drop cold campaign. Each email is QA&apos;d by the agent. Approve sends it at the 30/day pace. Replies go to info@americurial.com.
          </p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-2 text-sm font-bold text-stone-700 bg-stone-100 hover:bg-stone-200 px-4 py-2 rounded-lg transition-colors">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="flex gap-2 mb-6">
        {(["block", "warn", "pass"] as const).map((v) => (
          <span key={v} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${VERDICT[v].cls}`}>
            {counts[v] || 0} {VERDICT[v].label}
          </span>
        ))}
        <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold bg-stone-100 text-stone-600 border border-stone-200">
          {items.length} to review
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-stone-500 py-20 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 text-stone-500">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
          Nothing left to review. Run the QA agent on the next batch:
          <code className="block mt-2 text-xs bg-stone-100 rounded px-3 py-2 inline-block">node tools/50_outreach_qa_agent.mjs --limit 25 --apply</code>
        </div>
      ) : (
        <div className="space-y-5">
          {items.map((it) => {
            const V = VERDICT[it.verdict] || VERDICT.pass;
            const e = edit[it.qa_id] || { company_after: it.company_after || "", first_after: it.first_after || "", greeting: it.greeting || "" };
            return (
              <div key={it.qa_id} className={`bg-white border rounded-2xl p-5 shadow-sm ${it.verdict === "block" ? "border-red-200" : "border-stone-200"}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border ${V.cls}`}><V.Icon className="w-3 h-3" /> {V.label}</span>
                      <span className="font-bold text-stone-900">{it.company_after || it.company_before}</span>
                      <span className="text-xs text-stone-400">match: {it.match_fit}</span>
                    </div>
                    <p className="text-xs text-stone-500 mt-1">
                      {it.to}
                      {it.company_before !== it.company_after && <span className="ml-2 text-stone-400">was: {it.company_before}</span>}
                    </p>
                  </div>
                  {it.loom_url && (
                    <a href={it.loom_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg hover:bg-emerald-100">
                      <Video className="w-3.5 h-3.5" /> Loom
                    </a>
                  )}
                </div>

                {(it.issues?.length > 0 || it.learnings) && (
                  <div className="mb-3 space-y-1">
                    {it.issues.map((iss, k) => (
                      <p key={k} className={`text-xs ${iss.severity === "error" ? "text-red-700" : "text-amber-700"}`}>
                        ⚠ {iss.type}: {iss.reason}
                      </p>
                    ))}
                    {it.learnings && <p className="text-xs text-stone-400 italic">learned: {it.learnings}</p>}
                  </div>
                )}

                <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 mb-3">
                  <p className="text-xs font-bold text-stone-700">Subject: {it.subject}</p>
                  <pre className="text-[13px] text-stone-700 whitespace-pre-wrap font-sans mt-2 leading-relaxed">{it.body}</pre>
                </div>

                <details className="mb-3">
                  <summary className="text-xs font-bold text-stone-500 cursor-pointer inline-flex items-center gap-1"><Pencil className="w-3 h-3" /> Edit name / greeting</summary>
                  <div className="grid sm:grid-cols-3 gap-2 mt-2">
                    <input value={e.company_after} onChange={(ev) => setEdit({ ...edit, [it.qa_id]: { ...e, company_after: ev.target.value } })} placeholder="Company" className="text-xs border border-stone-200 rounded-lg px-2 py-1.5" />
                    <input value={e.first_after} onChange={(ev) => setEdit({ ...edit, [it.qa_id]: { ...e, first_after: ev.target.value } })} placeholder="First name" className="text-xs border border-stone-200 rounded-lg px-2 py-1.5" />
                    <button onClick={() => act(it.qa_id, "edit", e)} disabled={busy === it.qa_id + "edit"} className="text-xs font-bold bg-stone-800 text-white rounded-lg px-3 py-1.5 hover:bg-black disabled:opacity-50">Save &amp; re-render</button>
                  </div>
                </details>

                <div className="flex items-center gap-3">
                  <button onClick={() => act(it.qa_id, "approve")} disabled={!!busy} className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50">
                    {busy === it.qa_id + "approve" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Approve &amp; queue
                  </button>
                  <button onClick={() => act(it.qa_id, "skip")} disabled={!!busy} className="inline-flex items-center gap-2 bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 font-bold text-sm px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50">
                    {busy === it.qa_id + "skip" ? <Loader2 className="w-4 h-4 animate-spin" /> : <SkipForward className="w-4 h-4" />} Skip
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

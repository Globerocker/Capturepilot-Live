"use client";

import { useEffect, useState } from "react";
import {
    Copy,
    Key,
    Link2,
    Loader2,
    Plug,
    Plus,
    Trash2,
    Shield,
    Webhook,
    AlertTriangle,
    CheckCircle2,
    Slack,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";

interface ApiToken {
    id: string;
    token_prefix: string;
    kind: "mcp" | "zapier" | "api";
    label: string | null;
    last_used_at: string | null;
    expires_at: string | null;
    revoked_at: string | null;
    created_at: string;
}

interface WebhookEndpoint {
    id: string;
    url: string;
    events: string[];
    active: boolean;
    created_at: string;
}

const EVENT_OPTIONS = [
    { value: "pursuit.added", label: "Pursuit added" },
    { value: "pursuit.stage_changed", label: "Pursuit stage changed" },
    { value: "match.hot", label: "New HOT match" },
    { value: "match.warm", label: "New WARM match" },
    { value: "opportunity.dropped", label: "New opportunity (matches filter)" },
    { value: "proposal.completed", label: "Proposal generated" },
    { value: "capture_brief.generated", label: "Capture brief generated" },
    { value: "recompete.high_confidence", label: "High-confidence recompete detected" },
];

export default function IntegrationsPage() {
    const [tokens, setTokens] = useState<ApiToken[]>([]);
    const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [newToken, setNewToken] = useState<{ raw: string; kind: string } | null>(null);
    const [creatingToken, setCreatingToken] = useState(false);
    const [addingHook, setAddingHook] = useState(false);
    const [hookForm, setHookForm] = useState({ url: "", events: ["pursuit.added"] });
    const searchParams = useSearchParams();
    const slackStatus = searchParams?.get("slack");

    async function refresh() {
        setLoading(true);
        const [tRes, wRes] = await Promise.all([
            fetch("/api/integrations/tokens"),
            fetch("/api/integrations/webhooks"),
        ]);
        const tData = await tRes.json();
        const wData = await wRes.json();
        setTokens(tData.tokens || []);
        setWebhooks(wData.webhooks || []);
        setLoading(false);
    }

    useEffect(() => {
        refresh();
    }, []);

    async function createToken(kind: "mcp" | "zapier" | "api") {
        setCreatingToken(true);
        try {
            const res = await fetch("/api/integrations/tokens", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ kind, label: `${kind.toUpperCase()} — ${new Date().toLocaleDateString()}` }),
            });
            const data = await res.json();
            if (data.token) {
                setNewToken({ raw: data.token, kind });
                refresh();
            }
        } finally {
            setCreatingToken(false);
        }
    }

    async function revokeToken(id: string) {
        if (!confirm("Revoke this token? Anything using it will stop working immediately.")) return;
        await fetch(`/api/integrations/tokens?id=${id}`, { method: "DELETE" });
        refresh();
    }

    async function addWebhook() {
        if (!/^https:\/\//.test(hookForm.url)) {
            alert("URL must start with https://");
            return;
        }
        setAddingHook(true);
        try {
            const res = await fetch("/api/integrations/webhooks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(hookForm),
            });
            if (res.ok) {
                setHookForm({ url: "", events: ["pursuit.added"] });
                refresh();
            }
        } finally {
            setAddingHook(false);
        }
    }

    async function disableWebhook(id: string) {
        if (!confirm("Disable this webhook? You can re-add it later.")) return;
        await fetch(`/api/integrations/webhooks?id=${id}`, { method: "DELETE" });
        refresh();
    }

    const mcpTokens = tokens.filter((t) => t.kind === "mcp" && !t.revoked_at);
    const zapierTokens = tokens.filter((t) => t.kind === "zapier" && !t.revoked_at);
    const apiTokens = tokens.filter((t) => t.kind === "api" && !t.revoked_at);

    return (
        <div className="max-w-5xl mx-auto pb-16 px-1 animate-in fade-in duration-500">
            <header className="mb-8">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-black flex items-center gap-2">
                    <Plug className="w-7 h-7" />
                    Integrations
                </h1>
                <p className="text-stone-500 mt-1 text-sm">
                    Connect CapturePilot to Claude, ChatGPT, Zapier, Slack, and any tool that speaks HTTP.
                </p>
            </header>

            {/* ───────── One-time token display ───────── */}
            {newToken && (
                <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 mb-6">
                    <div className="flex items-start gap-3 mb-3">
                        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-bold text-amber-900">
                                Copy this token now — it will never be shown again.
                            </p>
                            <p className="text-xs text-amber-800 mt-0.5">
                                If you lose it, revoke it and create a new one.
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <code className="flex-1 bg-white border border-amber-300 rounded-lg px-3 py-2 text-xs font-mono text-stone-800 break-all">
                            {newToken.raw}
                        </code>
                        <button
                            type="button"
                            onClick={() => {
                                navigator.clipboard.writeText(newToken.raw);
                            }}
                            className="px-3 py-2 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 inline-flex items-center gap-1.5"
                        >
                            <Copy className="w-3 h-3" />
                            Copy
                        </button>
                        <button
                            type="button"
                            onClick={() => setNewToken(null)}
                            className="px-3 py-2 bg-stone-800 text-white rounded-lg text-xs font-bold hover:bg-stone-700"
                        >
                            Done
                        </button>
                    </div>
                </div>
            )}

            {/* ───────── MCP Section ───────── */}
            <section className="bg-white rounded-2xl border border-stone-200 p-6 mb-6">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2">
                            <Shield className="w-5 h-5 text-emerald-600" />
                            MCP — Model Context Protocol
                        </h2>
                        <p className="text-sm text-stone-500 mt-1 leading-relaxed">
                            Add CapturePilot as a connector in Claude Desktop, ChatGPT, Cursor, or any MCP-compatible
                            client. Your LLM gets direct access to opportunity search, capture briefs, past-performance
                            ratings, and labor rates.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => createToken("mcp")}
                        disabled={creatingToken}
                        className="bg-emerald-600 text-white px-4 py-2 rounded-full text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1.5 flex-shrink-0"
                    >
                        {creatingToken ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                        New MCP Token
                    </button>
                </div>

                <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 mb-4">
                    <p className="text-xs font-bold text-stone-700 mb-2">Claude Desktop config</p>
                    <pre className="text-[11px] text-stone-600 font-mono leading-relaxed overflow-x-auto">
{`{
  "mcpServers": {
    "capturepilot": {
      "url": "https://app.capturepilot.com/api/mcp",
      "headers": { "Authorization": "Bearer <your-token>" }
    }
  }
}`}
                    </pre>
                </div>

                <TokenList tokens={mcpTokens} loading={loading} onRevoke={revokeToken} emptyHint="No MCP tokens yet." />
            </section>

            {/* ───────── Zapier Section ───────── */}
            <section className="bg-white rounded-2xl border border-stone-200 p-6 mb-6">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2">
                            <Link2 className="w-5 h-5 text-orange-500" />
                            Zapier
                        </h2>
                        <p className="text-sm text-stone-500 mt-1 leading-relaxed">
                            Fire Zaps to HubSpot, Salesforce, Pipedrive, monday.com, Slack, and 7,000+ apps whenever a
                            pursuit is added, a HOT match surfaces, or a capture brief is generated.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => createToken("zapier")}
                        disabled={creatingToken}
                        className="bg-orange-500 text-white px-4 py-2 rounded-full text-xs font-bold hover:bg-orange-600 disabled:opacity-50 inline-flex items-center gap-1.5 flex-shrink-0"
                    >
                        {creatingToken ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                        New Zapier Token
                    </button>
                </div>
                <TokenList tokens={zapierTokens} loading={loading} onRevoke={revokeToken} emptyHint="No Zapier tokens yet." />
            </section>

            {/* ───────── Generic API Tokens ───────── */}
            <section className="bg-white rounded-2xl border border-stone-200 p-6 mb-6">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2">
                            <Key className="w-5 h-5 text-stone-600" />
                            API Tokens
                        </h2>
                        <p className="text-sm text-stone-500 mt-1 leading-relaxed">
                            Direct access to CapturePilot data for custom scripts, n8n, dashboards, and anything else.
                            Bearer-auth — same endpoints as the app.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => createToken("api")}
                        disabled={creatingToken}
                        className="bg-stone-900 text-white px-4 py-2 rounded-full text-xs font-bold hover:bg-stone-700 disabled:opacity-50 inline-flex items-center gap-1.5 flex-shrink-0"
                    >
                        {creatingToken ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                        New API Token
                    </button>
                </div>
                <TokenList tokens={apiTokens} loading={loading} onRevoke={revokeToken} emptyHint="No API tokens yet." />
            </section>

            {/* ───────── Slack Section ───────── */}
            <section className="bg-white rounded-2xl border border-stone-200 p-6 mb-6">
                <div className="flex items-start justify-between mb-4 gap-3">
                    <div>
                        <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2">
                            <Slack className="w-5 h-5 text-purple-600" />
                            Slack
                        </h2>
                        <p className="text-sm text-stone-500 mt-1 leading-relaxed">
                            Install the CapturePilot Slack app in your workspace. Ask{" "}
                            <code className="text-xs bg-stone-100 rounded px-1 py-0.5">/capturepilot hot</code>,{" "}
                            <code className="text-xs bg-stone-100 rounded px-1 py-0.5">/capturepilot recompetes</code>, or{" "}
                            <code className="text-xs bg-stone-100 rounded px-1 py-0.5">/capturepilot &lt;keyword&gt;</code>{" "}
                            to query federal contracts straight from Slack.
                        </p>
                    </div>
                    <a
                        href="/api/slack/install"
                        className="bg-purple-600 text-white px-4 py-2 rounded-full text-xs font-bold hover:bg-purple-700 inline-flex items-center gap-1.5 flex-shrink-0 whitespace-nowrap"
                    >
                        <Slack className="w-3 h-3" />
                        Add to Slack
                    </a>
                </div>
                {slackStatus === "installed" && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        Slack app installed. Try <code className="bg-white/50 rounded px-1">/capturepilot hot</code> in any
                        channel to test.
                    </div>
                )}
                {slackStatus === "error" && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-800 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        Slack install failed. Make sure <code className="bg-white/50 rounded px-1">SLACK_CLIENT_ID</code>{" "}
                        and <code className="bg-white/50 rounded px-1">SLACK_CLIENT_SECRET</code> are set in Vercel.
                    </div>
                )}
            </section>

            {/* ───────── Webhooks Section ───────── */}
            <section className="bg-white rounded-2xl border border-stone-200 p-6 mb-6">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2">
                            <Webhook className="w-5 h-5 text-blue-600" />
                            Webhooks
                        </h2>
                        <p className="text-sm text-stone-500 mt-1 leading-relaxed">
                            Receive HTTP POST callbacks on domain events. Payloads are signed with{" "}
                            <code className="text-xs bg-stone-100 rounded px-1 py-0.5">X-CapturePilot-Signature</code>{" "}
                            (HMAC-SHA256).
                        </p>
                    </div>
                </div>

                {/* Add webhook form */}
                <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 mb-4">
                    <div className="grid gap-3">
                        <input
                            type="url"
                            placeholder="https://hooks.example.com/your-endpoint"
                            value={hookForm.url}
                            onChange={(e) => setHookForm({ ...hookForm, url: e.target.value })}
                            className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        />
                        <div>
                            <p className="text-xs font-bold text-stone-700 mb-2">Events</p>
                            <div className="grid sm:grid-cols-2 gap-1.5">
                                {EVENT_OPTIONS.map((ev) => (
                                    <label
                                        key={ev.value}
                                        className="flex items-center gap-2 text-xs text-stone-700 cursor-pointer"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={hookForm.events.includes(ev.value)}
                                            onChange={(e) => {
                                                setHookForm({
                                                    ...hookForm,
                                                    events: e.target.checked
                                                        ? [...hookForm.events, ev.value]
                                                        : hookForm.events.filter((v) => v !== ev.value),
                                                });
                                            }}
                                            className="w-3.5 h-3.5"
                                        />
                                        {ev.label}
                                    </label>
                                ))}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={addWebhook}
                            disabled={!hookForm.url || hookForm.events.length === 0 || addingHook}
                            className="bg-blue-600 text-white px-4 py-2 rounded-full text-xs font-bold hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1.5 w-fit"
                        >
                            {addingHook ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                            Add Webhook
                        </button>
                    </div>
                </div>

                {/* Existing webhooks */}
                {loading ? (
                    <p className="text-xs text-stone-400">Loading...</p>
                ) : webhooks.length === 0 ? (
                    <p className="text-xs text-stone-400">No webhooks configured.</p>
                ) : (
                    <div className="space-y-2">
                        {webhooks.map((w) => (
                            <div
                                key={w.id}
                                className="flex items-start justify-between bg-stone-50 border border-stone-200 rounded-xl p-3"
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        {w.active ? (
                                            <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 text-[9px] font-bold px-2 py-0.5 rounded-full">
                                                <CheckCircle2 className="w-2.5 h-2.5" />
                                                ACTIVE
                                            </span>
                                        ) : (
                                            <span className="bg-stone-200 text-stone-600 text-[9px] font-bold px-2 py-0.5 rounded-full">
                                                DISABLED
                                            </span>
                                        )}
                                        <code className="text-xs text-stone-700 truncate">{w.url}</code>
                                    </div>
                                    <p className="text-[10px] text-stone-500 mt-1">
                                        Events: {w.events.join(", ")}
                                    </p>
                                </div>
                                {w.active && (
                                    <button
                                        type="button"
                                        onClick={() => disableWebhook(w.id)}
                                        className="text-stone-400 hover:text-red-600 p-1 flex-shrink-0"
                                        title="Disable"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <p className="text-xs text-stone-400 text-center">
                Need an integration we don&apos;t support? Email support@capturepilot.com.
            </p>
        </div>
    );
}

function TokenList({
    tokens,
    loading,
    onRevoke,
    emptyHint,
}: {
    tokens: ApiToken[];
    loading: boolean;
    onRevoke: (id: string) => void;
    emptyHint: string;
}) {
    if (loading) return <p className="text-xs text-stone-400">Loading...</p>;
    if (tokens.length === 0) return <p className="text-xs text-stone-400">{emptyHint}</p>;
    return (
        <div className="space-y-2">
            {tokens.map((t) => (
                <div
                    key={t.id}
                    className="flex items-center justify-between bg-stone-50 border border-stone-200 rounded-xl p-3"
                >
                    <div className="flex-1 min-w-0">
                        <code className="text-xs text-stone-700 font-mono">{t.token_prefix}…</code>
                        <p className="text-[10px] text-stone-500 mt-1">
                            {t.label} ·{" "}
                            {t.last_used_at
                                ? `Last used ${new Date(t.last_used_at).toLocaleDateString()}`
                                : "Never used"}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => onRevoke(t.id)}
                        className={clsx(
                            "text-stone-400 hover:text-red-600 p-1 flex-shrink-0",
                        )}
                        title="Revoke"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            ))}
        </div>
    );
}

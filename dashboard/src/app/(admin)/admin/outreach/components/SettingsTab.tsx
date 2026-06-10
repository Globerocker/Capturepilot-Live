"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import {
    Loader2, Save, Send, RefreshCw, Check, AlertTriangle, Globe,
    ShieldCheck, ShieldAlert,
} from "lucide-react";

interface OutreachSettings {
    sender_email?: string;
    sender_name?: string;
    reply_to?: string;
    email_signature?: string;
    sms_optin_language?: string;
    skip_if_replied?: boolean;
    throttle_per_hour?: number;
    send_window_start?: number;
    send_window_end?: number;
    send_window_timezone?: string;
}

interface DomainCheck {
    id: string;
    domain: string;
    spf_pass: boolean;
    dkim_pass: boolean;
    dmarc_pass: boolean;
    sentry_count_7d: number;
    raw_results: {
        spf_records?: string[];
        dkim_records?: string[];
        dmarc_records?: string[];
    };
    checked_at: string;
}

const TIMEZONES = [
    "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
    "America/Phoenix", "America/Anchorage", "Pacific/Honolulu", "UTC",
];

export default function SettingsTab() {
    const [settings, setSettings] = useState<OutreachSettings>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [domainCheck, setDomainCheck] = useState<DomainCheck | null>(null);
    const [checkingDomain, setCheckingDomain] = useState(false);
    const [testTo, setTestTo] = useState("");
    const [sendingTest, setSendingTest] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/outreach/settings");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json() as { settings: OutreachSettings };
            setSettings(json.settings || {});

            const domain = (json.settings.sender_email || "@capturepilot.com").split("@")[1];
            if (domain) {
                const r = await fetch(`/api/admin/outreach/domain-check?domain=${domain}`);
                if (r.ok) {
                    const j = await r.json();
                    setDomainCheck(j.last || null);
                }
            }
        } catch (e) {
            setMsg({ type: "error", text: (e as Error).message });
        }
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const update = <K extends keyof OutreachSettings>(key: K, value: OutreachSettings[K]) => {
        setSettings(s => ({ ...s, [key]: value }));
    };

    const save = async () => {
        setSaving(true);
        setMsg(null);
        try {
            const res = await fetch("/api/admin/outreach/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(settings),
            });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                throw new Error(j.error || `HTTP ${res.status}`);
            }
            setMsg({ type: "success", text: "Settings saved." });
        } catch (e) {
            setMsg({ type: "error", text: (e as Error).message });
        }
        setSaving(false);
    };

    const recheckDomain = async () => {
        const domain = (settings.sender_email || "").split("@")[1];
        if (!domain) {
            setMsg({ type: "error", text: "Set a sender email first." });
            return;
        }
        setCheckingDomain(true);
        try {
            const res = await fetch("/api/admin/outreach/domain-check", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ domain }),
            });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                throw new Error(j.error || `HTTP ${res.status}`);
            }
            const json = await res.json();
            setDomainCheck(json.check);
            setMsg({ type: "success", text: `Re-checked ${domain}.` });
        } catch (e) {
            setMsg({ type: "error", text: (e as Error).message });
        }
        setCheckingDomain(false);
    };

    const sendTest = async () => {
        if (!testTo) return;
        setSendingTest(true);
        setMsg(null);
        try {
            const res = await fetch("/api/admin/outreach/test-send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ to: testTo }),
            });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                throw new Error(j.error || `HTTP ${res.status}`);
            }
            const json = await res.json();
            setMsg({ type: "success", text: `Test sent to ${testTo}. Resend id: ${json.id}` });
        } catch (e) {
            setMsg({ type: "error", text: (e as Error).message });
        }
        setSendingTest(false);
    };

    if (loading) {
        return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>;
    }

    return (
        <div className="space-y-6 max-w-4xl">
            {msg && (
                <div className={clsx(
                    "text-xs px-3 py-2 rounded-lg border flex items-center gap-2",
                    msg.type === "success" ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200",
                )}>
                    {msg.type === "success" ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    {msg.text}
                </div>
            )}

            {/* Default sender */}
            <SectionCard title="Default sender" subtitle="Applied to every outreach campaign unless overridden per-campaign.">
                <Field label="From email">
                    <input type="email" value={settings.sender_email || ""} onChange={e => update("sender_email", e.target.value)}
                        className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-black"
                        placeholder="noreply@capturepilot.com"
                    />
                </Field>
                <Field label="From name">
                    <input type="text" value={settings.sender_name || ""} onChange={e => update("sender_name", e.target.value)}
                        className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-black"
                        placeholder="CapturePilot"
                    />
                </Field>
                <Field label="Reply-to">
                    <input type="email" value={settings.reply_to || ""} onChange={e => update("reply_to", e.target.value)}
                        className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-black"
                        placeholder="hello@capturepilot.com"
                    />
                </Field>
            </SectionCard>

            {/* Email signature */}
            <SectionCard title="Email signature" subtitle="Appended to every outreach email. Rich HTML supported.">
                <textarea value={settings.email_signature || ""} onChange={e => update("email_signature", e.target.value)}
                    rows={6}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-black font-mono"
                    placeholder="<p>Best,<br/>The CapturePilot team</p>"
                />
                {settings.email_signature && (
                    <div className="mt-3 border border-stone-200 rounded-lg p-3 bg-stone-50">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-2">Preview</p>
                        <div dangerouslySetInnerHTML={{ __html: settings.email_signature }} className="text-sm text-stone-800" />
                    </div>
                )}
            </SectionCard>

            {/* SMS */}
            <SectionCard title="SMS opt-in language" subtitle="Appended (or required) on every SMS template to satisfy carrier rules.">
                <textarea value={settings.sms_optin_language || ""} onChange={e => update("sms_optin_language", e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-black"
                    placeholder="Reply STOP to opt out. Msg & data rates may apply."
                />
            </SectionCard>

            {/* Behavior */}
            <SectionCard title="Send behavior" subtitle="Default rules applied to every campaign.">
                <Field label="Skip if recipient replied">
                    <label className="inline-flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={!!settings.skip_if_replied} onChange={e => update("skip_if_replied", e.target.checked)} />
                        <span>Don&apos;t send follow-ups if the prospect already replied</span>
                    </label>
                </Field>
                <Field label="Throttle (sends/hour, global)">
                    <input type="number" min={1} max={10000} value={settings.throttle_per_hour ?? 120}
                        onChange={e => update("throttle_per_hour", Number(e.target.value))}
                        className="w-32 px-3 py-2 border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-black"
                    />
                </Field>
                <Field label="Send window">
                    <div className="flex items-center gap-2">
                        <input type="number" min={0} max={23} value={settings.send_window_start ?? 9}
                            onChange={e => update("send_window_start", Number(e.target.value))}
                            className="w-20 px-3 py-2 border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-black"
                        />
                        <span className="text-xs text-stone-500">to</span>
                        <input type="number" min={1} max={24} value={settings.send_window_end ?? 17}
                            onChange={e => update("send_window_end", Number(e.target.value))}
                            className="w-20 px-3 py-2 border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-black"
                        />
                        <select value={settings.send_window_timezone || "America/New_York"}
                            onChange={e => update("send_window_timezone", e.target.value)}
                            aria-label="Send window timezone"
                            className="px-3 py-2 border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-black"
                        >
                            {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                        </select>
                    </div>
                </Field>
            </SectionCard>

            {/* Domain reputation */}
            <SectionCard
                title="Sender domain reputation"
                subtitle={`SPF / DKIM / DMARC checks for the sender email's domain.`}
            >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <DomainBadge label="SPF" pass={domainCheck?.spf_pass} />
                    <DomainBadge label="DKIM" pass={domainCheck?.dkim_pass} />
                    <DomainBadge label="DMARC" pass={domainCheck?.dmarc_pass} />
                </div>
                <div className="mt-3 flex items-center gap-3 flex-wrap text-xs text-stone-500">
                    {domainCheck ? (
                        <>
                            <span>Domain: <code className="bg-stone-100 px-1 rounded">{domainCheck.domain}</code></span>
                            <span>Last check: {new Date(domainCheck.checked_at).toLocaleString()}</span>
                            <span>Sentry incidents (7d): <strong>{domainCheck.sentry_count_7d}</strong></span>
                        </>
                    ) : (
                        <span>No previous check. Click <strong>Re-check now</strong> to run one.</span>
                    )}
                </div>
                <button type="button" onClick={recheckDomain} disabled={checkingDomain}
                    className="mt-3 text-xs font-bold text-stone-600 bg-white border border-stone-200 px-3 py-2 rounded-lg inline-flex items-center gap-1.5 hover:bg-stone-50 disabled:opacity-50">
                    {checkingDomain ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Re-check now
                </button>
            </SectionCard>

            {/* Test send */}
            <SectionCard title="Test send" subtitle="Send a one-shot email using the current settings to verify delivery + auth.">
                <div className="flex items-center gap-2">
                    <input type="email" value={testTo} onChange={e => setTestTo(e.target.value)}
                        className="flex-1 px-3 py-2 border border-stone-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-black"
                        placeholder="you@example.com"
                    />
                    <button type="button" onClick={sendTest} disabled={sendingTest || !testTo}
                        className="text-xs font-bold bg-black text-white px-4 py-2 rounded-lg inline-flex items-center gap-2 disabled:opacity-50">
                        {sendingTest ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        Send test
                    </button>
                </div>
            </SectionCard>

            <div className="sticky bottom-0 bg-gradient-to-t from-stone-100 via-stone-100 to-transparent pt-4 -mx-2 px-2">
                <div className="flex items-center justify-end">
                    <button type="button" onClick={save} disabled={saving}
                        className="text-sm font-bold bg-black text-white px-5 py-2.5 rounded-xl inline-flex items-center gap-2 disabled:opacity-50">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save settings
                    </button>
                </div>
            </div>
        </div>
    );
}

function SectionCard({
    title, subtitle, children,
}: { title: string; subtitle?: string; children: React.ReactNode }) {
    return (
        <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-3">
            <div>
                <h3 className="text-sm font-bold text-stone-900">{title}</h3>
                {subtitle && <p className="text-xs text-stone-500 mt-0.5">{subtitle}</p>}
            </div>
            {children}
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="text-xs font-bold uppercase tracking-widest text-stone-500 block mb-1">{label}</label>
            {children}
        </div>
    );
}

function DomainBadge({ label, pass }: { label: string; pass: boolean | undefined }) {
    const known = pass !== undefined;
    return (
        <div className={clsx(
            "rounded-xl border p-3 flex items-center gap-3",
            !known ? "bg-stone-50 border-stone-200"
                : pass ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200",
        )}>
            {!known ? (
                <Globe className="w-5 h-5 text-stone-400" />
            ) : pass ? (
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
            ) : (
                <ShieldAlert className="w-5 h-5 text-rose-600" />
            )}
            <div>
                <p className="text-xs font-bold uppercase tracking-widest text-stone-600">{label}</p>
                <p className={clsx(
                    "text-sm font-bold",
                    !known ? "text-stone-500" : pass ? "text-emerald-700" : "text-rose-700",
                )}>
                    {!known ? "Not checked" : pass ? "Pass" : "Fail"}
                </p>
            </div>
        </div>
    );
}

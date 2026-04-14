"use client";

import { useEffect, useState } from "react";
import { Receipt, Download, Eye } from "lucide-react";
import clsx from "clsx";

interface Invoice {
    id: string;
    number: string | null;
    status: string | null;
    amount: number;
    currency: string;
    created: number;
    period_start: number;
    period_end: number;
    pdf_url: string | null;
    hosted_url: string | null;
}

function formatDate(ts: number): string {
    return new Date(ts * 1000).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
    });
}

function formatCurrency(amount: number, currency = "usd"): string {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency.toUpperCase(),
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(amount);
}

function InvoiceStatusBadge({ status }: { status: string | null }) {
    const map: Record<string, { bg: string; text: string; label: string }> = {
        paid:          { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", label: "Paid" },
        open:          { bg: "bg-amber-50 border-amber-200",     text: "text-amber-700",   label: "Open" },
        draft:         { bg: "bg-stone-50 border-stone-200",     text: "text-stone-500",   label: "Draft" },
        void:          { bg: "bg-red-50 border-red-200",         text: "text-red-600",     label: "Void" },
        uncollectible: { bg: "bg-red-50 border-red-200",         text: "text-red-600",     label: "Uncollectible" },
    };
    const s = map[status || "draft"] || map.draft;
    return (
        <span className={clsx(s.bg, s.text, "border px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase")}>
            {s.label}
        </span>
    );
}

function SkeletonBlock({ className }: { className?: string }) {
    return <div className={clsx("animate-pulse bg-stone-100 rounded-lg", className)} />;
}

export default function InvoicesSection() {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/stripe/invoices");
                if (res.ok) {
                    const data = await res.json();
                    setInvoices(data.invoices || []);
                }
            } catch { /* ignore */ }
            finally { setLoading(false); }
        })();
    }, []);

    return (
        <section id="invoices" className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7">
            <p className="text-stone-400 text-xs uppercase tracking-widest font-bold mb-4">
                Invoices & Billing History
            </p>

            {loading ? (
                <div className="space-y-3">
                    {[...Array(4)].map((_, i) => <SkeletonBlock key={i} className="h-12 w-full" />)}
                </div>
            ) : invoices.length === 0 ? (
                <div className="text-center py-8">
                    <Receipt className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                    <p className="text-sm text-stone-500">No invoices yet</p>
                    <p className="text-xs text-stone-400 mt-1">
                        Invoices will appear here once you subscribe to a paid plan.
                    </p>
                </div>
            ) : (
                <div className="overflow-x-auto -mx-2 sm:mx-0">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-stone-200">
                                <th className="text-left text-[10px] text-stone-400 uppercase tracking-widest font-bold py-2 px-2">Date</th>
                                <th className="text-left text-[10px] text-stone-400 uppercase tracking-widest font-bold py-2 px-2">Invoice #</th>
                                <th className="text-right text-[10px] text-stone-400 uppercase tracking-widest font-bold py-2 px-2">Amount</th>
                                <th className="text-center text-[10px] text-stone-400 uppercase tracking-widest font-bold py-2 px-2">Status</th>
                                <th className="text-right text-[10px] text-stone-400 uppercase tracking-widest font-bold py-2 px-2">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoices.map((inv, idx) => (
                                <tr
                                    key={inv.id}
                                    className={clsx(
                                        "border-b border-stone-100 last:border-0 hover:bg-stone-50 transition-colors",
                                        idx % 2 === 1 && "bg-stone-50/50",
                                    )}
                                >
                                    <td className="py-3 px-2 text-stone-700 whitespace-nowrap">
                                        {formatDate(inv.created)}
                                    </td>
                                    <td className="py-3 px-2 text-stone-600 font-mono text-xs">
                                        {inv.number || "---"}
                                    </td>
                                    <td className="py-3 px-2 text-right text-stone-800 font-medium tabular-nums">
                                        {formatCurrency(inv.amount, inv.currency)}
                                    </td>
                                    <td className="py-3 px-2 text-center">
                                        <InvoiceStatusBadge status={inv.status} />
                                    </td>
                                    <td className="py-3 px-2 text-right">
                                        <div className="flex items-center justify-end gap-1.5">
                                            {inv.pdf_url && (
                                                <a
                                                    href={inv.pdf_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    title="Download PDF"
                                                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-stone-500 hover:text-stone-700 hover:bg-stone-100 transition-all"
                                                >
                                                    <Download className="w-3.5 h-3.5" />
                                                </a>
                                            )}
                                            {inv.hosted_url && (
                                                <a
                                                    href={inv.hosted_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    title="View invoice"
                                                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-stone-500 hover:text-stone-700 hover:bg-stone-100 transition-all"
                                                >
                                                    <Eye className="w-3.5 h-3.5" />
                                                </a>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

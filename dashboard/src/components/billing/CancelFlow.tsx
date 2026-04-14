"use client";

import { useState } from "react";
import { Loader2, X, Heart, AlertTriangle, CheckCircle2, Tag } from "lucide-react";
import clsx from "clsx";

interface Props {
    open: boolean;
    onClose: () => void;
    companyName: string;
    onComplete: (result: { retained: boolean; accessUntil: string | null }) => void;
}

type Step = 1 | 2 | 3 | 4;

const REASONS: { value: string; label: string }[] = [
    { value: "too_expensive", label: "Too expensive" },
    { value: "not_enough_opportunities", label: "Not enough opportunities" },
    { value: "missing_features", label: "Missing features I need" },
    { value: "not_ready", label: "Not ready to pursue contracts right now" },
    { value: "other", label: "Other" },
];

export default function CancelFlow({ open, onClose, companyName, onComplete }: Props) {
    const [step, setStep] = useState<Step>(1);
    const [reason, setReason] = useState<string>("");
    const [freeText, setFreeText] = useState<string>("");
    const [confirmText, setConfirmText] = useState<string>("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string>("");
    const [accessUntil, setAccessUntil] = useState<string | null>(null);

    const confirmPhrase = (companyName || "CANCEL").toUpperCase().trim();
    const confirmTextMatches = confirmText.trim().toUpperCase() === confirmPhrase;

    if (!open) return null;

    const reset = () => {
        setStep(1);
        setReason("");
        setFreeText("");
        setConfirmText("");
        setError("");
        setSubmitting(false);
        setAccessUntil(null);
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const handleAcceptOffer = async () => {
        setSubmitting(true);
        setError("");
        try {
            const res = await fetch("/api/stripe/cancel", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "accept_offer" }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || "Failed to apply offer. Please try again.");
                setSubmitting(false);
                return;
            }
            onComplete({ retained: true, accessUntil: null });
            handleClose();
        } catch {
            setError("Network error. Please try again.");
            setSubmitting(false);
        }
    };

    const handleFinalCancel = async () => {
        if (!confirmTextMatches) return;
        setSubmitting(true);
        setError("");
        try {
            const res = await fetch("/api/stripe/cancel", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "cancel",
                    reason,
                    free_text: freeText.trim() || null,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || "Failed to cancel. Please try again.");
                setSubmitting(false);
                return;
            }
            setAccessUntil(data.access_until || null);
            setStep(4);
            setSubmitting(false);
        } catch {
            setError("Network error. Please try again.");
            setSubmitting(false);
        }
    };

    const formatAccessUntil = (iso: string | null) => {
        if (!iso) return "the end of your current billing period";
        try {
            return new Date(iso).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
            });
        } catch {
            return "the end of your current billing period";
        }
    };

    return (
        <div
            className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={step === 4 ? handleClose : undefined}
        >
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-stone-100 px-6 py-4">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">
                            Step {step} of 4
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={handleClose}
                        className="text-stone-400 hover:text-stone-700 transition-colors"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Step 1 — Retention offer */}
                {step === 1 && (
                    <div className="px-6 py-6">
                        <div className="flex items-center justify-center w-14 h-14 bg-rose-50 rounded-full mx-auto mb-4">
                            <Heart className="w-7 h-7 text-rose-500" />
                        </div>
                        <h3 className="text-xl font-bold text-stone-900 text-center mb-2">
                            Before you go…
                        </h3>
                        <p className="text-sm text-stone-600 text-center mb-6 leading-relaxed">
                            We noticed you&apos;re thinking of leaving. Would an exclusive retention
                            discount change your mind?
                        </p>

                        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-2 border-emerald-300 rounded-2xl p-5 mb-6">
                            <div className="flex items-center gap-2 mb-2">
                                <Tag className="w-4 h-4 text-emerald-700" />
                                <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest">
                                    Exclusive offer
                                </span>
                            </div>
                            <p className="text-2xl font-bold text-emerald-900 leading-tight">
                                Stay for 50% off your next 3 months
                            </p>
                            <p className="text-sm text-emerald-800 mt-2">
                                Keep your full Pro access and try Capturepilot at half price —
                                applied automatically to your next invoices.
                            </p>
                        </div>

                        {error && (
                            <p className="text-sm text-red-600 mb-3 text-center">{error}</p>
                        )}

                        <div className="space-y-2">
                            <button
                                type="button"
                                onClick={handleAcceptOffer}
                                disabled={submitting}
                                className="w-full py-3 rounded-full font-bold text-sm bg-emerald-600 text-white hover:bg-emerald-700 transition-all shadow-md disabled:opacity-60 flex items-center justify-center gap-2"
                            >
                                {submitting ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <CheckCircle2 className="w-4 h-4" />
                                )}
                                Accept Offer — Stay for 50% off
                            </button>
                            <button
                                type="button"
                                onClick={() => setStep(2)}
                                disabled={submitting}
                                className="w-full py-3 rounded-full font-medium text-sm text-stone-500 hover:text-stone-800 transition-colors"
                            >
                                Continue cancelling
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 2 — Reason */}
                {step === 2 && (
                    <div className="px-6 py-6">
                        <h3 className="text-xl font-bold text-stone-900 mb-2">
                            Why are you cancelling?
                        </h3>
                        <p className="text-sm text-stone-500 mb-5">
                            Your feedback helps us improve — it only takes a moment.
                        </p>

                        <div className="space-y-2 mb-4">
                            {REASONS.map((r) => (
                                <label
                                    key={r.value}
                                    className={clsx(
                                        "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all",
                                        reason === r.value
                                            ? "border-emerald-500 bg-emerald-50"
                                            : "border-stone-200 bg-white hover:border-stone-300"
                                    )}
                                >
                                    <input
                                        type="radio"
                                        name="cancel-reason"
                                        value={r.value}
                                        checked={reason === r.value}
                                        onChange={() => setReason(r.value)}
                                        className="accent-emerald-600"
                                    />
                                    <span className="text-sm text-stone-800 font-medium">
                                        {r.label}
                                    </span>
                                </label>
                            ))}
                        </div>

                        <label className="block text-xs font-semibold text-stone-600 uppercase tracking-widest mb-2">
                            Anything else we should know? (optional)
                        </label>
                        <textarea
                            value={freeText}
                            onChange={(e) => setFreeText(e.target.value)}
                            rows={3}
                            maxLength={500}
                            placeholder="Tell us what we could have done better…"
                            className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent mb-5 resize-none"
                        />

                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setStep(1)}
                                className="flex-1 py-3 rounded-full font-medium text-sm text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all"
                            >
                                Back
                            </button>
                            <button
                                type="button"
                                onClick={() => setStep(3)}
                                disabled={!reason}
                                className="flex-1 py-3 rounded-full font-bold text-sm bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                Continue
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 3 — Final confirmation */}
                {step === 3 && (
                    <div className="px-6 py-6">
                        <div className="flex items-center justify-center w-14 h-14 bg-amber-50 rounded-full mx-auto mb-4">
                            <AlertTriangle className="w-7 h-7 text-amber-600" />
                        </div>
                        <h3 className="text-xl font-bold text-stone-900 text-center mb-2">
                            Final confirmation
                        </h3>
                        <p className="text-sm text-stone-600 text-center mb-6 leading-relaxed">
                            Cancelling will stop all Pro features after your current billing
                            period ends. To confirm, type{" "}
                            <span className="font-mono font-bold text-stone-900">
                                {confirmPhrase}
                            </span>{" "}
                            below.
                        </p>

                        <input
                            type="text"
                            value={confirmText}
                            onChange={(e) => setConfirmText(e.target.value)}
                            placeholder={confirmPhrase}
                            autoComplete="off"
                            className={clsx(
                                "w-full px-4 py-3 border rounded-xl text-sm font-mono mb-2 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent",
                                confirmTextMatches
                                    ? "border-red-500 bg-red-50"
                                    : "border-stone-200 bg-white"
                            )}
                        />

                        {error && (
                            <p className="text-sm text-red-600 mb-3 text-center">{error}</p>
                        )}

                        <div className="flex gap-2 mt-5">
                            <button
                                type="button"
                                onClick={() => setStep(2)}
                                disabled={submitting}
                                className="flex-1 py-3 rounded-full font-medium text-sm text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all"
                            >
                                Back
                            </button>
                            <button
                                type="button"
                                onClick={handleFinalCancel}
                                disabled={!confirmTextMatches || submitting}
                                className="flex-1 py-3 rounded-full font-bold text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                            >
                                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                                {submitting ? "Cancelling…" : "Confirm Cancellation"}
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 4 — Goodbye */}
                {step === 4 && (
                    <div className="px-6 py-8 text-center">
                        <div className="flex items-center justify-center w-14 h-14 bg-stone-100 rounded-full mx-auto mb-4">
                            <CheckCircle2 className="w-7 h-7 text-stone-500" />
                        </div>
                        <h3 className="text-xl font-bold text-stone-900 mb-2">
                            We&apos;re sorry to see you go.
                        </h3>
                        <p className="text-sm text-stone-600 leading-relaxed mb-6">
                            Your subscription has been cancelled. You&apos;ll keep full access
                            until{" "}
                            <span className="font-semibold text-stone-800">
                                {formatAccessUntil(accessUntil)}
                            </span>
                            .
                            <br />
                            <br />
                            If you change your mind, you can resubscribe anytime — all your data
                            will be waiting for you.
                        </p>
                        <button
                            type="button"
                            onClick={handleClose}
                            className="px-6 py-3 rounded-full font-bold text-sm bg-stone-900 text-white hover:bg-stone-800 transition-all"
                        >
                            Close
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

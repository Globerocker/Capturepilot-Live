"use client";

import { useState, useEffect } from "react";
import { createSupabaseClient } from "@/lib/supabase/client";
import { Zap, Lock, Loader2, LogOut } from "lucide-react";

const supabase = createSupabaseClient();

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";
const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL || "";

export default function LockScreen() {
    const [locked, setLocked] = useState(false);
    const [password, setPassword] = useState("");
    const [email, setEmail] = useState("");
    const [error, setError] = useState("");
    const [unlocking, setUnlocking] = useState(false);

    useEffect(() => {
        // Check if locked on mount
        if (typeof window !== "undefined" && sessionStorage.getItem("cp_locked") === "true") {
            setLocked(true);
        }

        // Load user email
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (user?.email) setEmail(user.email);
        });

        // Listen for lock event from sidebar
        const handleLock = () => {
            sessionStorage.setItem("cp_locked", "true");
            setLocked(true);
        };

        window.addEventListener("lock-session", handleLock);
        return () => window.removeEventListener("lock-session", handleLock);
    }, []);

    const handleUnlock = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!password.trim() || !email) return;

        setUnlocking(true);
        setError("");

        const { error: authError } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (authError) {
            setError("Incorrect password. Try again.");
            setUnlocking(false);
            return;
        }

        sessionStorage.removeItem("cp_locked");
        setLocked(false);
        setPassword("");
        setUnlocking(false);
    };

    const handleSignOut = async () => {
        sessionStorage.removeItem("cp_locked");
        await supabase.auth.signOut();
        const target = MARKETING_URL || APP_URL || "/";
        window.location.href = target;
    };

    if (!locked) return null;

    return (
        <div className="fixed inset-0 z-[60] bg-stone-900/80 backdrop-blur-md flex items-center justify-center p-6">
            <div className="w-full max-w-sm bg-white rounded-[32px] p-8 shadow-2xl text-center animate-in fade-in zoom-in-95 duration-300">
                <div className="w-14 h-14 rounded-2xl bg-black flex items-center justify-center mx-auto mb-5">
                    <Zap className="h-6 w-6 text-white" />
                </div>
                <h2 className="text-xl font-bold font-typewriter mb-1">Session Locked</h2>
                <p className="text-sm text-stone-500 mb-6">
                    Enter your password to unlock
                </p>

                {email && (
                    <div className="bg-stone-50 rounded-xl px-4 py-2.5 mb-4 flex items-center gap-2">
                        <Lock className="w-3.5 h-3.5 text-stone-400" />
                        <span className="text-xs text-stone-600 font-medium truncate">{email}</span>
                    </div>
                )}

                <form onSubmit={handleUnlock} className="space-y-3">
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-stone-400 text-center"
                        placeholder="Password"
                        autoFocus
                    />

                    {error && (
                        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-2.5">{error}</p>
                    )}

                    <button
                        type="submit"
                        disabled={unlocking || !password.trim()}
                        className="w-full bg-black text-white py-3 rounded-full font-typewriter font-bold text-sm hover:bg-stone-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {unlocking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                        {unlocking ? "Unlocking..." : "Unlock"}
                    </button>
                </form>

                <button
                    type="button"
                    onClick={handleSignOut}
                    className="mt-4 text-xs text-stone-400 hover:text-red-600 transition-colors flex items-center gap-1 mx-auto"
                >
                    <LogOut className="w-3 h-3" />
                    Sign out instead
                </button>
            </div>
        </div>
    );
}

"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Settings, Save, Loader2, CheckCircle2, Key, Mail, Building2 } from "lucide-react";

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function PortalSettings() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [changingPassword, setChangingPassword] = useState(false);
    const [pwSuccess, setPwSuccess] = useState(false);
    const [pwError, setPwError] = useState("");
    const [newPassword, setNewPassword] = useState("");

    const [form, setForm] = useState({
        company_name: "", contact_name: "", contact_phone: "", email: "",
        website: "", state: "", city: "", address_line_1: "", zip_code: "",
    });

    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data } = await supabase
                .from("user_profiles")
                .select("company_name, contact_name, contact_phone, email, website, state, city, address_line_1, zip_code")
                .eq("auth_user_id", user.id)
                .single();

            if (data) {
                setForm({
                    company_name: data.company_name || "",
                    contact_name: data.contact_name || "",
                    contact_phone: data.contact_phone || "",
                    email: data.email || user.email || "",
                    website: data.website || "",
                    state: data.state || "",
                    city: data.city || "",
                    address_line_1: data.address_line_1 || "",
                    zip_code: data.zip_code || "",
                });
            }
            setLoading(false);
        })();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setSaved(false);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        await supabase.from("user_profiles").update(form).eq("auth_user_id", user.id);
        setSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
    };

    const handlePasswordChange = async () => {
        if (newPassword.length < 8) {
            setPwError("Password must be at least 8 characters");
            return;
        }
        setChangingPassword(true);
        setPwError("");
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) {
            setPwError(error.message);
        } else {
            setPwSuccess(true);
            setNewPassword("");
            setTimeout(() => setPwSuccess(false), 3000);
        }
        setChangingPassword(false);
    };

    if (loading) {
        return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 text-stone-400 animate-spin" /></div>;
    }

    return (
        <div className="max-w-3xl space-y-6">
            <h1 className="text-2xl font-bold text-black font-typewriter flex items-center gap-2">
                <Settings className="w-6 h-6" /> Account Settings
            </h1>

            {/* Profile Info */}
            <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-5 py-3 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-stone-400" />
                    <h2 className="font-bold text-sm">Company Information</h2>
                </div>
                <div className="p-5 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-typewriter text-stone-400 uppercase block mb-1">Company Name</label>
                            <input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
                                className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm" />
                        </div>
                        <div>
                            <label className="text-[10px] font-typewriter text-stone-400 uppercase block mb-1">Contact Name</label>
                            <input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
                                className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm" />
                        </div>
                        <div>
                            <label className="text-[10px] font-typewriter text-stone-400 uppercase block mb-1">Email</label>
                            <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                                className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm" />
                        </div>
                        <div>
                            <label className="text-[10px] font-typewriter text-stone-400 uppercase block mb-1">Phone</label>
                            <input value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))}
                                className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm" />
                        </div>
                        <div>
                            <label className="text-[10px] font-typewriter text-stone-400 uppercase block mb-1">Website</label>
                            <input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
                                className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm" />
                        </div>
                        <div>
                            <label className="text-[10px] font-typewriter text-stone-400 uppercase block mb-1">State</label>
                            <input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
                                className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm" />
                        </div>
                        <div>
                            <label className="text-[10px] font-typewriter text-stone-400 uppercase block mb-1">City</label>
                            <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                                className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm" />
                        </div>
                        <div>
                            <label className="text-[10px] font-typewriter text-stone-400 uppercase block mb-1">Address</label>
                            <input value={form.address_line_1} onChange={e => setForm(f => ({ ...f, address_line_1: e.target.value }))}
                                className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm" />
                        </div>
                    </div>
                    <button type="button" onClick={handleSave} disabled={saving}
                        className="bg-black text-white px-5 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50 hover:bg-stone-800">
                        {saved ? <><CheckCircle2 className="w-4 h-4" /> Saved</> : saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Save className="w-4 h-4" /> Save Changes</>}
                    </button>
                </div>
            </div>

            {/* Google Login */}
            <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-5 py-3 flex items-center gap-2">
                    <Mail className="w-4 h-4 text-stone-400" />
                    <h2 className="font-bold text-sm">Quick Login</h2>
                </div>
                <div className="p-5 space-y-3">
                    <p className="text-xs text-stone-500">Link your Google account for one-click login. You can still use your email and password.</p>
                    <button
                        type="button"
                        onClick={async () => {
                            await supabase.auth.linkIdentity({ provider: "google", options: { redirectTo: window.location.origin + "/portal/settings" } });
                        }}
                        className="inline-flex items-center gap-2 bg-white border-2 border-stone-200 hover:border-stone-300 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                        Connect Google Account
                    </button>
                </div>
            </div>

            {/* Password Change */}
            <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-5 py-3 flex items-center gap-2">
                    <Key className="w-4 h-4 text-stone-400" />
                    <h2 className="font-bold text-sm">Change Password</h2>
                </div>
                <div className="p-5 space-y-3">
                    <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                        placeholder="New password (min 8 characters)"
                        className="w-full max-w-sm border border-stone-300 rounded-xl px-3 py-2 text-sm" />
                    {pwError && <p className="text-xs text-red-600">{pwError}</p>}
                    {pwSuccess && <p className="text-xs text-emerald-600">Password updated successfully!</p>}
                    <button type="button" onClick={handlePasswordChange} disabled={changingPassword || !newPassword}
                        className="bg-black text-white px-5 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
                        {changingPassword ? <><Loader2 className="w-4 h-4 animate-spin" /> Updating...</> : <><Key className="w-4 h-4" /> Update Password</>}
                    </button>
                </div>
            </div>

            {/* Email Preferences */}
            <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-5 py-3 flex items-center gap-2">
                    <Mail className="w-4 h-4 text-stone-400" />
                    <h2 className="font-bold text-sm">Notifications</h2>
                </div>
                <div className="p-5 space-y-3">
                    <label className="flex items-center gap-3 text-sm">
                        <input type="checkbox" defaultChecked className="rounded" />
                        <span>Email me when new tasks are assigned</span>
                    </label>
                    <label className="flex items-center gap-3 text-sm">
                        <input type="checkbox" defaultChecked className="rounded" />
                        <span>Email me when new opportunities match my profile</span>
                    </label>
                    <label className="flex items-center gap-3 text-sm">
                        <input type="checkbox" defaultChecked className="rounded" />
                        <span>Weekly opportunity summary email</span>
                    </label>
                </div>
            </div>
        </div>
    );
}

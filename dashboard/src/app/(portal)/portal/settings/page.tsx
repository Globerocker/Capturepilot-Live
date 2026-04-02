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

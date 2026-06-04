import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { Sparkles, Wrench, Zap, AlertTriangle, Calendar } from "lucide-react";
import ReactMarkdown from "react-markdown";

export const dynamic = "force-dynamic";
export const revalidate = 300; // 5-min CDN cache
export const metadata = {
    title: "Changelog — CapturePilot",
    description: "What's new in CapturePilot — features, fixes, improvements.",
};

interface ChangelogEntry {
    id: string;
    slug: string;
    title: string;
    body_md: string;
    cover_image_url: string | null;
    category: "feature" | "fix" | "improvement" | "breaking";
    released_at: string;
    author_email: string | null;
}

const CATEGORY_META: Record<ChangelogEntry["category"], { label: string; icon: typeof Sparkles; color: string; bg: string }> = {
    feature:     { label: "New",         icon: Sparkles,       color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
    improvement: { label: "Improved",    icon: Zap,            color: "text-blue-700",    bg: "bg-blue-50 border-blue-200" },
    fix:         { label: "Fixed",       icon: Wrench,         color: "text-amber-700",   bg: "bg-amber-50 border-amber-200" },
    breaking:    { label: "Breaking",    icon: AlertTriangle,  color: "text-red-700",     bg: "bg-red-50 border-red-200" },
};

async function fetchEntries(): Promise<ChangelogEntry[]> {
    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } },
    );
    const { data, error } = await sb
        .from("changelog_entries")
        .select("id, slug, title, body_md, cover_image_url, category, released_at, author_email")
        .eq("published", true)
        .order("released_at", { ascending: false })
        .limit(50);
    if (error) {
        console.error("[changelog] fetch error", error.message);
        return [];
    }
    return (data || []) as ChangelogEntry[];
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", {
        year: "numeric", month: "long", day: "numeric",
    });
}

export default async function ChangelogPage() {
    const entries = await fetchEntries();

    return (
        <main className="max-w-3xl mx-auto px-6 py-12 lg:py-20">
            <header className="mb-12 text-center">
                <h1 className="text-4xl lg:text-5xl font-extrabold text-stone-900 tracking-tight mb-3">
                    What's new
                </h1>
                <p className="text-lg text-stone-600">
                    Updates to CapturePilot, the federal-contracting platform for small businesses.
                </p>
            </header>

            {entries.length === 0 ? (
                <div className="text-center py-16 text-stone-500">
                    <p>No updates yet. Check back soon — we ship often.</p>
                </div>
            ) : (
                <div className="space-y-8">
                    {entries.map(entry => {
                        const meta = CATEGORY_META[entry.category];
                        const Icon = meta.icon;
                        return (
                            <article
                                key={entry.id}
                                id={entry.slug}
                                className="border border-stone-200 rounded-2xl bg-white overflow-hidden"
                            >
                                {entry.cover_image_url && (
                                    <div className="aspect-[3/1] bg-stone-100 overflow-hidden">
                                        <img src={entry.cover_image_url} alt="" className="w-full h-full object-cover" />
                                    </div>
                                )}
                                <div className="p-6 lg:p-8">
                                    <div className="flex items-center gap-3 mb-3">
                                        <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${meta.bg} ${meta.color}`}>
                                            <Icon className="w-3 h-3" />
                                            {meta.label}
                                        </span>
                                        <span className="text-xs text-stone-500 inline-flex items-center gap-1">
                                            <Calendar className="w-3 h-3" />
                                            {formatDate(entry.released_at)}
                                        </span>
                                    </div>
                                    <Link href={`/changelog#${entry.slug}`} className="block group">
                                        <h2 className="text-2xl font-bold text-stone-900 leading-tight mb-3 group-hover:text-stone-700 transition-colors">
                                            {entry.title}
                                        </h2>
                                    </Link>
                                    <div className="prose prose-stone prose-sm max-w-none text-stone-700">
                                        <ReactMarkdown
                                            components={{
                                                a: ({ href, children }) => (
                                                    <a href={href || "#"} target={href?.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="text-emerald-700 hover:text-emerald-900 underline">
                                                        {children}
                                                    </a>
                                                ),
                                                h2: ({ children }) => <h3 className="text-base font-bold text-stone-900 mt-4 mb-2">{children}</h3>,
                                                h3: ({ children }) => <h4 className="text-sm font-bold text-stone-800 mt-3 mb-1.5">{children}</h4>,
                                                code: ({ children }) => <code className="bg-stone-100 px-1.5 py-0.5 rounded text-xs font-mono text-stone-800">{children}</code>,
                                                ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>,
                                                p: ({ children }) => <p className="leading-relaxed mb-2">{children}</p>,
                                            }}
                                        >
                                            {entry.body_md}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}

            <footer className="mt-16 pt-8 border-t border-stone-200 text-center">
                <p className="text-sm text-stone-500 mb-3">Have an idea or hit a bug?</p>
                <Link href="/signup" className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold inline-flex items-center gap-2 transition-colors">
                    Start a 14-day Pro trial
                </Link>
            </footer>
        </main>
    );
}

"use client";

import { useEffect, useState } from "react";
import {
    GraduationCap,
    Loader2,
    Clock,
    Sparkles,
    BookOpen,
    Award,
    FileText,
    TrendingUp,
    PlayCircle,
    Film,
} from "lucide-react";
import clsx from "clsx";

interface Article {
    slug: string;
    title: string;
    excerpt: string | null;
    category: string;
    reading_minutes: number | null;
    featured: boolean;
    cover_image_url: string | null;
    author_name: string | null;
    published_at: string | null;
    content_type?: "article" | "video";
    duration_seconds?: number | null;
    thumbnail_url?: string | null;
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
    playbook: BookOpen,
    cert: Award,
    proposal: FileText,
    pricing: TrendingUp,
    market_intel: Sparkles,
};

const CATEGORY_LABELS: Record<string, string> = {
    playbook: "Playbook",
    cert: "Certifications",
    proposal: "Proposals",
    pricing: "Pricing",
    market_intel: "Market Intel",
};

function formatDuration(seconds: number | null | undefined): string | null {
    if (!seconds) return null;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m === 0) return `${s}s`;
    return s === 0 ? `${m} min` : `${m}:${s.toString().padStart(2, "0")}`;
}

export default function AcademyPage() {
    const [articles, setArticles] = useState<Article[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [selectedType, setSelectedType] = useState<"all" | "article" | "video">("all");

    useEffect(() => {
        async function load() {
            setLoading(true);
            const qs = selectedCategory ? `?category=${selectedCategory}` : "";
            const res = await fetch(`/api/academy${qs}`);
            const data = await res.json();
            setArticles((data.articles || []) as Article[]);
            setLoading(false);
        }
        load();
    }, [selectedCategory]);

    const categories = Array.from(new Set(articles.map((a) => a.category)));
    const visible = articles.filter(a => selectedType === "all" ? true : (a.content_type || "article") === selectedType);
    const featured = visible.filter((a) => a.featured);
    const others = visible.filter((a) => !a.featured);

    return (
        <div className="max-w-6xl mx-auto pb-16 px-1 animate-in fade-in duration-500">
            <header className="mb-8">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-black flex items-center gap-2">
                    <GraduationCap className="w-7 h-7" />
                    Academy
                </h1>
                <p className="text-stone-500 mt-1 text-sm max-w-2xl">
                    Playbooks, video walkthroughs, and deep-dives from our capture team. Ungated — you&apos;re already in.
                </p>
            </header>

            {/* Type toggle */}
            <div className="mb-3 inline-flex items-center bg-white rounded-full border border-stone-200 p-1 gap-0.5">
                {[
                    { value: "all", label: "All", icon: BookOpen },
                    { value: "article", label: "Articles", icon: FileText },
                    { value: "video", label: "Videos", icon: Film },
                ].map(o => {
                    const Icon = o.icon;
                    const active = selectedType === o.value;
                    return (
                        <button
                            key={o.value}
                            type="button"
                            onClick={() => setSelectedType(o.value as "all" | "article" | "video")}
                            className={clsx(
                                "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all",
                                active
                                    ? "bg-emerald-600 text-white"
                                    : "text-stone-500 hover:text-stone-800"
                            )}
                        >
                            <Icon className="w-3.5 h-3.5" /> {o.label}
                        </button>
                    );
                })}
            </div>

            {/* Category filter */}
            <div className="flex flex-wrap gap-2 mb-6">
                <button
                    type="button"
                    onClick={() => setSelectedCategory(null)}
                    className={clsx(
                        "px-3 py-1.5 rounded-full text-xs font-bold transition-all",
                        selectedCategory === null
                            ? "bg-emerald-600 text-white"
                            : "bg-white text-stone-600 border border-stone-200 hover:border-emerald-300",
                    )}
                >
                    All
                </button>
                {categories.map((c) => (
                    <button
                        type="button"
                        key={c}
                        onClick={() => setSelectedCategory(c)}
                        className={clsx(
                            "px-3 py-1.5 rounded-full text-xs font-bold transition-all",
                            selectedCategory === c
                                ? "bg-emerald-600 text-white"
                                : "bg-white text-stone-600 border border-stone-200 hover:border-emerald-300",
                        )}
                    >
                        {CATEGORY_LABELS[c] || c}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
                </div>
            ) : visible.length === 0 ? (
                <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center">
                    <GraduationCap className="w-10 h-10 text-stone-300 mx-auto mb-3" />
                    <p className="text-sm font-bold text-stone-700">No content in this category yet.</p>
                </div>
            ) : (
                <>
                    {featured.length > 0 && (
                        <section className="mb-8">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-3">
                                Featured
                            </p>
                            <div className="grid md:grid-cols-2 gap-4">
                                {featured.map((a) => (
                                    <ContentCard key={a.slug} item={a} featured />
                                ))}
                            </div>
                        </section>
                    )}

                    {others.length > 0 && (
                        <section>
                            {featured.length > 0 && (
                                <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-3">
                                    More from the library
                                </p>
                            )}
                            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {others.map((a) => (
                                    <ContentCard key={a.slug} item={a} />
                                ))}
                            </div>
                        </section>
                    )}
                </>
            )}
        </div>
    );
}

function ContentCard({ item, featured }: { item: Article; featured?: boolean }) {
    const isVideo = (item.content_type || "article") === "video";
    const Icon = CATEGORY_ICONS[item.category] || BookOpen;
    const thumb = item.thumbnail_url || item.cover_image_url;
    const duration = formatDuration(item.duration_seconds);

    return (
        <a
            href={`/academy/${item.slug}`}
            className={clsx(
                "block bg-white rounded-2xl border overflow-hidden hover:border-emerald-400 transition-all group",
                featured ? "border-emerald-200 shadow-sm" : "border-stone-200",
            )}
        >
            {/* Video thumbnail */}
            {isVideo && (
                <div className="relative aspect-video bg-stone-900 overflow-hidden">
                    {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt={item.title} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full bg-gradient-to-br from-stone-800 to-stone-950 flex items-center justify-center">
                            <Film className="w-10 h-10 text-stone-600" />
                        </div>
                    )}
                    <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                        <PlayCircle className="w-14 h-14 text-white/90 drop-shadow-lg group-hover:scale-110 transition-transform" />
                    </div>
                    {duration && (
                        <span className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                            {duration}
                        </span>
                    )}
                </div>
            )}

            <div className="p-5">
                <div className="flex items-center gap-2 mb-2">
                    <div
                        className={clsx(
                            "w-8 h-8 rounded-lg flex items-center justify-center",
                            isVideo
                                ? "bg-indigo-100 text-indigo-600"
                                : featured ? "bg-emerald-100 text-emerald-600" : "bg-stone-100 text-stone-500",
                        )}
                    >
                        {isVideo ? <Film className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                        {isVideo ? "Video" : (CATEGORY_LABELS[item.category] || item.category)}
                    </span>
                    {!isVideo && item.reading_minutes && (
                        <span className="text-[10px] text-stone-400 inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {item.reading_minutes} min
                        </span>
                    )}
                </div>
                <h3 className="font-bold text-stone-900 text-base leading-snug mb-2 group-hover:text-emerald-700">
                    {item.title}
                </h3>
                {item.excerpt && (
                    <p className="text-sm text-stone-600 leading-relaxed line-clamp-3">{item.excerpt}</p>
                )}
            </div>
        </a>
    );
}

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

export default function AcademyPage() {
    const [articles, setArticles] = useState<Article[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

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
    const featured = articles.filter((a) => a.featured);
    const others = articles.filter((a) => !a.featured);

    return (
        <div className="max-w-6xl mx-auto pb-16 px-1 animate-in fade-in duration-500">
            <header className="mb-8">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-black flex items-center gap-2">
                    <GraduationCap className="w-7 h-7" />
                    Academy
                </h1>
                <p className="text-stone-500 mt-1 text-sm max-w-2xl">
                    Playbooks, checklists, and deep-dives from our capture team. Ungated — you&apos;re already in.
                </p>
            </header>

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
            ) : articles.length === 0 ? (
                <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center">
                    <GraduationCap className="w-10 h-10 text-stone-300 mx-auto mb-3" />
                    <p className="text-sm font-bold text-stone-700">No articles in this category yet.</p>
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
                                    <ArticleCard key={a.slug} article={a} featured />
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
                                    <ArticleCard key={a.slug} article={a} />
                                ))}
                            </div>
                        </section>
                    )}
                </>
            )}
        </div>
    );
}

function ArticleCard({ article, featured }: { article: Article; featured?: boolean }) {
    const Icon = CATEGORY_ICONS[article.category] || BookOpen;
    return (
        <a
            href={`/academy/${article.slug}`}
            className={clsx(
                "block bg-white rounded-2xl border p-5 hover:border-emerald-400 transition-all group",
                featured ? "border-emerald-200 shadow-sm" : "border-stone-200",
            )}
        >
            <div className="flex items-center gap-2 mb-2">
                <div
                    className={clsx(
                        "w-8 h-8 rounded-lg flex items-center justify-center",
                        featured ? "bg-emerald-100" : "bg-stone-100",
                    )}
                >
                    <Icon className={clsx("w-4 h-4", featured ? "text-emerald-600" : "text-stone-500")} />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                    {CATEGORY_LABELS[article.category] || article.category}
                </span>
                {article.reading_minutes && (
                    <span className="text-[10px] text-stone-400 inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {article.reading_minutes} min
                    </span>
                )}
            </div>
            <h3 className="font-bold text-stone-900 text-base leading-snug mb-2 group-hover:text-emerald-700">
                {article.title}
            </h3>
            {article.excerpt && (
                <p className="text-sm text-stone-600 leading-relaxed line-clamp-3">{article.excerpt}</p>
            )}
        </a>
    );
}

import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Clock, GraduationCap } from "lucide-react";

export const dynamic = "force-dynamic";

interface Article {
    slug: string;
    title: string;
    excerpt: string | null;
    body_md: string;
    category: string;
    reading_minutes: number | null;
    cover_image_url: string | null;
    author_name: string | null;
    published_at: string | null;
}

/**
 * Very light Markdown → HTML renderer. Good enough for our playbook articles
 * (headings, paragraphs, lists, links, inline code). Anything more complex
 * and we switch to `marked` — but for our use case avoiding the dep is fine.
 */
function renderMarkdown(md: string): string {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const lines = md.split("\n");
    const out: string[] = [];
    let inList = false;
    let listType: "ul" | "ol" | null = null;
    let inCodeBlock = false;
    let codeBuf: string[] = [];

    function closeList() {
        if (inList) {
            out.push(`</${listType}>`);
            inList = false;
            listType = null;
        }
    }

    for (const rawLine of lines) {
        if (rawLine.startsWith("```")) {
            if (inCodeBlock) {
                out.push(`<pre class="bg-stone-900 text-stone-100 p-3 rounded-lg text-xs overflow-x-auto my-4"><code>${codeBuf.map(esc).join("\n")}</code></pre>`);
                inCodeBlock = false;
                codeBuf = [];
            } else {
                closeList();
                inCodeBlock = true;
            }
            continue;
        }
        if (inCodeBlock) { codeBuf.push(rawLine); continue; }

        const line = rawLine;
        if (line.startsWith("# ")) { closeList(); out.push(`<h1 class="text-3xl font-black text-stone-900 mt-8 mb-4">${esc(line.slice(2))}</h1>`); continue; }
        if (line.startsWith("## ")) { closeList(); out.push(`<h2 class="text-2xl font-bold text-stone-900 mt-8 mb-3">${esc(line.slice(3))}</h2>`); continue; }
        if (line.startsWith("### ")) { closeList(); out.push(`<h3 class="text-lg font-bold text-stone-900 mt-6 mb-2">${esc(line.slice(4))}</h3>`); continue; }
        if (line.trim() === "---") { closeList(); out.push(`<hr class="border-stone-200 my-6" />`); continue; }

        const olMatch = line.match(/^(\d+)\.\s+(.*)/);
        if (olMatch) {
            if (!inList || listType !== "ol") { closeList(); out.push(`<ol class="list-decimal pl-6 space-y-1 my-3 text-stone-700">`); inList = true; listType = "ol"; }
            out.push(`<li>${inlineMd(olMatch[2])}</li>`);
            continue;
        }
        if (line.startsWith("- ") || line.startsWith("* ")) {
            if (!inList || listType !== "ul") { closeList(); out.push(`<ul class="list-disc pl-6 space-y-1 my-3 text-stone-700">`); inList = true; listType = "ul"; }
            out.push(`<li>${inlineMd(line.slice(2))}</li>`);
            continue;
        }

        if (line.trim() === "") { closeList(); continue; }

        closeList();
        out.push(`<p class="text-stone-700 leading-relaxed my-3">${inlineMd(line)}</p>`);
    }
    closeList();
    return out.join("\n");
}

function inlineMd(s: string): string {
    return s
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/`([^`]+)`/g, '<code class="bg-stone-100 text-stone-800 px-1 py-0.5 rounded text-sm">$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>")
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-emerald-700 underline underline-offset-4 hover:text-emerald-800">$1</a>')
        .replace(/\[ \]/g, '<span class="inline-block w-3 h-3 border border-stone-300 rounded-sm mr-1 align-middle"></span>')
        .replace(/\[x\]/gi, '<span class="inline-block w-3 h-3 bg-emerald-500 border border-emerald-500 rounded-sm mr-1 align-middle text-white text-[10px] leading-none text-center">✓</span>');
}

export default async function AcademyArticlePage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data } = await sb
        .from("academy_articles")
        .select("slug, title, excerpt, body_md, category, reading_minutes, cover_image_url, author_name, published_at")
        .eq("slug", slug)
        .not("published_at", "is", null)
        .maybeSingle();

    const article = data as Article | null;
    if (!article) return notFound();

    const html = renderMarkdown(article.body_md);

    return (
        <article className="max-w-3xl mx-auto pb-16 px-1 animate-in fade-in duration-500">
            <Link
                href="/academy"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-500 hover:text-emerald-700 mb-6"
            >
                <ArrowLeft className="w-3 h-3" />
                Back to Academy
            </Link>

            <header className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                    <GraduationCap className="w-4 h-4 text-emerald-600" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                        {article.category}
                    </span>
                    {article.reading_minutes && (
                        <span className="text-[10px] text-stone-400 inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {article.reading_minutes} min read
                        </span>
                    )}
                </div>
                <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-stone-900 mb-3 leading-tight">
                    {article.title}
                </h1>
                {article.excerpt && (
                    <p className="text-lg text-stone-600 leading-relaxed">{article.excerpt}</p>
                )}
                <p className="text-xs text-stone-500 mt-4">
                    By {article.author_name || "CapturePilot"} ·{" "}
                    {article.published_at
                        ? new Date(article.published_at).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                          })
                        : ""}
                </p>
            </header>

            <div className="prose prose-stone max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
        </article>
    );
}

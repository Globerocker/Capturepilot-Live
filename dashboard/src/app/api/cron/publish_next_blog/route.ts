import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { guardCron } from "@/lib/cron-auth";
import { HUMAN_VOICE_RULES } from "@/lib/llm/humanizer";
import { withCronTelemetry } from "@/lib/cron-telemetry";

export const maxDuration = 300;

/**
 * Weekly blog auto-publisher.
 *
 * Reads `website/blog-topics.json` (40 topics seeded), fetches the GitHub
 * tree of the `website/app/blog/` directory to see which topics already
 * have folders, picks the next unpublished topic, generates a long-form
 * Markdown post via gpt-4o-mini, then commits two new files via the
 * GitHub Contents API:
 *
 *   website/app/blog/<slug>/page.tsx       (the article HTML)
 *   website/app/blog/<slug>/layout.tsx     (metadata + JSON-LD)
 *
 * Required env vars:
 *   GITHUB_REPO_OWNER          e.g. "Globerocker"
 *   GITHUB_REPO_NAME           e.g. "capturepilot-v3"
 *   GITHUB_TOKEN               PAT with `repo` scope (or fine-grained Contents:Write)
 *   GITHUB_DEFAULT_BRANCH      e.g. "main" (defaults to "main")
 *   GITHUB_WEBSITE_PATH        e.g. "website" (path prefix inside the repo)
 *   OPENAI_API_KEY
 *
 * Schedule (vercel.json):
 *   "/api/cron/publish_next_blog" — "0 14 * * 1"   (Mon 14:00 UTC)
 *
 * Manual trigger:
 *   GET /api/cron/publish_next_blog?slug=<topic-slug>&dry=1
 */

interface BlogTopic {
  slug: string;
  keyword: string;
  title: string;
  category: string;
  features: string[];
}

interface GeneratedPost {
  intro_paragraph: string;
  sections: Array<{ heading: string; body_markdown: string }>;
  conclusion: string;
  meta_description: string; // ≤160 chars, CTA-oriented
  faq: Array<{ q: string; a: string }>;
}

function getEnv(): {
  owner: string;
  repo: string;
  token: string;
  branch: string;
  prefix: string;
} | NextResponse {
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;
  const token = process.env.GITHUB_TOKEN;
  const branch = process.env.GITHUB_DEFAULT_BRANCH || "main";
  // Empty string is a valid value (= repo root). Use nullish-coalescing.
  const prefix = process.env.GITHUB_WEBSITE_PATH ?? "website";
  if (!owner || !repo || !token) {
    return NextResponse.json(
      { error: "GITHUB_REPO_OWNER, GITHUB_REPO_NAME and GITHUB_TOKEN must be configured" },
      { status: 500 },
    );
  }
  return { owner, repo, token, branch, prefix };
}

async function gh(path: string, init: RequestInit & { token: string }) {
  const { token, ...rest } = init;
  return fetch(`https://api.github.com${path}`, {
    ...rest,
    headers: {
      ...(rest.headers ?? {}),
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
}

/** Join the website prefix with a relative path. Never returns a leading slash
 *  (GitHub's contents API rejects paths that start with "/"). Tolerates an
 *  empty prefix, or a prefix that is just "/" or has stray slashes. */
function repoPath(prefix: string, relative: string): string {
  const rel = relative.replace(/^\/+/, "");
  const pre = (prefix || "").replace(/^\/+|\/+$/g, "");
  return pre ? `${pre}/${rel}` : rel;
}

async function fetchBlogTopics(env: ReturnType<typeof getEnv> & { owner: string; repo: string; token: string; branch: string; prefix: string }): Promise<BlogTopic[]> {
  const path = repoPath(env.prefix, "blog-topics.json");
  const res = await gh(`/repos/${env.owner}/${env.repo}/contents/${path}?ref=${env.branch}`, { method: "GET", token: env.token });
  if (!res.ok) throw new Error(`Failed to load blog-topics.json: ${res.status}`);
  const data = (await res.json()) as { content: string; encoding: "base64" };
  const decoded = Buffer.from(data.content, data.encoding).toString("utf8");
  const parsed = JSON.parse(decoded) as { topics: BlogTopic[] };
  return parsed.topics;
}

async function listPublishedSlugs(env: { owner: string; repo: string; token: string; branch: string; prefix: string }): Promise<Set<string>> {
  const path = repoPath(env.prefix, "app/blog");
  const res = await gh(`/repos/${env.owner}/${env.repo}/contents/${path}?ref=${env.branch}`, { method: "GET", token: env.token });
  if (!res.ok) return new Set();
  const items = (await res.json()) as Array<{ name: string; type: string }>;
  return new Set(items.filter((i) => i.type === "dir").map((i) => i.name));
}

async function generatePost(topic: BlogTopic, openaiKey: string): Promise<GeneratedPost> {
  const openai = new OpenAI({ apiKey: openaiKey });
  const userPrompt = `Write a blog post for the keyword "${topic.keyword}" with title "${topic.title}".

Audience: small business owners pursuing US federal government contracts (SAM.gov, SBA set-asides).
Length: 1,200-1,800 words. Concrete and useful. Cite real agencies and real programs.
Never invent statistics — say "usually", "most", "in our experience" instead of fake percentages.

Return ONLY valid JSON in this exact shape (no markdown fences):
{
  "intro_paragraph": "<one-paragraph opener that names the reader's actual problem in plain language>",
  "sections": [
    { "heading": "<H2>", "body_markdown": "<2-4 paragraphs of markdown, use ** for bold, - for lists>" }
  ],
  "conclusion": "<paragraph that leads into a soft mention of CapturePilot's free check at app.capturepilot.com/check>",
  "meta_description": "<≤160 char SEO description with the target keyword, in plain English>",
  "faq": [
    { "q": "<question someone would actually ask>", "a": "<concise 2-3 sentence answer>" }
  ]
}

Constraints:
- 5-7 sections.
- 4-6 FAQ entries.
- Each section's body_markdown can include sub-headings as ### Heading.
- Never recommend a specific paid tool other than CapturePilot or SAM.gov / official .gov sites.`;

  const chat = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0.55,
    max_tokens: 5500,
    messages: [
      { role: "system", content: HUMAN_VOICE_RULES },
      { role: "user", content: userPrompt },
    ],
  });

  const text = chat.choices[0]?.message?.content ?? "{}";
  return JSON.parse(text) as GeneratedPost;
}

function renderLayout(topic: BlogTopic, post: GeneratedPost): string {
  const url = `https://www.capturepilot.com/blog/${topic.slug}`;
  const today = new Date().toISOString().slice(0, 10);
  // Escape backticks and ${} just in case
  const desc = post.meta_description.replace(/"/g, "\\\"");

  return `import type { Metadata } from "next";
import { breadcrumbJsonLd, articleJsonLd, faqJsonLd } from "@/lib/schema";

export const metadata: Metadata = {
  title: ${JSON.stringify(topic.title)},
  description: ${JSON.stringify(desc)},
  keywords: ${JSON.stringify(topic.keyword)},
  alternates: { canonical: ${JSON.stringify(url)} },
  openGraph: {
    title: ${JSON.stringify(topic.title)},
    description: ${JSON.stringify(desc)},
    url: ${JSON.stringify(url)},
    type: "article",
  },
};

const FAQ = ${JSON.stringify(post.faq, null, 2)};

export default function Layout({ children }: { children: React.ReactNode }) {
  const breadcrumb = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Blog", path: "/blog" },
    { name: ${JSON.stringify(topic.title)}, path: ${JSON.stringify(`/blog/${topic.slug}`)} },
  ]);

  const article = articleJsonLd({
    title: ${JSON.stringify(topic.title)},
    description: ${JSON.stringify(desc)},
    url: ${JSON.stringify(url)},
    datePublished: ${JSON.stringify(today)},
    section: ${JSON.stringify(topic.category)},
    keywords: [${JSON.stringify(topic.keyword)}],
  });

  const faq = faqJsonLd(FAQ);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(article) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faq) }} />
      {children}
    </>
  );
}
`;
}

function renderPage(topic: BlogTopic, post: GeneratedPost): string {
  // Render markdown sections to React-friendly JSX
  const sectionBlocks = post.sections
    .map((s, i) => {
      const id = s.heading
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const body = renderMarkdown(s.body_markdown);
      return `        <section id=${JSON.stringify(id)} className="prose prose-stone max-w-none mb-12 scroll-mt-24">
          <h2 className="text-2xl md:text-3xl font-black text-stone-900 mt-12 mb-4">${escapeJsx(s.heading)}</h2>
${body}
        </section>`;
    })
    .join("\n");

  const faqBlocks = post.faq
    .map(
      (q) => `          <details className="border border-stone-200 rounded-xl p-5 group">
            <summary className="cursor-pointer font-bold text-stone-900 list-none flex items-center justify-between">
              <span>${escapeJsx(q.q)}</span>
              <span className="text-stone-400 group-open:rotate-180 transition-transform">▾</span>
            </summary>
            <p className="mt-3 text-sm text-stone-600 leading-relaxed">${escapeJsx(q.a)}</p>
          </details>`,
    )
    .join("\n");

  return `import Link from "next/link";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import { ArrowRight, ChevronRight } from "lucide-react";

const APP_URL = "https://app.capturepilot.com";

export default function Page() {
  return (
    <div className="min-h-screen bg-white">
      <SiteNav />

      <article className="pt-32 pb-16 px-6">
        <div className="max-w-3xl mx-auto">
          <nav className="flex items-center gap-2 text-sm text-stone-500 mb-6">
            <Link href="/" className="hover:text-black transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <Link href="/blog" className="hover:text-black transition-colors">Blog</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-stone-900 font-medium">${escapeJsx(topic.title)}</span>
          </nav>

          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-stone-900 mb-6 leading-[1.1]">
            ${escapeJsx(topic.title)}
          </h1>

          <p className="text-lg text-stone-600 leading-relaxed mb-12">
            ${escapeJsx(post.intro_paragraph)}
          </p>

${sectionBlocks}

          <section className="prose prose-stone max-w-none mb-12">
            <h2 className="text-2xl md:text-3xl font-black text-stone-900 mt-12 mb-4">Conclusion</h2>
            <p className="text-stone-700 leading-relaxed">${escapeJsx(post.conclusion)}</p>
          </section>

          <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-8 my-12 text-center">
            <p className="text-xs uppercase tracking-wider font-bold text-emerald-700 mb-2">Free Tool</p>
            <h3 className="text-xl md:text-2xl font-black text-emerald-900 mb-3">
              See your matching federal contracts in 30 seconds
            </h3>
            <p className="text-sm text-emerald-800 mb-6">
              Enter your website. Get your NAICS codes, SAM.gov status, set-aside eligibility,
              and live opportunities — free, no signup.
            </p>
            <Link
              href={\`\${APP_URL}/check\`}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-full font-bold text-sm transition-colors"
            >
              Run Free Check
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <section className="mt-16">
            <h2 className="text-2xl md:text-3xl font-black text-stone-900 mb-6">Frequently Asked Questions</h2>
            <div className="space-y-3">
${faqBlocks}
            </div>
          </section>
        </div>
      </article>

      <SiteFooter />
    </div>
  );
}
`;
}

function escapeJsx(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/{/g, "&#123;")
    .replace(/}/g, "&#125;");
}

function renderMarkdown(md: string): string {
  // Very small markdown-to-JSX converter: paragraphs, bold, lists, sub-headings.
  // Sufficient for the auto-publisher's narrow output shape — not a full md parser.
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (inList) { out.push("          </ul>"); inList = false; }
      continue;
    }
    if (line.startsWith("### ")) {
      if (inList) { out.push("          </ul>"); inList = false; }
      out.push(`          <h3 className="text-lg font-bold text-stone-900 mt-6 mb-2">${escapeJsx(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith("- ")) {
      if (!inList) { out.push("          <ul className=\"list-disc pl-6 space-y-1 text-stone-700\">"); inList = true; }
      out.push(`            <li>${inline(line.slice(2))}</li>`);
      continue;
    }
    if (inList) { out.push("          </ul>"); inList = false; }
    out.push(`          <p className="text-stone-700 leading-relaxed mb-4">${inline(line)}</p>`);
  }
  if (inList) out.push("          </ul>");
  return out.join("\n");
}

function inline(text: string): string {
  // bold via **
  return escapeJsx(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

async function commitFile(
  env: { owner: string; repo: string; token: string; branch: string; prefix: string },
  filePath: string,
  content: string,
  message: string,
): Promise<void> {
  const apiPath = `/repos/${env.owner}/${env.repo}/contents/${repoPath(env.prefix, filePath)}`;
  // Check for existing file (we only ever create new blog folders, so this should 404)
  const probe = await gh(`${apiPath}?ref=${env.branch}`, { method: "GET", token: env.token });
  let sha: string | undefined;
  if (probe.ok) {
    const data = (await probe.json()) as { sha: string };
    sha = data.sha;
  }
  const res = await gh(apiPath, {
    method: "PUT",
    token: env.token,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: Buffer.from(content, "utf8").toString("base64"),
      branch: env.branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`commit failed for ${filePath}: ${res.status} ${await res.text()}`);
  }
}

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}

async function GET_handler(req: NextRequest) {
  const denied = guardCron(req);
  if (denied) return denied;

  const env = getEnv();
  if (env instanceof NextResponse) return env;

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return NextResponse.json({ error: "OPENAI_API_KEY missing" }, { status: 500 });

  const url = new URL(req.url);
  const overrideSlug = url.searchParams.get("slug");
  const dry = url.searchParams.get("dry") === "1";
  const rewriteMode = url.searchParams.get("rewrite") === "1";
  const rewriteAll = url.searchParams.get("all") === "1";
  const limitParam = parseInt(url.searchParams.get("limit") || "0", 10);

  try {
    const topics = await fetchBlogTopics(env);
    const published = await listPublishedSlugs(env);

    // Bulk rewrite mode: regenerate every already-published post in HUMAN_VOICE.
    // Throttled, single endpoint call rewrites the whole site over ~5 min.
    if (rewriteMode && rewriteAll) {
      const targets = topics.filter(t => published.has(t.slug));
      const cap = limitParam > 0 ? Math.min(limitParam, targets.length) : targets.length;
      const results: Array<{ slug: string; ok: boolean; sections?: number; faq?: number; error?: string }> = [];
      for (let i = 0; i < cap; i++) {
        const t = targets[i];
        try {
          const post = await generatePost(t, openaiKey);
          if (!dry) {
            await commitFile(env, `app/blog/${t.slug}/layout.tsx`, renderLayout(t, post), `blog: rewrite ${t.slug} in human voice`);
            await commitFile(env, `app/blog/${t.slug}/page.tsx`, renderPage(t, post), `blog: rewrite ${t.slug} in human voice`);
          }
          results.push({ slug: t.slug, ok: true, sections: post.sections.length, faq: post.faq.length });
        } catch (e) {
          results.push({ slug: t.slug, ok: false, error: (e as Error).message });
        }
        // Throttle: GitHub Contents API + OpenAI rate limits
        if (i < cap - 1) await sleep(2000);
      }
      return NextResponse.json({
        ok: true,
        mode: dry ? "dry-rewrite-all" : "rewrite-all",
        processed: results.length,
        successes: results.filter(r => r.ok).length,
        failures: results.filter(r => !r.ok).length,
        results,
      });
    }

    // In rewrite mode the candidate must already be published; in normal mode it must NOT be.
    const candidate = overrideSlug
      ? topics.find((t) => t.slug === overrideSlug)
      : rewriteMode
        ? topics.find((t) => published.has(t.slug))
        : topics.find((t) => !published.has(t.slug));

    if (!candidate) {
      return NextResponse.json({ ok: true, message: rewriteMode
        ? "no published topics to rewrite — pass ?slug=<slug> or ?all=1"
        : "no unpublished topics remain — refill blog-topics.json" });
    }

    const post = await generatePost(candidate, openaiKey);

    if (dry) {
      return NextResponse.json({ ok: true, dry: true, mode: rewriteMode ? "rewrite" : "publish", slug: candidate.slug, sections: post.sections.length, faq: post.faq.length });
    }

    const layoutFile = `app/blog/${candidate.slug}/layout.tsx`;
    const pageFile = `app/blog/${candidate.slug}/page.tsx`;
    const verb = rewriteMode ? "rewrite" : "publish";

    await commitFile(env, layoutFile, renderLayout(candidate, post), `blog: ${verb} ${candidate.slug} (layout)`);
    await commitFile(env, pageFile, renderPage(candidate, post), `blog: ${verb} ${candidate.slug} (page)`);

    return NextResponse.json({
      ok: true,
      mode: rewriteMode ? "rewrite" : "publish",
      slug: candidate.slug,
      url: `https://www.capturepilot.com/blog/${candidate.slug}`,
      sections: post.sections.length,
      faq: post.faq.length,
    });
  } catch (e) {
    console.error("[publish_next_blog]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export const GET = withCronTelemetry("/api/cron/publish_next_blog", GET_handler);

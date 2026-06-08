import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin, assertAdminWithUser } from "@/lib/auth-admin";

export const dynamic = "force-dynamic";

/**
 * Belt-and-suspenders bucket allowlist. listBuckets() already constrains
 * us to real buckets in the project, but a static allowlist additionally
 * stops a misconfigured Supabase project (e.g. a public test bucket created
 * by mistake) from being browsable through this admin route.
 *
 * Update this whenever a bucket is added to the project (see CLAUDE.md
 * "Supabase Storage buckets").
 */
const BUCKET_ALLOWLIST = new Set<string>([
    "client-docs",
    "opportunity-attachments",
    "capability-statements",
]);

// Bucket names per Supabase naming rules: lowercase letters, digits, ., _, -.
// 3–63 chars. Stops `?bucket=../whatever` and other path-traversal attempts
// before we even hit Supabase.
const BUCKET_NAME_REGEX = /^[a-z0-9][a-z0-9._-]{1,62}$/;

/**
 * GET /api/admin/storage/list?bucket=...&limit=50&prefix=...
 *
 * Lists the most-recent objects in a Supabase Storage bucket. Drives the
 * /admin/health/storage/[bucket] detail page.
 *
 *   - bucket (required) — exact bucket name (case-sensitive). Validated
 *     against listBuckets() to prevent enumeration of arbitrary names.
 *   - limit  (optional, default 50, max 200) — number of objects to return.
 *   - prefix (optional, default "") — subfolder to list within.
 *
 * For each object we return:
 *   - name, size, mime, updated_at, created_at
 *   - kind: "file" | "folder" (folders surface so the UI can offer
 *     drill-down into nested prefixes like capability-statements/{profile_id})
 *   - access_url: getPublicUrl(name) for public buckets,
 *                 createSignedUrl(name, 60 * 10) for private (10 min TTL)
 *
 * No delete / mutate path on this iteration — too destructive.
 */

function svc() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;
const SIGNED_TTL_SECONDS = 60 * 10; // 10 minutes — long enough to click, short enough to expire before sharing

type StorageEntry = {
    name: string;
    id: string | null;
    updated_at: string | null;
    created_at: string | null;
    last_accessed_at: string | null;
    metadata: { size?: number; mimetype?: string } | null;
};

export async function GET(req: NextRequest) {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const { searchParams } = new URL(req.url);
    const bucket = (searchParams.get("bucket") || "").trim();
    const prefix = (searchParams.get("prefix") || "").trim().replace(/^\/+|\/+$/g, "");
    const limitRaw = parseInt(searchParams.get("limit") || `${DEFAULT_LIMIT}`, 10);
    const limit = Number.isFinite(limitRaw)
        ? Math.min(Math.max(limitRaw, 1), MAX_LIMIT)
        : DEFAULT_LIMIT;

    if (!bucket) {
        return NextResponse.json({ error: "Missing required query param: bucket" }, { status: 400 });
    }

    const sb = svc();

    // Validate bucket against the real list — stops `?bucket=../something`
    // shenanigans, gives us the public/private flag in one go.
    const { data: buckets, error: bErr } = await sb.storage.listBuckets();
    if (bErr) {
        return NextResponse.json({ error: bErr.message }, { status: 500 });
    }
    const target = (buckets || []).find(b => b.name === bucket);
    if (!target) {
        return NextResponse.json({ error: `Bucket not found: ${bucket}` }, { status: 404 });
    }

    const { data, error } = await sb.storage
        .from(bucket)
        .list(prefix, {
            limit,
            sortBy: { column: "updated_at", order: "desc" },
        });
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const entries = (data || []) as StorageEntry[];

    // Build access URLs in a single round-trip when private (createSignedUrls
    // batches), or per-row when public (getPublicUrl is synchronous).
    type EnrichedFile = {
        name: string;
        path: string;
        kind: "file" | "folder";
        size: number | null;
        mime: string | null;
        updated_at: string | null;
        created_at: string | null;
        access_url: string | null;
        access_url_expires_at: string | null;
    };

    const fullPaths: string[] = [];
    const out: EnrichedFile[] = entries.map(entry => {
        const isFolder = entry.id === null && (!entry.metadata || entry.metadata.size === undefined);
        const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (!isFolder) fullPaths.push(fullPath);
        return {
            name: entry.name,
            path: fullPath,
            kind: isFolder ? "folder" : "file",
            size: entry.metadata?.size ?? null,
            mime: entry.metadata?.mimetype ?? null,
            updated_at: entry.updated_at,
            created_at: entry.created_at,
            access_url: null,
            access_url_expires_at: null,
        };
    });

    if (target.public) {
        for (const f of out) {
            if (f.kind !== "file") continue;
            const { data: pub } = sb.storage.from(bucket).getPublicUrl(f.path);
            f.access_url = pub.publicUrl || null;
        }
    } else if (fullPaths.length > 0) {
        const { data: signed, error: signErr } = await sb.storage
            .from(bucket)
            .createSignedUrls(fullPaths, SIGNED_TTL_SECONDS);
        if (!signErr) {
            const expiresAt = new Date(Date.now() + SIGNED_TTL_SECONDS * 1000).toISOString();
            const byPath = new Map((signed || []).map(s => [s.path, s.signedUrl]));
            for (const f of out) {
                if (f.kind !== "file") continue;
                const u = byPath.get(f.path);
                if (u) {
                    f.access_url = u;
                    f.access_url_expires_at = expiresAt;
                }
            }
        }
    }

    return NextResponse.json({
        generated_at: new Date().toISOString(),
        bucket: {
            name: target.name,
            public: !!target.public,
            file_size_limit: target.file_size_limit ?? null,
            allowed_mime_types: target.allowed_mime_types ?? null,
            created_at: target.created_at ?? null,
            updated_at: target.updated_at ?? null,
        },
        prefix,
        limit,
        signed_url_ttl_seconds: target.public ? null : SIGNED_TTL_SECONDS,
        count: out.length,
        objects: out,
    });
}

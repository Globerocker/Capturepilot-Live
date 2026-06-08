import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth-admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/storage/buckets — power the /admin/health/storage overview.
 *
 * Returns one row per Supabase Storage bucket, computed by:
 *   1. listBuckets() — get bucket names, public/private flag, created_at.
 *   2. For each bucket, sample up to 1000 objects at root (depth ≥ 0) using
 *      `storage.from(b).list("", { limit: 1000, sortBy: { column: "updated_at", order: "desc" } })`.
 *      Sum size, count objects, take the newest updated_at as "latest_upload".
 *
 * Notes:
 *   - "object count" is bounded by 1000 per bucket on this iteration. The
 *     SDK doesn't expose a cheap COUNT(*) over storage.objects; doing a
 *     full pagination loop would be 100s of calls on the large buckets.
 *     For an exact figure we'd query storage.objects via SQL — out of scope
 *     for this read-only summary. The UI labels totals as "~N (sampled)".
 *   - For nested folders (e.g. capability-statements/{profile_id}/file.pdf)
 *     `storage.list("")` only returns the top-level prefix, not the leaves.
 *     We therefore recurse one level into top-level "folders" so the size
 *     totals reflect real content, not just root files.
 */

function svc() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!,
        { auth: { persistSession: false } },
    );
}

type StorageEntry = {
    name: string;
    id: string | null;
    updated_at: string | null;
    created_at: string | null;
    last_accessed_at: string | null;
    metadata: { size?: number; mimetype?: string } | null;
};

type BucketSummary = {
    name: string;
    id: string;
    public: boolean;
    created_at: string | null;
    updated_at: string | null;
    object_count: number;
    total_bytes: number;
    latest_upload: string | null;
    sampled: boolean;          // true when count is the sample ceiling
    sample_limit: number;
    file_size_limit: number | null;
    allowed_mime_types: string[] | null;
    error?: string;
};

const ROOT_SAMPLE = 1000;
const SUB_SAMPLE  = 200;

export async function GET() {
    const unauth = await assertAdmin();
    if (unauth) return unauth;

    const sb = svc();
    const { data: buckets, error: bErr } = await sb.storage.listBuckets();
    if (bErr) {
        return NextResponse.json({ error: bErr.message }, { status: 500 });
    }

    const results: BucketSummary[] = [];

    for (const b of buckets || []) {
        const summary: BucketSummary = {
            name: b.name,
            id: b.id,
            public: !!b.public,
            created_at: b.created_at ?? null,
            updated_at: b.updated_at ?? null,
            object_count: 0,
            total_bytes: 0,
            latest_upload: null,
            sampled: false,
            sample_limit: ROOT_SAMPLE,
            file_size_limit: b.file_size_limit ?? null,
            allowed_mime_types: b.allowed_mime_types ?? null,
        };

        try {
            // Root listing first — captures both top-level files and "folder"
            // pseudo-entries. Folder entries have `id === null && metadata === null`
            // per Supabase Storage conventions.
            const { data: rootData, error: rootErr } = await sb.storage
                .from(b.name)
                .list("", {
                    limit: ROOT_SAMPLE,
                    sortBy: { column: "updated_at", order: "desc" },
                });
            if (rootErr) throw rootErr;

            const root = (rootData || []) as StorageEntry[];
            const files: StorageEntry[] = [];
            const folders: string[] = [];

            for (const entry of root) {
                const isFolder = entry.id === null && (!entry.metadata || entry.metadata.size === undefined);
                if (isFolder) folders.push(entry.name);
                else files.push(entry);
            }

            // Walk one level into each top-level folder. We don't recurse
            // further on this iteration — too many round trips on buckets
            // like capability-statements/{profile_id}/file.pdf.
            for (const folder of folders) {
                const { data: subData, error: subErr } = await sb.storage
                    .from(b.name)
                    .list(folder, {
                        limit: SUB_SAMPLE,
                        sortBy: { column: "updated_at", order: "desc" },
                    });
                if (subErr) continue;
                for (const entry of (subData || []) as StorageEntry[]) {
                    const isFolder = entry.id === null && (!entry.metadata || entry.metadata.size === undefined);
                    if (!isFolder) files.push({ ...entry, name: `${folder}/${entry.name}` });
                }
            }

            for (const f of files) {
                summary.total_bytes += f.metadata?.size ?? 0;
                const ts = f.updated_at || f.created_at;
                if (ts && (!summary.latest_upload || ts > summary.latest_upload)) {
                    summary.latest_upload = ts;
                }
            }
            summary.object_count = files.length;
            summary.sampled = root.length >= ROOT_SAMPLE; // root saturated → likely undercounted
        } catch (e) {
            summary.error = (e as Error).message;
        }

        results.push(summary);
    }

    // Total roll-up for the page header strip.
    const totalBuckets = results.length;
    const totalObjects = results.reduce((s, r) => s + r.object_count, 0);
    const totalBytes = results.reduce((s, r) => s + r.total_bytes, 0);
    const publicBuckets = results.filter(r => r.public).length;

    return NextResponse.json({
        generated_at: new Date().toISOString(),
        totals: {
            buckets: totalBuckets,
            public_buckets: publicBuckets,
            objects: totalObjects,
            bytes: totalBytes,
        },
        buckets: results.sort((a, b) => b.total_bytes - a.total_bytes),
    });
}

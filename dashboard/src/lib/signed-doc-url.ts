import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Mints a short-lived signed URL for a file in the `client-docs` bucket.
 *
 * The bucket is private — callers must NOT use `getPublicUrl()`. Reads must
 * always re-sign from the stored `storage_path` so link sharing is bounded.
 *
 * @param sb Supabase client (any of browser/server/service-role).
 * @param path Storage object path inside `client-docs`.
 * @param ttlSec Seconds the signed URL is valid for. Default 300 (5 min).
 */
export async function signedDocUrl(
  sb: SupabaseClient,
  path: string,
  ttlSec = 300
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await sb.storage
    .from("client-docs")
    .createSignedUrl(path, ttlSec);
  if (error) {
    console.error("[signed-doc-url]", path, error.message);
    return null;
  }
  return data.signedUrl;
}

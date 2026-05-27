-- 094: hash-based cache for PDF / DOCX extraction results
--
-- analyze_match_attachments re-runs Tika / Mistral OCR per opportunity,
-- but many opps point at the same boilerplate attachments (FAR clause
-- riders, agency-standard cover sheets, etc). With Tika typically 200ms
-- + Mistral ~2-8s of paid-API time per PDF, deduplicating identical bytes
-- saves both wall-clock and money.
--
-- Cache key = sha256 of the raw bytes. Stores the extracted text + which
-- extractor produced it. TTL handled at read-time by the caller (current
-- consumers always want freshness or never want it — no in-table expiry).

create table if not exists public.pdf_extract_cache (
    content_hash    text primary key,
    extracted_text  text not null,
    bytes_size      int  not null,
    source          text not null check (source in ('tika', 'mistral', 'regex')),
    accessed_count  int  not null default 1,
    created_at      timestamptz not null default now(),
    last_accessed   timestamptz not null default now()
);

create index if not exists pdf_extract_cache_last_accessed_idx
    on public.pdf_extract_cache (last_accessed desc);

-- service_role only; no anon/auth access
alter table public.pdf_extract_cache enable row level security;

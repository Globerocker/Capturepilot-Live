#!/usr/bin/env python3
"""
Tool 13: Attachment Downloader & Text Extraction

Downloads SOW/RFP/attachment files from SAM.gov resource_links,
extracts text from PDFs and documents, stores extracted text in
opportunity_attachments table for requirement analysis.

Uses SAM API key for authenticated downloads.

Usage:
    python3 tools/13_download_attachments.py [--limit N] [--workers N]
"""
import os, sys, re, time, io, hashlib
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests

def load_env():
    for fp in [os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), f) for f in (".env.local", ".env")]:
        if os.path.exists(fp):
            with open(fp) as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        k, v = line.split('=', 1)
                        os.environ[k.strip()] = v.strip().strip("'").strip('"')

load_env()

from supabase import create_client

sb = create_client(
    os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_KEY")
)

SAM_KEY = os.getenv("SAM_API_KEY")
session = requests.Session()
session.headers.update({"X-Api-Key": SAM_KEY})

# Try importing PDF extraction library
try:
    import PyPDF2
    HAS_PYPDF2 = True
except ImportError:
    HAS_PYPDF2 = False
    print("Warning: PyPDF2 not installed. PDF text extraction disabled.", flush=True)
    print("  Install with: pip install PyPDF2", flush=True)


def extract_text_from_pdf(content_bytes):
    """Extract text from PDF bytes."""
    if not HAS_PYPDF2:
        return ""
    try:
        reader = PyPDF2.PdfReader(io.BytesIO(content_bytes))
        text = ""
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
        return text.strip()
    except Exception as e:
        return f"[PDF extraction error: {e}]"


def extract_text_from_html(content):
    """Extract text from HTML content."""
    text = re.sub(r'<script[^>]*>.*?</script>', '', content, flags=re.DOTALL)
    text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def extract_requirements_from_text(text):
    """Extract structured requirements from document text."""
    if not text or len(text) < 50:
        return {}

    lower = text.lower()
    reqs = {}

    # Workforce/staffing
    m = re.search(r'(\d+)\s*(?:employee|worker|personnel|staff|fte|full.time)', lower)
    if m:
        reqs["min_workforce"] = int(m.group(1))

    # Experience requirements
    m = re.search(r'(\d+)\s*(?:year|yr)s?\s*(?:of\s+)?(?:experience|exp)', lower)
    if m:
        reqs["years_experience"] = int(m.group(1))

    # Bonding
    if re.search(r'\bbond(?:ing|ed)?\b', lower):
        m = re.search(r'bond[^.]*?\$\s*([\d,.]+\s*(?:million|m|k)?)', lower)
        reqs["bonding_req"] = f"${m.group(1)}" if m else "Required"

    # Insurance
    if re.search(r'\binsurance\b|\bliability\b', lower):
        m = re.search(r'(?:insurance|liability)[^.]*?\$\s*([\d,.]+\s*(?:million|m|k)?)', lower)
        reqs["insurance_req"] = f"${m.group(1)}" if m else "Required"

    # Performance period
    m = re.search(r'(?:period\s+of\s+performance|base\s+(?:year|period)|contract\s+(?:period|duration))[^.]*?(\d+)\s*(year|month|day|week)', lower)
    if m:
        reqs["performance_period"] = f"{m.group(1)} {m.group(2)}{'s' if int(m.group(1)) > 1 else ''}"

    # Security clearance
    if re.search(r'\btop\s+secret\b|\bts[/ ]sci\b', lower):
        reqs["clearance_level"] = "Top Secret"
    elif re.search(r'\bsecret\b(?!\s*(?:service|ary|ion))', lower):
        reqs["clearance_level"] = "Secret"
    elif re.search(r'\bbackground\s+(?:check|investigation)\b|\bsuitability\b', lower):
        reqs["clearance_level"] = "Background Check"

    # Certifications
    cert_map = [
        (r'\biso\s*\d{4,5}', "ISO"),
        (r'\bosha', "OSHA"),
        (r'\bcmmi', "CMMI"),
        (r'\bleed\b', "LEED"),
        (r'\bjoint\s+commission', "Joint Commission"),
    ]
    certs = [label for pat, label in cert_map if re.search(pat, lower)]
    if certs:
        reqs["certifications"] = ", ".join(certs)

    # Evaluation criteria
    ev = re.search(r'evaluation\s+(?:criteria|factor)[^]*?(?:\n\n|\.$)', text[:5000], re.IGNORECASE)
    if ev:
        reqs["eval_criteria_summary"] = ev.group(0)[:500].strip()

    # Key dates
    dates = re.findall(r'(?:due|deadline|submit|response)[^.]*?(\d{1,2}/\d{1,2}/\d{2,4})', lower)
    if dates:
        reqs["key_dates"] = dates[:5]

    return reqs


def get_file_type(url, content_type="", filename="", content_bytes=b""):
    """Determine file type from URL, content-type, filename, or magic bytes."""
    url_lower = url.lower()
    fn_lower = filename.lower()
    combined = url_lower + " " + fn_lower + " " + content_type.lower()

    # Check magic bytes first (most reliable)
    if content_bytes[:5] == b"%PDF-":
        return "pdf"
    if content_bytes[:2] == b"PK":  # ZIP/DOCX/XLSX
        if fn_lower.endswith(".docx") or fn_lower.endswith(".doc"):
            return "docx"
        if fn_lower.endswith(".xlsx") or fn_lower.endswith(".xls"):
            return "xlsx"
        return "zip"

    # Then check filename, URL, and content-type
    if ".pdf" in combined or "application/pdf" in combined:
        return "pdf"
    elif any(ext in combined for ext in [".doc", ".docx", "word"]):
        return "docx"
    elif any(ext in combined for ext in [".xls", ".xlsx", "spreadsheet"]):
        return "xlsx"
    elif ".htm" in combined or "text/html" in combined:
        return "html"
    elif ".txt" in combined or "text/plain" in combined:
        return "text"
    elif ".zip" in combined:
        return "zip"

    # Fallback: check if content looks like HTML or text
    if content_bytes:
        try:
            text_start = content_bytes[:500].decode("utf-8", errors="ignore").strip()
            if text_start.startswith("<") or text_start.startswith("<!"):
                return "html"
            if text_start and all(c.isprintable() or c in "\n\r\t" for c in text_start[:200]):
                return "text"
        except Exception:
            pass

    return "unknown"


def process_opportunity(opp):
    """Download and process all attachments for an opportunity."""
    opp_id = opp["id"]
    links = opp.get("resource_links") or []

    if not links or not isinstance(links, list):
        return ("no_links", opp_id, 0)

    downloaded = 0
    all_text = ""
    all_reqs = {}

    for link_url in links:
        if not link_url or not isinstance(link_url, str):
            continue

        try:
            # Download the file (use plain session, not SAM API auth)
            dl_session = requests.Session()
            r = dl_session.get(link_url, timeout=30, allow_redirects=True)
            if r.status_code != 200:
                continue

            content_type = r.headers.get("content-type", "")
            file_size = len(r.content)

            # Extract filename from URL or content-disposition
            cd = r.headers.get("content-disposition", "")
            if "filename=" in cd:
                fn_match = re.search(r'filename="?([^";\n]+)', cd)
                filename = fn_match.group(1).strip() if fn_match else link_url.split("/")[-1]
            else:
                filename = link_url.split("/")[-1].split("?")[0]
                if not filename or filename == "" or filename == "download":
                    filename = f"attachment_{hashlib.md5(link_url.encode()).hexdigest()[:8]}"

            # Detect file type using all available signals including content bytes
            file_type = get_file_type(link_url, content_type, filename, r.content[:10])

            # Fix filename extension if missing
            if file_type != "unknown" and "." not in filename:
                ext_map = {"pdf": ".pdf", "docx": ".docx", "xlsx": ".xlsx", "html": ".html", "text": ".txt", "zip": ".zip"}
                filename += ext_map.get(file_type, "")

            # Extract text based on file type
            extracted_text = ""
            if file_type == "pdf":
                extracted_text = extract_text_from_pdf(r.content)
            elif file_type == "html":
                extracted_text = extract_text_from_html(r.text)
            elif file_type == "text":
                extracted_text = r.text[:50000]  # Limit text size

            # Extract requirements from text
            doc_reqs = extract_requirements_from_text(extracted_text) if extracted_text else {}

            # Check if already exists (by URL to avoid duplicates)
            existing = sb.table("opportunity_attachments") \
                .select("id") \
                .eq("opportunity_id", opp_id) \
                .eq("file_url", link_url) \
                .limit(1) \
                .execute()

            attachment_data = {
                "opportunity_id": opp_id,
                "filename": filename[:255],
                "file_url": link_url,
                "file_type": file_type,
                "file_size_bytes": file_size,
                "extracted_text": extracted_text[:100000] if extracted_text else None,
                "requirements_extracted": doc_reqs if doc_reqs else {},
                "downloaded_at": datetime.now().isoformat()
            }

            if existing.data:
                sb.table("opportunity_attachments").update(attachment_data).eq("id", existing.data[0]["id"]).execute()
            else:
                sb.table("opportunity_attachments").insert(attachment_data).execute()

            downloaded += 1

            if extracted_text:
                all_text += extracted_text + "\n"
            if doc_reqs:
                all_reqs.update(doc_reqs)

        except Exception as e:
            continue

    # If we extracted requirements from attachments, update the opportunity
    if all_reqs:
        existing = opp.get("structured_requirements") or {}
        if isinstance(existing, str):
            try:
                import json
                existing = json.loads(existing)
            except Exception:
                existing = {}

        # Merge - attachment data supplements but doesn't overwrite
        merged = {**all_reqs, **existing}
        sb.table("opportunities").update({
            "structured_requirements": merged,
            "requirements_extracted": all_reqs
        }).eq("id", opp_id).execute()

    return ("ok", opp_id, downloaded)


def main():
    limit = 1000
    workers = 3

    for arg in sys.argv[1:]:
        if arg.startswith("--limit="):
            limit = int(arg.split("=")[1])
        elif arg.startswith("--workers="):
            workers = int(arg.split("=")[1])

    print("=" * 60)
    print("  Tool 13: Attachment Downloader & Text Extraction")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  Limit: {limit} | Workers: {workers}")
    print(f"  PDF extraction: {'Enabled' if HAS_PYPDF2 else 'DISABLED (install PyPDF2)'}")
    print("=" * 60)

    # Get opportunities with resource_links that haven't been processed
    all_opps = []
    offset = 0
    while len(all_opps) < limit:
        batch = min(500, limit - len(all_opps))
        # Get opps with resource_links that are non-empty arrays
        res = sb.table("opportunities") \
            .select("id, resource_links, structured_requirements") \
            .neq("resource_links", "[]") \
            .not_.is_("resource_links", "null") \
            .order("posted_date", desc=True) \
            .range(offset, offset + batch - 1) \
            .execute()

        if not res.data:
            break

        # Filter to only those with actual links
        for opp in res.data:
            links = opp.get("resource_links")
            if links and isinstance(links, list) and len(links) > 0:
                all_opps.append(opp)

        offset += batch
        if len(res.data) < batch:
            break

    print(f"\nFound {len(all_opps)} opportunities with attachments to process", flush=True)

    if not all_opps:
        print("Nothing to process!")
        return

    ok = 0
    no_links = 0
    fail = 0
    total_files = 0
    start = time.time()

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(process_opportunity, opp): opp for opp in all_opps}

        for i, future in enumerate(as_completed(futures), 1):
            try:
                status, opp_id, count = future.result()
                if status == "ok":
                    ok += 1
                    total_files += count
                elif status == "no_links":
                    no_links += 1
                else:
                    fail += 1
            except Exception:
                fail += 1

            if i % 50 == 0:
                elapsed = time.time() - start
                rate = i / elapsed if elapsed > 0 else 0
                print(f"  [{i}/{len(all_opps)}] processed={ok} files={total_files} fail={fail} | {rate:.1f}/sec", flush=True)

    elapsed = time.time() - start
    print(f"\nDone in {elapsed:.0f}s ({elapsed/60:.1f}min)")
    print(f"  Opportunities processed: {ok}")
    print(f"  Total files downloaded: {total_files}")
    print(f"  No links: {no_links}")
    print(f"  Failed: {fail}")


if __name__ == "__main__":
    main()

"""
Tool 10: Batch Description & Resource Enrichment

Fetches actual description HTML from SAM.gov for all opportunities,
extracts resource_links from raw_json, and does lightweight requirements extraction.

Usage:
    python tools/10_enrich_descriptions.py [--limit N] [--skip-descriptions]
"""
import os
import re
import sys
import time
import requests
from datetime import datetime

def load_env_file(filepath=".env"):
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    os.environ[k.strip()] = v.strip().strip("'").strip('"')

_script_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.dirname(_script_dir)
load_env_file(os.path.join(_project_root, ".env.local"))
load_env_file(os.path.join(_project_root, ".env"))

from supabase import create_client, Client

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
SAM_API_KEY = os.getenv("SAM_API_KEY")

BATCH_SIZE = 50
REQUEST_DELAY = 0.5  # seconds between SAM.gov API calls
MAX_RETRIES = 3


# ---------------------------------------------------------------------------
# REQUIREMENTS EXTRACTION (from description text)
# ---------------------------------------------------------------------------
def extract_requirements(html_text):
    """Lightweight requirements extraction from description HTML."""
    if not html_text:
        return {}

    # Strip HTML tags
    text = re.sub(r'<[^>]+>', ' ', html_text)
    text = re.sub(r'\s+', ' ', text).strip()
    lower = text.lower()
    reqs = {}

    # Workforce / employees
    wf = re.search(r'(\d+)\s*(?:employee|worker|personnel|staff|fte)', lower)
    if wf:
        reqs["min_workforce"] = int(wf.group(1))

    # Years of experience
    yr = re.search(r'(\d+)\s*(?:year|yr)s?\s*(?:of\s+)?(?:experience|exp\.?|relevant)', lower)
    if yr:
        reqs["years_experience"] = int(yr.group(1))

    # Bonding
    if re.search(r'\bbond(?:ing|ed)?\b', lower):
        ba = re.search(r'bond(?:ing|ed)?[^.]*?\$\s*([\d,.]+\s*(?:million|m|k)?)', lower)
        reqs["bonding_req"] = f"${ba.group(1)}" if ba else "Required"

    # Insurance
    if re.search(r'\binsurance\b|\bliability\b', lower):
        ins = re.search(r'(?:insurance|liability)[^.]*?\$\s*([\d,.]+\s*(?:million|m|k)?)', lower)
        reqs["insurance_req"] = f"${ins.group(1)}" if ins else "Required"

    # Performance period
    pp = re.search(r'(?:period\s+of\s+performance|base\s+(?:year|period)|contract\s+(?:period|duration))[^.]*?(\d+)\s*(year|month|day|week)', lower)
    if pp:
        reqs["performance_period"] = f"{pp.group(1)} {pp.group(2)}{'s' if int(pp.group(1)) > 1 else ''}"
    else:
        alt = re.search(r'(\d+)\s*(?:-?\s*)?(?:base|option)\s*year', lower)
        if alt:
            reqs["performance_period"] = f"{alt.group(1)} year base"

    # Equipment
    equip_kws = [
        "fleet", "truck", "vehicle", "excavator", "bulldozer", "crane", "forklift",
        "mower", "tractor", "backhoe", "loader", "paving", "chipper", "aerial lift",
        "pressure washer", "buffer", "floor machine", "vacuum", "carpet cleaner"
    ]
    found = [eq for eq in equip_kws if eq in lower]
    if found:
        reqs["equipment_req"] = ", ".join(found)

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
    ]
    certs = [label for pat, label in cert_map if re.search(pat, lower)]
    if certs:
        reqs["certifications"] = ", ".join(certs)

    # Evaluation criteria snippet
    ev = re.search(r'evaluation\s+(?:criteria|factor)[^]*?(?:\n\n|\.$)', text[:3000], re.IGNORECASE)
    if ev:
        reqs["eval_criteria_summary"] = ev.group(0)[:500].strip()

    return reqs


# ---------------------------------------------------------------------------
# RESOURCE LINKS EXTRACTION (from raw_json)
# ---------------------------------------------------------------------------
def extract_resource_links(raw_json):
    """Extract resource/attachment links from raw_json."""
    if not raw_json or not isinstance(raw_json, dict):
        return []

    links = []

    # Primary: resourceLinks array
    resource_links = raw_json.get("resourceLinks", [])
    if isinstance(resource_links, list):
        for rl in resource_links:
            url = rl if isinstance(rl, str) else (rl.get("url", "") if isinstance(rl, dict) else "")
            if url:
                links.append(url)

    # Secondary: attachments
    attachments = raw_json.get("attachments", [])
    if isinstance(attachments, list):
        for att in attachments:
            if isinstance(att, dict):
                url = att.get("url") or att.get("link") or att.get("accessUrl", "")
                if url:
                    links.append(url)

    return list(set(links))


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------
def enrich_descriptions(limit=None, skip_descriptions=False):
    if not all([SUPABASE_URL, SUPABASE_SERVICE_KEY, SAM_API_KEY]):
        print("Missing API keys in .env")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    print(f"{'='*60}")
    print(f"  Tool 10: Batch Description & Resource Enrichment")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}")

    # =====================================================================
    # PHASE 1: Extract resource_links from raw_json (no API calls needed)
    # =====================================================================
    print("\n--- Phase 1: Extracting resource_links from raw_json ---")

    offset = 0
    resource_updated = 0

    while True:
        res = supabase.table("opportunities") \
            .select("id, raw_json, resource_links") \
            .not_.is_("raw_json", "null") \
            .range(offset, offset + BATCH_SIZE - 1) \
            .execute()

        if not res.data:
            break

        updates = []
        for opp in res.data:
            existing_links = opp.get("resource_links") or []
            raw_links = extract_resource_links(opp.get("raw_json"))

            if raw_links and len(raw_links) > len(existing_links):
                updates.append({
                    "id": opp["id"],
                    "resource_links": raw_links
                })

        if updates:
            for u in updates:
                supabase.table("opportunities").update({
                    "resource_links": u["resource_links"]
                }).eq("id", u["id"]).execute()
            resource_updated += len(updates)
            print(f"  Updated {len(updates)} resource_links (batch at offset {offset})")

        offset += BATCH_SIZE
        if len(res.data) < BATCH_SIZE:
            break

    print(f"  Total resource_links updated: {resource_updated}")

    # =====================================================================
    # PHASE 2: Fetch description HTML from SAM.gov
    # =====================================================================
    if skip_descriptions:
        print("\n--- Skipping Phase 2 (descriptions) ---")
    else:
        print("\n--- Phase 2: Fetching descriptions from SAM.gov ---")

        # Get all opportunities that have a URL in description field (not actual content)
        offset = 0
        desc_updated = 0
        desc_failed = 0
        total_to_process = 0

        # First count
        count_res = supabase.table("opportunities") \
            .select("id", count="exact") \
            .like("description", "https://api.sam.gov%") \
            .execute()
        total_to_process = count_res.count or 0
        print(f"  Opportunities needing description fetch: {total_to_process}")

        if limit:
            total_to_process = min(total_to_process, limit)
            print(f"  Limited to: {total_to_process}")

        processed = 0
        offset = 0

        while processed < total_to_process:
            batch_size = min(BATCH_SIZE, total_to_process - processed)
            res = supabase.table("opportunities") \
                .select("id, notice_id, description") \
                .like("description", "https://api.sam.gov%") \
                .range(offset, offset + batch_size - 1) \
                .execute()

            if not res.data:
                break

            for opp in res.data:
                notice_id = opp.get("notice_id")
                if not notice_id:
                    continue

                # Fetch description from SAM.gov
                desc_url = f"https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid={notice_id}"

                for attempt in range(MAX_RETRIES):
                    try:
                        r = requests.get(desc_url, headers={"X-Api-Key": SAM_API_KEY}, timeout=15)

                        if r.status_code == 429:
                            wait = 10 * (attempt + 1)
                            print(f"    Rate limited. Waiting {wait}s...")
                            time.sleep(wait)
                            continue

                        if r.status_code == 200:
                            data = r.json() if "application/json" in r.headers.get("content-type", "") or "hal+json" in r.headers.get("content-type", "") else {"description": r.text}
                            desc_html = data.get("description", r.text)

                            if desc_html and len(desc_html) > 20:
                                # Extract requirements from description
                                reqs = extract_requirements(desc_html)

                                update_payload = {"description": desc_html}
                                if reqs:
                                    update_payload["structured_requirements"] = reqs

                                supabase.table("opportunities").update(update_payload).eq("id", opp["id"]).execute()
                                desc_updated += 1
                            break
                        elif r.status_code == 404:
                            # No description available
                            supabase.table("opportunities").update({
                                "description": "No description available from SAM.gov"
                            }).eq("id", opp["id"]).execute()
                            break
                        else:
                            if attempt == MAX_RETRIES - 1:
                                desc_failed += 1
                            time.sleep(2)

                    except Exception as e:
                        if attempt == MAX_RETRIES - 1:
                            desc_failed += 1
                            print(f"    Error for {notice_id[:20]}: {e}")

                processed += 1
                time.sleep(REQUEST_DELAY)

                if processed % 50 == 0:
                    print(f"  Progress: {processed}/{total_to_process} ({desc_updated} updated, {desc_failed} failed)")

            # Don't increment offset since we're filtering by "https://api.sam.gov%"
            # and updating those records, so the next query skips already-updated ones

        print(f"\n  Descriptions updated: {desc_updated}")
        print(f"  Descriptions failed: {desc_failed}")

    # =====================================================================
    # PHASE 3: Fill structured_requirements for NULL description opps too
    # =====================================================================
    print("\n--- Phase 3: Extracting requirements from already-stored descriptions ---")

    offset = 0
    reqs_updated = 0

    while True:
        res = supabase.table("opportunities") \
            .select("id, description, structured_requirements") \
            .not_.like("description", "https://api.sam.gov%") \
            .not_.is_("description", "null") \
            .is_("structured_requirements", "null") \
            .range(offset, offset + BATCH_SIZE - 1) \
            .execute()

        if not res.data:
            break

        for opp in res.data:
            desc = opp.get("description", "")
            if not desc or len(desc) < 50:
                continue

            reqs = extract_requirements(desc)
            if reqs:
                supabase.table("opportunities").update({
                    "structured_requirements": reqs
                }).eq("id", opp["id"]).execute()
                reqs_updated += 1

        offset += BATCH_SIZE
        if len(res.data) < BATCH_SIZE:
            break

    print(f"  Additional requirements extracted: {reqs_updated}")

    print(f"\n{'='*60}")
    print(f"  Enrichment complete!")
    print(f"  Resource links updated: {resource_updated}")
    if not skip_descriptions:
        print(f"  Descriptions fetched: {desc_updated}")
    print(f"  Requirements extracted: {reqs_updated}")
    print(f"{'='*60}")


if __name__ == "__main__":
    lim = None
    skip_desc = False

    for arg in sys.argv[1:]:
        if arg.startswith("--limit="):
            lim = int(arg.split("=")[1])
        elif arg == "--skip-descriptions":
            skip_desc = True

    enrich_descriptions(limit=lim, skip_descriptions=skip_desc)

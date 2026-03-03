"""
Tool 9: Attachment Intelligence Engine
Downloads opportunity attachments (PDFs, DOCXs) from SAM.gov resource links
and extracts key requirements (bonding, clearance, equipment, certifications).

Reuses regex patterns from tool 6 (6_attachment_intelligence.py).
"""
import os
import sys
import re
import time
import json
import tempfile
import requests
from datetime import datetime
from supabase import create_client, Client

try:
    import PyPDF2
    HAS_PDF = True
except ImportError:
    HAS_PDF = False
    print("⚠️ PyPDF2 not installed. PDF extraction disabled.")
    print("   Install with: pip install PyPDF2")

try:
    import docx
    HAS_DOCX = True
except ImportError:
    HAS_DOCX = False
    print("⚠️ python-docx not installed. DOCX extraction disabled.")
    print("   Install with: pip install python-docx")

# ---------------------------------------------------------------------------
# ENV LOADING
# ---------------------------------------------------------------------------
def load_env_file(filepath=".env"):
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    os.environ[k.strip()] = v.strip().strip("'").strip('"')

load_env_file(".env.local")
load_env_file(".env")

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
SAM_API_KEY = os.getenv("SAM_API_KEY")

MAX_ATTACHMENTS_PER_RUN = 20
MAX_FILE_SIZE_MB = 25  # Skip files larger than this


# ---------------------------------------------------------------------------
# REQUIREMENT EXTRACTION (extended from tool 6)
# ---------------------------------------------------------------------------
def analyze_text_for_requirements(text):
    """
    Parse document text for key capacity requirements.
    Extended version of tool 6's analyze_text_for_requirements.
    """
    if not text:
        return {}

    text_lower = text.lower()
    requirements = {}

    # 1. Bonding Requirements
    bond_match = re.search(r'bond(?:ing|ed)?\s*(?:requirement|required|of)?\s*\$?([\d,]+(?:\.\d+)?(?:\s*(?:million|m|k))?)', text_lower)
    requirements["bonding_required"] = bool(re.search(r'\bbond\b|\bbonding\b|\bsurety\b', text_lower))
    if bond_match:
        requirements["bonding_amount"] = bond_match.group(1).strip()

    # 2. Insurance requirements
    insurance_match = re.search(r'(?:insurance|liability)\s*(?:requirement|required|of|:)?\s*\$?([\d,]+(?:\.\d+)?(?:\s*(?:million|m|k))?)', text_lower)
    requirements["insurance_required"] = bool(re.search(r'\binsurance\b|\bliability\b|\bcoverage\b', text_lower))
    if insurance_match:
        requirements["insurance_amount"] = insurance_match.group(1).strip()

    # 3. Equipment mentions
    equipment_keywords = [
        "fleet", "truck", "excavator", "bulldozer", "crane", "forklift",
        "tractor", "backhoe", "grader", "loader", "dump truck", "concrete",
        "asphalt", "paving", "mower", "chipper", "aerial lift"
    ]
    found_equipment = [eq for eq in equipment_keywords if eq in text_lower]
    if found_equipment:
        requirements["equipment_mentioned"] = found_equipment

    # 4. Security clearance
    clearance_patterns = [
        (r'\btop\s+secret\b|\bts/sci\b|\bts\b', "Top Secret"),
        (r'\bsecret\b(?!\s*(?:service|ary|ion))', "Secret"),
        (r'\bconfidential\b', "Confidential"),
    ]
    for pattern, level in clearance_patterns:
        if re.search(pattern, text_lower):
            requirements["security_clearance_required"] = True
            requirements["clearance_level"] = level
            break

    # 5. Certification mentions
    cert_patterns = {
        "8a": r'8\s*\(\s*a\s*\)',
        "hubzone": r'hubzone',
        "sdvosb": r'sdvosb|service.disabled\s+veteran',
        "wosb": r'wosb|women.owned',
        "edwosb": r'edwosb|economically\s+disadvantaged',
        "iso_9001": r'iso\s*9001',
        "iso_14001": r'iso\s*14001',
    }
    found_certs = []
    for cert_name, pattern in cert_patterns.items():
        if re.search(pattern, text_lower):
            found_certs.append(cert_name)
    if found_certs:
        requirements["certifications_required"] = found_certs

    # 6. Experience requirements
    exp_match = re.search(r'(\d+)\s*(?:years?|yrs?)\s*(?:of\s+)?(?:experience|relevant)', text_lower)
    if exp_match:
        requirements["experience_years_required"] = int(exp_match.group(1))

    # 7. Contract value hints
    value_match = re.search(r'(?:estimated|approximate|contract)\s*(?:value|amount|price)\s*(?:of|is|:)?\s*\$?([\d,]+(?:\.\d+)?(?:\s*(?:million|m|billion|b|k))?)', text_lower)
    if value_match:
        requirements["estimated_value"] = value_match.group(1).strip()

    # 8. Period of performance
    pop_match = re.search(r'(?:period\s+of\s+performance|contract\s+(?:period|duration))\s*(?:is|:)?\s*(\d+)\s*(months?|years?|days?)', text_lower)
    if pop_match:
        requirements["period_of_performance"] = f"{pop_match.group(1)} {pop_match.group(2)}"

    return requirements


# ---------------------------------------------------------------------------
# FILE EXTRACTION
# ---------------------------------------------------------------------------
def extract_text_from_pdf(filepath):
    """Extract all text from a PDF file using PyPDF2."""
    if not HAS_PDF:
        return ""

    try:
        text = ""
        with open(filepath, "rb") as f:
            reader = PyPDF2.PdfReader(f)
            for page in reader.pages[:50]:  # Limit to 50 pages
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
        return text
    except Exception as e:
        print(f"      ❌ PDF extraction error: {e}")
        return ""


def extract_text_from_docx(filepath):
    """Extract all text from a DOCX file using python-docx."""
    if not HAS_DOCX:
        return ""

    try:
        doc = docx.Document(filepath)
        text = "\n".join(para.text for para in doc.paragraphs)
        return text
    except Exception as e:
        print(f"      ❌ DOCX extraction error: {e}")
        return ""


def download_file(url, dest_path):
    """Download a file from a URL to a local path."""
    try:
        headers = {"User-Agent": "Mozilla/5.0 (compatible; CapturePilot/2.0)"}
        if SAM_API_KEY and "sam.gov" in url:
            headers["X-Api-Key"] = SAM_API_KEY

        res = requests.get(url, timeout=30, headers=headers, stream=True, allow_redirects=True)
        if res.status_code != 200:
            print(f"      ❌ Download failed: HTTP {res.status_code}")
            return False

        # Check file size
        content_length = int(res.headers.get("content-length", 0))
        if content_length > MAX_FILE_SIZE_MB * 1024 * 1024:
            print(f"      ⚠️ File too large ({content_length / 1024 / 1024:.1f}MB), skipping")
            return False

        with open(dest_path, "wb") as f:
            for chunk in res.iter_content(chunk_size=8192):
                f.write(chunk)

        return True

    except Exception as e:
        print(f"      ❌ Download error: {e}")
        return False


# ---------------------------------------------------------------------------
# SAM.GOV RESOURCE LINKS EXTRACTION
# ---------------------------------------------------------------------------
def get_opportunity_resource_links(opportunity):
    """
    Extract downloadable resource links from opportunity raw_json.
    SAM API stores these in the resourceLinks array.
    """
    raw = opportunity.get("raw_json", {})
    if not raw or not isinstance(raw, dict):
        return []

    links = []

    # Check resourceLinks in raw_json
    resource_links = raw.get("resourceLinks", [])
    if isinstance(resource_links, list):
        for rl in resource_links:
            url = rl if isinstance(rl, str) else rl.get("url", "")
            if url:
                links.append(url)

    # Check for attachment links in various SAM API response formats
    attachments = raw.get("attachments", [])
    if isinstance(attachments, list):
        for att in attachments:
            url = att.get("url") or att.get("link") or att.get("accessUrl", "")
            if url:
                links.append(url)

    # Check description for embedded document links
    desc = raw.get("description", "") or opportunity.get("description", "")
    if desc:
        # Find URLs that look like document links
        url_pattern = re.compile(r'https?://[^\s<>"\']+\.(?:pdf|docx?|xlsx?)', re.IGNORECASE)
        for match in url_pattern.finditer(desc):
            links.append(match.group())

    # Also check the opportunity link itself
    opp_link = raw.get("uiLink") or opportunity.get("link", "")
    if opp_link and "sam.gov" in opp_link:
        # SAM.gov opportunity page may have attachments we can discover
        links.append(opp_link)

    return list(set(links))


# ---------------------------------------------------------------------------
# MAIN PIPELINE
# ---------------------------------------------------------------------------
def process_opportunity_attachments(supabase, opportunity):
    """
    Download and process all attachments for a single opportunity.
    Returns list of requirement dicts.
    """
    opp_id = opportunity["id"]
    title = opportunity.get("title", "Unknown")

    print(f"\n  📎 Opportunity: {title[:60]}")

    # Get resource links
    links = get_opportunity_resource_links(opportunity)
    if not links:
        print(f"     No attachment links found")
        return []

    print(f"     Found {len(links)} resource links")

    all_requirements = {}
    processed = 0

    for url in links[:5]:  # Max 5 attachments per opportunity
        # Determine file type from URL
        url_lower = url.lower()
        if url_lower.endswith(".pdf"):
            file_type = "pdf"
        elif url_lower.endswith(".docx") or url_lower.endswith(".doc"):
            file_type = "docx"
        elif url_lower.endswith(".xlsx") or url_lower.endswith(".xls"):
            file_type = "xlsx"
            continue  # Skip spreadsheets for now
        else:
            # Skip non-document URLs (HTML pages, etc)
            if not any(ext in url_lower for ext in [".pdf", ".doc"]):
                continue
            file_type = "pdf"  # Assume PDF

        # Check if already processed
        existing = supabase.table("opportunity_attachments").select("id").eq(
            "opportunity_id", opp_id
        ).eq("file_url", url).limit(1).execute()

        if existing.data:
            continue

        # Download to temp file
        filename = url.split("/")[-1].split("?")[0] or f"attachment.{file_type}"
        with tempfile.NamedTemporaryFile(suffix=f".{file_type}", delete=False) as tmp:
            tmp_path = tmp.name

        print(f"     Downloading: {filename[:40]}...")

        if not download_file(url, tmp_path):
            os.unlink(tmp_path)
            continue

        # Extract text
        file_size = os.path.getsize(tmp_path)
        if file_type == "pdf":
            text = extract_text_from_pdf(tmp_path)
        elif file_type in ("docx", "doc"):
            text = extract_text_from_docx(tmp_path)
        else:
            text = ""

        # Clean up temp file
        os.unlink(tmp_path)

        if not text:
            print(f"     ⚠️ No text extracted from {filename[:40]}")
            continue

        # Extract requirements
        requirements = analyze_text_for_requirements(text)
        all_requirements.update(requirements)

        # Save to DB
        try:
            supabase.table("opportunity_attachments").insert({
                "opportunity_id": opp_id,
                "filename": filename[:255],
                "file_url": url,
                "file_type": file_type,
                "file_size_bytes": file_size,
                "extracted_text": text[:50000],  # Limit stored text
                "requirements_extracted": requirements,
                "downloaded_at": datetime.utcnow().isoformat(),
            }).execute()
            processed += 1
        except Exception as e:
            print(f"     ❌ DB insert error: {e}")

        time.sleep(1)  # Be polite to servers

    # Update opportunity with merged requirements
    if all_requirements:
        try:
            supabase.table("opportunities").update({
                "requirements_extracted": all_requirements,
            }).eq("id", opp_id).execute()
        except Exception:
            pass

    print(f"     ✅ Processed {processed} attachments, extracted {len(all_requirements)} requirement fields")
    return all_requirements


def run_attachment_pipeline(opportunity_id=None):
    """
    Main entry point.
    Processes attachments for HOT-matched opportunities.
    """
    if not all([SUPABASE_URL, SUPABASE_SERVICE_KEY]):
        print("❌ Missing Supabase API keys in .env. Halting execution.")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    print("📎 Starting Attachment Intelligence Engine...")

    if opportunity_id:
        res = supabase.table("opportunities").select(
            "id, title, description, raw_json, link"
        ).eq("id", opportunity_id).single().execute()

        if not res.data:
            print(f"  ❌ Opportunity {opportunity_id} not found")
            return

        opportunities = [res.data]
    else:
        # Find HOT-matched opportunities (no join - FK may not exist in PostgREST cache)
        match_res = supabase.table("matches").select(
            "opportunity_id"
        ).eq("classification", "HOT").order("score", desc=True).limit(30).execute()

        if not match_res.data:
            print("  ✅ No HOT opportunities to process.")
            return

        # Deduplicate and fetch each opportunity
        seen = set()
        opportunities = []
        for m in match_res.data:
            oid = m.get("opportunity_id")
            if oid and oid not in seen and len(opportunities) < MAX_ATTACHMENTS_PER_RUN:
                seen.add(oid)
                opp_res = supabase.table("opportunities").select(
                    "id, title, description, raw_json, link"
                ).eq("id", oid).single().execute()
                if opp_res.data:
                    opportunities.append(opp_res.data)

    print(f"  -> Processing attachments for {len(opportunities)} opportunities")

    total_processed = 0
    for opp in opportunities:
        reqs = process_opportunity_attachments(supabase, opp)
        if reqs:
            total_processed += 1

    print(f"\n🎉 Attachment Intelligence Complete! Processed {total_processed} opportunities.")


if __name__ == "__main__":
    opp_id = None

    for i, arg in enumerate(sys.argv[1:], 1):
        if arg == "--opportunity_id" and i < len(sys.argv) - 1:
            opp_id = sys.argv[i + 1]

    run_attachment_pipeline(opportunity_id=opp_id)

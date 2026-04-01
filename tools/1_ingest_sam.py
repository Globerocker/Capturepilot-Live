"""
SAM.gov Strategic Intelligence Ingestion Pipeline
===================================================
Modes:
  daily    — r,p,o,k (Sources Sought, Presol, Sol, Combined) — 3 days back
  weekly   — r,p,o,k — 7 days back (full refresh active)
  monthly  — f,a (Forecast + Award notices) — 30 days back
  backfill — r,p,o,k,f,a — 180 days in 30-day windows

Usage:
  python 1_ingest_sam.py                   # daily (default)
  python 1_ingest_sam.py daily
  python 1_ingest_sam.py weekly
  python 1_ingest_sam.py monthly
  python 1_ingest_sam.py backfill
  python 1_ingest_sam.py daily 5           # daily, 5 days back
"""
import os
import time
import requests
from supabase import create_client, Client
from datetime import datetime, timedelta

# ---------------------------------------------------------------------------
# ENV
# ---------------------------------------------------------------------------
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

SAM_API_KEY = os.getenv("SAM_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

# ---------------------------------------------------------------------------
# Set-aside code mappings for flag detection
# ---------------------------------------------------------------------------
VETERAN_SET_ASIDES = {"SDVOSBC", "SDVOSBS", "VSA", "SDVOSB"}
SB_SET_ASIDES = {"SBA", "SBP", "8A", "8AN", "HZC", "HZS", "SDVOSBC", "SDVOSBS",
                 "WOSB", "WOSBSS", "EDWOSB", "VSA", "SDVOSB"}

VETERAN_KEYWORDS = ["sdvosb", "vosb", "veteran", "service-disabled"]
SB_KEYWORDS = ["small business", "8(a)", "hubzone", "wosb", "women-owned",
               "small disadvantaged", "sdb"]

PTYPE_LABELS = {
    "r": "Sources Sought / RFI",
    "p": "Presolicitation",
    "o": "Solicitation",
    "k": "Combined Synopsis/Solicitation",
    "f": "Forecast",
    "a": "Award Notice",
}

# ---------------------------------------------------------------------------
# Flag detection
# ---------------------------------------------------------------------------
def detect_flags(op):
    """Detect veteran/SB relevance and sources sought flags from raw SAM data."""
    set_aside_raw = (op.get("typeOfSetAside") or op.get("typeOfSetAsideDescription") or "").upper()
    notice_type = (op.get("type") or "").lower()
    title = (op.get("title") or "").lower()

    veteran = False
    small_biz = False
    sources_sought = False

    # Set-aside code matching
    for code in VETERAN_SET_ASIDES:
        if code in set_aside_raw:
            veteran = True
            break
    for code in SB_SET_ASIDES:
        if code in set_aside_raw:
            small_biz = True
            break

    # Keyword fallback in set-aside description
    set_aside_lower = set_aside_raw.lower()
    if not veteran:
        veteran = any(kw in set_aside_lower or kw in title for kw in VETERAN_KEYWORDS)
    if not small_biz:
        small_biz = any(kw in set_aside_lower or kw in title for kw in SB_KEYWORDS)

    # Sources Sought detection
    if notice_type in ("r", "sources sought"):
        sources_sought = True
    elif "sources sought" in title or "rfi" in title or "market research" in title:
        sources_sought = True

    return veteran, small_biz, sources_sought

def compute_status(op, ptype):
    """Compute lifecycle status based on notice type and deadline."""
    deadline_str = op.get("responseDeadLine") or op.get("responseDate")
    now = datetime.now()

    # Award notices
    if ptype == "a":
        return "AWARDED"

    # Forecast
    if ptype == "f":
        return "SEARCH_SEED"

    # Sources Sought
    _, _, is_sources_sought = detect_flags(op)
    if is_sources_sought or ptype == "r":
        if deadline_str:
            try:
                deadline = datetime.fromisoformat(deadline_str.replace("Z", "+00:00")).replace(tzinfo=None)
                if deadline < now:
                    return "INTELLIGENCE"
            except (ValueError, TypeError):
                pass
        return "MARKET_RESEARCH"

    # Standard opportunities: check deadline
    if deadline_str:
        try:
            deadline = datetime.fromisoformat(deadline_str.replace("Z", "+00:00")).replace(tzinfo=None)
            if deadline < now:
                return "EXPIRED"
            elif deadline < now + timedelta(days=7):
                return "EXPIRING_SOON"
            else:
                return "ACTIVE"
        except (ValueError, TypeError):
            pass

    return "DISCOVERED"

# ---------------------------------------------------------------------------
# Core fetch + upsert
# ---------------------------------------------------------------------------
def fetch_and_upsert(supabase, posted_from, posted_to, ptypes, valid_naics=None, valid_psc=None):
    """Fetch from SAM.gov API and upsert to Supabase. Returns total upserted count."""
    url = "https://api.sam.gov/opportunities/v2/search"
    limit = 1000
    total_upserted = 0

    # Pre-load valid FK codes if not provided
    if valid_naics is None or valid_psc is None:
        try:
            naics_res = supabase.table("naics_codes").select("code").execute()
            psc_res = supabase.table("psc_codes").select("code").execute()
            valid_naics = {r["code"] for r in (naics_res.data or [])}
            valid_psc = {r["code"] for r in (psc_res.data or [])}
        except Exception:
            valid_naics = set()
            valid_psc = set()

    for ptype in ptypes:
        print(f"\n📥 Fetching: {PTYPE_LABELS.get(ptype, ptype)} (ptype={ptype})")
        offset = 0

        while True:
            params = {
                "postedFrom": posted_from,
                "postedTo": posted_to,
                "limit": limit,
                "offset": offset,
                "ptype": ptype
            }
            headers = {"X-Api-Key": SAM_API_KEY}

            try:
                response = requests.get(url, params=params, headers=headers, timeout=30)

                if response.status_code == 429:
                    print("  ⚠️ Rate limit hit. Sleeping 10s...")
                    time.sleep(10)
                    continue

                if response.status_code != 200:
                    print(f"  ❌ API error {response.status_code}")
                    break

                data = response.json()
                ops_batch = data.get("opportunitiesData", [])

                if not ops_batch:
                    print(f"  Done. No more records.")
                    break

                print(f"  Retrieved {len(ops_batch)} records at offset {offset}...")

                # Normalize
                db_payload = []
                for op in ops_batch:
                    notice_id = op.get("noticeId")
                    if not notice_id:
                        continue

                    veteran, small_biz, sources_sought = detect_flags(op)
                    status = compute_status(op, ptype)

                    # Extract resource links
                    raw_links = []
                    for rl in (op.get("resourceLinks") or []):
                        link_url_val = rl if isinstance(rl, str) else (rl.get("url", "") if isinstance(rl, dict) else "")
                        if link_url_val:
                            raw_links.append(link_url_val)

                    # Validate FK codes upfront
                    naics = op.get("naicsCode")
                    psc = op.get("classificationCode")
                    if naics and naics not in valid_naics:
                        naics = None
                    if psc and psc not in valid_psc:
                        psc = None

                    normalized = {
                        "notice_id": notice_id,
                        "title": op.get("title"),
                        "agency": (lambda fpp: fpp.split(".")[0].strip() if fpp else None)(op.get("fullParentPathName")) or op.get("department") or op.get("subtier") or op.get("agency"),
                        "sub_agency": (lambda fpp: fpp.split(".")[1].strip() if fpp and len(fpp.split(".")) > 1 else None)(op.get("fullParentPathName")) or op.get("subtierAgency") or op.get("subtier"),
                        "office": (lambda fpp: fpp.split(".")[-1].strip() if fpp and len(fpp.split(".")) > 2 else None)(op.get("fullParentPathName")) or op.get("office"),
                        "department": op.get("fullParentPathName") or op.get("department"),
                        "organization_code": op.get("organizationCode"),
                        "naics_code": naics or None,
                        "psc_code": psc or None,
                        "set_aside_code": op.get("typeOfSetAsideDescription") or op.get("typeOfSetAside"),
                        "notice_type": op.get("type"),
                        "posted_date": op.get("postedDate") or None,
                        "response_deadline": op.get("responseDeadLine") or None,
                        "place_of_performance_state": (op.get("placeOfPerformance") or {}).get("state", {}).get("code"),
                        "description": op.get("description"),
                        "resource_links": raw_links if raw_links else [],
                        "solicitation_number": op.get("solicitationNumber"),
                        "link": op.get("uiLink") or (f"https://sam.gov/opp/{notice_id}/view" if notice_id else None),
                        "raw_json": op,
                        # New strategic fields
                        "status": status,
                        "veteran_relevance_flag": veteran,
                        "small_business_relevance_flag": small_biz,
                        "sources_sought_flag": sources_sought,
                        "last_crawled_at": datetime.utcnow().isoformat(),
                        # Award data (from award notices)
                        "award_amount": op.get("award", {}).get("amount") if isinstance(op.get("award"), dict) else None,
                        "estimated_value": op.get("estimatedTotalValue") or op.get("award", {}).get("amount") if isinstance(op.get("award"), dict) else None,
                        # Retention for awards
                        "retention_protected": status == "AWARDED",
                        "retention_reason": "award_notice" if status == "AWARDED" else None,
                        # Incumbent from award notices
                        "incumbent_contractor_name": (op.get("award", {}).get("awardee", {}).get("name")
                                                      if isinstance(op.get("award"), dict) and isinstance(op.get("award", {}).get("awardee"), dict)
                                                      else None),
                    }

                    # Clean empty strings for timestamp/FK columns
                    for key in ("response_deadline", "posted_date", "psc_code", "naics_code", "award_amount", "estimated_value"):
                        if not normalized.get(key):
                            normalized[key] = None

                    db_payload.append(normalized)

                if db_payload:
                    try:
                        supabase.table("opportunities").upsert(db_payload, on_conflict="notice_id").execute()
                        total_upserted += len(db_payload)
                        print(f"  ✅ Upserted {len(db_payload)} (total: {total_upserted})")
                    except Exception as db_err:
                        err_msg = str(db_err)
                        NEW_COLS = ("sub_agency", "office", "estimated_value", "status",
                                    "veteran_relevance_flag", "small_business_relevance_flag",
                                    "sources_sought_flag", "last_crawled_at", "retention_protected",
                                    "retention_reason", "incumbent_contractor_name")

                        # Schema error (columns don't exist yet) — strip new cols immediately
                        if "PGRST204" in err_msg or "schema cache" in err_msg or "column" in err_msg.lower():
                            print(f"  ⚠️ Schema error — migration not applied yet. Stripping new columns...")
                            for row in db_payload:
                                for col in NEW_COLS:
                                    row.pop(col, None)
                            try:
                                supabase.table("opportunities").upsert(db_payload, on_conflict="notice_id").execute()
                                total_upserted += len(db_payload)
                                print(f"  ✅ Minimal upsert succeeded. Upserted {len(db_payload)}.")
                            except Exception as schema_retry_err:
                                print(f"  ❌ Even minimal upsert failed: {schema_retry_err}")

                        # FK constraint error — null bad codes and retry
                        elif "foreign key constraint" in err_msg or "23503" in err_msg:
                            print(f"  ⚠️ FK constraint error. Nulling bad codes and retrying...")
                            for row in db_payload:
                                if row.get("naics_code") and row["naics_code"] not in valid_naics:
                                    row["naics_code"] = None
                                if row.get("psc_code") and row["psc_code"] not in valid_psc:
                                    row["psc_code"] = None
                            try:
                                supabase.table("opportunities").upsert(db_payload, on_conflict="notice_id").execute()
                                total_upserted += len(db_payload)
                                print(f"  ✅ Retry succeeded. Upserted {len(db_payload)}.")
                            except Exception as retry_err:
                                print(f"  ⚠️ Retry failed ({retry_err}). Trying minimal payload...")
                                for row in db_payload:
                                    for col in NEW_COLS:
                                        row.pop(col, None)
                                try:
                                    supabase.table("opportunities").upsert(db_payload, on_conflict="notice_id").execute()
                                    total_upserted += len(db_payload)
                                    print(f"  ✅ Minimal upsert succeeded. Upserted {len(db_payload)}.")
                                except Exception as final_err:
                                    print(f"  ❌ Final retry also failed: {final_err}")
                        else:
                            print(f"  ❌ DB Error: {db_err}")

                offset += limit

                if len(ops_batch) < limit:
                    print(f"  Done. Total for this type so far.")
                    break

            except requests.exceptions.RequestException as req_err:
                print(f"  ❌ Request Exception: {req_err}")
                break

        # Small delay between ptypes to be nice to the API
        time.sleep(1)

    return total_upserted

# ---------------------------------------------------------------------------
# Post-processing: link Sources Sought → Solicitations
# ---------------------------------------------------------------------------
def link_sources_sought(supabase):
    """Find Sources Sought that share solicitation_number with a newer solicitation."""
    print("\n🔗 Linking Sources Sought to Solicitations...")
    try:
        # Get Sources Sought with solicitation numbers
        ss_res = supabase.table("opportunities").select("notice_id, solicitation_number").eq("sources_sought_flag", True).not_.is_("solicitation_number", "null").limit(5000).execute()
        if not ss_res.data:
            print("  No linkable Sources Sought found.")
            return

        sol_numbers = list({r["solicitation_number"] for r in ss_res.data if r.get("solicitation_number")})
        if not sol_numbers:
            return

        # Find matching solicitations (batch in groups of 50)
        linked = 0
        for i in range(0, len(sol_numbers), 50):
            batch = sol_numbers[i:i+50]
            sol_res = supabase.table("opportunities").select("notice_id, solicitation_number").in_("solicitation_number", batch).eq("sources_sought_flag", False).limit(5000).execute()
            if not sol_res.data:
                continue

            sol_map = {}
            for s in sol_res.data:
                sol_map[s["solicitation_number"]] = s["notice_id"]

            for ss in ss_res.data:
                sol_num = ss.get("solicitation_number")
                if sol_num and sol_num in sol_map:
                    supabase.table("opportunities").update({
                        "related_notice_id": sol_map[sol_num]
                    }).eq("notice_id", ss["notice_id"]).execute()
                    linked += 1

        print(f"  ✅ Linked {linked} Sources Sought to Solicitations.")
    except Exception as e:
        print(f"  ❌ Error linking: {e}")

# ---------------------------------------------------------------------------
# Main entry points
# ---------------------------------------------------------------------------
def ingest_sam_opportunities(mode="daily", days_back=None):
    """
    Strategic SAM.gov ingestion with mode-based operation.

    Modes:
      daily    — r,p,o,k — 3 days (or custom days_back)
      weekly   — r,p,o,k — 7 days
      monthly  — f,a (Forecast + Awards) — 30 days
      backfill — r,p,o,k,f,a — 180 days in 30-day windows
    """
    if not all([SAM_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY]):
        print("❌ Missing API keys in .env. Halting execution.")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    today = datetime.now()

    # Mode configuration
    if mode == "backfill":
        ptypes = ["r", "p", "o", "k", "f", "a"]
        days = days_back or 180
        window_size = 30
    elif mode == "monthly":
        ptypes = ["f", "a"]
        days = days_back or 30
        window_size = days  # single window
    elif mode == "weekly":
        ptypes = ["r", "p", "o", "k"]
        days = days_back or 7
        window_size = days
    else:  # daily
        ptypes = ["r", "p", "o", "k"]
        days = days_back or 3
        window_size = days

    print(f"{'='*60}")
    print(f"SAM.gov Strategic Ingestion — Mode: {mode.upper()}")
    print(f"Notice types: {', '.join(PTYPE_LABELS.get(p, p) for p in ptypes)}")
    print(f"Date range: {days} days back")
    print(f"{'='*60}")

    # Pre-load valid FK codes once
    try:
        naics_res = supabase.table("naics_codes").select("code").execute()
        psc_res = supabase.table("psc_codes").select("code").execute()
        valid_naics = {r["code"] for r in (naics_res.data or [])}
        valid_psc = {r["code"] for r in (psc_res.data or [])}
        print(f"Loaded {len(valid_naics)} NAICS codes, {len(valid_psc)} PSC codes")
    except Exception:
        valid_naics = set()
        valid_psc = set()

    grand_total = 0

    # Process in windows (for backfill) or single pass
    for window_start_days in range(0, days, window_size):
        window_end_days = min(window_start_days + window_size, days)

        from_date = (today - timedelta(days=window_end_days)).strftime('%m/%d/%Y')
        to_date = (today - timedelta(days=window_start_days)).strftime('%m/%d/%Y')

        print(f"\n--- Window: {from_date} to {to_date} ---")

        count = fetch_and_upsert(supabase, from_date, to_date, ptypes, valid_naics, valid_psc)
        grand_total += count

        # Rate limit between windows
        if window_start_days + window_size < days:
            print("  Sleeping 2s between windows...")
            time.sleep(2)

    # Post-processing
    link_sources_sought(supabase)

    print(f"\n{'='*60}")
    print(f"🎉 COMPLETE. Mode: {mode.upper()}. Total upserted: {grand_total}")
    print(f"{'='*60}")

    # Log progress
    with open("progress.md", "a") as f:
        f.write(f"\n* [{datetime.now().strftime('%Y-%m-%d %H:%M')}] SAM Ingestion ({mode}): {grand_total} records.\n")

    return grand_total

if __name__ == "__main__":
    import sys
    mode = sys.argv[1] if len(sys.argv) > 1 else "daily"

    # Support legacy usage: python 1_ingest_sam.py 180 (number = days_back for daily)
    if mode.isdigit():
        ingest_sam_opportunities(mode="daily", days_back=int(mode))
    else:
        days = int(sys.argv[2]) if len(sys.argv) > 2 else None
        ingest_sam_opportunities(mode=mode, days_back=days)

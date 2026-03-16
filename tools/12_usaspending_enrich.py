#!/usr/bin/env python3
"""
Tool 12: USASpending.gov Contractor Award Enrichment

Queries USASpending.gov API (free, no key needed) to backfill:
- Total federal awards count and dollar volume
- Agency relationship history (which agencies they've worked for)
- NAICS award track record (which NAICS codes they've won contracts under)
- Last award date and recent activity status
- Contract vehicles used

This directly improves matching by proving a contractor's track record.

Usage:
    python3 tools/12_usaspending_enrich.py [--limit N] [--workers N]
"""
import os, sys, time, json
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

USASPENDING_BASE = "https://api.usaspending.gov/api/v2"
session = requests.Session()


def fetch_awards_by_name(company_name):
    """Query USASpending for all awards to a company by name."""
    url = f"{USASPENDING_BASE}/search/spending_by_award/"
    # Clean company name for search
    search_name = company_name.strip().upper()
    # Remove common suffixes that cause mismatches
    for suffix in [", LLC", ", INC", ", INC.", " LLC", " INC", " CORP", " CORPORATION", " CO", " COMPANY"]:
        if search_name.endswith(suffix):
            search_name = search_name[:-len(suffix)].strip()
            break

    payload = {
        "filters": {
            "recipient_search_text": [search_name],
            "time_period": [{"start_date": "2019-01-01", "end_date": datetime.now().strftime("%Y-%m-%d")}],
            "award_type_codes": ["A", "B", "C", "D", "IDV_A", "IDV_B", "IDV_B_A", "IDV_B_B", "IDV_B_C", "IDV_C", "IDV_D", "IDV_E"]
        },
        "fields": [
            "Award ID", "Recipient Name", "Award Amount",
            "Awarding Agency", "Start Date", "End Date",
            "NAICS Code", "Award Type", "Contract Award Type"
        ],
        "page": 1,
        "limit": 100,
        "sort": "Award Amount",
        "order": "desc"
    }

    try:
        r = session.post(url, json=payload, timeout=30)
        if r.status_code == 200:
            data = r.json()
            results = data.get("results", [])
            total = data.get("page_metadata", {}).get("total", 0)
            # Filter results to only include close name matches
            if results:
                name_upper = company_name.upper()
                filtered = [a for a in results if name_upper in (a.get("Recipient Name") or "").upper()
                           or (a.get("Recipient Name") or "").upper() in name_upper]
                if filtered:
                    return filtered, len(filtered)
                # If no exact match, return all results (USASpending already filtered by name)
                return results, total
            return [], 0
        return [], 0
    except Exception:
        return [], 0


def process_contractor(contractor):
    """Enrich a single contractor with USASpending data."""
    uei = contractor["uei"]
    cid = contractor["id"]
    company_name = contractor.get("company_name", "")

    if not company_name:
        sb.table("contractors").update({
            "federal_activity_status": "no_name",
            "last_enriched_at": datetime.now().isoformat()
        }).eq("id", cid).execute()
        return ("no_name", uei, 0)

    # Fetch awards by company name
    awards, total_count = fetch_awards_by_name(company_name)

    if total_count == 0 and not awards:
        # Mark as checked even if no results
        sb.table("contractors").update({
            "federal_activity_status": "no_awards_found",
            "last_enriched_at": datetime.now().isoformat()
        }).eq("id", cid).execute()
        return ("no_awards", uei, 0)

    # Aggregate award data
    total_value = 0
    agencies_served = set()
    naics_history = {}
    last_award = None

    for award in awards:
        amount = award.get("Award Amount") or 0
        if isinstance(amount, str):
            amount = float(amount.replace(",", "").replace("$", "")) if amount else 0
        total_value += amount

        agency = award.get("Awarding Agency", "")
        if agency:
            agencies_served.add(agency)

        naics = award.get("NAICS Code", "")
        if naics:
            naics_history[naics] = naics_history.get(naics, 0) + 1

        start = award.get("Start Date", "")
        if start:
            if not last_award or start > last_award:
                last_award = start

    # Determine activity status
    if last_award:
        try:
            last_date = datetime.strptime(last_award[:10], "%Y-%m-%d")
            days_since = (datetime.now() - last_date).days
            if days_since < 365:
                activity = "active_recent"
            elif days_since < 730:
                activity = "active"
            else:
                activity = "inactive"
        except ValueError:
            activity = "unknown"
    else:
        activity = "no_recent_awards"

    # Build update payload
    update = {
        "total_federal_awards": total_count,
        "total_award_volume": round(total_value, 2),
        "federal_activity_status": activity,
        "last_enriched_at": datetime.now().isoformat(),
        "enrichment_source": "usaspending"
    }

    if last_award:
        update["last_award_date"] = last_award[:10]

    # Store agency and NAICS history in capacity_signals JSONB
    capacity = contractor.get("capacity_signals") or {}
    if isinstance(capacity, str):
        try:
            capacity = json.loads(capacity)
        except Exception:
            capacity = {}

    capacity["agencies_served"] = sorted(agencies_served)
    capacity["naics_award_history"] = naics_history
    capacity["award_count"] = total_count
    capacity["total_award_value"] = round(total_value, 2)
    update["capacity_signals"] = capacity

    sb.table("contractors").update(update).eq("id", cid).execute()
    return ("ok", uei, total_count)


def main():
    limit = 5000
    workers = 3

    for arg in sys.argv[1:]:
        if arg.startswith("--limit="):
            limit = int(arg.split("=")[1])
        elif arg.startswith("--workers="):
            workers = int(arg.split("=")[1])

    print("=" * 60)
    print("  Tool 12: USASpending.gov Award Enrichment")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  Limit: {limit} | Workers: {workers}")
    print("=" * 60)

    # Get contractors with UEI that haven't been enriched yet
    all_contractors = []
    offset = 0
    while len(all_contractors) < limit:
        batch = min(1000, limit - len(all_contractors))
        res = sb.table("contractors") \
            .select("id, uei, company_name, capacity_signals") \
            .not_.is_("uei", "null") \
            .not_.is_("company_name", "null") \
            .is_("federal_activity_status", "null") \
            .eq("is_sam_registered", True) \
            .range(offset, offset + batch - 1) \
            .execute()

        if not res.data:
            break
        all_contractors.extend(res.data)
        offset += batch
        if len(res.data) < batch:
            break

    print(f"\nFound {len(all_contractors)} contractors to enrich", flush=True)

    if not all_contractors:
        print("Nothing to enrich!")
        return

    ok = 0
    no_awards = 0
    fail = 0
    start = time.time()

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(process_contractor, c): c for c in all_contractors}

        for i, future in enumerate(as_completed(futures), 1):
            try:
                status, uei, count = future.result()
                if status == "ok":
                    ok += 1
                elif status == "no_awards":
                    no_awards += 1
                else:
                    fail += 1
            except Exception as e:
                fail += 1

            if i % 100 == 0:
                elapsed = time.time() - start
                rate = i / elapsed if elapsed > 0 else 0
                remaining = len(all_contractors) - i
                eta = remaining / rate if rate > 0 else 0
                print(f"  [{i}/{len(all_contractors)}] enriched={ok} no_awards={no_awards} fail={fail} | {rate:.1f}/sec | ETA: {eta/60:.0f}min", flush=True)

    elapsed = time.time() - start
    print(f"\nDone in {elapsed:.0f}s ({elapsed/60:.1f}min)")
    print(f"  Contractors enriched with award data: {ok}")
    print(f"  No federal awards found: {no_awards}")
    print(f"  Failed: {fail}")


if __name__ == "__main__":
    main()

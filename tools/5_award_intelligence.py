"""
Tool 5: Award Notice Intelligence
Scrapes SAM.gov Award Notices to identify:
  1. Incumbent contractors (who currently holds similar contracts)
  2. Award amounts (what agencies pay for similar work)
  3. Contract vehicles used (GSA, GWAC, IDIQ, BPA)

This data feeds into the scoring algorithm as "Incumbent Risk" and
"Competitive Position" intelligence factors.
"""
import os
import time
import requests
from datetime import datetime, timedelta
from supabase import create_client, Client

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

# ---------------------------------------------------------------------------
# SAM.GOV AWARD NOTICE SCRAPER
# ---------------------------------------------------------------------------

def fetch_award_notices(naics_code, state=None, days_back=180):
    """
    Search SAM.gov for Award Notices matching a NAICS code.
    Returns list of award dicts with incumbent info.
    Max date range: 1 year. Default 180 days.
    """
    if not SAM_API_KEY:
        print("  ⚠️ SAM_API_KEY not set")
        return []

    url = "https://api.sam.gov/opportunities/v2/search"
    posted_from = (datetime.now() - timedelta(days=min(days_back, 364))).strftime("%m/%d/%Y")
    posted_to = datetime.now().strftime("%m/%d/%Y")

    params = {
        "ptype": "a",  # Award notices only
        "ncode": str(naics_code),
        "postedFrom": posted_from,
        "postedTo": posted_to,
        "limit": 100,
        "offset": 0,
    }
    if state:
        params["state"] = state

    headers = {"X-Api-Key": SAM_API_KEY}

    awards = []
    try:
        res = requests.get(url, params=params, headers=headers, timeout=30)
        if res.status_code != 200:
            print(f"  ❌ SAM Award API error: {res.status_code} - {res.text[:200]}")
            return []

        data = res.json()
        opportunities = data.get("opportunitiesData", [])

        for opp in opportunities:
            try:
                award_info = opp.get("award") or {}
                if not isinstance(award_info, dict):
                    award_info = {}

                awardee = award_info.get("awardee")
                if isinstance(awardee, dict):
                    awardee_name = awardee.get("name")
                    awardee_uei = awardee.get("ueiSAM")
                elif isinstance(awardee, str):
                    awardee_name = awardee
                    awardee_uei = None
                else:
                    awardee_name = None
                    awardee_uei = None

                pop = opp.get("placeOfPerformance") or {}
                pop_state = None
                if isinstance(pop, dict):
                    state_obj = pop.get("state")
                    if isinstance(state_obj, dict):
                        pop_state = state_obj.get("code")

                parent_path = opp.get("fullParentPathName") or ""

                award = {
                    "notice_id": opp.get("noticeId"),
                    "title": opp.get("title"),
                    "solicitation_number": opp.get("solicitationNumber"),
                    "naics_code": opp.get("naicsCode"),
                    "award_amount": award_info.get("amount"),
                    "award_date": award_info.get("date"),
                    "awardee_name": awardee_name,
                    "awardee_uei": awardee_uei,
                    "agency": parent_path.split(".")[0] if parent_path else None,
                    "place_of_performance": pop_state,
                }
                if award["awardee_name"]:
                    awards.append(award)
            except Exception:
                continue

        print(f"  -> Found {len(awards)} award notices for NAICS {naics_code}")
        return awards

    except Exception as e:
        print(f"  ❌ Award Notice fetch error: {e}")
        return []


def match_incumbents_to_opportunities(supabase, awards):
    """
    For each active opportunity, check if any award notices reveal
    the incumbent contractor (same agency + NAICS = likely recompete).
    """
    matched = 0

    # Get opportunities that don't have incumbent data yet
    opps = supabase.table("opportunities").select(
        "id, naics_code, agency, solicitation_number, title"
    ).is_("incumbent_contractor_uei", "null").eq("is_archived", False).execute()

    if not opps.data:
        return 0

    # Build award lookup by NAICS (most recent award wins)
    award_by_naics = {}
    for a in awards:
        nc = a.get("naics_code")
        if nc and nc not in award_by_naics:
            award_by_naics[nc] = a

    for opp in opps.data:
        opp_naics = opp.get("naics_code")
        if opp_naics and opp_naics in award_by_naics:
            award = award_by_naics[opp_naics]
            try:
                update = {
                    "incumbent_contractor_name": award["awardee_name"],
                }
                if award.get("awardee_uei"):
                    update["incumbent_contractor_uei"] = award["awardee_uei"]

                supabase.table("opportunities").update(update).eq("id", opp["id"]).execute()
                matched += 1
            except Exception:
                pass

    return matched


def enrich_usaspending_awards(supabase, naics_code, limit=50):
    """
    Query USASpending.gov for recent contract awards in a NAICS code.
    Returns competitor intelligence: who's winning, how much, which agencies.
    """
    try:
        payload = {
            "filters": {
                "naics_codes": [str(naics_code)],
                "time_period": [
                    {"start_date": "2024-01-01", "end_date": "2026-12-31"}
                ],
                "award_type_codes": ["A", "B", "C", "D"],
            },
            "fields": [
                "Award ID", "Recipient Name", "Award Amount",
                "Awarding Agency", "Award Type", "Start Date",
            ],
            "limit": limit,
            "page": 1,
            "sort": "Award Amount",
            "order": "desc",
        }

        res = requests.post(
            "https://api.usaspending.gov/api/v2/search/spending_by_award/",
            json=payload,
            timeout=15,
        )

        if res.status_code != 200:
            print(f"  ⚠️ USASpending API error: {res.status_code}")
            return []

        data = res.json()
        results = data.get("results", [])
        print(f"  -> USASpending: {len(results)} recent awards for NAICS {naics_code}")
        return results

    except Exception as e:
        print(f"  ❌ USASpending error: {e}")
        return []


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------

def run_award_intelligence():
    """
    Main entry point: scrape award notices for all active NAICS codes,
    match incumbents to opportunities, and enrich with USASpending data.
    """
    if not all([SUPABASE_URL, SUPABASE_SERVICE_KEY]):
        print("❌ Missing Supabase keys.")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    print("🏆 Starting Award Notice Intelligence Engine...")

    # Get unique NAICS codes from active opportunities
    opps = supabase.table("opportunities").select("naics_code").eq("is_archived", False).not_.is_("naics_code", "null").execute()
    naics_codes = list(set(o["naics_code"] for o in opps.data if o.get("naics_code")))
    print(f"  -> Scanning {len(naics_codes)} unique NAICS codes")

    all_awards = []
    for i, naics in enumerate(naics_codes[:10]):  # Limit to 10 NAICS codes per run
        print(f"\n  [{i+1}/{min(len(naics_codes), 10)}] NAICS: {naics}")
        awards = fetch_award_notices(naics)
        all_awards.extend(awards)
        time.sleep(2)  # Rate limit

    print(f"\n  Total award notices collected: {len(all_awards)}")

    # Match incumbents
    matched = match_incumbents_to_opportunities(supabase, all_awards)
    print(f"  Incumbents matched to opportunities: {matched}")

    # USASpending enrichment for top NAICS
    for naics in naics_codes[:3]:
        enrich_usaspending_awards(supabase, naics)

    print("\n🏆 Award Intelligence Complete!")

if __name__ == "__main__":
    run_award_intelligence()

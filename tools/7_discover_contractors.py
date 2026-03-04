"""
Tool 7: Contractor Discovery Engine
Discovers contractors for HOT-matched opportunities via:
  1. SAM.gov Entity Management API (registered contractors by NAICS + state + set-aside)
  2. SerpAPI Google Local search (fallback for non-SAM contractors in radius)

Integrates with the enrichment pipeline as the first step:
  discover_contractors -> enrich_contacts -> download_attachments
"""
import os
import sys
import time
import json
import requests
from datetime import datetime, timedelta
from supabase import create_client, Client

# ---------------------------------------------------------------------------
# ENV LOADING (consistent with existing tools pattern)
# ---------------------------------------------------------------------------
def load_env_file(filepath=".env"):
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    os.environ[k.strip()] = v.strip().strip("'").strip('"')

# Load env from project root (parent of tools/)
_script_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.dirname(_script_dir)
load_env_file(os.path.join(_project_root, ".env.local"))
load_env_file(os.path.join(_project_root, ".env"))

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
SAM_API_KEY = os.getenv("SAM_API_KEY")
SERPAPI_KEY = os.getenv("SERPAPI_KEY")

# Budget caps
SERPAPI_MONTHLY_AUTO_CAP = 80
SERPAPI_MONTHLY_MANUAL_CAP = 20
SAM_ENTITY_DELAY = 6  # seconds between SAM Entity API calls (10 req/min limit)

# ---------------------------------------------------------------------------
# SAM.GOV ENTITY SEARCH
# ---------------------------------------------------------------------------
def search_sam_entities(naics_code, state, set_aside_code=None, page=0):
    """
    Search SAM.gov Entity Management API for registered contractors.
    GET https://api.sam.gov/entity-information/v3/entities

    Returns list of normalized contractor dicts ready for DB upsert.
    """
    if not SAM_API_KEY:
        print("  ⚠️ SAM_API_KEY not set, skipping SAM entity search")
        return []

    url = "https://api.sam.gov/entity-information/v3/entities"
    params = {
        "samRegistered": "Yes",
        "registrationStatus": "A",  # Active registrations only
        "page": page,
        "size": 10,
    }

    if naics_code:
        params["naicsCode"] = str(naics_code)
    if state:
        params["physicalAddressProvinceOrStateCode"] = state

    # Map common set-aside descriptions to SAM business type codes
    if set_aside_code:
        sa_lower = set_aside_code.lower() if set_aside_code else ""
        if "8(a)" in sa_lower:
            params["sbaBusinessTypeCode"] = "A4"
        elif "hubzone" in sa_lower:
            params["sbaBusinessTypeCode"] = "XX"
        elif "sdvosb" in sa_lower or "service-disabled" in sa_lower:
            params["businessTypeCode"] = "QF"
        elif "wosb" in sa_lower or "women" in sa_lower:
            params["businessTypeCode"] = "A2"
        elif "small" in sa_lower:
            params["businessTypeCode"] = "2X"  # Small business

    try:
        headers = {"X-Api-Key": SAM_API_KEY}
        res = requests.get(url, params=params, headers=headers, timeout=30)

        if res.status_code == 429:
            print("  ⚠️ SAM Entity API rate limited. Waiting 30s...")
            time.sleep(30)
            return search_sam_entities(naics_code, state, set_aside_code, page)

        if res.status_code != 200:
            print(f"  ❌ SAM Entity API error: {res.status_code} - {res.text[:200]}")
            return []

        data = res.json()
        entities = data.get("entityData", [])

        if not entities:
            return []

        contractors = []
        for entity in entities:
            core = entity.get("entityRegistration", {})
            core_data = entity.get("coreData", {})
            assertions = entity.get("assertions", {})
            phys_addr = core_data.get("physicalAddress", {})

            # POC data is at top level, not under coreData
            poc_data = entity.get("pointsOfContact", {})
            if not poc_data:
                poc_data = core_data.get("pointsOfContact", {})
            govt_poc = poc_data.get("governmentBusinessPOC", {}) or {}
            ebiz_poc = poc_data.get("electronicBusinessPOC", {}) or {}

            # Use whichever POC has the most info
            primary_poc = govt_poc if govt_poc.get("firstName") else ebiz_poc
            poc_name = f"{primary_poc.get('firstName', '')} {primary_poc.get('lastName', '')}".strip() or None
            poc_title = primary_poc.get("title")
            poc_email = primary_poc.get("email") or govt_poc.get("email") or ebiz_poc.get("email")
            poc_phone = (primary_poc.get("USPhone") or primary_poc.get("nonUSPhone")
                         or govt_poc.get("USPhone") or ebiz_poc.get("USPhone"))

            # Extract NAICS codes from assertions.goodsAndServices
            entity_naics = []
            goods = assertions.get("goodsAndServices", {})
            naics_list = goods.get("naicsList", [])
            if isinstance(naics_list, list):
                for n in naics_list:
                    code = n.get("naicsCode") if isinstance(n, dict) else str(n)
                    if code:
                        entity_naics.append(str(code))
            # Also add primary NAICS if present
            primary_naics = goods.get("primaryNaics")
            if primary_naics and str(primary_naics) not in entity_naics:
                entity_naics.insert(0, str(primary_naics))

            # Extract certifications from businessTypes
            certs = []
            biz_types_data = core_data.get("businessTypes", {})
            biz_type_list = biz_types_data.get("businessTypeList", []) if isinstance(biz_types_data, dict) else []
            sba_list = biz_types_data.get("sbaBusinessTypeList", []) if isinstance(biz_types_data, dict) else []
            for bt in biz_type_list + sba_list:
                bt_desc = (bt.get("businessTypeDesc") or bt.get("sbaBusinessTypeDesc") or "").upper()
                if "8(A)" in bt_desc:
                    certs.append("8A")
                elif "HUBZONE" in bt_desc:
                    certs.append("HUBZone")
                elif "SERVICE-DISABLED" in bt_desc or "SDVOSB" in bt_desc:
                    certs.append("SDVOSB")
                elif "WOMEN" in bt_desc or "WOSB" in bt_desc:
                    certs.append("WOSB")
                elif "VETERAN" in bt_desc:
                    certs.append("VOSB")

            uei = core.get("ueiSAM") or core.get("uei")
            if not uei:
                continue

            # Website from entity info
            entity_url = core_data.get("entityInformation", {}).get("entityURL")

            contractor = {
                "uei": uei,
                "cage_code": core.get("cageCode"),
                "company_name": core.get("legalBusinessName", "Unknown"),
                "dba_name": core.get("dbaName"),
                "sam_registered": True,
                "state": phys_addr.get("stateOrProvinceCode"),
                "city": phys_addr.get("city"),
                "zip_code": phys_addr.get("zipCode"),
                "address_line_1": phys_addr.get("addressLine1"),
                "country_code": phys_addr.get("countryCode", "USA"),
                "naics_codes": entity_naics if entity_naics else None,
                "sba_certifications": certs if certs else None,
                "primary_poc_name": poc_name,
                "primary_poc_title": poc_title,
                "primary_poc_email": poc_email,
                "primary_poc_phone": poc_phone,
                "business_url": entity_url,
                "activation_date": core.get("activationDate"),
                "expiration_date": core.get("registrationExpirationDate") or core.get("expirationDate"),
                "enrichment_source": "sam_entity",
            }
            contractors.append(contractor)

        return contractors

    except requests.exceptions.Timeout:
        print("  ⚠️ SAM Entity API timeout")
        return []
    except Exception as e:
        print(f"  ❌ SAM Entity API error: {e}")
        return []


# ---------------------------------------------------------------------------
# SERPAPI GOOGLE LOCAL SEARCH
# ---------------------------------------------------------------------------
def search_google_local(query, location):
    """
    SerpAPI Google Local/Maps search for contractors not on SAM.gov.
    Returns list of normalized contractor dicts.
    Uses 1 SerpAPI credit per call.
    """
    if not SERPAPI_KEY:
        print("  ⚠️ SERPAPI_KEY not set, skipping Google Local search")
        return []

    try:
        params = {
            "engine": "google_local",
            "q": query,
            "location": location,
            "api_key": SERPAPI_KEY,
            "num": 20,
        }
        res = requests.get("https://serpapi.com/search", params=params, timeout=15)

        if res.status_code != 200:
            print(f"  ❌ SerpAPI error: {res.status_code}")
            return []

        data = res.json()
        local_results = data.get("local_results", [])

        contractors = []
        for result in local_results:
            name = result.get("title", "").strip()
            if not name:
                continue

            address = result.get("address", "")
            # Parse state from address (last element before zip typically)
            state = None
            city = None
            if address:
                parts = [p.strip() for p in address.split(",")]
                if len(parts) >= 2:
                    city = parts[-2] if len(parts) >= 3 else parts[0]
                    # State is often in the last part with zip
                    state_zip = parts[-1].strip()
                    state_parts = state_zip.split()
                    if state_parts:
                        state = state_parts[0]

            contractor = {
                "company_name": name,
                "sam_registered": False,
                "city": city,
                "state": state,
                "address_line_1": address,
                "primary_poc_phone": result.get("phone"),
                "business_url": result.get("website") or result.get("link"),
                "google_rating": result.get("rating"),
                "google_reviews_count": result.get("reviews"),
                "google_place_id": result.get("place_id"),
                "enrichment_source": "google_local",
            }
            contractors.append(contractor)

        return contractors

    except Exception as e:
        print(f"  ❌ SerpAPI Google Local error: {e}")
        return []


# ---------------------------------------------------------------------------
# NAICS DESCRIPTION LOOKUP (for building search queries)
# ---------------------------------------------------------------------------
NAICS_DESCRIPTIONS = {
    # 6-digit specific codes (federal contracting common)
    "236220": "Commercial Building Construction",
    "237110": "Water & Sewer Line Construction",
    "237130": "Power & Communication Line Construction",
    "237310": "Highway & Street Construction",
    "238110": "Poured Concrete Foundation",
    "238210": "Electrical Contractors",
    "238220": "Plumbing, Heating & AC Contractors",
    "238290": "Other Building Equipment Contractors",
    "238310": "Drywall & Insulation Contractors",
    "238910": "Site Preparation Contractors",
    "238990": "All Other Specialty Trade Contractors",
    "332710": "Machine Shops",
    "332911": "Industrial Valve Manufacturing",
    "332991": "Ball & Roller Bearing Manufacturing",
    "332994": "Small Arms Manufacturing",
    "333120": "Construction Machinery Manufacturing",
    "333517": "Machine Tool Manufacturing",
    "333613": "Mechanical Power Transmission Equipment",
    "333618": "Other Engine Equipment Manufacturing",
    "333914": "Measuring & Dispensing Pump Manufacturing",
    "334419": "Other Electronic Component Manufacturing",
    "334511": "Search & Navigation Equipment",
    "334514": "Totalizing Fluid Meter Manufacturing",
    "335931": "Current-Carrying Wiring Devices",
    "336310": "Motor Vehicle Gasoline Engine Parts",
    "336330": "Motor Vehicle Steering & Suspension",
    "336350": "Motor Vehicle Transmission Parts",
    "336390": "Other Motor Vehicle Parts",
    "336411": "Aircraft Manufacturing",
    "336413": "Other Aircraft Parts Manufacturing",
    "336611": "Ship Building & Repairing",
    "339113": "Surgical Appliance & Supplies",
    "339991": "Gasket, Packing & Sealing Devices",
    "326122": "Plastics Pipe & Pipe Fitting Manufacturing",
    "541330": "Engineering Services",
    "541511": "Custom Computer Programming",
    "541512": "Computer Systems Design",
    "541519": "Other Computer Related Services",
    "541611": "Administrative Management Consulting",
    "541620": "Environmental Consulting",
    "541690": "Other Scientific & Technical Consulting",
    "541990": "All Other Professional Services",
    "561210": "Facilities Support Services",
    "561612": "Security Guards & Patrol Services",
    "561720": "Janitorial Services",
    "561730": "Landscaping Services",
    "561790": "Other Services to Buildings",
    "562111": "Solid Waste Collection",
    "562991": "Septic Tank & Portable Toilet Services",
    "611430": "Professional Development Training",
    "711219": "Other Spectator Sports",
    "812320": "Drycleaning & Laundry Services",
    # 3-digit sector fallbacks
    "236": "Construction", "237": "Heavy & Civil Engineering Construction",
    "238": "Specialty Trade Contractors", "332": "Fabricated Metal Manufacturing",
    "333": "Machinery Manufacturing", "334": "Electronics Manufacturing",
    "335": "Electrical Equipment Manufacturing", "336": "Transportation Equipment Manufacturing",
    "339": "Miscellaneous Manufacturing", "326": "Plastics & Rubber Manufacturing",
    "541": "Professional & Technical Services", "561": "Administrative & Support Services",
    "562": "Waste Management & Remediation", "611": "Educational Services",
    "621": "Healthcare", "711": "Performing Arts & Spectator Sports",
    "721": "Accommodation", "722": "Food Services",
    "811": "Repair & Maintenance", "812": "Personal & Laundry Services",
}

def get_naics_description(naics_code):
    """Get a human-readable description for a NAICS code."""
    if not naics_code:
        return "contractor"
    code = str(naics_code).strip()
    # Try exact 6-digit match first
    if code in NAICS_DESCRIPTIONS:
        return NAICS_DESCRIPTIONS[code]
    # Try 3-digit sector match
    if code[:3] in NAICS_DESCRIPTIONS:
        return NAICS_DESCRIPTIONS[code[:3]]
    # Fallback
    return f"NAICS {code} contractor"


# ---------------------------------------------------------------------------
# DATABASE OPERATIONS
# ---------------------------------------------------------------------------
def upsert_contractor(supabase, contractor_data):
    """
    Upsert a contractor to the DB.
    If UEI exists, update. If no UEI (Google Local), insert by company_name match or create new.
    Returns the contractor ID.
    """
    uei = contractor_data.get("uei")

    if uei:
        # SAM entity - upsert on UEI
        try:
            res = supabase.table("contractors").upsert(
                contractor_data, on_conflict="uei"
            ).execute()
            if res.data:
                return res.data[0]["id"]
        except Exception as e:
            print(f"    ❌ DB upsert error for UEI {uei}: {e}")
            return None
    else:
        # Google Local - check if company already exists by name + state
        name = contractor_data.get("company_name", "")
        state = contractor_data.get("state", "")
        try:
            existing = supabase.table("contractors").select("id").ilike(
                "company_name", f"%{name}%"
            ).eq("state", state).limit(1).execute()

            if existing.data:
                # Update existing
                cid = existing.data[0]["id"]
                contractor_data.pop("company_name", None)  # Don't overwrite name
                supabase.table("contractors").update(contractor_data).eq("id", cid).execute()
                return cid
            else:
                # Insert new
                res = supabase.table("contractors").insert(contractor_data).execute()
                if res.data:
                    return res.data[0]["id"]
        except Exception as e:
            print(f"    ❌ DB insert error for {name}: {e}")
            return None

    return None


def link_contractor_to_opportunity(supabase, opportunity_id, contractor_id, job_id, source):
    """Create opportunity_contractors link if not exists."""
    try:
        supabase.table("opportunity_contractors").upsert({
            "opportunity_id": opportunity_id,
            "contractor_id": contractor_id,
            "enrichment_job_id": job_id,
            "discovery_source": source,
            "enrichment_status": "discovered",
        }, on_conflict="opportunity_id,contractor_id").execute()
    except Exception as e:
        print(f"    ❌ Link error: {e}")


def enrich_usaspending(supabase, contractor_id, uei):
    """Fetch federal award history from USASpending.gov (free, no key needed)."""
    if not uei or len(uei) < 10:
        return
    try:
        payload = {
            "filters": {
                "recipient_search_text": [uei],
                "award_type_codes": ["A", "B", "C", "D"],
            }
        }
        res = requests.post(
            "https://api.usaspending.gov/api/v2/search/spending_by_award_count/",
            json=payload, timeout=10
        )
        if res.status_code == 200:
            data = res.json()
            results = data.get("results", {})
            contracts = results.get("contracts", 0)
            count = contracts if isinstance(contracts, int) else (contracts.get("count", 0) if isinstance(contracts, dict) else 0)
            supabase.table("contractors").update({
                "federal_awards_count": count,
            }).eq("id", contractor_id).execute()
    except Exception:
        pass


def create_enrichment_job(supabase, opportunity_id, trigger_type="auto"):
    """Create an enrichment_jobs record, returns job_id."""
    try:
        res = supabase.table("enrichment_jobs").insert({
            "opportunity_id": opportunity_id,
            "trigger_type": trigger_type,
            "status": "running",
            "started_at": datetime.utcnow().isoformat(),
        }).execute()
        if res.data:
            return res.data[0]["id"]
    except Exception as e:
        print(f"  ❌ Failed to create enrichment job: {e}")
    return None


def get_serpapi_credits_used_this_month(supabase):
    """Count SerpAPI credits used this month by counting enrichment jobs."""
    first_of_month = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0).isoformat()
    try:
        res = supabase.table("opportunity_contractors").select(
            "id", count="exact"
        ).eq("discovery_source", "google_local").gte(
            "created_at", first_of_month
        ).execute()
        # Each Google Local search = ~1 credit, rough estimate
        return res.count or 0
    except Exception:
        return 0


# ---------------------------------------------------------------------------
# MAIN DISCOVERY PIPELINE
# ---------------------------------------------------------------------------
def discover_for_opportunity(supabase, opportunity, job_id, serpapi_budget_remaining):
    """
    Discover contractors for a single opportunity.
    1. Search SAM.gov Entity API by NAICS + state + set-aside
    2. If < 10 results, supplement with SerpAPI Google Local
    Returns (sam_count, google_count)
    """
    opp_id = opportunity["id"]
    naics = opportunity.get("naics_code")
    state = opportunity.get("place_of_performance_state")
    set_aside = opportunity.get("set_aside_code")
    title = opportunity.get("title", "Unknown")

    print(f"\n  📋 Opportunity: {title[:60]}")
    print(f"     NAICS: {naics} | State: {state} | Set-Aside: {set_aside}")

    # --- Phase 1: SAM Entity Search ---
    sam_contractors = []
    for page in range(10):  # Up to 100 results (10 per page)
        print(f"    -> SAM Entity search page {page + 1}...")
        batch = search_sam_entities(naics, state, set_aside, page=page)
        if not batch:
            break
        sam_contractors.extend(batch)
        time.sleep(SAM_ENTITY_DELAY)  # Rate limit compliance

    print(f"    -> Found {len(sam_contractors)} SAM-registered entities")

    # Upsert and link SAM contractors + fetch award history
    sam_linked = 0
    for c in sam_contractors:
        cid = upsert_contractor(supabase, c)
        if cid:
            link_contractor_to_opportunity(supabase, opp_id, cid, job_id, "sam_entity")
            uei = c.get("uei")
            if uei:
                enrich_usaspending(supabase, cid, uei)
            sam_linked += 1

    # --- Phase 2: Google Local (if SAM < 10 and budget allows) ---
    google_linked = 0
    if sam_linked < 10 and serpapi_budget_remaining > 0:
        naics_desc = get_naics_description(naics)
        city = opportunity.get("place_of_performance_city") or ""
        location = f"{city}, {state}" if state else "United States"
        query = f"{naics_desc} contractor"

        print(f"    -> Google Local search: '{query}' near '{location}'")
        google_contractors = search_google_local(query, location)
        print(f"    -> Found {len(google_contractors)} Google Local results")

        for c in google_contractors:
            cid = upsert_contractor(supabase, c)
            if cid:
                link_contractor_to_opportunity(supabase, opp_id, cid, job_id, "google_local")
                google_linked += 1

    total = sam_linked + google_linked
    print(f"    ✅ Total contractors discovered: {total} (SAM: {sam_linked}, Google: {google_linked})")
    return sam_linked, google_linked


def run_discovery_pipeline(opportunity_id=None, trigger_type="auto"):
    """
    Main entry point.
    If opportunity_id is provided, discovers for that single opportunity.
    Otherwise, finds all HOT-matched opportunities needing enrichment.
    """
    if not all([SUPABASE_URL, SUPABASE_SERVICE_KEY]):
        print("❌ Missing Supabase API keys in .env. Halting execution.")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    print("🔍 Starting Contractor Discovery Engine...")

    # Check SerpAPI budget
    serpapi_used = get_serpapi_credits_used_this_month(supabase)
    cap = SERPAPI_MONTHLY_AUTO_CAP if trigger_type == "auto" else SERPAPI_MONTHLY_AUTO_CAP + SERPAPI_MONTHLY_MANUAL_CAP
    serpapi_remaining = max(0, cap - serpapi_used)
    print(f"  💰 SerpAPI budget: {serpapi_remaining} credits remaining this month (used: {serpapi_used})")

    if opportunity_id:
        # Single opportunity mode (manual trigger)
        res = supabase.table("opportunities").select(
            "id, title, naics_code, place_of_performance_state, place_of_performance_city, set_aside_code"
        ).eq("id", opportunity_id).single().execute()

        if not res.data:
            print(f"  ❌ Opportunity {opportunity_id} not found")
            return

        opportunities = [res.data]
    else:
        # Auto mode: find HOT-matched opportunities not yet enriched
        # Step 1: Get unique opportunity IDs from HOT matches
        match_res = supabase.table("matches").select(
            "opportunity_id"
        ).eq("classification", "HOT").order("score", desc=True).limit(50).execute()

        if not match_res.data:
            print("  ✅ No HOT matches found requiring discovery.")
            return

        # Deduplicate opportunity IDs
        opp_ids = list(dict.fromkeys(m["opportunity_id"] for m in match_res.data if m.get("opportunity_id")))

        # Step 2: Fetch those opportunities, filtering to unenriched ones
        opportunities = []
        for oid in opp_ids:
            if len(opportunities) >= 5:
                break
            opp_res = supabase.table("opportunities").select(
                "id, title, naics_code, place_of_performance_state, place_of_performance_city, set_aside_code, enrichment_status"
            ).eq("id", oid).single().execute()
            if opp_res.data:
                status = opp_res.data.get("enrichment_status", "none")
                if status in (None, "none", "failed"):
                    opportunities.append(opp_res.data)

    if not opportunities:
        print("  ✅ All HOT opportunities already enriched.")
        return

    print(f"  -> Processing {len(opportunities)} opportunities for contractor discovery")

    total_sam = 0
    total_google = 0

    for opp in opportunities:
        opp_id = opp["id"]

        # Update opportunity status
        supabase.table("opportunities").update({
            "enrichment_status": "running"
        }).eq("id", opp_id).execute()

        # Create enrichment job
        job_id = create_enrichment_job(supabase, opp_id, trigger_type)
        if not job_id:
            continue

        # Run discovery
        sam_count, google_count = discover_for_opportunity(
            supabase, opp, job_id, serpapi_remaining
        )

        total_sam += sam_count
        total_google += google_count
        serpapi_remaining -= (1 if google_count > 0 else 0)

        # Update enrichment job
        supabase.table("enrichment_jobs").update({
            "contractors_found": sam_count + google_count,
            "status": "completed",
            "completed_at": datetime.utcnow().isoformat(),
        }).eq("id", job_id).execute()

        # Mark opportunity discovery complete (enrichment continues in tool 8)
        supabase.table("opportunities").update({
            "enrichment_status": "completed",
            "enrichment_completed_at": datetime.utcnow().isoformat(),
        }).eq("id", opp_id).execute()

    print(f"\n🎉 Discovery Complete!")
    print(f"   Total SAM entities: {total_sam}")
    print(f"   Total Google Local: {total_google}")
    print(f"   Total discovered: {total_sam + total_google}")


if __name__ == "__main__":
    opp_id = None
    trigger = "auto"

    for i, arg in enumerate(sys.argv[1:], 1):
        if arg == "--opportunity_id" and i < len(sys.argv) - 1:
            opp_id = sys.argv[i + 1]
        elif arg == "--trigger" and i < len(sys.argv) - 1:
            trigger = sys.argv[i + 1]

    run_discovery_pipeline(opportunity_id=opp_id, trigger_type=trigger)

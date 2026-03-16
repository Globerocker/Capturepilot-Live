import os
import requests
from supabase import create_client, Client
from datetime import datetime, timedelta

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

SAM_API_KEY = os.getenv("SAM_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

def ingest_sam_opportunities(days_back=2):
    """
    Deterministically fetches opportunities from SAM.gov based on architecture/1_sam_ingestion_sop.md
    """
    if not all([SAM_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY]):
        print("❌ Missing API keys in .env. Halting execution.")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    
    # Calculate Date Range
    today = datetime.now()
    posted_from_date = (today - timedelta(days=days_back)).strftime('%m/%d/%Y')
    posted_to_date = today.strftime('%m/%d/%Y')
    
    print(f"🔄 Starting SAM.gov Ingestion from {posted_from_date} to {posted_to_date}...")
    
    url = "https://api.sam.gov/opportunities/v2/search"
    limit = 1000
    ptypes = ["r", "p", "o", "k"] # Sources Sought, Presolicitation, Solicitation, Combined Synopsis/Solicitation
    
    total_upserted = 0
    
    for ptype in ptypes:
        print(f"\n📥 Fetching Notice Type: '{ptype}'")
        offset = 0
        keep_fetching = True
        
        while keep_fetching:
            params = {
                "postedFrom": posted_from_date,
                "postedTo": posted_to_date,
                "limit": limit,
                "offset": offset,
                "ptype": ptype
            }
            headers = {"X-Api-Key": SAM_API_KEY}

            try:
                response = requests.get(url, params=params, headers=headers, timeout=30)
                
                if response.status_code == 429:
                    print("⚠️ Rate limit hit. Sleeping for 10 seconds (per SOP)...")
                    import time
                    time.sleep(10)
                    continue
                    
                if response.status_code != 200:
                    print(f"❌ Failed to fetch page. Status: {response.status_code}")
                    break
                    
                data = response.json()
                ops_batch = data.get("opportunitiesData", [])
                
                if not ops_batch:
                    print("No more records for this type.")
                    keep_fetching = False
                    break
                    
                print(f"  -> Retrieved {len(ops_batch)} records. Normalizing payload...")
                
                # Normalize exactly per SOP
                db_payload = []
                for op in ops_batch:
                    # Map properties carefully as SAM API structure can be inconsistent
                    notice_id = op.get("noticeId")
                    if not notice_id:
                        continue # Skip malformed records silently per SOP
                        
                    # Extract resource links from raw data
                    raw_links = []
                    for rl in (op.get("resourceLinks") or []):
                        link_url = rl if isinstance(rl, str) else (rl.get("url", "") if isinstance(rl, dict) else "")
                        if link_url:
                            raw_links.append(link_url)

                    normalized = {
                        "notice_id": notice_id,
                        "title": op.get("title"),
                        "agency": op.get("department") or op.get("subtier") or op.get("agency"),
                        "organization_code": None, # Future mapping
                        "naics_code": op.get("naicsCode"),
                        "psc_code": op.get("classificationCode"),
                        "set_aside_code": op.get("typeOfSetAsideDescription"),
                        "notice_type": op.get("type"),
                        "posted_date": op.get("postedDate"),
                        "response_deadline": op.get("responseDeadLine"),
                        "place_of_performance_state": (op.get("placeOfPerformance") or {}).get("state", {}).get("code"),
                        "description": op.get("description"),  # SAM.gov description URL
                        "resource_links": raw_links if raw_links else [],
                        "raw_json": op
                    }
                    db_payload.append(normalized)
                
                if db_payload:
                    # Fix empty strings (Supabase rejects "" for timestamp/FK columns)
                    for row in db_payload:
                        if not row.get("response_deadline"):
                            row["response_deadline"] = None
                        if not row.get("posted_date"):
                            row["posted_date"] = None
                        if not row.get("psc_code"):
                            row["psc_code"] = None
                        if not row.get("naics_code"):
                            row["naics_code"] = None

                    try:
                        # Upsert batch to Supabase
                        res = supabase.table("opportunities").upsert(db_payload, on_conflict="notice_id").execute()
                        total_upserted += len(db_payload)
                        print(f"  ✅ Upserted batch of {len(db_payload)}. Moving to next offset.")
                    except Exception as db_err:
                        err_msg = str(db_err)
                        # Handle FK constraint errors by nulling bad codes and retrying
                        if "foreign key constraint" in err_msg or "23503" in err_msg:
                            print(f"  ⚠️ FK constraint error. Stripping unknown codes and retrying...")
                            # Collect valid NAICS and PSC codes from DB
                            try:
                                valid_naics = set()
                                valid_psc = set()
                                naics_res = supabase.table("naics_codes").select("code").execute()
                                psc_res = supabase.table("psc_codes").select("code").execute()
                                if naics_res.data:
                                    valid_naics = {r["code"] for r in naics_res.data}
                                if psc_res.data:
                                    valid_psc = {r["code"] for r in psc_res.data}

                                for row in db_payload:
                                    if row.get("naics_code") and row["naics_code"] not in valid_naics:
                                        row["naics_code"] = None
                                    if row.get("psc_code") and row["psc_code"] not in valid_psc:
                                        row["psc_code"] = None

                                res2 = supabase.table("opportunities").upsert(db_payload, on_conflict="notice_id").execute()
                                total_upserted += len(db_payload)
                                print(f"  ✅ Retry succeeded. Upserted {len(db_payload)} (some codes nulled).")
                            except Exception as retry_err:
                                print(f"  ❌ Retry also failed: {retry_err}")
                        else:
                            print(f"  ❌ DB Error Upserting Batch: {db_err}")
                
                offset += limit
                
            except requests.exceptions.RequestException as req_err:
                 print(f"❌ Request Exception: {req_err}")
                 break
                 
    print(f"\n🎉 Ingestion Complete. Total Opportunities Upserted: {total_upserted}")
    
    # Log progress according to Project Constitution
    with open("progress.md", "a") as f:
        f.write(f"\n* Ran SAM Ingestion Script. Fetched {total_upserted} records from {posted_from_date} to {posted_to_date}.\n")

if __name__ == "__main__":
    import sys
    days = int(sys.argv[1]) if len(sys.argv) > 1 else 7
    ingest_sam_opportunities(days_back=days)

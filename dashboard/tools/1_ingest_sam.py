import os
import requests
from supabase import create_client, Client
from dotenv import load_dotenv
from datetime import datetime, timedelta

load_dotenv()

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
    ptypes = ["r", "p", "o"] # Sources Sought, Presolicitation, Solicitation priorities
    
    total_upserted = 0
    
    for ptype in ptypes:
        print(f"\n📥 Fetching Notice Type: '{ptype}'")
        offset = 0
        keep_fetching = True
        
        while keep_fetching:
            params = {
                "api_key": SAM_API_KEY,
                "postedFrom": posted_from_date,
                "postedTo": posted_to_date,
                "limit": limit,
                "offset": offset,
                "ptype": ptype
            }
            
            try:
                response = requests.get(url, params=params, timeout=30)
                
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
                        "raw_json": op,
                        "resource_links": op.get("resourceLinks")
                    }
                    db_payload.append(normalized)
                
                if db_payload:
                    try:
                        # Upsert batch to Supabase
                        res = supabase.table("opportunities").upsert(db_payload, on_conflict="notice_id").execute()
                        total_upserted += len(db_payload)
                        print(f"  ✅ Upserted batch of {len(db_payload)}. Moving to next offset.")
                    except Exception as db_err:
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

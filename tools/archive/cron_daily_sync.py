import os
import requests
import time
from datetime import datetime, timedelta
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SAM_API_KEY = os.getenv("SAM_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not all([SAM_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY]):
    print("❌ Missing required API keys in .env. Halting.")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# ==========================================
# 1. Lookups & Helpers
# ==========================================
TYPE_MAPPING = {}
SET_ASIDE_MAPPING = {}

def load_lookups():
    global TYPE_MAPPING, SET_ASIDE_MAPPING
    # Load Opportunity Types
    res = supabase.table("opportunity_types").select("id, name").execute()
    for row in res.data:
        TYPE_MAPPING[row["name"].lower()] = row["id"]
        
    # Load Set Asides
    res = supabase.table("set_asides").select("id, code").execute()
    for row in res.data:
        SET_ASIDE_MAPPING[row["code"].upper()] = row["id"]

def get_agency_id(department, subtier, office):
    dept = department or "Unknown Department"
    sub = subtier or ""
    off = office or ""
    
    # Try exact match first
    res = supabase.table("agencies").select("id").eq("department", dept).eq("sub_tier", sub).eq("office", off).execute()
    if res.data:
        return res.data[0]["id"]
        
    # Upsert if not found
    try:
        payload = {"department": dept, "sub_tier": sub, "office": off}
        # The unique constraint is on (department, sub_tier, office)
        insert_res = supabase.table("agencies").upsert(payload, on_conflict="department,sub_tier,office").execute()
        if insert_res.data:
            return insert_res.data[0]["id"]
    except Exception as e:
        print(f"Error inserting agency {dept}: {e}")
    
    return None

def normalize_set_aside(raw_code):
    if not raw_code: return None
    code = str(raw_code).upper().strip()
    if "SBA" in code: return "SBA"
    if "SBP" in code: return "SBP"
    if "8A" in code: return "8A"
    if "SDVOSB" in code: return "SDVOSBC"
    if "WOSB" in code: return "WOSB"
    if "EDWOSB" in code: return "EDWOSB"
    if "HZC" in code or "HUBZONE" in code: return "HZC"
    return "NONE"

def normalize_notice_type(raw_type):
    if not raw_type: return None
    t = str(raw_type).lower().strip()
    if "solicitation" in t and "combined" in t: return "Combined Synopsis/Solicitation"
    if "presolicitation" in t: return "Presolicitation"
    if "solicitation" in t: return "Solicitation"
    if "sources sought" in t: return "Sources Sought"
    if "award" in t: return "Award Notice"
    return "Solicitation" # Fallback

# ==========================================
# 2. Sync Opportunities
# ==========================================
def sync_opportunities(days_back=1):
    today = datetime.now()
    posted_from_date = (today - timedelta(days=days_back)).strftime('%m/%d/%Y')
    posted_to_date = today.strftime('%m/%d/%Y')
    
    print(f"\n[OPPORTUNITIES] 🔄 Syncing SAM.gov from {posted_from_date} to {posted_to_date}...")
    
    url = "https://api.sam.gov/opportunities/v2/search"
    limit = 1000
    ptypes = ["r", "p", "o"] # Sources Sought, Presolicitation, Solicitation
    
    total_upserted = 0
    
    for ptype in ptypes:
        print(f"  -> Fetching Notice Type: '{ptype}'")
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
                    print("     ⚠️ Rate limit hit. Sleeping for 10 seconds...")
                    time.sleep(10)
                    continue
                    
                if response.status_code != 200:
                    print(f"     ❌ Failed to fetch page. Status: {response.status_code}")
                    break
                    
                data = response.json()
                ops_batch = data.get("opportunitiesData", [])
                
                if not ops_batch:
                    keep_fetching = False
                    break
                    
                print(f"     -> Parsing {len(ops_batch)} records...")
                
                db_payload = []
                for op in ops_batch:
                    notice_id = op.get("noticeId")
                    if not notice_id: continue
                        
                    # Agency Resolution
                    dept = op.get("department") or op.get("agency")
                    subtier = op.get("subtier")
                    office = op.get("office")
                    agency_id = get_agency_id(dept, subtier, office)
                    
                    # Types & Set Asides
                    raw_type = op.get("type")
                    norm_type = normalize_notice_type(raw_type)
                    type_id = TYPE_MAPPING.get(norm_type.lower()) if norm_type else None
                    
                    raw_set_aside = op.get("typeOfSetAsideDescription")
                    norm_sa = normalize_set_aside(raw_set_aside)
                    sa_id = SET_ASIDE_MAPPING.get(norm_sa)
                    
                    normalized = {
                        "notice_id": notice_id,
                        "title": op.get("title"),
                        "solicitation_number": op.get("solicitationNumber"),
                        "agency_id": agency_id,
                        "opportunity_type_id": type_id,
                        "set_aside_id": sa_id,
                        "naics_code": op.get("naicsCode"),
                        "psc_code": op.get("classificationCode"),
                        "posted_date": op.get("postedDate"),
                        "response_deadline": op.get("responseDeadLine"),
                        "active": op.get("active") == "Yes",
                        "link": op.get("uiLink")
                    }
                    db_payload.append(normalized)
                
                if db_payload:
                    try:
                        supabase.table("opportunities").upsert(db_payload, on_conflict="notice_id").execute()
                        total_upserted += len(db_payload)
                        print(f"     ✅ Upserted batch of {len(db_payload)} via normalized schema.")
                    except Exception as db_err:
                        print(f"     ❌ DB upsert error: {db_err}")
                
                offset += limit
                
            except Exception as e:
                 print(f"     ❌ Error during request: {e}")
                 break
                 
    print(f"[OPPORTUNITIES] 🎉 Sync complete. Upserted {total_upserted} records.")

# ==========================================
# 3. Sync Contractors (Entities)
# ==========================================
def sync_contractors(days_back=1):
    today = datetime.now()
    reg_date = (today - timedelta(days=days_back)).strftime('%Y-%m-%d')
    # Use SAM Entity Management API to find entities activated recently
    
    print(f"\n[CONTRACTORS] 🔄 Syncing SAM.gov Entities registered since {reg_date}...")
    
    url = "https://api.sam.gov/entity-information/v3/entities"
    limit = 100
    offset = 0
    total_upserted = 0
    keep_fetching = True
    
    while keep_fetching:
        params = {
            "api_key": SAM_API_KEY,
            "registrationDate": reg_date, # Registered on or after this date
            "limit": limit,
            "offset": offset
        }
        
        try:
            response = requests.get(url, params=params, timeout=30)
            
            if response.status_code == 429:
                print("     ⚠️ Rate limit hit. Sleeping for 10 seconds...")
                time.sleep(10)
                continue
                
            if response.status_code != 200:
                print(f"     ❌ Failed to fetch page. Status: {response.status_code}")
                # Fallback to outputting text if the API lacks v3 access
                print(f"     Response: {response.text[:200]}")
                break
                
            data = response.json()
            entities = data.get("entityData", [])
            
            if not entities:
                keep_fetching = False
                break
                
            print(f"     -> Parsing {len(entities)} entity records...")
            
            db_payload = []
            for item in entities:
                entity = item.get("entityRegistration", {})
                uei = entity.get("ueiSAM")
                if not uei: continue
                
                legal_name = entity.get("legalBusinessName")
                dba_name = entity.get("doingBusinessAsName")
                cage = entity.get("cageCode")
                
                # address
                phys_addr = entity.get("physicalAddress", {})
                
                # poc
                poc = entity.get("electronicBusinessPoc", {})
                
                record = {
                    "uei": uei,
                    "company_name": legal_name,
                    "dba_name": dba_name,
                    "cage_code": cage,
                    "address_line_1": phys_addr.get("addressLine1"),
                    "city": phys_addr.get("city"),
                    "state": phys_addr.get("stateOrProvinceCode"),
                    "zip_code": phys_addr.get("zipCode"),
                    "country_code": phys_addr.get("countryCode"),
                    
                    "primary_poc_name": f'{poc.get("firstName", "")} {poc.get("lastName", "")}'.strip(),
                    "primary_poc_email": poc.get("email"),
                    "primary_poc_phone": poc.get("usPhone"),
                    "is_sam_registered": True
                }
                
                # Optional: Handle NAICS and Certs if they exist in the v3 payload
                core = item.get("coreData", {})
                cert_data = item.get("assertions", {})
                naics = [n.get("naicsCode") for n in cert_data.get("naicsList", [])]
                if naics:
                    record["naics_codes"] = naics
                    
                business_types = core.get("businessTypes", [])
                certs = [bt.get("businessTypeCode") for bt in business_types]
                if certs:
                    record["sba_certifications"] = certs
                
                db_payload.append(record)
                
            if db_payload:
                try:
                    supabase.table("contractors").upsert(db_payload, on_conflict="uei").execute()
                    total_upserted += len(db_payload)
                    print(f"     ✅ Upserted batch of {len(db_payload)} entities.")
                except Exception as db_err:
                    print(f"     ❌ DB upsert error: {db_err}")
            
            offset += limit
            
        except Exception as e:
            print(f"     ❌ Error during request: {e}")
            break
            
    print(f"[CONTRACTORS] 🎉 Sync complete. Upserted {total_upserted} records.")

if __name__ == "__main__":
    print("="*60)
    print("🚀 INIT: CAPTURE PILOT 24-HOUR SYNC PIPELINE")
    print("="*60)
    load_lookups()
    
    # 1. Sync Opportunities
    sync_opportunities(days_back=1)
    
    # 2. Sync Entity Registrations (Contractors)
    sync_contractors(days_back=1)
    
    print("\n✅ Daily sync successfully executed.")

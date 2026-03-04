import os
import requests
import re
from datetime import datetime
from supabase import create_client, Client

# Simple dotenv implementation to avoid dependency issues
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
BING_API_KEY = os.getenv("BING_API_KEY")
YELP_API_KEY = os.getenv("YELP_API_KEY")

def chunk_list(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]

def enrich_usaspending(uei):
    """
    Queries USASpending API for federal award metrics based on UEI.
    Since this is a free public API, it's executed entirely.
    """
    if not uei or len(uei) < 10:
        return None
        
    try:
        # We will use the advanced search to get the total amount and count
        payload = {
            "filters": {
                "recipient_search_text": [uei],
                "award_type_codes": ["A", "B", "C", "D"], # Contracts
            }
        }
        res = requests.post("https://api.usaspending.gov/api/v2/search/spending_by_award_count/", json=payload, timeout=5)
        if res.status_code == 200:
            data = res.json()
            results = data.get("results", {})
            contracts = results.get("contracts", 0) if isinstance(results, dict) else 0
            
            count = contracts.get("count", 0) if isinstance(contracts, dict) else (contracts if isinstance(contracts, int) else 0)
            amount = contracts.get("total_amount", 0) if isinstance(contracts, dict) else 0
            
            return {
                "federal_awards_count": count,
                "total_award_volume": amount
            }
    except Exception as e:
        print(f"    - USASpending Error for {uei}: {e}")
    return None

def fetch_website_keywords(url):
    """
    Lightweight crawler to detect municipal/commercial/bonded capability.
    """
    if not url: return {}
    
    if not url.startswith("http"):
        url = "https://" + url
        
    try:
        res = requests.get(url, timeout=5, headers={"User-Agent": "Mozilla/5.0"})
        if res.status_code == 200:
            text = res.text.lower()
            return {
                "bonded_mentioned": "bond" in text or "insured" in text,
                "municipal_experience": "municipal" in text or "government" in text or "city" in text,
                # rough estimation of employee count / revenue if we wanted from parsing text
            }
    except Exception:
        pass
    return {}

def enrich_bing(company_name, state):
    """
    Calls Bing Web Search API to extract website and phone if missing.
    Gracefully returns mocked Data if key is missing.
    """
    if not BING_API_KEY:
        return {} # Graceful skip
        
    try:
        query = f"{company_name} {state} contact website"
        headers = {"Ocp-Apim-Subscription-Key": BING_API_KEY}
        params = {"q": query, "count": 1}
        res = requests.get("https://api.bing.microsoft.com/v7.0/search", headers=headers, params=params, timeout=5)
        if res.status_code == 200:
            data = res.json()
            top_result = data.get("webPages", {}).get("value", [])[0]
            return {"website": top_result.get("url")}
    except Exception as e:
        print(f"    - Bing Error: {e}")
    return {}

def enrich_contractors():
    if not all([SUPABASE_URL, SUPABASE_SERVICE_KEY]):
        print("❌ Missing Supabase API keys in .env. Halting execution.")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    print("🚀 Starting Contractor Data Enrichment...")

    # Fetch contractors that haven't been enriched yet (i.e. federal_awards_count is null)
    # We will limit to 50 for execution performance in early deployment
    res = supabase.table("contractors") \
        .select("id, company_name, uei, website, phone, state, data_quality_flag") \
        .is_("federal_awards_count", "null") \
        .neq("data_quality_flag", "LOW_QUALITY") \
        .limit(50) \
        .execute()
        
    contractors = res.data
    if not contractors:
        print("✅ No contractors require enrichment right now.")
        return
        
    print(f"  -> Found {len(contractors)} contractors to enrich in this batch.")
    
    updates = []
    
    for con in contractors:
        c_id = con["id"]
        c_name = con["company_name"]
        c_uei = con["uei"]
        c_web = con["website"]
        
        print(f"  -> Processing: {c_name} (UEI: {c_uei})")
        update_payload = {}
        
        # 1. USASpending
        usa_data = enrich_usaspending(c_uei)
        if usa_data:
            update_payload.update(usa_data)
        else:
            # Mark as 0 to avoid checking again immediately
            update_payload["federal_awards_count"] = 0
            update_payload["total_award_volume"] = 0
            
        # 2. Bing Search (For missing Websites)
        if not c_web:
            bing_data = enrich_bing(c_name, con.get("state", ""))
            if bing_data:
                update_payload.update(bing_data)
                c_web = bing_data.get("website")
                
        # 3. Crawler for Keyword Detection
        if c_web:
            keywords = fetch_website_keywords(c_web)
            if keywords:
                update_payload.update(keywords)
                
        # 4. LinkedIn Dork Generation
        slug = re.sub(r'[^a-zA-Z0-9]+', '-', c_name.lower()).strip('-')
        update_payload["company_linkedin"] = f"https://www.linkedin.com/company/{slug}"
        update_payload["owner_linkedin"] = f"https://www.google.com/search?q=site:linkedin.com/in+owner+founder+CEO+\"{c_name}\""
        
        updates.append({"id": c_id, "payload": update_payload})
        
    print(f"  -> Executing updates to DB...")
    
    # Apply updates
    success_count = 0
    for upd in updates:
        try:
            supabase.table("contractors").update(upd["payload"]).eq("id", upd["id"]).execute()
            success_count += 1
        except Exception as e:
            print(f"  ❌ DB Error updating {upd['id']}: {e}")
            
    print(f"✅ Enrichment complete. Successfully updated {success_count}/{len(contractors)} profiles.")

if __name__ == "__main__":
    enrich_contractors()

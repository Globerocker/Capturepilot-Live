import os
import requests
import time
from supabase import create_client, Client
from dotenv import load_dotenv
import urllib.parse

load_dotenv()

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

OVERPASS_URL = "http://overpass-api.de/api/interpreter"

def enrich_contractors():
    """Fetches contractors and attempts to find them on OpenStreetMap for enrichment."""
    if not all([SUPABASE_URL, SUPABASE_SERVICE_KEY]):
        print("❌ Missing Supabase API keys.")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    
    # Fetch contractors that haven't been enriched yet (we check within raw_json)
    print("🔍 Fetching contractors for enrichment...")
    res = supabase.table("contractors").select("id, company_name, city, state, raw_json").execute()
    contractors = res.data or []
    
    enriched_count = 0
    
    for c in contractors:
        raw = c.get("raw_json") or {}
        if "enrichment" in raw and "overpass" in raw["enrichment"]:
            continue # Already enriched
            
        company_name = c.get("company_name", "")
        city = c.get("city", "")
        
        if not company_name or not city:
            continue
            
        # Clean company name for better matching
        search_name = company_name.split(" LLC")[0].split(" INC")[0].split(" CORP")[0].strip()
        
        # Overpass QL Query
        # Search for nodes, ways, or relations in the given city with the firm's name
        query = f"""
        [out:json][timeout:25];
        area[name="{city}"]->.searchArea;
        (
          node["name"~"{search_name}", i](area.searchArea);
          way["name"~"{search_name}", i](area.searchArea);
          relation["name"~"{search_name}", i](area.searchArea);
        );
        out body;
        >;
        out skel qt;
        """
        
        try:
            print(f"🌍 Querying Overpass API for: {search_name} in {city}...")
            response = requests.post(OVERPASS_URL, data={'data': query}, timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                elements = data.get("elements", [])
                
                # If we found something, update the raw_json
                if elements:
                    print(f"   ✅ Found {len(elements)} OSM element(s) for {company_name}")
                    if "enrichment" not in raw:
                        raw["enrichment"] = {}
                    
                    # Store the best match's tags (usually contains website, phone, address, amenity type)
                    best_match = elements[0]
                    raw["enrichment"]["overpass"] = best_match.get("tags", {})
                    raw["enrichment"]["overpass"]["lat"] = best_match.get("lat")
                    raw["enrichment"]["overpass"]["lon"] = best_match.get("lon")
                    
                    # Update Supabase
                    supabase.table("contractors").update({"raw_json": raw}).eq("id", c["id"]).execute()
                    enriched_count += 1
                else:
                    print(f"   ❌ No OSM data found for {search_name}")
                    # Mark as attempted so we don't query again immediately
                    if "enrichment" not in raw:
                        raw["enrichment"] = {}
                    raw["enrichment"]["overpass"] = {"status": "not_found"}
                    supabase.table("contractors").update({"raw_json": raw}).eq("id", c["id"]).execute()
                    
            elif response.status_code == 429:
                print("⚠️ Overpass API Rate limit exceeded. Halting.")
                break
                
            # Sleep to respect Overpass API limits (max 1-2 requests per second)
            time.sleep(1.5)
            
        except Exception as e:
            print(f"Error enriching {company_name}: {e}")
            time.sleep(2)

    print(f"🎉 Enrichment complete. Successfully enriched {enriched_count} contractors.")

if __name__ == "__main__":
    enrich_contractors()

import os
import requests
from bs4 import BeautifulSoup
import uuid
import time
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not all([SUPABASE_URL, SUPABASE_SERVICE_KEY]):
    print("❌ Missing Supabase keys in .env. Halting.")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def search_duckduckgo(query, max_results=20):
    """
    Scrapes DuckDuckGo HTML results as a free crawler proxy for Bing/Yellowpages.
    (Note: In a true enterprise environment, use the Bing Web Search API or apify).
    """
    print(f"🔍 Crawling web for query: '{query}'")
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    
    url = f"https://html.duckduckgo.com/html/?q={requests.utils.quote(query)}"
    response = requests.get(url, headers=headers)
    
    if response.status_code != 200:
        print(f"❌ Failed to reach search engine. Status Code: {response.status_code}")
        return []
        
    soup = BeautifulSoup(response.text, 'html.parser')
    results = soup.find_all('div', class_='result')
    
    leads = []
    for r in results[:max_results]:
        title_tag = r.find('a', class_='result__url')
        snippet_tag = r.find('a', class_='result__snippet')
        
        if title_tag and snippet_tag:
            href = title_tag.get('href', '')
            # Clean up DDG redirect URLs
            if href.startswith('//duckduckgo.com/l/?uddg='):
                href = requests.utils.unquote(href.split('uddg=')[1].split('&')[0])
            
            domain = href.replace('https://', '').replace('http://', '').split('/')[0]
            domain = domain.replace('www.', '')
            
            title = r.find('h2', class_='result__title').text.strip()
            
            # Simple heuristic: Only ingest if it looks like a business website (not wikipedia, etc)
            ignore_domains = ['wikipedia', 'youtube', 'facebook', 'linkedin', 'twitter', 'instagram']
            if any(ig in domain for ig in ignore_domains):
                continue
                
            leads.append({
                "company_name": title,
                "business_url": href,
                "domain": domain,
                "description": snippet_tag.text.strip(),
                "query_source": query
            })
            
    return leads

def ingest_external_leads(queries):
    total_upserted = 0
    
    for query in queries:
        leads = search_duckduckgo(query)
        print(f"  -> Found {len(leads)} potential B2G external leads.")
        
        db_payload = []
        for lead in leads:
            # Generate a pseudo-UEI (Prefix 'EXT-' + unique hash) to satisfy the UNIQUE UEI constraint 
            # if that is the primary key. If UEI is the primary key, we MUST provide it.
            # Wait, the `contractors` table has 'id' as Primary Key, and 'uei' is uniquely constrained if varying.
            # Let's use a hashed domain for UEI fallback.
            pseudo_uei = f"EXT-{lead['domain'][:8].upper()}-{str(uuid.uuid4())[:4].upper()}"
            
            record = {
                "uei": pseudo_uei,
                "company_name": lead["company_name"][:255],
                "business_url": lead["business_url"],
                "is_sam_registered": False, # This marks it as an External Lead!
                # We can store the description in a notes field if one exists, 
                # or just ingest the core data.
                "address_line_1": f"Found via {lead['query_source']}",
                "city": "Unknown",
                "state": "XX",
                "country_code": "USA"
            }
            db_payload.append(record)
            
        if db_payload:
            try:
                # Upserting. If domain/name already exists, we might want to handle it, 
                # but unique UEI works here for external rapid ingestion.
                supabase.table("contractors").upsert(db_payload, on_conflict="uei").execute()
                total_upserted += len(db_payload)
                print(f"  ✅ Upserted {len(db_payload)} external leads to Supabase.")
            except Exception as e:
                print(f"  ❌ DB Error Upserting external leads: {e}")
                
        time.sleep(2) # Be polite to search engines
        
    print(f"\n🎉 External Web Crawler Complete. Upserted {total_upserted} Non-SAM entities.")

if __name__ == "__main__":
    print("="*60)
    print("🕸️  INIT: CAPTURE PILOT EXTERNAL PROSPECT CRAWLER")
    print("="*60)
    
    target_queries = [
        "top cybersecurity contractors defense",
        "AI software providers government directory",
        "logistics and supply chain contractors list USA"
    ]
    
    ingest_external_leads(target_queries)

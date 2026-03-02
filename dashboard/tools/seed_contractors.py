import os
import uuid
from supabase import create_client, Client
from dotenv import load_dotenv
import random

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

def seed_contractors():
    """Seeds 50 realistic fake B2G contractors to the DB"""
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    
    print("🔄 Generating 50 Mock B2G Contractors...")
    
    prefixes = ["Apex", "Nova", "Quantum", "Omega", "Titan", "Vanguard", "Patriot", "Zenith", "Meridian", "Vertex"]
    suffixes = ["Solutions", "Technologies", "Consulting", "Cybernetics", "Systems", "Logistics", "Defense", "Group", "Analytics", "Networks"]
    
    naics_pool = [
        "541512", "541511", "541519", "541611", "236220", "561210", 
        "541330", "541990", "561110", "334111", "611420", "541715"
    ]
    
    certs_pool = ["8(a)", "SDVOSB", "WOSB", "HUBZone", "Small Business"]
    states = ["VA", "MD", "DC", "CO", "TX", "CA", "FL", "NY", "PA", "OH"]
    
    contractors = []
    
    for i in range(50):
        name = f"{random.choice(prefixes)} {random.choice(suffixes)} LLC"
        
        # Give each contractor 2-4 NAICS codes
        company_naics = random.sample(naics_pool, k=random.randint(2, 4))
        
        # Give 0-2 certifications
        company_certs = random.sample(certs_pool, k=random.randint(0, 2))
        if "Small Business" not in company_certs:
            company_certs.append("Small Business")
            
        contractors.append({
            "id": str(uuid.uuid4()),
            "company_name": name,
            "uei": f"MOCK{random.randint(10000000, 99999999)}",
            "cage_code": f"{random.randint(10000, 99999)}",
            "naics_codes": company_naics,
            "certifications": company_certs,
            "state": random.choice(states),
            "raw_json": {"status": "mock_generated"}
        })
        
    try:
        supabase.table("contractors").upsert(contractors, on_conflict="id").execute()
        print("✅ Contractors Seeded Successfully.")
    except Exception as e:
        print(f"❌ Failed to seed contractors: {e}")

if __name__ == "__main__":
    seed_contractors()

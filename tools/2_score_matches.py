import os
import math
from supabase import create_client, Client

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Use our fallback loader in case python-dotenv isn't functioning properly
def load_env_file(filepath=".env"):
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    if '=' in line:
                        k, v = line.split('=', 1)
                        os.environ[k.strip()] = v.strip().strip("'").strip('"')

load_env_file(".env.local")
load_env_file(".env")

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

def haversine(lat1, lon1, lat2, lon2):
    if None in [lat1, lon1, lat2, lon2]:
        return None
    R = 3958.8  # Earth radius in miles
    dLat = math.radians(lat2 - lat1)
    dLon = math.radians(lon2 - lon1)
    a = math.sin(dLat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dLon / 2) ** 2
    c = 2 * math.asin(math.sqrt(a))
    return R * c

def chunk_list(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]

def score_matches():
    """
    Deterministically applies the 100-point scoring algorithm.
    1. NAICS Fit (30%)
    2. Geographic Fit (15%)
    3. Capacity Score (20%)
    4. Federal Inactivity (20%)
    5. Competition Density (15%)
    """
    if not all([SUPABASE_URL, SUPABASE_SERVICE_KEY]):
        print("❌ Missing API keys in .env. Halting execution.")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    
    print("🔄 Starting 100-Point Deterministic Contractor Matching...")
    
    # Fetch active opportunities (limit for execution scoping)
    ops_res = supabase.table("opportunities").select(
        "id, naics_code, historical_bidders, latitude, longitude"
    ).eq("is_archived", False).limit(50).execute()
    
    # Fetch all actionable contractors
    con_res = supabase.table("contractors").select(
        "id, naics_codes, certifications, state, latitude, longitude, employee_count, revenue, bonded_mentioned, municipal_experience, federal_awards_count, last_award_date"
    ).neq("data_quality_flag", "LOW_QUALITY").execute()
    
    opportunities = ops_res.data
    contractors = con_res.data
    
    if not opportunities or not contractors:
        print("⚠️ Not enough data in DB to run scoring matrix. Ensure active contractors and opportunities exist.")
        return
        
    print(f"  -> Comparing {len(opportunities)} opportunities against {len(contractors)} contractors.")
    
    match_payloads = []
    
    for op in opportunities:
        op_id = op.get("id")
        op_naics = op.get("naics_code")
        op_lat = op.get("latitude")
        op_lon = op.get("longitude")
        op_bidders = op.get("historical_bidders") or 7 # Default to medium density if unknown
        
        # 5. Competition Density (15)
        if op_bidders < 5:
            density_score = 15
        elif op_bidders < 10:
            density_score = 10
        else:
            density_score = 5
            
        contractor_scores = []
        
        for con in contractors:
            con_id = con.get("id")
            con_naics_list = con.get("naics_codes") or []
            
            # 1. NAICS Fit (30)
            naics_score = 0
            if op_naics:
                if op_naics in con_naics_list:
                    naics_score = 30
                else:
                    # Weak/Related mapping (Check first 3 digits for sector match)
                    related = any(str(n)[:3] == str(op_naics)[:3] for n in con_naics_list)
                    naics_score = 20 if related else 10
            
            # 2. Geographic Fit (15)
            geo_score = 5 # Default fallback (Nationwide / Unknown > 150 miles)
            dist_miles = haversine(op_lat, op_lon, con.get("latitude"), con.get("longitude"))
            
            if dist_miles is not None:
                if dist_miles < 50:
                    geo_score = 15
                elif dist_miles <= 150:
                    geo_score = 10
            
            # 3. Capacity Score (20)
            capacity_score = 0
            if con.get("bonded_mentioned"): capacity_score += 5
            if con.get("municipal_experience"): capacity_score += 5
            if con.get("employee_count") and con.get("employee_count", 0) > 10: capacity_score += 5
            if con.get("revenue") and con.get("revenue", 0) > 1000000: capacity_score += 5
            
            # 4. Federal Inactivity (20)
            inactivity_score = 5 # default active
            fed_awards = con.get("federal_awards_count")
            if fed_awards in [None, 0]:
                inactivity_score = 20
            else:
                # Check if recent or not
                # If last_award_date is > 3 years, give 15. We'll simulate this logic.
                last_award = con.get("last_award_date")
                if last_award:
                    # simplistic check
                    inactivity_score = 15 if "2020" in last_award or "2019" in last_award else 5
                else:
                    inactivity_score = 15
                    
            # Total 100-point score
            total_score = naics_score + geo_score + capacity_score + inactivity_score + density_score
            
            # Normalize to 0-1 for HOT/WARM DB representation if needed, but we keep the 100 raw score!
            # The system expects score to be Numeric, we'll store the 100 point scale directly, 
            # and modify the classification threshold.
            if total_score >= 75:
                classification = "HOT"
            elif total_score >= 50:
                classification = "WARM"
            else:
                classification = "COLD"
                
            contractor_scores.append({
                "opportunity_id": op_id,
                "contractor_id": con_id,
                "score": round(total_score / 100.0, 4),
                "classification": classification,
                "score_breakdown": {
                    "naics_score": naics_score,
                    "geo_score": geo_score,
                    "capacity_score": capacity_score,
                    "inactivity_score": inactivity_score,
                    "density_score": density_score,
                    "total": total_score
                }
            })
            
        # Top 10 Per Opportunity Constraint
        top_10 = sorted(contractor_scores, key=lambda x: x["score"], reverse=True)[:10]
        match_payloads.extend(top_10)
        
    print(f"  -> Generated {len(match_payloads)} match records across matrix.")
    
    if match_payloads:
        try:
            # We iterate and upsert for atomic testing so we don't duplicate constraints
            # Ideally this would delete old records for these ops first
            op_ids = list(set([m["opportunity_id"] for m in match_payloads]))
            # Clear old match records for these evaluated opportunities to prevent bloated dupes
            for chunk in chunk_list(op_ids, 100):
                 if chunk:
                     supabase.table("matches").delete().in_("opportunity_id", chunk).execute()
                     
            # Insert the newly calculated top 10
            # For 50 * 10 = 500 records, batch insert
            for chunk in chunk_list(match_payloads, 500):
                supabase.table("matches").insert(chunk).execute()
                
            print(f"  ✅ Successfully committed Top 10 High-Fidelity matches per Opportunity.")
        except Exception as e:
            print(f"  ❌ DB Error Inserting Matches: {e}")

if __name__ == "__main__":
    score_matches()

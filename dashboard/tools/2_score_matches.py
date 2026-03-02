import os
import math
from datetime import datetime, timezone
from supabase import create_client, Client
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

def haversine(lat1, lon1, lat2, lon2):
    if None in [lat1, lon1, lat2, lon2]:
        return 999.0 # Unknown distance
    R = 3958.8 # Radius of earth in miles
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2) * math.sin(dlat/2) + math.cos(math.radians(lat1)) \
        * math.cos(math.radians(lat2)) * math.sin(dlon/2) * math.sin(dlon/2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

def score_matches():
    if not all([SUPABASE_URL, SUPABASE_SERVICE_KEY]):
        print("❌ Missing API keys in .env.")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    
    print("🔄 Starting 100-Point Match Engine (Minimum 15 Candidates)...")
    
    # Fetch active opportunities that need matching (simplification: fetch recent 10)
    ops_res = supabase.table("opportunities").select("*").limit(10).execute()
    con_res = supabase.table("contractors").select("*").execute()
    
    opportunities = ops_res.data or []
    contractors = con_res.data or []
    
    if not opportunities or not contractors:
        print("⚠️ Not enough data in DB.")
        return
        
    print(f"  -> Processing {len(opportunities)} opportunities against {len(contractors)} contractors.")
    
    all_new_matches = []
    
    for op in opportunities:
        op_id = op.get("id")
        op_naics = op.get("naics_code") or []
        if isinstance(op_naics, str):
            op_naics = [op_naics]
            
        reqs = op.get("structured_requirements") or {}
        strat = op.get("strategic_scoring") or {}
        
        min_workforce = reqs.get("min_workforce", 0)
        est_comp = strat.get("est_competition_level", "Medium")
        
        # We don't have op lat/lon natively right now, so we approximate or use 0
        op_lat = op.get("lat")
        op_lon = op.get("lon")
        
        contractor_scores = []
        
        for con in contractors:
            con_id = con.get("id")
            
            # --- 1. NAICS FIT (0-30) ---
            naics_score = 10 # Weak
            con_naics = con.get("naics_codes") or []
            if isinstance(con_naics, str):
                con_naics = [con_naics]
                
            for n in op_naics:
                if n in con_naics:
                    naics_score = 30
                    break
                # Check related (first 4 digits)
                for cn in con_naics:
                    if str(n)[:4] == str(cn)[:4]:
                        naics_score = max(naics_score, 20)
            
            # --- 2. GEO FIT (0-15) ---
            geo_score = 0
            distance = haversine(op_lat, op_lon, con.get("lat"), con.get("lon"))
            
            if distance == 999.0:
                # If no coords, fallback to state match
                if op.get("place_of_performance_state") == con.get("state"):
                    geo_score = 15
                    distance = 25 # Assume local
                else:
                    geo_score = 5
                    distance = 250
            else:
                if distance < 50:
                    geo_score = 15
                elif distance <= 150:
                    geo_score = 10
                elif distance <= 300:
                    geo_score = 5
                else:
                    geo_score = 0
                    
            # --- 3. CAPACITY SCORE (0-20) ---
            cap_score = 10 # Unknown
            emp = con.get("employee_count")
            if emp is not None:
                if emp >= min_workforce:
                    cap_score = 20
                else:
                    cap_score = 5
            elif min_workforce == 0:
                cap_score = 20 # None required
                
            # --- 4. FEDERAL INACTIVITY (0-20) ---
            fed_score = 5 # Active
            total_awards = con.get("total_federal_awards", 0)
            status = con.get("federal_activity_status", "")
            if total_awards == 0 or status == "Never Awarded":
                fed_score = 20
            elif status == "Inactive 12+ Months":
                fed_score = 15
                
            # --- 5. COMPETITION ADJUSTMENT (0-15) ---
            comp_score = 10 # Medium
            if est_comp == "Low":
                comp_score = 15
            elif est_comp == "High":
                comp_score = 5
                
            total_score = naics_score + geo_score + cap_score + fed_score + comp_score
            
            # Classification
            if total_score >= 80:
                classification = "HOT"
            elif total_score >= 60:
                classification = "WARM"
            else:
                classification = "COLD"
                
            contractor_scores.append({
                "opportunity_id": op_id,
                "contractor_id": con_id,
                "score": total_score,
                "classification": classification,
                "distance_miles": round(distance, 1),
                "score_breakdown": {
                    "naics_fit": naics_score,
                    "geo_fit": geo_score,
                    "capacity": cap_score,
                    "federal_inactivity": fed_score,
                    "competition_adjustment": comp_score,
                    "total_score": total_score
                }
            })
            
        # Top 15 Constraints (5 good, 5 backup, 5 hidden gems basically organically happens by score sort)
        top_15 = sorted(contractor_scores, key=lambda x: x["score"], reverse=True)[:15]
        
        # Ensure we always return at least 15 if DB has them.
        all_new_matches.extend(top_15)
        
    print(f"  -> Generated {len(all_new_matches)} matches across {len(opportunities)} ops.")
    
    if all_new_matches:
        try:
            # Upsert
            supabase.table("matches").upsert(all_new_matches, on_conflict="opportunity_id, contractor_id").execute()
            print("  ✅ Successfully committed Top 15 matches per Opportunity.")
        except Exception as e:
            print(f"  ❌ DB Upsert Error: {e}")

if __name__ == "__main__":
    score_matches()

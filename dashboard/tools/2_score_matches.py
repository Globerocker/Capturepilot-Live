import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

def score_matches():
    """
    Deterministically applies the Phase 1 blueprint formula described in architecture/2_contractor_matching_sop.md
    """
    if not all([SUPABASE_URL, SUPABASE_SERVICE_KEY]):
        print("❌ Missing API keys in .env. Halting execution.")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    
    print("🔄 Starting Deterministic Contractor Matching...")
    
    # For a real run we'd paginate, but for atomicity we select newly created opportunities
    # Currently extracting a subset just to demonstrate logic engine mapping
    ops_res = supabase.table("opportunities").select("id, naics_code, set_aside_code, place_of_performance_state, response_deadline").limit(10).execute()
    con_res = supabase.table("contractors").select("id, naics_codes, certifications, state").execute()
    
    opportunities = ops_res.data
    contractors = con_res.data
    
    if not opportunities or not contractors:
        print("⚠️ Not enough data in DB to run scoring matrix. Ensure contractors exist.")
        return
        
    print(f"  -> Comparing {len(opportunities)} opportunities against {len(contractors)} contractors.")
    
    match_payloads = []
    
    for op in opportunities:
        op_id = op.get("id")
        op_naics = op.get("naics_code")
        op_setaside = op.get("set_aside_code")
        op_state = op.get("place_of_performance_state")
        
        # Calculate days until deadline for feasibility score
        deadline_score = 0.5 # Default fallback
        # Real logic would parse `op.get("response_deadline")` and date-math here
        
        contractor_scores = []
        
        for con in contractors:
            con_id = con.get("id")
            
            # Binary variables
            naics_match = 1 if op_naics and con.get("naics_codes") and op_naics in con["naics_codes"] else 0
            psc_match = 0 # Not fully implemented yet
            setaside_match = 1 if op_setaside and con.get("certifications") and op_setaside in con["certifications"] else 0
            geo_match = 1 if op_state and con.get("state") and op_state == con["state"] else 0
            
            # SOP Formula
            score = (
                (0.25 * naics_match) + 
                (0.15 * psc_match) + 
                (0.20 * setaside_match) + 
                (0.15 * geo_match) + 
                (0.15 * 0.5) +  # contract_value_fit fallback placeholder
                (0.10 * deadline_score) 
            )
            
            # Classification Tiering
            if score >= 0.70:
                classification = "HOT"
            elif score >= 0.50:
                classification = "WARM"
            else:
                classification = "COLD"
                
            contractor_scores.append({
                "opportunity_id": op_id,
                "contractor_id": con_id,
                "score": round(score, 4),
                "classification": classification,
                "score_breakdown": {
                    "naics_match": naics_match,
                    "psc_match": psc_match,
                    "setaside_match": setaside_match,
                    "geo_match": geo_match,
                    "contract_value_fit": 0.5,
                    "deadline_feasibility": deadline_score
                }
            })
            
        # Top 10 Per Opportunity Constraint mapping
        top_10 = sorted(contractor_scores, key=lambda x: x["score"], reverse=True)[:10]
        match_payloads.extend(top_10)
        
    print(f"  -> Generated {len(match_payloads)} match records across matrix.")
    
    if match_payloads:
        try:
            # We assume deleting old matches for these exact op_ids first, or just upserting
            # For simplicity of exact script logic, direct insert matching DB schema
            supabase.table("matches").insert(match_payloads).execute()
            print("  ✅ Successfully committed Top 10 matches per Opportunity to database.")
        except Exception as e:
            print(f"  ❌ DB Error Inserting Matches: {e}")

if __name__ == "__main__":
    score_matches()

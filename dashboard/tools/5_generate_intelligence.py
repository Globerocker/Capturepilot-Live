import os
from supabase import create_client, Client
from dotenv import load_dotenv
from datetime import datetime, timedelta

load_dotenv()

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

def generate_intelligence():
    """Calculates weekly intelligence metrics and saves to agency_intelligence_logs."""
    if not all([SUPABASE_URL, SUPABASE_SERVICE_KEY]):
        print("❌ Missing API keys in .env. Halting execution.")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    
    today = datetime.now()
    # Find the most recent Sunday
    days_since_sunday = (today.weekday() + 1) % 7
    week_start = (today - timedelta(days=days_since_sunday)).date()

    print(f"🧠 Generating Intelligence for week starting: {week_start}")

    # Fetch last 30 days of opportunities
    thirty_days_ago = (today - timedelta(days=30)).isoformat()
    res = supabase.table("opportunities").select("naics_code, agencies(department, sub_tier)").gte("posted_date", thirty_days_ago).execute()
    
    ops = res.data or []
    
    # Calculate top agencies
    agency_counts = {}
    naics_counts = {}
    
    for op in ops:
        ag = op.get("agencies") or {}
        agency_name = ag.get("sub_tier") or ag.get("department") or "Unknown"
        if agency_name != "Unknown":
            agency_counts[agency_name] = agency_counts.get(agency_name, 0) + 1
            
        naics = op.get("naics_code")
        if naics:
            naics_counts[naics] = naics_counts.get(naics, 0) + 1
            
    # Sort and take top 5
    top_agencies = dict(sorted(agency_counts.items(), key=lambda item: item[1], reverse=True)[:5])
    top_naics = dict(sorted(naics_counts.items(), key=lambda item: item[1], reverse=True)[:5])
    
    # Generate mock competition trends based on volume (deterministic logic)
    total_ops = len(ops)
    if total_ops > 100:
        trend_summary = f"High solicitation volume ({total_ops} notices) indicates aggressive end-of-quarter push. Competition is expected to be fierce across IT and Services sectors."
    elif total_ops > 50:
        trend_summary = f"Moderate active pipeline with {total_ops} new notices. Expect standard competition rates across most bureaus."
    else:
        trend_summary = f"Low solicitation volume ({total_ops} notices). Ideal time to position capabilities proactively before the next major RFP wave."
        
    competition_trends = {
        "summary": trend_summary
    }
    
    # Example deterministic certification performance
    cert_perf = {
        "8(a)": {"mentions": top_naics.get(list(top_naics.keys())[0], 12) if top_naics else 10, "trend": "up"},
        "SDVOSB": {"mentions": top_naics.get(list(top_naics.keys())[1], 8) if len(top_naics) > 1 else 5, "trend": "up"},
        "WOSB": {"mentions": 4, "trend": "down"}
    }
    
    payload = {
        "week_start": week_start.isoformat(),
        "top_naics": top_naics,
        "top_agencies": top_agencies,
        "certification_performance": cert_perf,
        "win_rate_by_score_band": {}, 
        "competition_trends": competition_trends,
        "generated_at": today.isoformat()
    }
    
    try:
        # Note: supabase upserts by primary/unique key, ensure week_start has a UNIQUE constraint or use insert if not
        # we'll fetch first to see if it exists
        existing = supabase.table("agency_intelligence_logs").select("week_start").eq("week_start", week_start.isoformat()).execute()
        if existing.data:
             supabase.table("agency_intelligence_logs").update(payload).eq("week_start", week_start.isoformat()).execute()
        else:
             supabase.table("agency_intelligence_logs").insert(payload).execute()
        print("✅ Successfully generated and saved Intelligence Log.")
    except Exception as e:
        print(f"❌ Error saving Intelligence Log: {e}")

if __name__ == "__main__":
    generate_intelligence()

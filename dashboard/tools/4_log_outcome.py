import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

def ingest_outcome_feedback(opportunity_id, contractor_id, won, loss_reason=None, hours_spent=0.0):
    """
    Deterministically logs the outcome of a pursuit so the engine learns.
    """
    if not all([SUPABASE_URL, SUPABASE_SERVICE_KEY]):
        print("❌ Missing API keys in .env. Halting execution.")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    
    payload = {
        "opportunity_id": opportunity_id,
        "contractor_id": contractor_id,
        "submitted": True,
        "won": won,
        "loss_reason": loss_reason,
        "bid_hours_spent": hours_spent
    }
    
    try:
        supabase.table("capture_outcomes").upsert(payload).execute()
        print(f"✅ Outcome logged for Opportunity {opportunity_id} & Contractor {contractor_id}. Won: {won}")
    except Exception as e:
        print(f"❌ Error logging outcome: {e}")

if __name__ == "__main__":
    print("This is a module meant to be imported by the routing engine, not run directly.")

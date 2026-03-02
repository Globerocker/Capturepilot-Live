import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

def test_supabase_connection():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("❌ Error: SUPABASE_URL or SUPABASE_SERVICE_KEY is not set in .env")
        return

    print("🔍 Testing Supabase Database Connectivity...")

    try:
        # Initialize the Supabase client using the Service Role Key for backend administrative tasks
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        
        # We will attempt a very basic API call to see if the client initializes and endpoints resolve.
        # Since we just laid out the schema but haven't run SQL DDL yet, we'll try to query a standard postgREST endpoint
        # or just authenticate the client headers. A simple request against a known potential table.
        # Note: If the `opportunities` table doesn't exist yet, it will return a 404/400, but that STILL proves
        # the network connection and API keys are functioning.
        
        # Test request
        response = supabase.table("opportunities").select("id").limit(1).execute()
        
        # If we get here without an exception, the connection was successful, even if empty string is returned
        print("✅ SUCCESS: Supabase connection established and authenticated successfully.")
        print(f"📊 Response Data: {response.data}")

    except Exception as e:
        err_str = str(e)
        if "relation \"public.opportunities\" does not exist" in err_str or "PGRST205" in err_str or "Could not find the table" in err_str:
             print("✅ SUCCESS: Network connection & authentication verified (Database empty; tables not created yet).")
        else:
            print(f"❌ Exception occurred: {e}")

if __name__ == "__main__":
    test_supabase_connection()

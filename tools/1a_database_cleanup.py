import os
from datetime import datetime, timedelta, timezone
from supabase import create_client, Client
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

def chunk_list(lst, n):
    """Yield successive n-sized chunks from lst."""
    for i in range(0, len(lst), n):
        yield lst[i:i + n]

def database_cleanup():
    if not all([SUPABASE_URL, SUPABASE_SERVICE_KEY]):
        print("❌ Missing API keys in .env. Halting execution.")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    print("🧹 Starting Database Cleanup...")

    # 1. Archive outdated opportunities
    print("⏳ Archiving outdated opportunities...")
    now = datetime.now(timezone.utc)
    one_year_ago = now - timedelta(days=365)
    
    # We will do this via batching to avoid statement timeouts on large datasets (like 50k+ records)
    try:
        print("  -> Archiving past deadline...")
        archived_count = 0
        while True:
            res = supabase.table("opportunities").select("id").lt("response_deadline", now.isoformat()).eq("is_archived", False).limit(2000).execute()
            if not res.data: break
            
            ids = [op["id"] for op in res.data]
            supabase.table("opportunities").update({"is_archived": True}).in_("id", ids).execute()
            archived_count += len(ids)
        print(f"  -> Archived {archived_count} opportunities past their deadline.")

        print("  -> Archiving past 365 days...")
        archived_old_count = 0
        while True:
            res = supabase.table("opportunities").select("id").lt("posted_date", one_year_ago.isoformat()).eq("is_archived", False).limit(2000).execute()
            if not res.data: break
            
            ids = [op["id"] for op in res.data]
            supabase.table("opportunities").update({"is_archived": True}).in_("id", ids).execute()
            archived_old_count += len(ids)
        print(f"  -> Archived {archived_old_count} opportunities older than 365 days.")
    except Exception as e:
        print(f"  ❌ Error archiving opportunities: {e}")

    # 3. Data Quality Flag
    print("🔍 Flagging LOW_QUALITY contractors...")
    try:
        # Contractors with no website, phone, or location (city/state)
        # We can't do a complex IS NULL OR IS NULL in a single clean client call without an RPC,
        # so we will pull down contractors with missing data and update them.
        # To avoid pulling 70k rows, we'll just execute a raw SQL if possible, or paginated fetch
        print("  -> Running pagination to evaluate quality flags...")
        
        page_size = 1000
        offset = 0
        low_quality_ids = []
        
        while True:
            res = supabase.table("contractors").select("id, website, phone, city, state, data_quality_flag").range(offset, offset + page_size - 1).execute()
            data = res.data
            
            if not data:
                break
                
            for con in data:
                # If no website AND no phone AND (no city or no state)
                if not con.get("website") and not con.get("phone") and (not con.get("city") and not con.get("state")):
                    if con.get("data_quality_flag") != 'LOW_QUALITY':
                        low_quality_ids.append(con["id"])
            
            offset += page_size
            
        print(f"  -> Found {len(low_quality_ids)} LOW_QUALITY contractors. Updating...")
        
        # Batch update
        for chunk in chunk_list(low_quality_ids, 500):
            for con_id in chunk:
                # the python supabase client doesn't support bulk update with 'in' easily without a loop or RPC
                # We'll do an in_ filter update
                pass
            
            if chunk:
                try:
                    supabase.table("contractors").update({"data_quality_flag": "LOW_QUALITY"}).in_("id", chunk).execute()
                except Exception as e:
                     print(f"  ❌ Error updating chunk: {e}")
                    
        print(f"  ✅ Finished quality flagging.")
        
    except Exception as e:
        print(f"  ❌ Error assessing data quality: {e}")


    # 2. Deduplicate contractors
    print("👯 Deduplicating contractors...")
    try:
        # For memory efficiency and performance, we'll deduplicate based on UEI first.
        # This is a basic implementation of merging missing fields into the primary record.
        page_size = 5000
        offset = 0
        uei_map = {}
        duplicates_to_delete = []
        updates = []
        
        print("  -> Fetching contractors for UEI deduplication...")
        while True:
            res = supabase.table("contractors").select("id, uei, company_name, website, phone, state, city, sam_registered").range(offset, offset + page_size - 1).execute()
            
            if not res.data:
                break
                
            for con in res.data:
                uei = con.get("uei")
                if not uei: continue
                
                if uei not in uei_map:
                    uei_map[uei] = {"primary": con, "dupes": []}
                else:
                    uei_map[uei]["dupes"].append(con)
            
            offset += page_size
            
        merge_count = 0
        for uei, group in uei_map.items():
            if not group["dupes"]: continue
            
            primary = group["primary"]
            dupes = group["dupes"]
            
            # Determine the best primary based on sam_registered and completeness
            all_records = [primary] + dupes
            # Sort so sam_registered is first, then by number of populated fields
            all_records.sort(key=lambda x: (x.get("sam_registered", False), len([v for v in x.values() if v])), reverse=True)
            
            best_primary = all_records[0]
            other_dupes = all_records[1:]
            
            new_primary_data = best_primary.copy()
            merge_happened = False
            
            for dupe in other_dupes:
                duplicates_to_delete.append(dupe["id"])
                # Merge missing fields
                for key, val in dupe.items():
                    if key != "id" and not new_primary_data.get(key) and val:
                        new_primary_data[key] = val
                        merge_happened = True
            
            if merge_happened:
                # We remove 'id' and 'created_at' before update
                update_payload = {k: v for k, v in new_primary_data.items() if k not in ("id", "created_at")}
                updates.append({"id": best_primary["id"], "payload": update_payload})
                merge_count += 1
                
        print(f"  -> Found {len(duplicates_to_delete)} duplicate UEI records to merge.")
        
        # Execute merging updates
        for upd in updates:
            supabase.table("contractors").update(upd["payload"]).eq("id", upd["id"]).execute()
            
        # Delete duplicates
        for chunk in chunk_list(duplicates_to_delete, 200):
            if chunk:
                supabase.table("contractors").delete().in_("id", chunk).execute()
                
        print(f"  ✅ Deduplication complete. Deleted {len(duplicates_to_delete)} duplicates and updated {merge_count} primary records.")
        
    except Exception as e:
        print(f"  ❌ Error deduplicating contractors: {e}")

    print("🏁 Database cleanup finished successfully.")

if __name__ == "__main__":
    database_cleanup()

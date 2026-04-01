"""
Strategic Intelligence Database — Lifecycle Management & Cleanup
================================================================
Runs the lifecycle state machine + retention rules + contractor quality flags.

State transitions (in order):
  ACTIVE → EXPIRING_SOON (deadline within 7 days)
  ACTIVE/EXPIRING_SOON → EXPIRED (deadline passed)
  MARKET_RESEARCH → INTELLIGENCE (Sources Sought past deadline)
  EXPIRED → ARCHIVED (deadline > 120 days, not protected)
  ARCHIVED → DELETE (archived > 12 months, not protected)
  INTELLIGENCE → DELETE (> 24 months AND no related solicitation)

Never delete:
  - retention_protected = true (incumbents, awards, strategies)
  - AWARDED status
"""
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

_script_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.dirname(_script_dir)
load_env_file(os.path.join(_project_root, ".env.local"))
load_env_file(os.path.join(_project_root, ".env"))
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

BATCH_SIZE = 2000

def chunk_list(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]

def batch_update(supabase, table, select_query_fn, update_payload, description):
    """Generic batch update: select IDs matching criteria, update in chunks."""
    total = 0
    while True:
        res = select_query_fn().limit(BATCH_SIZE).execute()
        if not res.data:
            break
        ids = [r["id"] for r in res.data]
        for chunk in chunk_list(ids, 500):
            supabase.table(table).update(update_payload).in_("id", chunk).execute()
        total += len(ids)
    if total > 0:
        print(f"  ✅ {description}: {total} records")
    return total

def database_cleanup():
    if not all([SUPABASE_URL, SUPABASE_SERVICE_KEY]):
        print("❌ Missing API keys in .env. Halting execution.")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    now = datetime.now(timezone.utc)
    seven_days = (now + timedelta(days=7)).isoformat()
    now_iso = now.isoformat()
    days_120_ago = (now - timedelta(days=120)).isoformat()
    months_12_ago = (now - timedelta(days=365)).isoformat()
    months_24_ago = (now - timedelta(days=730)).isoformat()

    print("=" * 60)
    print("Strategic Intelligence — Lifecycle Management")
    print(f"Time: {now.strftime('%Y-%m-%d %H:%M UTC')}")
    print("=" * 60)

    stats = {}

    # ================================================================
    # 1. ACTIVE → EXPIRING_SOON (deadline within 7 days)
    # ================================================================
    print("\n⏰ Transition: ACTIVE → EXPIRING_SOON...")
    stats["expiring_soon"] = 0
    while True:
        res = (supabase.table("opportunities").select("id")
               .eq("status", "ACTIVE")
               .lt("response_deadline", seven_days)
               .gt("response_deadline", now_iso)
               .limit(BATCH_SIZE).execute())
        if not res.data:
            break
        ids = [r["id"] for r in res.data]
        for chunk in chunk_list(ids, 500):
            supabase.table("opportunities").update({"status": "EXPIRING_SOON"}).in_("id", chunk).execute()
        stats["expiring_soon"] += len(ids)
    print(f"  ✅ {stats['expiring_soon']} marked EXPIRING_SOON")

    # ================================================================
    # 2. ACTIVE/EXPIRING_SOON → EXPIRED (deadline passed)
    # ================================================================
    print("\n📅 Transition: ACTIVE/EXPIRING_SOON → EXPIRED...")
    stats["expired"] = 0
    for status_val in ("ACTIVE", "EXPIRING_SOON"):
        while True:
            res = (supabase.table("opportunities").select("id")
                   .eq("status", status_val)
                   .lt("response_deadline", now_iso)
                   .limit(BATCH_SIZE).execute())
            if not res.data:
                break
            ids = [r["id"] for r in res.data]
            for chunk in chunk_list(ids, 500):
                supabase.table("opportunities").update({"status": "EXPIRED"}).in_("id", chunk).execute()
            stats["expired"] += len(ids)
    print(f"  ✅ {stats['expired']} marked EXPIRED")

    # ================================================================
    # 3. MARKET_RESEARCH → INTELLIGENCE (Sources Sought past deadline)
    # ================================================================
    print("\n🔬 Transition: MARKET_RESEARCH → INTELLIGENCE...")
    stats["intelligence"] = 0
    while True:
        res = (supabase.table("opportunities").select("id")
               .eq("status", "MARKET_RESEARCH")
               .lt("response_deadline", now_iso)
               .limit(BATCH_SIZE).execute())
        if not res.data:
            break
        ids = [r["id"] for r in res.data]
        for chunk in chunk_list(ids, 500):
            supabase.table("opportunities").update({
                "status": "INTELLIGENCE",
                "retention_protected": True,
                "retention_reason": "intelligence"
            }).in_("id", chunk).execute()
        stats["intelligence"] += len(ids)
    print(f"  ✅ {stats['intelligence']} Sources Sought → INTELLIGENCE (protected)")

    # ================================================================
    # 4. EXPIRED → ARCHIVED (deadline > 120 days, not protected)
    # ================================================================
    print("\n📦 Transition: EXPIRED → ARCHIVED (120+ days, unprotected)...")
    stats["archived"] = 0
    while True:
        res = (supabase.table("opportunities").select("id")
               .eq("status", "EXPIRED")
               .lt("response_deadline", days_120_ago)
               .eq("retention_protected", False)
               .limit(BATCH_SIZE).execute())
        if not res.data:
            break
        ids = [r["id"] for r in res.data]
        for chunk in chunk_list(ids, 500):
            supabase.table("opportunities").update({"status": "ARCHIVED"}).in_("id", chunk).execute()
        stats["archived"] += len(ids)
    print(f"  ✅ {stats['archived']} marked ARCHIVED")

    # ================================================================
    # 5. DELETE: ARCHIVED > 12 months, not protected
    # ================================================================
    print("\n🗑️  Deleting: ARCHIVED > 12 months (unprotected)...")
    stats["deleted"] = 0
    while True:
        res = (supabase.table("opportunities").select("id")
               .eq("status", "ARCHIVED")
               .lt("status_changed_at", months_12_ago)
               .eq("retention_protected", False)
               .limit(BATCH_SIZE).execute())
        if not res.data:
            break
        ids = [r["id"] for r in res.data]
        for chunk in chunk_list(ids, 200):
            supabase.table("opportunities").delete().in_("id", chunk).execute()
        stats["deleted"] += len(ids)
    print(f"  ✅ Deleted {stats['deleted']} old ARCHIVED records")

    # ================================================================
    # 6. DELETE: INTELLIGENCE > 24 months WITH no related solicitation
    # ================================================================
    print("\n🗑️  Deleting: INTELLIGENCE > 24 months (no linked solicitation)...")
    stats["intel_deleted"] = 0
    while True:
        res = (supabase.table("opportunities").select("id")
               .eq("status", "INTELLIGENCE")
               .lt("posted_date", months_24_ago)
               .is_("related_notice_id", "null")
               .eq("retention_protected", False)
               .limit(BATCH_SIZE).execute())
        if not res.data:
            break
        ids = [r["id"] for r in res.data]
        for chunk in chunk_list(ids, 200):
            supabase.table("opportunities").delete().in_("id", chunk).execute()
        stats["intel_deleted"] += len(ids)
    print(f"  ✅ Deleted {stats['intel_deleted']} old unlinked INTELLIGENCE records")

    # ================================================================
    # 7. Flag LOW_QUALITY contractors
    # ================================================================
    print("\n🔍 Flagging LOW_QUALITY contractors...")
    stats["low_quality"] = 0
    page_size = 1000
    offset = 0
    low_quality_ids = []

    while True:
        res = supabase.table("contractors").select("id, website, phone, city, state, data_quality_flag").range(offset, offset + page_size - 1).execute()
        if not res.data:
            break
        for con in res.data:
            if not con.get("website") and not con.get("phone") and (not con.get("city") and not con.get("state")):
                if con.get("data_quality_flag") != 'LOW_QUALITY':
                    low_quality_ids.append(con["id"])
        offset += page_size

    for chunk in chunk_list(low_quality_ids, 500):
        if chunk:
            try:
                supabase.table("contractors").update({"data_quality_flag": "LOW_QUALITY"}).in_("id", chunk).execute()
            except Exception as e:
                print(f"  ❌ Error updating chunk: {e}")
    stats["low_quality"] = len(low_quality_ids)
    print(f"  ✅ Flagged {stats['low_quality']} LOW_QUALITY contractors")

    # ================================================================
    # 8. Contractor deduplication (by UEI)
    # ================================================================
    print("\n👯 Deduplicating contractors by UEI...")
    page_size = 5000
    offset = 0
    uei_map = {}
    duplicates_to_delete = []
    updates = []

    while True:
        res = supabase.table("contractors").select("id, uei, company_name, website, phone, state, city, sam_registered").range(offset, offset + page_size - 1).execute()
        if not res.data:
            break
        for con in res.data:
            uei = con.get("uei")
            if not uei:
                continue
            if uei not in uei_map:
                uei_map[uei] = {"primary": con, "dupes": []}
            else:
                uei_map[uei]["dupes"].append(con)
        offset += page_size

    merge_count = 0
    for uei, group in uei_map.items():
        if not group["dupes"]:
            continue
        all_records = [group["primary"]] + group["dupes"]
        all_records.sort(key=lambda x: (x.get("sam_registered", False), len([v for v in x.values() if v])), reverse=True)
        best_primary = all_records[0]
        other_dupes = all_records[1:]
        new_primary_data = best_primary.copy()
        merge_happened = False
        for dupe in other_dupes:
            duplicates_to_delete.append(dupe["id"])
            for key, val in dupe.items():
                if key != "id" and not new_primary_data.get(key) and val:
                    new_primary_data[key] = val
                    merge_happened = True
        if merge_happened:
            update_payload = {k: v for k, v in new_primary_data.items() if k not in ("id", "created_at")}
            updates.append({"id": best_primary["id"], "payload": update_payload})
            merge_count += 1

    for upd in updates:
        supabase.table("contractors").update(upd["payload"]).eq("id", upd["id"]).execute()
    for chunk in chunk_list(duplicates_to_delete, 200):
        if chunk:
            supabase.table("contractors").delete().in_("id", chunk).execute()
    print(f"  ✅ Merged {merge_count} records, deleted {len(duplicates_to_delete)} duplicates")

    # ================================================================
    # Summary
    # ================================================================
    print(f"\n{'='*60}")
    print("🏁 Lifecycle Management Complete")
    for k, v in stats.items():
        print(f"  {k}: {v}")
    print(f"{'='*60}")

if __name__ == "__main__":
    database_cleanup()

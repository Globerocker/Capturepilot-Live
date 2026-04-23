"""
Tool 11: Backfill Missing Fields from raw_json
Extracts structured data from the raw_json column (full SAM.gov API response)
to populate missing fields on opportunities.

Fields backfilled:
  - description
  - agency
  - department
  - place_of_performance_city
  - place_of_performance_state
  - set_aside_code

All extraction is deterministic (no AI). Runs in batches of 50.
"""
import os
import json
from supabase import create_client, Client


# ---------------------------------------------------------------------------
# ENV LOADING (same pattern as other tools)
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------
def chunk_list(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]


def safe_get(d, *keys, default=None):
    """Safely traverse nested dicts/lists."""
    current = d
    for key in keys:
        if isinstance(current, dict):
            current = current.get(key)
        elif isinstance(current, list) and isinstance(key, int) and key < len(current):
            current = current[key]
        else:
            return default
        if current is None:
            return default
    return current


def extract_description(raw):
    desc = raw.get("description")
    if desc is None:
        return None

    if isinstance(desc, str) and desc.strip():
        return desc.strip()

    # SAM v2 API returns description as a list of sections
    if isinstance(desc, list):
        bodies = []
        for section in desc:
            if isinstance(section, dict):
                body = section.get("body")
                if body and isinstance(body, str):
                    bodies.append(body.strip())
        if bodies:
            return "\n\n".join(bodies)

    data_desc = safe_get(raw, "data", "description")
    if isinstance(data_desc, str) and data_desc.strip():
        return data_desc.strip()

    return None


def extract_agency(raw):
    parent_path = raw.get("fullParentPathName")
    if parent_path and isinstance(parent_path, str):
        parts = [p.strip() for p in parent_path.split(".") if p.strip()]
        if len(parts) >= 2:
            return parts[1]
        if len(parts) == 1:
            return parts[0]

    for field in ["department", "subtier", "agency"]:
        val = raw.get(field)
        if val and isinstance(val, str) and val.strip():
            return val.strip()

    org_hierarchy = raw.get("organizationHierarchy")
    if isinstance(org_hierarchy, list) and len(org_hierarchy) > 0:
        for org in org_hierarchy:
            if isinstance(org, dict):
                name = org.get("name") or org.get("organizationName")
                if name:
                    return name.strip()

    return None


def extract_department(raw):
    parent_path = raw.get("fullParentPathName")
    if parent_path and isinstance(parent_path, str):
        parts = [p.strip() for p in parent_path.split(".") if p.strip()]
        if parts:
            return parts[0]

    for field in ["departmentName", "department"]:
        val = raw.get(field)
        if val and isinstance(val, str) and val.strip():
            return val.strip()

    return None


def extract_pop_city(raw):
    pop = raw.get("placeOfPerformance")
    if not isinstance(pop, dict):
        return None

    city = pop.get("city")
    if isinstance(city, dict):
        return city.get("name") or city.get("cityName")
    if isinstance(city, str) and city.strip():
        return city.strip()

    return None


def extract_pop_state(raw):
    pop = raw.get("placeOfPerformance")
    if not isinstance(pop, dict):
        return None

    state = pop.get("state")
    if isinstance(state, dict):
        return state.get("code") or state.get("stateCode")
    if isinstance(state, str) and state.strip():
        return state.strip()

    return None


def extract_set_aside(raw):
    for field in ["typeOfSetAsideDescription", "typeOfSetAside", "setAsideDescription", "setAside"]:
        val = raw.get(field)
        if val and isinstance(val, str) and val.strip():
            return val.strip()
    return None


# ---------------------------------------------------------------------------
# MAIN BACKFILL LOGIC
# ---------------------------------------------------------------------------

def backfill_from_rawjson():
    if not all([SUPABASE_URL, SUPABASE_SERVICE_KEY]):
        print("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env. Halting.")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    print("=== Backfill from raw_json - Starting ===\n")

    # Step 1: Sample a raw_json to log its structure for debugging
    sample = supabase.table("opportunities").select("raw_json").not_.is_("raw_json", "null").limit(1).execute()
    if sample.data:
        rj = sample.data[0]["raw_json"]
        print("Sample raw_json top-level keys:")
        if isinstance(rj, dict):
            print(f"  {list(rj.keys())}")
            pop = rj.get("placeOfPerformance")
            if pop:
                print(f"  placeOfPerformance: {json.dumps(pop, indent=4)}")
            desc = rj.get("description")
            if desc:
                if isinstance(desc, list) and len(desc) > 0:
                    print(f"  description: list[{len(desc)}], first item keys: {list(desc[0].keys()) if isinstance(desc[0], dict) else type(desc[0]).__name__}")
                elif isinstance(desc, str):
                    print(f"  description: string, length={len(desc)}")
                else:
                    print(f"  description: type={type(desc).__name__}")
            else:
                print("  description: NOT PRESENT in raw_json")
            fppn = rj.get("fullParentPathName")
            if fppn:
                print(f"  fullParentPathName: {fppn}")
            for sa_field in ["typeOfSetAsideDescription", "typeOfSetAside", "setAsideDescription"]:
                val = rj.get(sa_field)
                if val:
                    print(f"  {sa_field}: {val}")
        print()
    else:
        print("WARNING: No records with raw_json found. Nothing to backfill.\n")
        return

    # Step 2: Fetch ALL opportunities that have raw_json
    print("Fetching opportunities with raw_json...")

    fields = "id, description, agency, department, place_of_performance_city, place_of_performance_state, set_aside_code, raw_json"
    page_size = 1000
    offset = 0
    all_rows = []

    while True:
        res = supabase.table("opportunities").select(fields).not_.is_("raw_json", "null").range(offset, offset + page_size - 1).execute()
        batch = res.data
        if not batch:
            break
        all_rows.extend(batch)
        offset += page_size
        if len(batch) < page_size:
            break

    print(f"  -> Total opportunities with raw_json: {len(all_rows)}")

    # Step 3: For each row, determine which fields are missing and can be extracted
    updates_to_apply = []
    field_stats = {
        "description": 0,
        "agency": 0,
        "department": 0,
        "place_of_performance_city": 0,
        "place_of_performance_state": 0,
        "set_aside_code": 0,
    }

    for row in all_rows:
        raw = row.get("raw_json")
        if not raw or not isinstance(raw, dict):
            continue

        update_payload = {}
        row_id = row["id"]

        if not row.get("description"):
            extracted = extract_description(raw)
            if extracted:
                update_payload["description"] = extracted
                field_stats["description"] += 1

        if not row.get("agency"):
            extracted = extract_agency(raw)
            if extracted:
                update_payload["agency"] = extracted
                field_stats["agency"] += 1

        if not row.get("department"):
            extracted = extract_department(raw)
            if extracted:
                update_payload["department"] = extracted
                field_stats["department"] += 1

        if not row.get("place_of_performance_city"):
            extracted = extract_pop_city(raw)
            if extracted:
                update_payload["place_of_performance_city"] = extracted
                field_stats["place_of_performance_city"] += 1

        if not row.get("place_of_performance_state"):
            extracted = extract_pop_state(raw)
            if extracted:
                update_payload["place_of_performance_state"] = extracted
                field_stats["place_of_performance_state"] += 1

        if not row.get("set_aside_code"):
            extracted = extract_set_aside(raw)
            if extracted:
                update_payload["set_aside_code"] = extracted
                field_stats["set_aside_code"] += 1

        if update_payload:
            updates_to_apply.append({"id": row_id, "payload": update_payload})

    print(f"\n  -> Records needing backfill: {len(updates_to_apply)}")
    print(f"  -> Fields to fill:")
    for field, count in field_stats.items():
        print(f"       {field}: {count}")

    if not updates_to_apply:
        print("\nNo records need backfilling. All fields are already populated.")
        return

    # Step 4: Apply updates in batches of 50
    print(f"\nApplying updates in batches of 50...")
    success_count = 0
    error_count = 0

    for i, chunk in enumerate(chunk_list(updates_to_apply, 50)):
        for upd in chunk:
            try:
                supabase.table("opportunities").update(upd["payload"]).eq("id", upd["id"]).execute()
                success_count += 1
            except Exception as e:
                error_count += 1
                if error_count <= 5:
                    print(f"  ERROR updating id={upd['id']}: {e}")

        processed = min((i + 1) * 50, len(updates_to_apply))
        print(f"  Progress: {processed}/{len(updates_to_apply)} records processed ({success_count} success, {error_count} errors)")

    # Step 5: Summary
    print(f"\n{'='*60}")
    print("BACKFILL COMPLETE")
    print(f"{'='*60}")
    print(f"  Total records scanned:  {len(all_rows)}")
    print(f"  Records updated:        {success_count}")
    print(f"  Errors:                 {error_count}")
    print(f"\n  Fields backfilled:")
    for field, count in field_stats.items():
        status = f"{count} records" if count > 0 else "none needed"
        print(f"    {field}: {status}")
    print(f"{'='*60}")


if __name__ == "__main__":
    backfill_from_rawjson()

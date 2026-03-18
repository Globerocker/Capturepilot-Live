"""
Tool 16: Backfill Estimated Values + POC Contacts from raw_json
Extracts:
  - estimated_value from raw_json.award.amount / raw_json.awardAmount
  - Point of Contact data → upserts into contacts table
  - department from raw_json.fullParentPathName

All extraction is deterministic (no AI). Runs in batches of 50.
"""
import os
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


def chunk_list(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]


def extract_estimated_value(raw):
    """Try multiple paths in SAM.gov raw_json to find contract value."""
    # Path 1: award.amount
    award = raw.get("award")
    if isinstance(award, dict):
        amount = award.get("amount")
        if amount is not None:
            try:
                return float(amount)
            except (ValueError, TypeError):
                pass

    # Path 2: awardAmount (direct)
    for field in ["awardAmount", "estimatedTotalAwardAmount", "baseAndAllOptionsValue"]:
        val = raw.get(field)
        if val is not None:
            try:
                return float(val)
            except (ValueError, TypeError):
                pass

    # Path 3: archive.amount
    archive = raw.get("archive")
    if isinstance(archive, dict):
        amount = archive.get("amount")
        if amount is not None:
            try:
                return float(amount)
            except (ValueError, TypeError):
                pass

    return None


def extract_contacts(raw):
    """Extract point of contact data from SAM.gov raw_json."""
    contacts = []
    poc_data = raw.get("pointOfContact")
    if not poc_data:
        return contacts

    poc_list = poc_data if isinstance(poc_data, list) else [poc_data]

    for i, poc in enumerate(poc_list):
        if not isinstance(poc, dict):
            continue

        name = poc.get("fullName") or ""
        email = poc.get("email") or ""
        phone = poc.get("phone") or ""
        title = poc.get("title") or ""
        fax = poc.get("fax") or ""
        poc_type = poc.get("type") or ""

        # Skip empty contacts
        if not name and not email and not phone:
            continue

        contacts.append({
            "fullname": name.strip() if name else None,
            "email": email.strip() if email else None,
            "phone": phone.strip() if phone else None,
            "title": title.strip() if title else None,
            "fax": fax.strip() if fax else None,
            "is_primary": (i == 0) or (poc_type.lower() == "primary" if poc_type else False),
        })

    return contacts


def extract_department(raw):
    """Extract department from fullParentPathName."""
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


def backfill_values_and_contacts():
    if not all([SUPABASE_URL, SUPABASE_SERVICE_KEY]):
        print("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY. Halting.")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    print("=== Backfill Values + POC Contacts from raw_json ===\n")

    # Fetch all opportunities with raw_json
    fields = "id, notice_id, estimated_value, department, raw_json"
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

    print(f"Total opportunities with raw_json: {len(all_rows)}")

    # Process each record
    value_updates = 0
    dept_updates = 0
    contacts_inserted = 0
    contacts_skipped = 0
    errors = 0

    for i, row in enumerate(all_rows):
        raw = row.get("raw_json")
        if not raw or not isinstance(raw, dict):
            continue

        row_id = row["id"]
        notice_id = row.get("notice_id")
        update_payload = {}

        # 1. Backfill estimated_value
        if not row.get("estimated_value"):
            val = extract_estimated_value(raw)
            if val and val > 0:
                update_payload["estimated_value"] = val
                value_updates += 1

        # 2. Backfill department
        if not row.get("department"):
            dept = extract_department(raw)
            if dept:
                update_payload["department"] = dept
                dept_updates += 1

        # Apply opportunity updates
        if update_payload:
            try:
                supabase.table("opportunities").update(update_payload).eq("id", row_id).execute()
            except Exception as e:
                errors += 1
                if errors <= 5:
                    print(f"  ERROR updating opp {row_id}: {e}")

        # 3. Extract and upsert contacts
        if notice_id:
            contacts = extract_contacts(raw)
            for contact in contacts:
                contact["notice_id"] = notice_id
                try:
                    supabase.table("contacts").upsert(
                        contact,
                        on_conflict="notice_id,email,fullname"
                    ).execute()
                    contacts_inserted += 1
                except Exception:
                    contacts_skipped += 1

        # Progress
        if (i + 1) % 200 == 0:
            print(f"  Progress: {i + 1}/{len(all_rows)} | Values: {value_updates} | Depts: {dept_updates} | Contacts: {contacts_inserted}")

    # Summary
    print(f"\n{'='*60}")
    print("BACKFILL COMPLETE")
    print(f"{'='*60}")
    print(f"  Records scanned:         {len(all_rows)}")
    print(f"  Values backfilled:       {value_updates}")
    print(f"  Departments backfilled:  {dept_updates}")
    print(f"  Contacts upserted:       {contacts_inserted}")
    print(f"  Contacts skipped (dupe): {contacts_skipped}")
    print(f"  Errors:                  {errors}")
    print(f"{'='*60}")


if __name__ == "__main__":
    backfill_values_and_contacts()

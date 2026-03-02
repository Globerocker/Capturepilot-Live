import os
import csv
import sys
from typing import Optional
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

def map_set_aside_code(raw: str) -> str:
    if not raw: return 'NONE'
    clean = ''.join(e for e in raw.upper() if e.isalnum())
    mapping = {
        'SBA': 'SBA', 'TOTALSMALLBUSINESS': 'SBA',
        'SBP': 'SBP', 'PARTIALSMALLBUSINESS': 'SBP',
        '8A': '8A', '8AN': '8AN',
        'HZC': 'HZC', 'HUBZONE': 'HZC',
        'SDVOSBC': 'SDVOSBC', 'SERVICEDISABLEDVETERAN': 'SDVOSBS',
        'WOSB': 'WOSB', 'WOMENOWNED': 'WOSB',
        'EDWOSB': 'EDWOSB',
        'VSA': 'VSA'
    }
    for key, val in mapping.items():
        if key in clean: return val
    return 'NONE'

def parse_currency(val: str) -> Optional[float]:
    if not val: return None
    import re
    cleaned = re.sub(r'[^0-9.-]', '', val)
    try:
        return float(cleaned)
    except ValueError:
        return None

def ingest_csv(filepath: str):
    if not all([SUPABASE_URL, SUPABASE_SERVICE_KEY]):
        print("❌ Missing Supabase keys in .env.")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    
    print(f"🔄 Starting Ingestion of {filepath}...")
    
    agencies_map = {}
    naics_set = set()
    psc_set = set()
    
    # 1. First Parse to collect lookups
    print("  -> Scanning for Agencies, NAICS, PSCs...")
    with open(filepath, mode='r', encoding='latin-1', errors='replace') as f:
        reader = csv.DictReader(f)
        for row in reader:
            dept = row.get("Department/Ind.Agency", "").strip() or None
            subtier = row.get("CGAC", "").strip() or row.get("Sub-Tier", "").strip() or None
            office = row.get("Office", "").strip() or None
            
            if dept or subtier or office:
                agency_key = f"{dept}|{subtier}|{office}"
                if agency_key not in agencies_map:
                    agencies_map[agency_key] = {
                        "department": dept,
                        "sub_tier": subtier,
                        "office": office,
                    }
                    
            naics = row.get("NaicsCode", "").strip()
            if naics: naics_set.add(naics)
            
            psc = row.get("ClassificationCode", "").strip()
            if psc: psc_set.add(psc)
            
    # 2. Upsert Lookups
    print("  -> Upserting Lookups...")
    if agencies_map:
        agency_list = list(agencies_map.values())
        res, _ = supabase.table('agencies').upsert(agency_list, on_conflict='department, sub_tier, office').execute()
        # Create map of agency_key -> ID
        # Since upsert returns data, we can match
        agency_id_map = {}
        for a in res[1]:
            key = f"{a.get('department')}|{a.get('sub_tier')}|{a.get('office')}"
            agency_id_map[key] = a['id']
    else:
        agency_id_map = {}
        
    if naics_set:
        supabase.table('naics_codes').upsert([{"code": c} for c in naics_set], on_conflict='code').execute()
        
    if psc_set:
        supabase.table('psc_codes').upsert([{"code": c} for c in psc_set], on_conflict='code').execute()

    # Load ENUMS
    opp_types = supabase.table('opportunity_types').select('id, name').execute().data
    opp_type_map = {t['name']: t['id'] for t in opp_types}
    
    set_asides = supabase.table('set_asides').select('id, code').execute().data
    set_aside_map = {s['code']: s['id'] for s in set_asides}

    # 3. Second Parse to ingest main records
    print("  -> Upserting Opportunities...")
    batch_size = 500
    ops_batch = []
    contacts_batch = []
    total_ops = 0
    
    def flush_batches():
        nonlocal total_ops
        if ops_batch:
            supabase.table("opportunities").upsert(ops_batch, on_conflict="notice_id").execute()
            total_ops += len(ops_batch)
            print(f"    ✅ Upserted {len(ops_batch)} records. Total: {total_ops}")
            ops_batch.clear()
            
        if contacts_batch:
            # dedupe contacts
            unique_contacts = {}
            for c in contacts_batch:
                key = f"{c['notice_id']}|{c['email']}|{c['fullname']}"
                if key not in unique_contacts:
                    unique_contacts[key] = c
            supabase.table("contacts").upsert(list(unique_contacts.values()), on_conflict="notice_id, email, fullname").execute()
            contacts_batch.clear()

    with open(filepath, mode='r', encoding='latin-1', errors='replace') as f:
        reader = csv.DictReader(f)
        for row in reader:
            notice_id = row.get("NoticeId", "").strip()
            if not notice_id: continue
            
            dept = row.get("Department/Ind.Agency", "").strip() or None
            subtier = row.get("CGAC", "").strip() or row.get("Sub-Tier", "").strip() or None
            office = row.get("Office", "").strip() or None
            agency_key = f"{dept}|{subtier}|{office}"
            
            sa_raw = row.get("SetASideCode", "")
            sa_code = map_set_aside_code(sa_raw)
            
            opp_type_raw = row.get("Type", "").strip()
            # If not in our enum, default to None or try to map
            opp_type_id = opp_type_map.get(opp_type_raw)
            
            # Dates
            posted_date = row.get("PostedDate", "").strip()
            posted_date = posted_date if posted_date else None
            response_deadline = row.get("ResponseDeadLine", "").strip()
            response_deadline = response_deadline if response_deadline else None
            award_date = row.get("AwardDate", "").strip()
            award_date = award_date if award_date else None

            op_record = {
                "notice_id": notice_id,
                "title": row.get("Title", "").strip(),
                "solicitation_number": row.get("Sol#", "").strip() or None,
                "posted_date": posted_date,
                "response_deadline": response_deadline,
                "opportunity_type_id": opp_type_id,
                "agency_id": agency_id_map.get(agency_key),
                "naics_code": row.get("NaicsCode", "").strip() or None,
                "psc_code": row.get("ClassificationCode", "").strip() or None,
                "set_aside_id": set_aside_map.get(sa_code),
                "award_amount": parse_currency(row.get("Award$", "")),
                "award_date": award_date,
                "award_number": row.get("AwardNumber", "").strip() or None,
                "awardee": row.get("Awardee", "").strip() or None,
                "description": row.get("Description", "").strip() or None,
                "link": row.get("Link", "").strip() or None,
                "active": row.get("Active", "Yes").strip() == "Yes"
            }
            ops_batch.append(op_record)

            # Safe string truncator
            def trunc(val, length):
                v = val.strip() if val else ""
                return v[:length] if v else None
            
            # Extract Primary Contact
            p_email = row.get("PrimaryContactEmail", "").strip().lower()
            p_name = row.get("PrimaryContactFullname", "").strip()
            if p_email or p_name:
                contacts_batch.append({
                    "notice_id": trunc(notice_id, 255),
                    "is_primary": True,
                    "title": trunc(row.get("PrimaryContactTitle", ""), 255),
                    "fullname": trunc(p_name, 255),
                    "email": trunc(p_email, 255),
                    "phone": trunc(row.get("PrimaryContactPhone", ""), 100),
                    "fax": trunc(row.get("PrimaryContactFax", ""), 100)
                })
                
            # Extract Secondary Contact
            s_email = row.get("SecondaryContactEmail", "").strip().lower()
            s_name = row.get("SecondaryContactFullname", "").strip()
            if s_email or s_name:
                contacts_batch.append({
                    "notice_id": trunc(notice_id, 255),
                    "is_primary": False,
                    "title": trunc(row.get("SecondaryContactTitle", ""), 255),
                    "fullname": trunc(s_name, 255),
                    "email": trunc(s_email, 255),
                    "phone": trunc(row.get("SecondaryContactPhone", ""), 100),
                    "fax": trunc(row.get("SecondaryContactFax", ""), 100)
                })

            if len(ops_batch) >= batch_size:
                flush_batches()
                
    # Flush remaining
    flush_batches()
    print(f"\n🎉 Finished Ingesting {filepath}. Total Opportunities: {total_ops}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python ingest_csv.py <path_to_csv>")
        sys.exit(1)
    
    filepath = sys.argv[1]
    if os.path.exists(filepath):
        ingest_csv(filepath)
    else:
        print(f"❌ File not found: {filepath}")

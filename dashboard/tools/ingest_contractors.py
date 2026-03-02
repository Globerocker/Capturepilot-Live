import os
import sys
from typing import Optional
from supabase import create_client, Client
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

def parse_date(date_str: str) -> Optional[str]:
    if not date_str or len(date_str) != 8:
        return None
    try:
        # Expected format YYYYMMDD
        parsed = datetime.strptime(date_str, "%Y%m%d")
        return parsed.strftime("%Y-%m-%d")
    except ValueError:
        return None

def clean_taxonomy(tax_str: str) -> list[str]:
    if not tax_str:
        return []
    # Split by ~ and strip Y/N suffixes commonly found in NAICS/PSC flags
    items = tax_str.split('~')
    cleaned = []
    for item in items:
        item = item.strip()
        if not item: continue
        if item.endswith('Y') or item.endswith('N'):
            item = item[:-1]
        cleaned.append(item)
    return list(set(cleaned))

def map_sba_codes(certs_str: str) -> list[str]:
    if not certs_str:
        return []
    codes = certs_str.split('~')
    mapping = {
        'A2': 'WOSB',
        'A5': 'VOSB',
        'QF': 'SDVOSB',
        'HQ': 'HUBZone',
        '8W': '8A',
        'XX': 'SDB',     # Generic substitution logic for demonstration
        'JT': '8A_JV',
        'XX': 'MINORITY'
    }
    # Keep the raw code if unmapped, or just the mapped string
    result = []
    for c in codes:
        if c in mapping:
            result.append(mapping[c])
        else:
            result.append(c) # store raw code as fallback
    return list(set(result))

def trunc(val: str, length: int) -> Optional[str]:
    v = val.strip() if val else ""
    return v[:length] if v else None

def ingest_contractors(filepath: str):
    if not all([SUPABASE_URL, SUPABASE_SERVICE_KEY]):
        print("❌ Missing Supabase keys in .env.")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    
    print(f"🔄 Starting Ingestion of {filepath}...")
    
    batch_size = 300  # Smaller batch due to heavy array payloads
    batch = {}
    total_inserted = 0
    total_skipped = 0
    
    def flush_batch():
        nonlocal total_inserted
        if batch:
            try:
                values = list(batch.values())
                res = supabase.table("contractors").upsert(values, on_conflict="uei").execute()
                total_inserted += len(values)
                print(f"    ✅ Upserted {len(values)} active entities. Total: {total_inserted}")
            except Exception as e:
                print(f"    ❌ Error upserting batch: {e}")
            batch.clear()

    with open(filepath, mode='r', encoding='latin-1', errors='replace') as f:
        # Not using csv reader because pipe delimiter might be unescaped inside text.
        # Fixed split is safer for SAM.gov DAT files.
        for line in f:
            if line.startswith('BOF') or line.startswith('!end'):
                continue
                
            row = line.split('|')
            if len(row) < 50:
                continue # Malformed line
                
            status = row[5].strip()
            if status != 'A':
                total_skipped += 1
                continue # Only ingest active entities
                
            uei = row[0].strip()
            if not uei:
                continue

            # Contact parsing: First + Last. Public extracts omit email/phone.
            primary_first = row[46].strip() if len(row) > 46 else ""
            primary_last = row[48].strip() if len(row) > 48 else ""
            primary_name = f"{primary_first} {primary_last}".strip()

            secondary_first = row[90].strip() if len(row) > 90 else ""
            secondary_last = row[92].strip() if len(row) > 92 else ""
            secondary_name = f"{secondary_first} {secondary_last}".strip()

            record = {
                "uei": trunc(uei, 20),
                "cage_code": trunc(row[3], 20),
                "is_sam_registered": True,
                "company_name": trunc(row[11], 255),
                "dba_name": trunc(row[12], 255),
                "address_line_1": trunc(row[15], 255),
                "city": trunc(row[17], 100),
                "state": trunc(row[18], 50),
                "zip_code": trunc(row[19], 20),
                "country_code": trunc(row[21], 3),
                "activation_date": parse_date(row[9].strip()),
                "expiration_date": parse_date(row[8].strip()),
                "business_url": trunc(row[26], 255),
                "sba_certifications": map_sba_codes(row[31].strip()),
                "naics_codes": clean_taxonomy(row[34].strip()),
                "psc_codes": clean_taxonomy(row[36].strip()),
                "primary_poc_name": trunc(primary_name, 255) if primary_name else None,
                "secondary_poc_name": trunc(secondary_name, 255) if secondary_name else None,
            }
            batch[record["uei"]] = record
            
            if len(batch) >= batch_size:
                flush_batch()
                
    # Flush remaining
    flush_batch()
    print(f"\n🎉 Finished Ingesting {filepath}.")
    print(f"Total Active Entities Upserted: {total_inserted}")
    print(f"Total Expired/Inactive Entities Skipped: {total_skipped}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python ingest_contractors.py <path_to_dat_file>")
        sys.exit(1)
    
    filepath = sys.argv[1]
    if os.path.exists(filepath):
        ingest_contractors(filepath)
    else:
        print(f"❌ File not found: {filepath}")

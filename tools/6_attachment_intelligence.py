import os
import re
from supabase import create_client, Client

# Simple fallback dotenv since python-dotenv gave permissions error earlier
def load_env_file(filepath=".env"):
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    if '=' in line:
                        k, v = line.split('=', 1)
                        os.environ[k.strip()] = v.strip().strip("'").strip('"')

load_env_file(".env.local")
load_env_file(".env")

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

def chunk_list(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]

def analyze_text_for_requirements(text):
    """
    Simulates attachment intelligence by parsing the description or document text 
    for common capacity requirements.
    """
    if not text:
        return {}
        
    text = text.lower()
    requirements = {}
    
    # 1. Bonding Requirements
    if re.search(r'\bbond\b|\bbonding\b|\bsurety\b', text):
        requirements["bonding_required"] = True
    else:
        requirements["bonding_required"] = False
        
    # 2. Key Equipment
    equipment_keywords = ["fleet", "truck", "excavator", "bulldozer", "crane", "forklift", "tractor"]
    found_equipment = [eq for eq in equipment_keywords if eq in text]
    if found_equipment:
        requirements["equipment_mentioned"] = found_equipment
        
    # 3. Clearance
    if re.search(r'\bclearance\b|\bsecret\b|\btop secret\b|\bts/sci\b', text):
        requirements["security_clearance_required"] = True
        
    # 4. Certification Mentions
    if "8(a)" in text or "hubzone" in text or "sdvosb" in text or "wosb" in text:
        requirements["special_certifications_mentioned"] = True
        
    return requirements

def extract_attachment_intelligence():
    if not all([SUPABASE_URL, SUPABASE_SERVICE_KEY]):
        print("❌ Missing API keys in .env. Halting execution.")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    print("🧠 Starting Attachment Intelligence Extraction...")
    
    # Target high-value active opportunities without extracted requirements
    # "is_null" on JSONB column isn't perfect in PostgREST, so we'll fetch a batch
    res = supabase.table("opportunities").select(
        "id, description"
    ).eq("is_archived", False).limit(200).execute()
    
    opportunities = res.data
    
    if not opportunities:
        print("✅ No active opportunities pending extraction.")
        return
        
    print(f"  -> Found {len(opportunities)} opportunities for requirement parsing.")
    
    updates = []
    
    for op in opportunities:
        desc = op.get("description", "")
        extracted = analyze_text_for_requirements(desc)
        
        # Even if empty, we save the empty JSON to mark it as processed if needed
        updates.append({
            "id": op["id"],
            "payload": {
                "requirements_extracted": extracted
            }
        })
        
    print(f"  -> Generated {len(updates)} requirement payloads. Updating DB...")
    
    success_count = 0
    # Batch updates
    for upd in updates:
        try:
            supabase.table("opportunities").update(upd["payload"]).eq("id", upd["id"]).execute()
            success_count += 1
        except Exception as e:
            print(f"  ❌ Error updating op {upd['id']}: {e}")
            
    print(f"✅ Attachment Intelligence complete. Extracted requirements for {success_count}/{len(opportunities)} opportunities.")

if __name__ == "__main__":
    extract_attachment_intelligence()

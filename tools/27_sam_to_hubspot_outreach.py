"""
SAM.gov to HubSpot Mixed Outreach Pipeline
===================================================
This script queries the SAM.gov Entity Management API for entities that registered 
on the previous day, extracts their contact information (Points of Contact), and 
pushes them into HubSpot.

Once in HubSpot, this data can trigger a Workflow that orchestrates physical 
handwritten mail (via Thanks.io or Handwrytten), followed by a 5-day delay, 
automated SMS/email, and task creation.

Usage:
  python 27_sam_to_hubspot_outreach.py
  python 27_sam_to_hubspot_outreach.py 2023-10-01  # specific date
"""
import os
import sys
import time
import requests
from datetime import datetime, timedelta

# ---------------------------------------------------------------------------
# ENV Loading
# ---------------------------------------------------------------------------
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

SAM_API_KEY = os.getenv("SAM_API_KEY")
HUBSPOT_TOKEN = os.getenv("HUBSPOT_ACCESS_TOKEN")

if not SAM_API_KEY or not HUBSPOT_TOKEN:
    print("❌ Missing SAM_API_KEY or HUBSPOT_ACCESS_TOKEN in .env.")
    sys.exit(1)

# ---------------------------------------------------------------------------
# SAM.gov API Helpers
# ---------------------------------------------------------------------------
def fetch_new_sam_entities(target_date: str):
    """
    Fetch entities registered on a specific date from SAM.gov v3 API.
    Date format: YYYY-MM-DD
    """
    url = "https://api.sam.gov/entity-information/v3/entities"
    
    # SAM API typically uses [start,end] or exact match format for dates
    # Assuming standard date param based on official documentation
    params = {
        "api_key": SAM_API_KEY,
        "registrationDate": f"[{target_date}T00:00:00Z,{target_date}T23:59:59Z]",
        "includeSections": "entityRegistration,coreData,pointsOfContact",
        "limit": 100 # limit per page, paginate if necessary
    }
    
    print(f"📥 Fetching newly registered entities for date: {target_date}")
    
    entities = []
    offset = 0
    while True:
        params["offset"] = offset
        try:
            response = requests.get(url, params=params, timeout=30)
            
            if response.status_code == 429:
                print("  ⚠️ Rate limit hit. Sleeping 10s...")
                time.sleep(10)
                continue
                
            if response.status_code != 200:
                print(f"  ❌ SAM API Error {response.status_code}: {response.text}")
                break
                
            data = response.json()
            batch = data.get("entityData", [])
            
            if not batch:
                break
                
            entities.extend(batch)
            print(f"  Retrieved {len(batch)} entities at offset {offset}...")
            
            if len(batch) < 100:
                break # Last page
            offset += 100
            time.sleep(1) # be nice
            
        except requests.exceptions.RequestException as e:
            print(f"  ❌ Request exception: {e}")
            break
            
    return entities

# ---------------------------------------------------------------------------
# HubSpot API Helpers
# ---------------------------------------------------------------------------
def create_hubspot_company(entity):
    """Creates a Company in HubSpot from a SAM.gov entity record."""
    url = "https://api.hubapi.com/crm/v3/objects/companies"
    headers = {
        "Authorization": f"Bearer {HUBSPOT_TOKEN}",
        "Content-Type": "application/json"
    }
    
    core_data = entity.get("coreData", {})
    reg_data = entity.get("entityRegistration", {})
    
    # Extract base properties
    company_name = reg_data.get("legalBusinessName", "")
    website = core_data.get("businessTypes", [{}])[0].get("businessUrl", "") # approximate
    uei = entity.get("entityRegistration", {}).get("ueiSAM", "")
    cage = entity.get("coreData", {}).get("cageCode", "")
    
    # Extract Physical Address
    address_obj = core_data.get("physicalAddress", {})
    address1 = address_obj.get("addressLine1", "")
    city = address_obj.get("city", "")
    state = address_obj.get("stateOrProvinceCode", "")
    zip_code = address_obj.get("zipCode", "")
    
    properties = {
        "name": company_name,
        "domain": website,
        "address": address1,
        "city": city,
        "state": state,
        "zip": zip_code,
        "sam_uei": uei,
        "sam_cage": cage,
        "sam_new_registration": "true", # Custom property used to trigger workflow
        "lifecyclestage": "lead"
    }
    
    payload = {"properties": {k: v for k, v in properties.items() if v}}
    
    try:
        res = requests.post(url, json=payload, headers=headers)
        if res.status_code in (200, 201):
            return res.json().get("id")
        elif res.status_code == 409: # already exists
            # Optionally extract existing ID if domain matched
            msg = res.json().get("message", "")
            if "Existing ID:" in msg:
                return msg.split("Existing ID:")[1].strip()
        else:
            print(f"  ⚠️ HubSpot Company Error: {res.text}")
    except Exception as e:
        print(f"  ⚠️ Request error: {e}")
    return None

def create_hubspot_contact(poc, company_id):
    """Creates a Contact in HubSpot and associates it with the Company."""
    url = "https://api.hubapi.com/crm/v3/objects/contacts"
    headers = {
        "Authorization": f"Bearer {HUBSPOT_TOKEN}",
        "Content-Type": "application/json"
    }
    
    # A Point of Contact typically has firstName, lastName, email, phone
    first_name = poc.get("firstName", "Unknown")
    last_name = poc.get("lastName", "Unknown")
    email = poc.get("email", "")
    phone = poc.get("phone", "")
    address1 = poc.get("addressLine1", "")
    city = poc.get("city", "")
    state = poc.get("stateOrProvinceCode", "")
    zip_code = poc.get("zipCode", "")
    
    properties = {
        "firstname": first_name,
        "lastname": last_name,
        "email": email,
        "phone": phone,
        "address": address1,
        "city": city,
        "state": state,
        "zip": zip_code,
        "sam_new_registration_contact": "true",
        "lifecyclestage": "lead"
    }
    
    payload = {"properties": {k: v for k, v in properties.items() if v}}
    
    if company_id:
        # Standard association format for CRM v3
        payload["associations"] = [
            {
                "to": {"id": company_id},
                "types": [{"associationCategory": "HUBSPOT_DEFINED", "associationTypeId": 1}] # 1 = contact_to_company
            }
        ]
        
    try:
        res = requests.post(url, json=payload, headers=headers)
        if res.status_code in (200, 201):
            return res.json().get("id")
        else:
            # Often fails on duplicate email
            pass 
    except Exception as e:
        print(f"  ⚠️ Contact Request error: {e}")
    return None

# ---------------------------------------------------------------------------
# Main Routine
# ---------------------------------------------------------------------------
def run_pipeline(target_date: str):
    print(f"{'='*60}")
    print(f"SAM.gov -> HubSpot Outreach Pipeline")
    print(f"Date: {target_date}")
    print(f"{'='*60}")
    
    entities = fetch_new_sam_entities(target_date)
    if not entities:
        print("  No entities found for this date. Exiting.")
        return
        
    print(f"\n🚀 Found {len(entities)} newly registered entities. Pushing to HubSpot...")
    
    success_count = 0
    for idx, entity in enumerate(entities):
        sys.stdout.write(f"\rProcessing {idx+1}/{len(entities)}...")
        sys.stdout.flush()
        
        # 1. Create Company
        company_id = create_hubspot_company(entity)
        if not company_id:
            continue
            
        # 2. Extract and create Contacts (Points of Contact)
        pocs = entity.get("pointsOfContact", [])
        if not pocs:
            continue
            
        # We usually care about Gov Business POCs or Electronic Business POCs
        # Let's extract them all for the outreach workflow to decide
        for poc in pocs:
            create_hubspot_contact(poc, company_id)
            
        success_count += 1
        time.sleep(0.5) # avoid HubSpot rate limits (100-150 requests / 10s depending on tier)
        
    print(f"\n\n✅ COMPLETE. Pushed {success_count} companies to HubSpot.")
    print("These contacts can now be enrolled in a HubSpot Workflow to trigger physical letters.")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        target = sys.argv[1]
    else:
        # Default to yesterday
        target = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
        
    run_pipeline(target)

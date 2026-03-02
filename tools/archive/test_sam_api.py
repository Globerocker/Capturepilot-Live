import os
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

SAM_API_KEY = os.getenv("SAM_API_KEY")

def test_sam_api():
    if not SAM_API_KEY:
        print("❌ Error: SAM_API_KEY is not set in .env")
        return

    print("🔍 Testing SAM.gov API Connectivity...")
    
    url = "https://api.sam.gov/opportunities/v2/search"
    # We use a very restrictive query (e.g. limit=1, specific notice type, small window) just to check connectivity
    params = {
        "api_key": SAM_API_KEY,
        "limit": 1,
        "ptype": "o" # Solicitations
    }
    
    try:
        response = requests.get(url, params=params, timeout=10)
        
        if response.status_code == 200:
            print("✅ SUCCESS: SAM.gov API connection established.")
            data = response.json()
            if "opportunitiesData" in data:
                print(f"📊 Received {len(data['opportunitiesData'])} records in test payload.")
            else:
                print("⚠️ Warning: Received 200 OK, but no 'opportunitiesData' key found in JSON.")
        elif response.status_code == 403:
            print("❌ FAILURE: 403 Forbidden. Your API Key may be invalid or you lack permissions for this endpoint.")
        else:
            print(f"❌ FAILURE: Received HTTP {response.status_code}")
            print(response.text)
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Exception occurred: {e}")

if __name__ == "__main__":
    test_sam_api()

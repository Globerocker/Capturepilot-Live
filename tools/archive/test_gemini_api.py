import os
from google import genai
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

def test_gemini_api():
    if not GEMINI_API_KEY:
        print("❌ Error: GEMINI_API_KEY is not set in .env")
        return

    print("🔍 Testing Gemini AI Connectivity...")

    try:
        # Initialize the new SDK client 
        client = genai.Client(api_key=GEMINI_API_KEY)
        
        # Per master prompt constraint: We use Gemini Flash for summaries
        prompt = "This is a deterministic system test. Reply with exactly one word: 'READY'."
        
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
        )
        
        if response.text and "READY" in response.text.upper():
            print(f"✅ SUCCESS: Gemini AI connection established. Model response: {response.text.strip()}")
        else:
            print(f"⚠️ Warning: Connection succeeded but unexpected response: {response.text}")
            
    except Exception as e:
         print(f"❌ Exception occurred: {e}")

if __name__ == "__main__":
    test_gemini_api()

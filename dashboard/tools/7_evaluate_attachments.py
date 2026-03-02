import os
import json
import requests
import io
try:
    import PyPDF2
except ImportError:
    print("⚠️ PyPDF2 not installed. Run: pip install PyPDF2")
    PyPDF2 = None

from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

def extract_text_from_pdf_url(url):
    """Downloads a PDF from a URL and extracts text."""
    if not PyPDF2:
        return "PyPDF2 not installed."
        
    try:
        response = requests.get(url, timeout=30)
        # Check if it's a valid PDF
        if response.status_code == 200 and b'%PDF' in response.content[:10]:
            pdf_file = io.BytesIO(response.content)
            reader = PyPDF2.PdfReader(pdf_file)
            text = ""
            # Extract first 5 pages to save tokens/time
            for page in reader.pages[:5]:
                text += page.extract_text() + "\n"
            return text
        else:
            return f"Not a valid PDF or download failed: {response.status_code}"
    except Exception as e:
        return f"Error downloading/parsing PDF: {e}"

def call_llm_api(text_content, notice_id):
    """Sends extracted text to OpenAI or Gemini for evaluation."""
    system_prompt = """
    You are an expert Federal Government Contracting (GovCon) analyst. 
    Review the following Sources Sought / Solicitation extract.
    Provide a JSON response strictly matching this format:
    {
      "summary": "2-3 sentence summary of the work",
      "compliance_requirements": ["list of strict requirements, eg TS clearance, ISO 9001"],
      "incumbent_mentioned": true/false,
      "estimated_risk_level": "LOW|MEDIUM|HIGH",
      "action_recommendation": "Bid | Teaming Required | No Bid"
    }
    """
    
    if GEMINI_API_KEY:
        print("🤖 Using Google Gemini API...")
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
            payload = {
                "contents": [{"parts": [{"text": f"{system_prompt}\n\nDocument Extract (Notice ID: {notice_id}):\n{text_content[:15000]}"}]}],
                "generationConfig": {"response_mime_type": "application/json"}
            }
            res = requests.post(url, json=payload).json()
            if "candidates" in res:
                return json.loads(res["candidates"][0]["content"]["parts"][0]["text"])
            return {"error": "Failed to parse Gemini response", "raw": res}
        except Exception as e:
            return {"error": str(e)}

    elif OPENAI_API_KEY:
        print("🤖 Using OpenAI ChatGPT API...")
        try:
            url = "https://api.openai.com/v1/chat/completions"
            headers = {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"}
            payload = {
                "model": "gpt-4o-mini",
                "response_format": { "type": "json_object" },
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Document Extract (Notice ID: {notice_id}):\n{text_content[:15000]}"}
                ]
            }
            res = requests.post(url, headers=headers, json=payload).json()
            if "choices" in res:
                return json.loads(res["choices"][0]["message"]["content"])
            return {"error": "Failed to parse OpenAI response", "raw": res}
        except Exception as e:
            return {"error": str(e)}
            
    else:
        return {"error": "Neither GEMINI_API_KEY nor OPENAI_API_KEY found in .env"}

def evaluate_attachments():
    if not all([SUPABASE_URL, SUPABASE_SERVICE_KEY]):
        print("❌ Missing Supabase API keys.")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    
    # Fetch ops with resource_links but no ai_analysis yet
    print("🔍 Fetching opportunities requiring AI Evaluation...")
    res = supabase.table("opportunities").select("id, notice_id, resource_links").is_("ai_analysis", "null").not_.is_("resource_links", "null").limit(5).execute()
    
    ops = res.data or []
    
    if not ops:
        print("✅ No new documents to evaluate.")
        return

    for op in ops:
        print(f"📄 Analyzing {op['notice_id']}...")
        links = op.get("resource_links", [])
        
        # Only evaluate if there are actual downloadable links
        if not links or not isinstance(links, list):
            supabase.table("opportunities").update({"ai_analysis": {"status": "no_valid_links"}}).eq("id", op["id"]).execute()
            continue
            
        pdf_url = links[0] if len(links) > 0 else None
        
        if pdf_url and pdf_url.startswith("http"):
            print(f"   Downloading and parsing: {pdf_url}")
            text_content = extract_text_from_pdf_url(pdf_url)
            
            if "Not a valid PDF" in text_content or "Error" in text_content or "not installed" in text_content:
                print(f"   ❌ Extraction failed: {text_content[:50]}...")
                supabase.table("opportunities").update({"ai_analysis": {"status": "extraction_failed", "reason": text_content[:100]}}).eq("id", op["id"]).execute()
                continue
                
            print(f"   Extracted {len(text_content)} characters of text. Sending to LLM...")
            
            # Send to LLM
            analysis = call_llm_api(text_content, op["notice_id"])
            
            if "error" in analysis:
                print(f"   ❌ LLM Evaluation failed: {analysis['error']}")
            else:
                print(f"   ✅ LLM Evaluation successful!")
                
            # Update DB
            supabase.table("opportunities").update({"ai_analysis": analysis}).eq("id", op["id"]).execute()
            
        else:
             supabase.table("opportunities").update({"ai_analysis": {"status": "no_valid_links"}}).eq("id", op["id"]).execute()

    print("🎉 Document evaluation batch complete.")

if __name__ == "__main__":
    evaluate_attachments()

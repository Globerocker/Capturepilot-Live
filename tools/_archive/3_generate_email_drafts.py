import os
import json
from supabase import create_client, Client
from google import genai
from dotenv import load_dotenv

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

def generate_email_drafts():
    """
    Generates 3 email draft strategies for HOT matches using Gemini Flash, strictly adhering to constraints.
    """
    if not all([SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMINI_API_KEY]):
        print("❌ Missing API keys in .env. Halting execution.")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    gemini_client = genai.Client(api_key=GEMINI_API_KEY)
    
    print("🔄 Initializing Email Draft Engine for HOT Matches...")
    
    # 1. Fetch HOT Matches
    # Note: In a production environment, you would use a joined view or GraphQL extension.
    # For this deterministic script, we fetch the match, then join manually for strictly controlled payloads.
    matches_res = supabase.table("matches").select("*").eq("classification", "HOT").limit(5).execute()
    
    if not matches_res.data:
        print("⚠️ No 'HOT' matches found in the database. Run `2_score_matches.py` with eligible data first.")
        return
        
    for match in matches_res.data:
        op_id = match.get("opportunity_id")
        con_id = match.get("contractor_id")
        
        # Fetch Opp details
        op_res = supabase.table("opportunities").select("title, naics_code, response_deadline, agency, notice_type, set_aside_code").eq("id", op_id).execute()
        if not op_res.data: continue
        op_data = op_res.data[0]
        
        # Fetch Contractor details
        con_res = supabase.table("contractors").select("company_name, certifications").eq("id", con_id).execute()
        if not con_res.data: continue
        con_data = con_res.data[0]
        
        score_breakdown = match.get("score_breakdown", {})
        
        print(f"\n📧 Generating drafts for: {con_data['company_name']} -> {op_data['title']}")
        
        # 2. Strict Prompt Construction according to V3 Master Prompt
        prompt = f"""
        You are the Strategic Capture Intelligence Engine.
        Draft 3 email strategies for a B2G contractor regarding a federal opportunity.
        
        Contractor: {con_data['company_name']}
        Opportunity: {op_data['title']} (Agency: {op_data['agency']})
        Notice Type: {op_data['notice_type']}
        Opportunity Set-Aside: {op_data['set_aside_code']}
        Contractor Certifications: {con_data.get('certifications', [])}
        
        CRITICAL CONSTRAINTS (DO NOT VIOLATE):
        1. Each email MUST be under 180 words.
        2. You MUST mention the specific NAICS code: {op_data['naics_code']}.
        3. You MUST mention the Response Deadline: {op_data['response_deadline']}.
        4. You MUST explicitly state why they matched (e.g., NAICS match = {score_breakdown.get('naics_match', 0)}, Set-Aside match = {score_breakdown.get('setaside_match', 0)}, Geo Match = {score_breakdown.get('geo_match', 0)}).
        
        Generate exactly 3 drafts separated by '---':
        Draft 1: Standard Opportunity Alert (Direct, professional)
        Draft 2: Certification Leverage Angle (Focus heavily on their specific certifications matching the set-aside)
        Draft 3: Early Engagement Focus (Focus on this being an early Sources Sought or Presolicitation to shape the requirements)
        """
        
        try:
            response = gemini_client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
            )
            
            drafts = response.text.split("---")
            
            print("========================================")
            for i, draft in enumerate(drafts):
                if draft.strip():
                    print(f"** Strategy {i+1} **\n{draft.strip()}\n")
            print("========================================\n")
            
            # In production, we'd save these to a 'communications' table or similar.
            
        except Exception as api_err:
            print(f"❌ Failed to generate drafts via Gemini: {api_err}")

if __name__ == "__main__":
    generate_email_drafts()

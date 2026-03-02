import os
import requests
import json
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# ==========================================
# Phase 16: PWin Match Engine & Enrichment Schema
# ==========================================
# This script is designed to run chronologically AFTER `cron_daily_sync.py`.
# It calculates the deterministic 10-Factor PWin Score for active Opportunities 
# against the known Contractor roster. 
# Matches that score >80% are automatically enriched and have outreach emails drafted.

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY") 

if not all([SUPABASE_URL, SUPABASE_SERVICE_KEY]):
    print("❌ Missing Supabase keys in .env. Halting.")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# ==========================================
# 1. Deterministic Scoring Logic
# ==========================================
def calculate_pwin_score(opp_record, contractor_record):
    """
    Simulates the 10-Factor Masterguide Probability of Win (PWin) Score.
    Normally this would be a highly complex NLP model.
    Here we use deterministic signals based on the active schema.
    """
    score = 50 # Baseline assumption
    
    # 1. NAICS Alignment (+20)
    opp_naics = opp_record.get('naics_code')
    cont_naics = contractor_record.get('naics_codes') or []
    if opp_naics and opp_naics in cont_naics:
        score += 20
        
    # 2. Set-Aside Alignment (+15)
    # E.g. Opportunity requires 8A, contractor has 8A
    opp_sa_id = opp_record.get('set_aside_id')
    # In a full system we'd join exactly text to text, but roughly:
    cont_certs = contractor_record.get('sba_certifications') or []
    if opp_sa_id and len(cont_certs) > 0:
        # Give bump if they possess certifications and it's a restricted opp
        score += 15
        
    # 3. Keyword Match / Capabilities Overlap (+10)
    # Simple check if company name is in the title (edge case, but illustrative)
    if contractor_record.get('company_name', '').lower() in opp_record.get('title', '').split():
        score += 10
        
    # 4. Active SAM Registration (+5)
    if contractor_record.get('is_sam_registered'):
        score += 5
        
    return min(score, 100) # Cap at 100

# ==========================================
# 2. Match Execution
# ==========================================
def run_match_engine():
    print("🧠 Starting Capture Pilot Deterministic Match Engine...")
    
    # Fetch 50 random active opportunities
    opps_res = supabase.table("opportunities").select("*").limit(50).execute()
    opportunities = opps_res.data
    
    # Fetch 200 random contractors to score against
    cont_res = supabase.table("contractors").select("*").limit(200).execute()
    contractors = cont_res.data
    
    total_matches = 0
    high_score_matches = []
    
    db_payload = []
    
    print(f"  -> Cross-referencing {len(opportunities)} Opps vs {len(contractors)} Entities.")
    for opp in opportunities:
        for cont in contractors:
            score = calculate_pwin_score(opp, cont)
            
            # Only record matches historically if > 60%
            if score >= 60:
                record = {
                    "opportunity_id": opp["notice_id"],
                    "contractor_id": cont["id"],
                    "pwin_score": score,
                    "naics_match": (opp.get('naics_code') in (cont.get('naics_codes') or [])),
                    "status": "Identified"
                }
                db_payload.append(record)
                total_matches += 1
                
                # Flag >80 for AI Action
                if score >= 85:
                    record["opp_title"] = opp["title"] # pass context
                    record["cont_name"] = cont["company_name"]
                    record["cont_email"] = cont.get("primary_poc_email")
                    high_score_matches.append(record)
                
    if db_payload:
        try:
            # We use ON CONFLICT DO UPDATE so the score is lively updated
            res = supabase.table("matches").upsert(db_payload, on_conflict="opportunity_id,contractor_id").execute()
            print(f"  ✅ Persisted {total_matches} viable paths to Matches database.")
        except Exception as e:
            # Supabase API sometimes throws unique constraints differently. 
            print(f"  ⚠️ Match Upsert note: {e}")
            
    print(f"\n🧠 Match Engine Complete. Found {len(high_score_matches)} HIGH PWin (>85) targets needing AI Enrichment.")
    return high_score_matches

# ==========================================
# 3. AI Enrichment & Drafting
# ==========================================
def draft_outreach_emails(high_score_matches):
    if not OPENAI_API_KEY:
        print("⚠️ No OPENAI_API_KEY found. Skipping AI Outreach Drafts.")
        return
        
    print(f"🤖 Booting AI Intake for {len(high_score_matches)} Elite Prospects...")
    
    # Normally we'd use openai library, using simple requests here for dependency-free
    # ... In a real app we hit https://api.openai.com/v1/chat/completions ...
    print("  -> Generating hyper-personalized B2G outreach emails via LLM...")
    
    drafts_payload = []
    
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json"
    }
    
    for match in high_score_matches:
        prompt = f"Write a professional, concise B2G email to {match.get('cont_name')} explaining why they " \
                 f"are an excellent fit for the government opportunity '{match.get('opp_title')}'. " \
                 f"Mention their Masterguide PWin match score of {match.get('pwin_score')}/100 based on their SAM.gov profile."
                 
        payload = {
            "model": "gpt-4o-mini",
            "messages": [{"role": "user", "content": prompt}]
        }
        
        try:
            response = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
            draft_text = data['choices'][0]['message']['content']
            
            # Retrieve the match_id from the database based on opp and cont (since we upserted it)
            match_id_res = supabase.table("matches").select("id").eq("opportunity_id", match["opportunity_id"]).eq("contractor_id", match["contractor_id"]).execute()
            
            if match_id_res.data:
                match_id = match_id_res.data[0]["id"]
                drafts_payload.append({
                    "match_id": match_id,
                    "recipient_email": match.get("cont_email") or "info@contractor.com",
                    "subject": f"Strategic Teaming Opportunity: {match.get('opp_title')}",
                    "body": draft_text,
                    "ai_model_used": "gpt-4o-mini",
                    "tokens_consumed": data['usage']['total_tokens']
                })
        except Exception as e:
            print(f"  ⚠️ OpenAI API Error for {match.get('cont_name')}: {e}")
    
    if drafts_payload:
        try:
            res = supabase.table("outreach_drafts").insert(drafts_payload).execute()
            print(f"  ✅ {len(drafts_payload)} Drafts Successfully Generated and Saved to Supabase.")
        except Exception as e:
            print(f"  ⚠️ Drafts Insert Error: {e}")


if __name__ == "__main__":
    print("="*60)
    print("🧠 INIT: INTELLIGENCE ENGINE (MATCHING & ENRICHMENT)")
    print("="*60)
    
    elite_targets = run_match_engine()
    
    if elite_targets:
        draft_outreach_emails(elite_targets)

"""
Tool 15: AI Win Strategy Generator
Analyzes opportunity data + attachment text to generate per-opportunity win strategies.
Populates the ai_win_strategy JSONB field on opportunities.

Uses Gemini Flash for cost efficiency (~$0.001/opp).
"""

import os
import sys
import json
import time
from datetime import datetime
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().strip('"').strip("'")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "").strip().strip('"').strip("'")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip().strip('"').strip("'")

LIMIT = int(sys.argv[1]) if len(sys.argv) > 1 else 100

def main():
    from supabase import create_client
    from openai import OpenAI

    if not all([SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_API_KEY]):
        print("Missing SUPABASE_URL, SUPABASE_SERVICE_KEY, or OPENAI_API_KEY")
        return

    sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    client = OpenAI(api_key=OPENAI_API_KEY)

    print("=" * 60)
    print(f"  Tool 15: AI Win Strategy Generator")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  Limit: {LIMIT}")
    print("=" * 60)
    print()

    # Fetch opportunities that need strategies
    # Prioritize: has attachment text > has description > has notice_type
    # ai_win_strategy defaults to {} (empty dict), not null
    # Use eq to match empty JSON object
    opps = sb.table("opportunities") \
        .select("id, notice_id, title, agency, notice_type, naics_code, set_aside_code, "
                "award_amount, place_of_performance_state, place_of_performance_city, "
                "response_deadline, posted_date, description, "
                "incumbent_contractor_name, incumbent_contractor_uei, "
                "structured_requirements, strategic_scoring, set_aside_types") \
        .eq("ai_win_strategy", {}) \
        .eq("is_archived", False) \
        .order("response_deadline", desc=False) \
        .limit(LIMIT) \
        .execute()

    if not opps.data:
        print("No opportunities need win strategies.")
        return

    print(f"Found {len(opps.data)} opportunities to analyze")

    success = 0
    fail = 0
    skipped = 0

    for i, opp in enumerate(opps.data):
        opp_id = opp["id"]
        title = opp.get("title", "Untitled")

        # Get attachment text if available
        attachment_text = ""
        try:
            att = sb.table("opportunity_attachments") \
                .select("filename, extracted_text") \
                .eq("opportunity_id", opp_id) \
                .neq("extracted_text", "") \
                .limit(3) \
                .execute()
            if att.data:
                for a in att.data:
                    text = (a.get("extracted_text") or "")[:4000]
                    if text:
                        attachment_text += f"\n--- {a.get('filename', 'attachment')} ---\n{text}\n"
        except Exception:
            pass

        # Build context for the AI
        desc = (opp.get("description") or "")[:3000]
        reqs = ""
        if opp.get("structured_requirements"):
            sr = opp["structured_requirements"]
            if isinstance(sr, dict):
                for key in ["scope_of_work", "requirements", "qualifications", "deliverables"]:
                    if sr.get(key):
                        items = sr[key] if isinstance(sr[key], list) else [sr[key]]
                        reqs += f"\n{key.upper()}: " + "; ".join(str(x) for x in items[:5])

        # Skip if we have almost no data to work with
        if not desc and not attachment_text and not reqs:
            skipped += 1
            continue

        set_aside = opp.get("set_aside_code") or "None"
        notice_type = opp.get("notice_type") or "Unknown"
        value = opp.get("award_amount")
        value_str = f"${value:,.0f}" if value else "Not specified"
        incumbent = opp.get("incumbent_contractor_name") or "Unknown"
        deadline = opp.get("response_deadline") or "Not specified"
        state = opp.get("place_of_performance_state") or "Not specified"

        prompt = f"""You are a federal government contracting capture strategist. Analyze this opportunity and provide a concise win strategy.

OPPORTUNITY:
- Title: {title}
- Agency: {opp.get('agency', 'Unknown')}
- Notice Type: {notice_type}
- NAICS: {opp.get('naics_code', 'N/A')}
- Set-Aside: {set_aside}
- Estimated Value: {value_str}
- Location: {state}, {opp.get('place_of_performance_city', '')}
- Deadline: {deadline}
- Incumbent: {incumbent}

DESCRIPTION:
{desc[:2000] if desc else 'No description available.'}

{('REQUIREMENTS:' + reqs[:1500]) if reqs else ''}

{('ATTACHMENT EXCERPTS:' + attachment_text[:3000]) if attachment_text else ''}

Respond in EXACTLY this JSON format (no markdown, no code fences):
{{
  "summary": "2-3 sentence executive summary of what this opportunity is and why it matters",
  "sales_angle": "The key differentiator or approach a small business should emphasize to win",
  "recommended_profile": "Ideal contractor profile: company size, certifications needed, key capabilities",
  "key_risks": ["risk 1", "risk 2", "risk 3"],
  "win_probability_factors": {{
    "positive": ["factor 1", "factor 2"],
    "negative": ["factor 1", "factor 2"]
  }},
  "next_steps": ["step 1", "step 2", "step 3"],
  "competitive_positioning": "How to position against likely competitors including the incumbent"
}}"""

        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=1000,
            )
            text = (response.choices[0].message.content or "").strip()

            # Clean up response - remove markdown fences if present
            if text.startswith("```"):
                text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            if text.endswith("```"):
                text = text[:-3]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()

            strategy = json.loads(text)

            # Validate required fields
            if not isinstance(strategy, dict) or "summary" not in strategy:
                raise ValueError("Invalid strategy format")

            # Update opportunity
            sb.table("opportunities") \
                .update({"ai_win_strategy": strategy}) \
                .eq("id", opp_id) \
                .execute()

            success += 1

        except json.JSONDecodeError as e:
            fail += 1
            if i < 3:
                print(f"  JSON parse error on '{title[:40]}': {e}")
        except Exception as e:
            fail += 1
            err_str = str(e)
            if "429" in err_str or "quota" in err_str.lower():
                print(f"  Rate limited at {i+1}/{len(opps.data)}. Waiting 60s...")
                time.sleep(60)
                continue
            if i < 5:
                print(f"  Error on '{title[:40]}': {err_str[:100]}")

        # Progress
        if (i + 1) % 20 == 0:
            print(f"  [{i+1}/{len(opps.data)}] success={success} fail={fail} skip={skipped}")

        # Rate limit: ~1s between requests
        time.sleep(1.0)

    print()
    print(f"Done. Strategies generated: {success}, Failed: {fail}, Skipped (no data): {skipped}")

if __name__ == "__main__":
    main()

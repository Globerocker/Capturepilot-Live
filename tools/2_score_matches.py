"""
Tool 2: Enhanced Deterministic Contractor Matching (Sprint 3)
Scores opportunities against contractors using a multi-factor model:
  Base Factors (100 pts): NAICS Fit, Geo Fit, Capacity, Federal Inactivity, Competition Density
  Intelligence Factors (+40 pts): Notice Type Priority, Past Performance, Incumbent Risk

All scoring is deterministic and rules-based (no AI).
"""
import os
from supabase import create_client, Client

# ---------------------------------------------------------------------------
# ENV LOADING
# ---------------------------------------------------------------------------
def load_env_file(filepath=".env"):
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    os.environ[k.strip()] = v.strip().strip("'").strip('"')

load_env_file(".env.local")
load_env_file(".env")

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------
def chunk_list(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]

# ---------------------------------------------------------------------------
# SPRINT 3: INTELLIGENCE SCORING FUNCTIONS (all in-memory, no DB queries)
# ---------------------------------------------------------------------------

def score_notice_type(notice_type):
    """
    Score by notice type (from SAM.gov Masterguide).
    Sources Sought/RFI = 6-18 months early = HIGHEST priority.
    """
    if not notice_type:
        return 0
    nt = str(notice_type).lower()
    if any(x in nt for x in ['sources sought', 'rfi', 'market research']):
        return 20
    if 'presolicitation' in nt:
        return 15
    if any(x in nt for x in ['solicitation', 'combined', 'synopsis']):
        return 10
    if 'award' in nt:
        return 5
    return 0

def score_past_performance(contractor):
    """Score based on contractor's federal awards history (in-memory)."""
    fed_awards = contractor.get("federal_awards_count") or 0
    if fed_awards >= 5:
        score = 15
    elif fed_awards >= 3:
        score = 10
    elif fed_awards >= 1:
        score = 5
    else:
        return 0
    # Recency bonus
    last_award = contractor.get("last_award_date") or ""
    if any(yr in last_award for yr in ["2024", "2025", "2026"]):
        score += 5
    return min(score, 20)

def score_incumbent_match(opportunity, contractor):
    """Check if contractor is the incumbent (advantage) — in-memory."""
    inc_uei = opportunity.get("incumbent_contractor_uei")
    inc_name = (opportunity.get("incumbent_contractor_name") or "").lower()
    if not inc_uei and not inc_name:
        return 0
    con_uei = contractor.get("uei") or ""
    con_name = (contractor.get("company_name") or "").lower()
    if inc_uei and con_uei == inc_uei:
        return -15  # Strong incumbent advantage
    if inc_name and inc_name in con_name:
        return -10  # Weak name match
    return 0

# ---------------------------------------------------------------------------
# MAIN SCORING ENGINE
# ---------------------------------------------------------------------------

def score_matches():
    """
    Enhanced 140-point deterministic scoring:
      Base (100): NAICS(30) + Geo(15) + Capacity(20) + Inactivity(20) + Density(15)
      Intel (+40): NoticeType(20) + PastPerf(20) + IncumbentRisk(-15 to 0)
    """
    if not all([SUPABASE_URL, SUPABASE_SERVICE_KEY]):
        print("❌ Missing API keys in .env.")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    print("🔄 Starting Enhanced Deterministic Contractor Matching (Sprint 3)...")

    # --- BATCH LOAD all data into memory ---
    print("  📦 Loading data...")
    ops_res = supabase.table("opportunities").select(
        "id, naics_code, notice_type, awardee, "
        "incumbent_contractor_uei, incumbent_contractor_name, "
        "place_of_performance_state, set_aside_code"
    ).eq("is_archived", False).execute()

    # Load contractors in batches (Supabase has 1000 row default limit)
    all_contractors = []
    offset = 0
    batch_size = 1000
    while True:
        con_batch = supabase.table("contractors").select(
            "id, uei, company_name, naics_codes, sba_certifications, state, city, "
            "employee_count, revenue, federal_awards_count, last_award_date"
        ).range(offset, offset + batch_size - 1).execute()
        all_contractors.extend(con_batch.data)
        if len(con_batch.data) < batch_size:
            break
        offset += batch_size

    opportunities = ops_res.data
    contractors = all_contractors

    if not opportunities or not contractors:
        print("⚠️ No data. Ensure opportunities and contractors exist.")
        return

    print(f"  -> {len(opportunities)} opportunities x {len(contractors)} contractors")

    match_payloads = []
    notice_type_updates = {}

    for i, op in enumerate(opportunities):
        op_id = op["id"]
        op_naics = op.get("naics_code")
        op_state = op.get("place_of_performance_state")
        op_set_aside = (op.get("set_aside_code") or "").lower()

        # Notice Type Score (opportunity-level, same for all contractors)
        nt_score = score_notice_type(op.get("notice_type"))
        notice_type_updates[op_id] = nt_score

        # Competition density (default medium, we don't have bidder count)
        density_score = 10

        contractor_scores = []

        for con in contractors:
            con_id = con["id"]
            con_naics = con.get("naics_codes") or []
            con_state = con.get("state")

            # --- 1. NAICS Fit (30) ---
            naics_score = 0
            if op_naics:
                if op_naics in con_naics:
                    naics_score = 30  # Exact match
                elif any(str(n)[:4] == str(op_naics)[:4] for n in con_naics):
                    naics_score = 20  # Sub-sector match (4-digit)
                elif any(str(n)[:3] == str(op_naics)[:3] for n in con_naics):
                    naics_score = 10  # Sector match (3-digit)

            # Skip if no NAICS relevance at all
            if naics_score == 0:
                continue

            # --- 2. Geographic Fit (15) ---
            geo_score = 5  # Nationwide fallback
            if op_state and con_state:
                if op_state == con_state:
                    geo_score = 15  # Same state
                # Neighboring states bonus could be added later

            # --- 3. Capacity Score (20) ---
            capacity_score = 5  # Base for being SAM-registered
            emp = con.get("employee_count") or 0
            rev = con.get("revenue") or 0
            if emp > 10:
                capacity_score += 5
            if rev > 500000:
                capacity_score += 5
            # Set-aside certification match bonus
            certs = con.get("sba_certifications") or []
            certs_lower = [str(c).lower() for c in certs]
            if op_set_aside:
                if "8(a)" in op_set_aside and any("8a" in c for c in certs_lower):
                    capacity_score += 5
                elif "sdvosb" in op_set_aside and any("sdvosb" in c for c in certs_lower):
                    capacity_score += 5
                elif "wosb" in op_set_aside and any("wosb" in c for c in certs_lower):
                    capacity_score += 5
                elif "hubzone" in op_set_aside and any("hubzone" in c for c in certs_lower):
                    capacity_score += 5
                elif "small" in op_set_aside:
                    capacity_score += 3  # Generic small business

            # --- 4. Federal Inactivity Score (20) ---
            # Higher = more likely to need help (our target client)
            fed_awards = con.get("federal_awards_count") or 0
            if fed_awards == 0:
                inactivity_score = 20  # Never won = needs us most
            elif fed_awards <= 2:
                inactivity_score = 15
            elif fed_awards <= 5:
                inactivity_score = 10
            else:
                inactivity_score = 5

            # --- SPRINT 3: Intelligence Factors ---
            past_perf = score_past_performance(con)
            incumbent_risk = score_incumbent_match(op, con)

            # --- TOTAL ---
            base_score = naics_score + geo_score + capacity_score + inactivity_score + density_score
            intel_bonus = nt_score + past_perf + incumbent_risk
            total_score = base_score + intel_bonus

            # Classification
            if total_score >= 100:
                classification = "HOT"
            elif total_score >= 70:
                classification = "WARM"
            else:
                classification = "COLD"

            contractor_scores.append({
                "opportunity_id": op_id,
                "contractor_id": con_id,
                "score": round(min(total_score / 140.0, 1.0), 4),
                "classification": classification,
                "score_breakdown": {
                    "naics": naics_score,
                    "geo": geo_score,
                    "capacity": capacity_score,
                    "inactivity": inactivity_score,
                    "density": density_score,
                    "notice_type": nt_score,
                    "past_performance": past_perf,
                    "incumbent_risk": incumbent_risk,
                    "base": base_score,
                    "intel_bonus": intel_bonus,
                    "total": total_score,
                }
            })

        # Top 10 per opportunity
        top_10 = sorted(contractor_scores, key=lambda x: x["score"], reverse=True)[:10]
        match_payloads.extend(top_10)

        # Progress
        if (i + 1) % 50 == 0:
            print(f"     Scored {i + 1}/{len(opportunities)} opportunities...")

    print(f"  -> Generated {len(match_payloads)} match records")

    if not match_payloads:
        print("  ⚠️ No matches generated. Check NAICS alignment between opportunities and contractors.")
        return

    # --- WRITE RESULTS ---
    try:
        op_ids = list(set(m["opportunity_id"] for m in match_payloads))

        # Update notice_type_score on opportunities
        for op_id in op_ids:
            if op_id in notice_type_updates:
                try:
                    supabase.table("opportunities").update({
                        "notice_type_score": notice_type_updates[op_id]
                    }).eq("id", op_id).execute()
                except Exception:
                    pass

        # Clear old matches
        for chunk in chunk_list(op_ids, 100):
            if chunk:
                supabase.table("matches").delete().in_("opportunity_id", chunk).execute()

        # Insert new matches
        for chunk in chunk_list(match_payloads, 500):
            supabase.table("matches").insert(chunk).execute()

        # Stats
        hot = sum(1 for m in match_payloads if m["classification"] == "HOT")
        warm = sum(1 for m in match_payloads if m["classification"] == "WARM")
        cold = sum(1 for m in match_payloads if m["classification"] == "COLD")
        unique_opps = len(op_ids)
        unique_cons = len(set(m["contractor_id"] for m in match_payloads))

        print(f"\n  ✅ Scoring Complete!")
        print(f"     Opportunities matched: {unique_opps}")
        print(f"     Unique contractors: {unique_cons}")
        print(f"     HOT: {hot} | WARM: {warm} | COLD: {cold}")
        print(f"  📊 Sprint 3 Intelligence:")
        print(f"     Notice Type Scoring: ✓")
        print(f"     Past Performance: ✓")
        print(f"     Incumbent Risk: ✓")

    except Exception as e:
        print(f"  ❌ DB Error: {e}")

if __name__ == "__main__":
    score_matches()

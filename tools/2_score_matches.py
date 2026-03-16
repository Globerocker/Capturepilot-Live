"""
Tool 2: User-Centric Opportunity Matching (Sprint 11)
Scores opportunities against user_profiles using a Masterguide-aligned model:
  NAICS(15%) + PSC(10%) + SetAside(15%) + Geo(10%) + ValueFit(10%)
  + PastPerf(10%) + NoticeType(10%) + AgencyPref(5%) + Deadline(5%) + CertBonus(10%)

All scoring is deterministic and rules-based (no AI).
Writes to user_matches table (per-user, RLS-protected).
"""
import os
from datetime import datetime, timezone
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

_script_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.dirname(_script_dir)
load_env_file(os.path.join(_project_root, ".env.local"))
load_env_file(os.path.join(_project_root, ".env"))

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

# ---------------------------------------------------------------------------
# WEIGHTS (Masterguide-aligned, sum to 1.0)
# ---------------------------------------------------------------------------
W_NAICS = 0.15
W_PSC = 0.10
W_SET_ASIDE = 0.15
W_GEO = 0.10
W_VALUE_FIT = 0.10
W_PAST_PERF = 0.10
W_NOTICE_TYPE = 0.10
W_AGENCY_PREF = 0.05
W_DEADLINE = 0.05
W_CERT_BONUS = 0.10

# Max matches to keep per user
MAX_MATCHES_PER_USER = 100

# ---------------------------------------------------------------------------
# SCORING FUNCTIONS
# ---------------------------------------------------------------------------

def score_naics(user_naics, opp_naics):
    """NAICS match: exact=1.0, 4-digit=0.6, 3-digit=0.3, none=None (skip)."""
    if not opp_naics or not user_naics:
        return None  # Skip this opportunity
    opp_str = str(opp_naics)
    for n in user_naics:
        if str(n) == opp_str:
            return 1.0
    for n in user_naics:
        if str(n)[:4] == opp_str[:4]:
            return 0.6
    for n in user_naics:
        if str(n)[:3] == opp_str[:3]:
            return 0.3
    return None  # No relevance — skip


def score_psc(user_pscs, opp_psc):
    """PSC match: exact=1.0, no match=0.0."""
    if not opp_psc or not user_pscs:
        return 0.0
    opp_str = str(opp_psc).upper()
    for p in user_pscs:
        if str(p).upper() == opp_str:
            return 1.0
        # Partial match: same category (first 2 chars)
        if len(str(p)) >= 2 and len(opp_str) >= 2 and str(p).upper()[:2] == opp_str[:2]:
            return 0.5
    return 0.0


def score_set_aside(user_certs, opp_set_aside):
    """Set-aside alignment."""
    if not opp_set_aside:
        # No set-aside = open to all. Slight bonus if user has certs (versatile).
        return 0.5 if user_certs else 0.3

    sa = opp_set_aside.lower()
    certs_lower = [str(c).lower() for c in (user_certs or [])]

    # Direct certification match
    cert_map = {
        "8(a)": ["8(a)", "8a"],
        "sdvosb": ["sdvosb"],
        "wosb": ["wosb"],
        "edwosb": ["edwosb"],
        "hubzone": ["hubzone"],
        "vosb": ["vosb"],
        "sdb": ["sdb"],
    }
    for sa_key, cert_variants in cert_map.items():
        if sa_key in sa:
            if any(cv in c for cv in cert_variants for c in certs_lower):
                return 1.0
            return 0.0  # Required cert not held — bad match

    # Generic "small business" set-aside
    if "small" in sa:
        return 0.6 if certs_lower else 0.4

    # Total small business or other
    return 0.3


def score_geo(user_state, user_target_states, opp_state):
    """Geographic alignment."""
    if not opp_state:
        return 0.3  # No location specified — neutral

    target_states = user_target_states or []
    if opp_state in target_states:
        return 1.0  # Explicitly targeted
    if user_state and user_state == opp_state:
        return 0.8  # Home state
    if not target_states:
        return 0.2  # No preferences set — nationwide default
    return 0.0  # Outside target area


def score_value_fit(user_revenue, opp_value):
    """Contract value fit: 20-80% of annual revenue is ideal."""
    if not opp_value or not user_revenue or user_revenue <= 0:
        return 0.5  # Unknown — neutral
    ratio = opp_value / user_revenue
    if 0.2 <= ratio <= 0.8:
        return 1.0  # Sweet spot
    if 0.1 <= ratio < 0.2 or 0.8 < ratio <= 1.5:
        return 0.5  # Manageable but not ideal
    return 0.2  # Too small or too large


def score_past_performance(fed_awards):
    """Past performance based on federal award count."""
    awards = fed_awards or 0
    if awards >= 5:
        return 1.0
    if awards >= 3:
        return 0.7
    if awards >= 1:
        return 0.4
    return 0.2  # No experience — low but not zero


def score_notice_type(notice_type):
    """Notice type priority (Masterguide: Sources Sought > Presol > Solicitation)."""
    if not notice_type:
        return 0.3
    nt = str(notice_type).lower()
    if any(x in nt for x in ['sources sought', 'rfi', 'market research']):
        return 1.0
    if 'presolicitation' in nt:
        return 0.8
    if 'combined' in nt:
        return 0.6
    if 'solicitation' in nt:
        return 0.5
    if 'award' in nt:
        return 0.0  # Award notices — skip
    return 0.3


def score_agency_pref(user_preferred, opp_agency):
    """Agency preference match."""
    if not user_preferred:
        return 0.5  # No preference — neutral
    if not opp_agency:
        return 0.3
    agency_lower = opp_agency.lower()
    for pref in user_preferred:
        if pref.lower() in agency_lower or agency_lower in pref.lower():
            return 1.0
    return 0.2  # Not preferred


def score_deadline(response_deadline):
    """Deadline feasibility — more time = better."""
    if not response_deadline:
        return 0.5
    try:
        deadline = datetime.fromisoformat(response_deadline.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        days_left = (deadline - now).days
        if days_left < 0:
            return None  # Past deadline — skip
        if days_left > 30:
            return 1.0
        if days_left > 14:
            return 0.7
        if days_left > 7:
            return 0.4
        return 0.2
    except (ValueError, TypeError):
        return 0.5


def score_cert_bonus(user_certs, opp_set_aside):
    """Extra certification bonus for exact cert-to-setaside alignment."""
    if not opp_set_aside or not user_certs:
        return 0.0

    sa = opp_set_aside.lower()
    certs_lower = [str(c).lower() for c in user_certs]

    # Perfect match bonuses
    if "8(a)" in sa and any("8a" in c or "8(a)" in c for c in certs_lower):
        return 1.0
    if "hubzone" in sa and any("hubzone" in c for c in certs_lower):
        return 1.0  # HUBZone is undermet — highest advantage
    if "sdvosb" in sa and any("sdvosb" in c for c in certs_lower):
        return 1.0
    if "wosb" in sa and any("wosb" in c or "edwosb" in c for c in certs_lower):
        return 1.0
    # Has cert but different set-aside
    if user_certs:
        return 0.3
    return 0.0


# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------
def chunk_list(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]


# ---------------------------------------------------------------------------
# MAIN SCORING ENGINE
# ---------------------------------------------------------------------------

def score_matches():
    if not all([SUPABASE_URL, SUPABASE_SERVICE_KEY]):
        print("Missing API keys in .env.")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    print("=" * 60)
    print("  Tool 2: User-Centric Opportunity Matching (Sprint 11)")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    # --- Load user profiles (only onboarded users) ---
    profiles_res = supabase.table("user_profiles").select(
        "id, company_name, naics_codes, sba_certifications, state, "
        "target_states, employee_count, revenue, federal_awards_count, "
        "service_radius_miles, target_contract_types, "
        "target_psc_codes, preferred_agencies, contract_value_min, contract_value_max"
    ).eq("onboarding_complete", True).execute()

    users = profiles_res.data or []
    if not users:
        print("No onboarded users found.")
        return

    print(f"  Users to score: {len(users)}")

    # --- Load active opportunities ---
    all_opportunities = []
    offset = 0
    batch_size = 1000
    while True:
        opp_batch = supabase.table("opportunities").select(
            "id, naics_code, psc_code, notice_type, agency, "
            "set_aside_code, place_of_performance_state, "
            "award_amount, response_deadline"
        ).eq("is_archived", False).range(offset, offset + batch_size - 1).execute()
        all_opportunities.extend(opp_batch.data)
        if len(opp_batch.data) < batch_size:
            break
        offset += batch_size

    opportunities = all_opportunities
    if not opportunities:
        print("No active opportunities found.")
        return

    print(f"  Opportunities to score: {len(opportunities)}")
    print()

    total_hot = 0
    total_warm = 0
    total_written = 0

    for u_idx, user in enumerate(users):
        user_id = user["id"]
        user_name = user.get("company_name", "Unknown")
        user_naics = user.get("naics_codes") or []
        user_pscs = user.get("target_psc_codes") or []
        user_certs = user.get("sba_certifications") or []
        user_state = user.get("state") or ""
        user_target_states = user.get("target_states") or []
        user_revenue = user.get("revenue") or 0
        user_fed_awards = user.get("federal_awards_count") or 0
        user_preferred_agencies = user.get("preferred_agencies") or []

        print(f"  Scoring for: {user_name}")
        print(f"    NAICS: {user_naics[:5]}{'...' if len(user_naics) > 5 else ''}")
        print(f"    State: {user_state}, Targets: {len(user_target_states)} states")
        print(f"    Certs: {user_certs}")

        scored_matches = []

        for opp in opportunities:
            opp_id = opp["id"]

            # --- 1. NAICS (15%) — gate: skip if no match ---
            naics = score_naics(user_naics, opp.get("naics_code"))
            if naics is None:
                continue

            # --- 2. Notice Type (10%) — skip awards ---
            nt = score_notice_type(opp.get("notice_type"))
            if nt == 0.0:
                continue  # Award notices — not actionable

            # --- 3. Deadline (5%) — skip expired ---
            dl = score_deadline(opp.get("response_deadline"))
            if dl is None:
                continue  # Past deadline

            # --- 4-10. Remaining factors ---
            psc = score_psc(user_pscs, opp.get("psc_code"))
            sa = score_set_aside(user_certs, opp.get("set_aside_code"))
            geo = score_geo(user_state, user_target_states, opp.get("place_of_performance_state"))
            vf = score_value_fit(user_revenue, opp.get("award_amount"))
            pp = score_past_performance(user_fed_awards)
            ap = score_agency_pref(user_preferred_agencies, opp.get("agency"))
            cb = score_cert_bonus(user_certs, opp.get("set_aside_code"))

            # --- Weighted total ---
            total = (
                W_NAICS * naics +
                W_PSC * psc +
                W_SET_ASIDE * sa +
                W_GEO * geo +
                W_VALUE_FIT * vf +
                W_PAST_PERF * pp +
                W_NOTICE_TYPE * nt +
                W_AGENCY_PREF * ap +
                W_DEADLINE * dl +
                W_CERT_BONUS * cb
            )

            # Only keep WARM or better
            if total < 0.50:
                continue

            classification = "HOT" if total >= 0.70 else "WARM"

            scored_matches.append({
                "user_profile_id": user_id,
                "opportunity_id": opp_id,
                "score": round(total, 4),
                "classification": classification,
                "score_breakdown": {
                    "naics": round(naics, 2),
                    "psc": round(psc, 2),
                    "set_aside": round(sa, 2),
                    "geo": round(geo, 2),
                    "value_fit": round(vf, 2),
                    "past_performance": round(pp, 2),
                    "notice_type": round(nt, 2),
                    "agency_pref": round(ap, 2),
                    "deadline": round(dl, 2),
                    "cert_bonus": round(cb, 2),
                    "total": round(total, 4),
                },
            })

        # Sort by score, keep top MAX_MATCHES_PER_USER
        scored_matches.sort(key=lambda x: x["score"], reverse=True)
        top_matches = scored_matches[:MAX_MATCHES_PER_USER]

        user_hot = sum(1 for m in top_matches if m["classification"] == "HOT")
        user_warm = sum(1 for m in top_matches if m["classification"] == "WARM")
        total_hot += user_hot
        total_warm += user_warm

        print(f"    Scored: {len(scored_matches)} passed threshold, keeping top {len(top_matches)}")
        print(f"    HOT: {user_hot} | WARM: {user_warm}")

        if not top_matches:
            print(f"    No matches above 0.50 threshold.")
            continue

        # --- Write to user_matches ---
        try:
            # Get existing opp IDs for this user to clean stale matches
            keep_opp_ids = [m["opportunity_id"] for m in top_matches]

            # Delete stale matches not in new top set
            try:
                supabase.table("user_matches").delete() \
                    .eq("user_profile_id", user_id) \
                    .not_.in_("opportunity_id", keep_opp_ids) \
                    .execute()
            except Exception:
                pass

            # Upsert new matches
            for chunk in chunk_list(top_matches, 200):
                supabase.table("user_matches").upsert(
                    chunk,
                    on_conflict="user_profile_id,opportunity_id"
                ).execute()

            total_written += len(top_matches)
            print(f"    Written: {len(top_matches)} matches")

        except Exception as e:
            print(f"    DB Error: {e}")

        print()

    # --- Summary ---
    print("=" * 60)
    print(f"  Scoring Complete!")
    print(f"  Users scored: {len(users)}")
    print(f"  Total matches written: {total_written}")
    print(f"  HOT: {total_hot} | WARM: {total_warm}")
    print("=" * 60)


if __name__ == "__main__":
    score_matches()

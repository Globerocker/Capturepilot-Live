"""
Tool 10: Enrichment Orchestrator
Master pipeline that chains:
  7_discover_contractors  ->  9_download_attachments  ->  8_enrich_contacts

Supports both automatic (cron) and manual (dashboard button) triggers.
Includes API budget checking and graceful degradation.
"""
import os
import sys
import time
import json
from datetime import datetime
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
APOLLO_API_KEY = os.getenv("APOLLO_API_KEY")
SERPAPI_KEY = os.getenv("SERPAPI_KEY")
SAM_API_KEY = os.getenv("SAM_API_KEY")

# Budget limits
SERPAPI_MONTHLY_CAP = 95       # Total SerpAPI credits/month (free tier = 100)
APOLLO_MONTHLY_CAP = 180       # Conservative Apollo limit (~200 on starter)
AUTO_OPPORTUNITIES_LIMIT = 5   # Max opportunities per auto run
MANUAL_TIMEOUT_MINUTES = 3     # Max time for manual enrichment


# ---------------------------------------------------------------------------
# BUDGET CHECKING
# ---------------------------------------------------------------------------
def check_api_budgets(supabase):
    """
    Checks remaining API budgets before starting.
    Returns dict with budget info and whether to proceed.
    """
    first_of_month = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0).isoformat()
    budgets = {
        "sam_entity": {"available": bool(SAM_API_KEY), "unlimited": True},
        "serpapi": {"available": bool(SERPAPI_KEY), "remaining": 0},
        "apollo": {"available": bool(APOLLO_API_KEY), "remaining": 0},
        "website_scraping": {"available": True, "unlimited": True},
    }

    # Count SerpAPI usage (Google Local + Google Business searches)
    try:
        # Google Local discoveries
        gl_res = supabase.table("opportunity_contractors").select(
            "id", count="exact"
        ).eq("discovery_source", "google_local").gte("created_at", first_of_month).execute()
        gl_count = gl_res.count or 0

        # Google Business enrichments (estimate from contractors updated this month)
        gmb_res = supabase.table("contractors").select(
            "id", count="exact"
        ).not_.is_("google_place_id", "null").gte("last_enriched_at", first_of_month).execute()
        gmb_count = gmb_res.count or 0

        serpapi_used = gl_count + gmb_count
        budgets["serpapi"]["remaining"] = max(0, SERPAPI_MONTHLY_CAP - serpapi_used)
        budgets["serpapi"]["used"] = serpapi_used
    except Exception:
        budgets["serpapi"]["remaining"] = 50  # Conservative estimate

    # Count Apollo usage
    try:
        apollo_res = supabase.table("contractor_contacts").select(
            "id", count="exact"
        ).eq("source", "apollo").gte("created_at", first_of_month).execute()
        apollo_used = apollo_res.count or 0
        budgets["apollo"]["remaining"] = max(0, APOLLO_MONTHLY_CAP - apollo_used)
        budgets["apollo"]["used"] = apollo_used
    except Exception:
        budgets["apollo"]["remaining"] = 100  # Conservative estimate

    return budgets


def print_budget_report(budgets):
    """Pretty print the API budget status."""
    print("\n  📊 API Budget Status:")
    print(f"     SAM Entity API:    {'✅ Available (unlimited)' if budgets['sam_entity']['available'] else '❌ No API key'}")
    if budgets["serpapi"]["available"]:
        print(f"     SerpAPI:           ✅ {budgets['serpapi']['remaining']} credits remaining")
    else:
        print(f"     SerpAPI:           ⚠️ No API key (Google Local/GMB disabled)")
    if budgets["apollo"]["available"]:
        print(f"     Apollo.io:         ✅ {budgets['apollo']['remaining']} credits remaining")
    else:
        print(f"     Apollo.io:         ⚠️ No API key (decision-maker search disabled)")
    print(f"     Website Scraping:  ✅ Available (free)")


# ---------------------------------------------------------------------------
# ORCHESTRATION
# ---------------------------------------------------------------------------
def orchestrate_enrichment(opportunity_id=None, trigger_type="auto"):
    """
    Master orchestrator that runs the full enrichment pipeline.

    Pipeline per opportunity:
      1. Discover contractors (SAM Entity + Google Local)
      2. Download attachments (PDF/DOCX extraction)
      3. Enrich contacts (Apollo + website scrape + Google Business)

    Args:
        opportunity_id: Specific opportunity UUID (for manual trigger), or None for auto
        trigger_type: 'auto' or 'manual'
    """
    if not all([SUPABASE_URL, SUPABASE_SERVICE_KEY]):
        print("❌ Missing Supabase API keys in .env. Halting execution.")
        return {"success": False, "error": "Missing Supabase keys"}

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    print("=" * 60)
    print("🚀 ENRICHMENT ORCHESTRATOR")
    print(f"   Trigger: {trigger_type}")
    print(f"   Target: {'Single opportunity' if opportunity_id else 'All HOT matches'}")
    print(f"   Time: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC")
    print("=" * 60)

    # --- Budget Check ---
    budgets = check_api_budgets(supabase)
    print_budget_report(budgets)

    # Warn if major APIs are unavailable but don't block
    if not budgets["sam_entity"]["available"]:
        print("\n  ⚠️ SAM_API_KEY missing - SAM entity discovery will be skipped!")

    # --- Import tools (lazy import to avoid circular deps) ---
    # We import the pipeline functions directly rather than subprocess calls
    # for better error handling and data flow
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

    from importlib import import_module

    try:
        tool7 = import_module("7_discover_contractors")
        tool8 = import_module("8_enrich_contacts")
        tool9 = import_module("9_download_attachments")
    except ImportError as e:
        print(f"\n  ❌ Failed to import enrichment tools: {e}")
        return {"success": False, "error": str(e)}

    # --- Determine opportunities to process ---
    if opportunity_id:
        # Manual trigger: single opportunity
        res = supabase.table("opportunities").select(
            "id, title, naics_code, place_of_performance_state, place_of_performance_city, set_aside_code"
        ).eq("id", opportunity_id).single().execute()

        if not res.data:
            print(f"\n  ❌ Opportunity {opportunity_id} not found")
            return {"success": False, "error": "Opportunity not found"}

        target_opportunities = [res.data]
    else:
        # Auto trigger: find HOT matches not yet enriched (no joins - FK may not exist)
        match_res = supabase.table("matches").select(
            "opportunity_id"
        ).eq("classification", "HOT").order("score", desc=True).limit(50).execute()

        if not match_res.data:
            print("\n  ✅ No HOT matches found. Pipeline complete.")
            return {"success": True, "processed": 0}

        # Deduplicate and fetch each opportunity separately
        seen = set()
        target_opportunities = []
        for match in match_res.data:
            oid = match.get("opportunity_id")
            if oid and oid not in seen and len(target_opportunities) < AUTO_OPPORTUNITIES_LIMIT:
                seen.add(oid)
                opp_res = supabase.table("opportunities").select(
                    "id, title, naics_code, place_of_performance_state, place_of_performance_city, set_aside_code, enrichment_status"
                ).eq("id", oid).single().execute()
                if opp_res.data:
                    status = opp_res.data.get("enrichment_status", "none")
                    if status in (None, "none", "failed"):
                        target_opportunities.append(opp_res.data)

    if not target_opportunities:
        print("\n  ✅ All HOT opportunities already enriched.")
        return {"success": True, "processed": 0}

    print(f"\n  🎯 Processing {len(target_opportunities)} opportunities")

    # --- Process each opportunity ---
    results = []
    for i, opp in enumerate(target_opportunities, 1):
        opp_id = opp["id"]
        opp_title = opp.get("title", "Unknown")[:50]

        print(f"\n{'─' * 60}")
        print(f"  [{i}/{len(target_opportunities)}] {opp_title}")
        print(f"{'─' * 60}")

        # Update status
        supabase.table("opportunities").update({
            "enrichment_status": "running"
        }).eq("id", opp_id).execute()

        opp_result = {
            "opportunity_id": opp_id,
            "title": opp_title,
            "contractors_discovered": 0,
            "contractors_enriched": 0,
            "attachments_processed": 0,
            "errors": [],
        }

        # --- Step 1: Discover Contractors ---
        print(f"\n  📡 Step 1: Contractor Discovery")
        try:
            tool7.run_discovery_pipeline(
                opportunity_id=opp_id,
                trigger_type=trigger_type,
            )
            # Count what was discovered
            disc_res = supabase.table("opportunity_contractors").select(
                "id", count="exact"
            ).eq("opportunity_id", opp_id).execute()
            opp_result["contractors_discovered"] = disc_res.count or 0
        except Exception as e:
            error_msg = f"Discovery error: {str(e)[:200]}"
            print(f"  ❌ {error_msg}")
            opp_result["errors"].append(error_msg)

        # --- Step 2: Download Attachments ---
        print(f"\n  📎 Step 2: Attachment Intelligence")
        try:
            tool9.run_attachment_pipeline(opportunity_id=opp_id)
            att_res = supabase.table("opportunity_attachments").select(
                "id", count="exact"
            ).eq("opportunity_id", opp_id).execute()
            opp_result["attachments_processed"] = att_res.count or 0
        except Exception as e:
            error_msg = f"Attachment error: {str(e)[:200]}"
            print(f"  ❌ {error_msg}")
            opp_result["errors"].append(error_msg)

        # --- Step 3: Deep Contact Enrichment ---
        print(f"\n  🧬 Step 3: Contact Enrichment")
        try:
            tool8.run_enrichment_pipeline(opportunity_id=opp_id)
            enr_res = supabase.table("opportunity_contractors").select(
                "id", count="exact"
            ).eq("opportunity_id", opp_id).eq("enrichment_status", "enriched").execute()
            opp_result["contractors_enriched"] = enr_res.count or 0
        except Exception as e:
            error_msg = f"Enrichment error: {str(e)[:200]}"
            print(f"  ❌ {error_msg}")
            opp_result["errors"].append(error_msg)

        # --- Finalize opportunity ---
        final_status = "completed" if not opp_result["errors"] else "partial"
        supabase.table("opportunities").update({
            "enrichment_status": final_status,
            "enrichment_completed_at": datetime.utcnow().isoformat(),
        }).eq("id", opp_id).execute()

        results.append(opp_result)

        print(f"\n  📊 Summary for {opp_title}:")
        print(f"     Contractors discovered: {opp_result['contractors_discovered']}")
        print(f"     Contractors enriched:   {opp_result['contractors_enriched']}")
        print(f"     Attachments processed:  {opp_result['attachments_processed']}")
        if opp_result["errors"]:
            print(f"     Errors: {len(opp_result['errors'])}")

    # --- Final Summary ---
    total_discovered = sum(r["contractors_discovered"] for r in results)
    total_enriched = sum(r["contractors_enriched"] for r in results)
    total_attachments = sum(r["attachments_processed"] for r in results)
    total_errors = sum(len(r["errors"]) for r in results)

    print(f"\n{'=' * 60}")
    print(f"🎉 ENRICHMENT ORCHESTRATOR COMPLETE")
    print(f"   Opportunities processed: {len(results)}")
    print(f"   Total contractors discovered: {total_discovered}")
    print(f"   Total contractors enriched: {total_enriched}")
    print(f"   Total attachments processed: {total_attachments}")
    print(f"   Errors: {total_errors}")
    print(f"   Completed: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC")
    print(f"{'=' * 60}")

    return {
        "success": True,
        "processed": len(results),
        "total_discovered": total_discovered,
        "total_enriched": total_enriched,
        "total_attachments": total_attachments,
        "results": results,
    }


if __name__ == "__main__":
    opp_id = None
    trigger = "auto"

    args = sys.argv[1:]
    i = 0
    while i < len(args):
        if args[i] == "--opportunity_id" and i + 1 < len(args):
            opp_id = args[i + 1]
            i += 2
        elif args[i] == "--trigger" and i + 1 < len(args):
            trigger = args[i + 1]
            i += 2
        else:
            i += 1

    orchestrate_enrichment(opportunity_id=opp_id, trigger_type=trigger)

#!/usr/bin/env python3
"""
Tool 11: Backfill Contractor Fields from Existing Data

Derives missing fields from data already in the database:
1. years_in_business from activation_date
2. POC emails/phones from contacts table
3. Normalize duplicate sam_registered → is_sam_registered
4. Calculate federal_activity_status from awards data
5. Extract solicitation_number from raw_json

Usage:
    python3 tools/11_backfill_contractors.py
"""
import os, sys, re
from datetime import datetime, date

def load_env():
    for fp in [os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), f) for f in (".env.local", ".env")]:
        if os.path.exists(fp):
            with open(fp) as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        k, v = line.split('=', 1)
                        os.environ[k.strip()] = v.strip().strip("'").strip('"')

load_env()

from supabase import create_client

sb = create_client(
    os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_KEY")
)

BATCH_SIZE = 500


def backfill_years_in_business():
    """Calculate years_in_business from activation_date for all contractors."""
    print("\n--- Phase 1: Backfill years_in_business from activation_date ---")

    updated = 0
    offset = 0
    today = date.today()

    while True:
        res = sb.table("contractors") \
            .select("id, activation_date") \
            .not_.is_("activation_date", "null") \
            .range(offset, offset + BATCH_SIZE - 1) \
            .execute()

        if not res.data:
            break

        for c in res.data:
            act = c.get("activation_date")
            if not act:
                continue
            try:
                if isinstance(act, str):
                    act_date = datetime.strptime(act[:10], "%Y-%m-%d").date()
                else:
                    act_date = act
                years = (today - act_date).days / 365.25
                years_int = max(0, int(years))

                if years_int > 0:
                    sb.table("contractors").update({
                        "years_in_business": years_int
                    }).eq("id", c["id"]).execute()
                    updated += 1
            except Exception:
                pass

        offset += BATCH_SIZE
        if len(res.data) < BATCH_SIZE:
            break

        if offset % 5000 == 0:
            print(f"  Processed {offset} contractors, {updated} updated...", flush=True)

    print(f"  Years in business backfilled: {updated}", flush=True)
    return updated


def backfill_poc_from_contacts():
    """Cross-reference contacts table to fill missing POC emails/phones on contractors."""
    print("\n--- Phase 2: Backfill POC emails/phones from contacts table ---")

    updated = 0
    offset = 0

    # Get contractors with POC names but missing email/phone
    while True:
        res = sb.table("contractors") \
            .select("id, uei, primary_poc_name, primary_poc_email, primary_poc_phone") \
            .not_.is_("primary_poc_name", "null") \
            .is_("primary_poc_email", "null") \
            .range(offset, offset + BATCH_SIZE - 1) \
            .execute()

        if not res.data:
            break

        for c in res.data:
            poc_name = c.get("primary_poc_name", "")
            if not poc_name:
                continue

            # Search contacts by name
            contacts_res = sb.table("contacts") \
                .select("email, phone") \
                .ilike("fullname", f"%{poc_name}%") \
                .not_.is_("email", "null") \
                .limit(1) \
                .execute()

            if contacts_res.data:
                contact = contacts_res.data[0]
                update = {}
                if contact.get("email") and not c.get("primary_poc_email"):
                    update["primary_poc_email"] = contact["email"]
                if contact.get("phone") and not c.get("primary_poc_phone"):
                    update["primary_poc_phone"] = contact["phone"]
                if update:
                    sb.table("contractors").update(update).eq("id", c["id"]).execute()
                    updated += 1

        offset += BATCH_SIZE
        if len(res.data) < BATCH_SIZE:
            break

        if offset % 2000 == 0:
            print(f"  Processed {offset} contractors, {updated} updated...", flush=True)

    print(f"  POC contacts backfilled: {updated}", flush=True)
    return updated


def backfill_opportunity_fields():
    """Backfill opportunity fields from raw_json that weren't extracted during ingestion."""
    print("\n--- Phase 3: Backfill opportunity fields from raw_json ---")

    updated = 0
    offset = 0

    while True:
        res = sb.table("opportunities") \
            .select("id, raw_json, solicitation_number, place_of_performance_zip, place_of_performance_country, link") \
            .not_.is_("raw_json", "null") \
            .range(offset, offset + BATCH_SIZE - 1) \
            .execute()

        if not res.data:
            break

        for opp in res.data:
            raw = opp.get("raw_json")
            if not raw or not isinstance(raw, dict):
                continue

            update = {}

            # Solicitation number
            if not opp.get("solicitation_number"):
                sol_num = raw.get("solicitationNumber") or raw.get("solicitation_number", "")
                if sol_num:
                    update["solicitation_number"] = sol_num

            # Place of performance details
            pop = raw.get("placeOfPerformance") or raw.get("place_of_performance") or {}
            if isinstance(pop, dict):
                state_code = pop.get("state", {}).get("code", "") if isinstance(pop.get("state"), dict) else pop.get("state", "")
                city = pop.get("city", {}).get("name", "") if isinstance(pop.get("city"), dict) else pop.get("city", "")
                zip_code = pop.get("zip", "")
                country = pop.get("country", {}).get("code", "") if isinstance(pop.get("country"), dict) else pop.get("country", "")

                if not opp.get("place_of_performance_zip") and zip_code:
                    update["place_of_performance_zip"] = zip_code
                if not opp.get("place_of_performance_country") and country:
                    update["place_of_performance_country"] = country

            # SAM.gov link
            notice_id = raw.get("noticeId", "")
            if not opp.get("link") and notice_id:
                update["link"] = f"https://sam.gov/opp/{notice_id}/view"

            # Additional info link
            if not opp.get("additional_info_link"):
                add_info = raw.get("additionalInfoLink", "")
                if add_info:
                    update["additional_info_link"] = add_info

            if update:
                sb.table("opportunities").update(update).eq("id", opp["id"]).execute()
                updated += 1

        offset += BATCH_SIZE
        if len(res.data) < BATCH_SIZE:
            break

        if offset % 2000 == 0:
            print(f"  Processed {offset} opportunities, {updated} updated...", flush=True)

    print(f"  Opportunity fields backfilled: {updated}", flush=True)
    return updated


def normalize_sam_registered():
    """Fix duplicate sam_registered boolean - ensure is_sam_registered is canonical."""
    print("\n--- Phase 4: Normalize SAM registration flags ---")

    # Set is_sam_registered=true for any contractor with sam_registered=true but is_sam_registered=false
    res = sb.table("contractors") \
        .select("id", count="exact") \
        .eq("sam_registered", True) \
        .eq("is_sam_registered", False) \
        .execute()

    count = res.count or 0
    if count > 0:
        print(f"  Found {count} contractors with mismatched SAM flags, fixing...", flush=True)
        offset = 0
        while True:
            batch = sb.table("contractors") \
                .select("id") \
                .eq("sam_registered", True) \
                .eq("is_sam_registered", False) \
                .range(offset, offset + BATCH_SIZE - 1) \
                .execute()
            if not batch.data:
                break
            for c in batch.data:
                sb.table("contractors").update({"is_sam_registered": True}).eq("id", c["id"]).execute()
            offset += BATCH_SIZE
            if len(batch.data) < BATCH_SIZE:
                break

    print(f"  SAM flags normalized: {count}", flush=True)
    return count


def backfill_contractor_website():
    """Copy business_url to website field for contractors missing website."""
    print("\n--- Phase 5: Backfill website from business_url ---")

    updated = 0
    offset = 0

    while True:
        res = sb.table("contractors") \
            .select("id, business_url, website") \
            .not_.is_("business_url", "null") \
            .is_("website", "null") \
            .range(offset, offset + BATCH_SIZE - 1) \
            .execute()

        if not res.data:
            break

        for c in res.data:
            if c.get("business_url"):
                sb.table("contractors").update({
                    "website": c["business_url"]
                }).eq("id", c["id"]).execute()
                updated += 1

        offset += BATCH_SIZE
        if len(res.data) < BATCH_SIZE:
            break

    print(f"  Websites backfilled: {updated}", flush=True)
    return updated


def main():
    print("=" * 60)
    print("  Tool 11: Backfill Contractor & Opportunity Fields")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    r1 = backfill_years_in_business()
    r2 = backfill_poc_from_contacts()
    r3 = backfill_opportunity_fields()
    r4 = normalize_sam_registered()
    r5 = backfill_contractor_website()

    print(f"\n{'=' * 60}")
    print(f"  Backfill complete!")
    print(f"  Years in business: {r1}")
    print(f"  POC contacts: {r2}")
    print(f"  Opportunity fields: {r3}")
    print(f"  SAM flags normalized: {r4}")
    print(f"  Websites: {r5}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()

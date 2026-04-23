"""
Comprehensive Opportunity Backfill — Extract ALL data from raw_json
===================================================================
Fills: agency, response_deadline, description, place_of_performance,
       set_aside_code, naics_code, psc_code, solicitation_number,
       sub_agency, office, department, resource_links, award data,
       and strategic flags.

Run: python3 -u tools/20_backfill_all.py
"""
import os, json, time, re, sys
from datetime import datetime

# ---------------------------------------------------------------------------
# ENV
# ---------------------------------------------------------------------------
def load_env(fp):
    if os.path.exists(fp):
        with open(fp) as f:
            for l in f:
                l = l.strip()
                if l and not l.startswith('#') and '=' in l:
                    k, v = l.split('=', 1)
                    os.environ[k.strip()] = v.strip().strip("'").strip('"')

_dir = os.path.dirname(os.path.abspath(__file__))
_root = os.path.dirname(_dir)
load_env(os.path.join(_root, ".env.local"))
load_env(os.path.join(_root, ".env"))

from supabase import create_client
sb = create_client(
    os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_KEY")
)

# Set-aside keyword detection
VETERAN_KEYWORDS = ["sdvosb", "vosb", "veteran", "service-disabled"]
SB_KEYWORDS = ["small business", "8(a)", "hubzone", "wosb", "women-owned",
               "small disadvantaged", "sdb", "small bus"]

def safe_str(val):
    if val is None:
        return None
    return str(val).strip() or None

def safe_date(val):
    if not val:
        return None
    s = str(val).strip()
    if not s:
        return None
    # Try ISO parse
    try:
        datetime.fromisoformat(s.replace("Z", "+00:00"))
        return s
    except:
        pass
    # Try common SAM formats
    for fmt in ("%m/%d/%Y", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).isoformat()
        except:
            pass
    return None

def extract_from_raw(raw):
    """Extract all fields from a raw SAM.gov JSON response."""
    if not raw or not isinstance(raw, dict):
        return {}

    # Place of performance
    pop = raw.get("placeOfPerformance") or {}
    pop_state = None
    pop_city = None
    pop_zip = None
    if isinstance(pop.get("state"), dict):
        pop_state = pop["state"].get("code")
    elif isinstance(pop.get("state"), str):
        pop_state = pop["state"]
    if isinstance(pop.get("city"), dict):
        pop_city = pop["city"].get("name")
    elif isinstance(pop.get("city"), str):
        pop_city = pop["city"]
    pop_zip = pop.get("zip") if isinstance(pop.get("zip"), str) else None

    # Agency hierarchy
    agency = safe_str(raw.get("department") or raw.get("subtier") or raw.get("agency"))
    sub_agency = safe_str(raw.get("subtierAgency") or raw.get("subtier"))
    office = safe_str(raw.get("office"))
    department = safe_str(raw.get("department"))
    org_code = safe_str(raw.get("organizationCode"))

    # Full parent path for department
    full_path = safe_str(raw.get("fullParentPathName"))
    if full_path and not department:
        parts = full_path.split(".")
        department = parts[0].strip() if parts else None

    # Set-aside
    set_aside = safe_str(raw.get("typeOfSetAsideDescription") or raw.get("typeOfSetAside"))

    # Award data
    award = raw.get("award") or {}
    award_amount = None
    awardee_name = None
    awardee_uei = None
    award_date = None
    if isinstance(award, dict):
        award_amount = award.get("amount")
        if isinstance(award_amount, str):
            try:
                award_amount = float(award_amount.replace(",", "").replace("$", ""))
            except:
                award_amount = None
        awardee_obj = award.get("awardee") or {}
        if isinstance(awardee_obj, dict):
            awardee_name = safe_str(awardee_obj.get("name"))
            awardee_uei = safe_str(awardee_obj.get("ueiSAM"))
        award_date = safe_date(award.get("date"))

    # Estimated value
    estimated_value = award_amount
    for field in ("estimatedTotalValue", "baseAndAllOptionsValue", "baseAndExercisedOptionsValue"):
        val = raw.get(field)
        if val:
            try:
                estimated_value = float(str(val).replace(",", "").replace("$", ""))
                break
            except:
                pass

    # Resource links
    resource_links = []
    for rl in (raw.get("resourceLinks") or []):
        if isinstance(rl, str) and rl:
            resource_links.append(rl)
        elif isinstance(rl, dict) and rl.get("url"):
            resource_links.append(rl["url"])
    # Also check attachments
    for att in (raw.get("attachments") or []):
        if isinstance(att, dict):
            url = att.get("url") or att.get("resourceUrl")
            if url:
                resource_links.append(url)

    # POC contacts (for contacts table, handled separately)
    contacts = []
    for poc_key in ("pointOfContact", "contacts"):
        pocs = raw.get(poc_key)
        if isinstance(pocs, list):
            for poc in pocs:
                if isinstance(poc, dict):
                    contacts.append({
                        "fullname": safe_str(poc.get("fullName")),
                        "title": safe_str(poc.get("title")),
                        "email": safe_str(poc.get("email")),
                        "phone": safe_str(poc.get("phone") or poc.get("fax")),
                        "is_primary": poc.get("type", "").lower() == "primary",
                    })

    # Flags
    set_aside_lower = (set_aside or "").lower()
    title_lower = (raw.get("title") or "").lower()
    notice_type = safe_str(raw.get("type")) or ""

    veteran = any(kw in set_aside_lower or kw in title_lower for kw in VETERAN_KEYWORDS)
    small_biz = bool(set_aside and set_aside.lower() not in ("", "none", "total small business"))
    if not small_biz:
        small_biz = any(kw in set_aside_lower or kw in title_lower for kw in SB_KEYWORDS)
    sources_sought = notice_type.lower() in ("r", "sources sought") or "sources sought" in title_lower or "rfi" in title_lower

    # Compute status
    deadline = safe_date(raw.get("responseDeadLine") or raw.get("responseDate"))
    now = datetime.utcnow()
    status = "DISCOVERED"
    if raw.get("type") == "a" or awardee_name:
        status = "AWARDED"
    elif sources_sought:
        if deadline:
            try:
                dl = datetime.fromisoformat(deadline.replace("Z", "+00:00")).replace(tzinfo=None)
                status = "INTELLIGENCE" if dl < now else "MARKET_RESEARCH"
            except:
                status = "MARKET_RESEARCH"
        else:
            status = "MARKET_RESEARCH"
    elif deadline:
        try:
            dl = datetime.fromisoformat(deadline.replace("Z", "+00:00")).replace(tzinfo=None)
            if dl < now:
                status = "EXPIRED"
            else:
                status = "ACTIVE"
        except:
            pass

    return {
        "agency": agency,
        "sub_agency": sub_agency,
        "office": office,
        "department": department,
        "organization_code": org_code,
        "notice_type": safe_str(raw.get("type")),
        "set_aside_code": set_aside,
        "naics_code": safe_str(raw.get("naicsCode")),
        "psc_code": safe_str(raw.get("classificationCode")),
        "solicitation_number": safe_str(raw.get("solicitationNumber")),
        "posted_date": safe_date(raw.get("postedDate")),
        "response_deadline": deadline,
        "description": safe_str(raw.get("description")),
        "title": safe_str(raw.get("title")),
        "link": raw.get("uiLink") or (f"https://sam.gov/opp/{raw.get('noticeId')}/view" if raw.get("noticeId") else None),
        "place_of_performance_state": pop_state,
        "place_of_performance_city": pop_city,
        "place_of_performance_zip": pop_zip,
        "award_amount": award_amount,
        "estimated_value": estimated_value,
        "award_date": award_date,
        "awardee": awardee_name,
        "incumbent_contractor_name": awardee_name,
        "incumbent_contractor_uei": awardee_uei,
        "resource_links": resource_links if resource_links else None,
        # Strategic flags
        "veteran_relevance_flag": veteran,
        "small_business_relevance_flag": small_biz,
        "sources_sought_flag": sources_sought,
        "status": status,
        "retention_protected": status == "AWARDED",
        "retention_reason": "award_notice" if status == "AWARDED" else None,
        "last_crawled_at": datetime.utcnow().isoformat(),
        # POC contacts (not stored on opp, handled separately)
        "_contacts": contacts,
    }

# Pre-load valid NAICS/PSC codes for FK validation
print("Loading valid NAICS/PSC codes...")
try:
    naics_res = sb.table("naics_codes").select("code").execute()
    psc_res = sb.table("psc_codes").select("code").execute()
    VALID_NAICS = {r["code"] for r in (naics_res.data or [])}
    VALID_PSC = {r["code"] for r in (psc_res.data or [])}
    print(f"  {len(VALID_NAICS)} NAICS, {len(VALID_PSC)} PSC codes loaded")
except:
    VALID_NAICS = set()
    VALID_PSC = set()

# ---------------------------------------------------------------------------
# Main backfill loop
# ---------------------------------------------------------------------------
def backfill_batch(offset, batch_size=500):
    """Process one batch of opportunities."""
    res = sb.table("opportunities").select(
        "notice_id, raw_json, agency, response_deadline, description"
    ).not_.is_("raw_json", "null").range(offset, offset + batch_size - 1).execute()

    if not res.data:
        return 0, 0

    updates = []
    contacts_to_insert = []

    for row in res.data:
        raw = row.get("raw_json")
        if not raw:
            continue

        extracted = extract_from_raw(raw)
        contacts = extracted.pop("_contacts", [])

        # Validate FK codes
        if extracted.get("naics_code") and extracted["naics_code"] not in VALID_NAICS:
            extracted["naics_code"] = None
        if extracted.get("psc_code") and extracted["psc_code"] not in VALID_PSC:
            extracted["psc_code"] = None

        # Only update non-null extracted values (don't overwrite existing good data)
        update = {}
        for key, val in extracted.items():
            if val is not None and val != "" and val != []:
                update[key] = val

        if update:
            update["notice_id"] = row["notice_id"]
            updates.append(update)

        # Collect contacts
        for c in contacts:
            if c.get("fullname") or c.get("email"):
                contacts_to_insert.append({
                    "notice_id": row["notice_id"],
                    "fullname": c.get("fullname"),
                    "title": c.get("title"),
                    "email": c.get("email"),
                    "phone": c.get("phone"),
                    "is_primary": c.get("is_primary", False),
                })

    # Batch upsert opportunities
    upserted = 0
    if updates:
        try:
            sb.table("opportunities").upsert(updates, on_conflict="notice_id").execute()
            upserted = len(updates)
        except Exception as e:
            err = str(e)
            if "PGRST204" in err or "schema cache" in err or "column" in err.lower():
                # Strip new columns and retry
                NEW_COLS = {"sub_agency", "office", "estimated_value", "status",
                            "veteran_relevance_flag", "small_business_relevance_flag",
                            "sources_sought_flag", "last_crawled_at", "retention_protected",
                            "retention_reason", "follow_on_flag", "opportunity_score",
                            "related_notice_id", "status_changed_at"}
                for u in updates:
                    for col in list(u.keys()):
                        if col in NEW_COLS:
                            del u[col]
                try:
                    sb.table("opportunities").upsert(updates, on_conflict="notice_id").execute()
                    upserted = len(updates)
                    print(f"    (used fallback — new columns not available yet)")
                except Exception as e2:
                    print(f"    ❌ Upsert failed: {str(e2)[:100]}")
            elif "foreign key" in err.lower() or "23503" in err:
                # Null all FK codes and retry
                for u in updates:
                    if u.get("naics_code") and u["naics_code"] not in VALID_NAICS:
                        u["naics_code"] = None
                    if u.get("psc_code") and u["psc_code"] not in VALID_PSC:
                        u["psc_code"] = None
                try:
                    sb.table("opportunities").upsert(updates, on_conflict="notice_id").execute()
                    upserted = len(updates)
                except Exception as e2:
                    print(f"    ❌ FK retry failed: {str(e2)[:100]}")
            else:
                print(f"    ❌ Error: {str(e)[:120]}")

    # Insert contacts (ignore duplicates)
    contacts_inserted = 0
    if contacts_to_insert:
        # Deduplicate
        seen = set()
        unique_contacts = []
        for c in contacts_to_insert:
            key = (c["notice_id"], c.get("email") or "", c.get("fullname") or "")
            if key not in seen:
                seen.add(key)
                unique_contacts.append(c)

        try:
            sb.table("contacts").upsert(
                unique_contacts,
                on_conflict="notice_id,email,fullname",
            ).execute()
            contacts_inserted = len(unique_contacts)
        except:
            pass  # Contacts are best-effort

    return upserted, contacts_inserted


def main():
    print("=" * 60)
    print("COMPREHENSIVE OPPORTUNITY BACKFILL")
    print(f"Time: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}")
    print("=" * 60)

    # Count records with raw_json
    try:
        count_res = sb.table("opportunities").select("notice_id", count="exact", head=True).not_.is_("raw_json", "null").execute()
        total = count_res.count or 0
    except:
        total = 37000  # estimate

    print(f"\nRecords with raw_json to process: {total}")
    print(f"Processing in batches of 500...\n")

    offset = 0
    batch_size = 500
    total_upserted = 0
    total_contacts = 0
    batch_num = 0

    while True:
        batch_num += 1
        upserted, contacts = backfill_batch(offset, batch_size)

        if upserted == 0 and offset > 0:
            break

        total_upserted += upserted
        total_contacts += contacts
        pct = min(100, (offset + batch_size) / max(total, 1) * 100)
        print(f"  Batch {batch_num}: {upserted} opps updated, {contacts} contacts | Total: {total_upserted} ({pct:.0f}%)")

        offset += batch_size

        if upserted == 0:
            break

        # Small delay to not overload DB
        time.sleep(0.5)

    print(f"\n{'=' * 60}")
    print(f"BACKFILL COMPLETE")
    print(f"  Opportunities updated: {total_upserted}")
    print(f"  Contacts inserted: {total_contacts}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()

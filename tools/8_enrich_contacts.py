"""
Tool 8: Deep Contact Enrichment Engine
Enriches discovered contractors with decision-maker contact info via:
  1. Apollo.io People Search (CEO/Owner/President/Founder)
  2. Website scraping (emails, phones, social links, team pages)
  3. Google My Business data (via SerpAPI Maps)

Calculates contact_readiness_score (0-100) for each contractor.
"""
import os
import sys
import re
import time
import json
import requests
from datetime import datetime
from urllib.parse import urljoin, urlparse
from supabase import create_client, Client

try:
    from bs4 import BeautifulSoup
    HAS_BS4 = True
except ImportError:
    HAS_BS4 = False
    print("⚠️ BeautifulSoup not installed. Website scraping will be limited.")
    print("   Install with: pip install beautifulsoup4")

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

# Load env from project root (parent of tools/)
_script_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.dirname(_script_dir)
load_env_file(os.path.join(_project_root, ".env.local"))
load_env_file(os.path.join(_project_root, ".env"))

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
APOLLO_API_KEY = os.getenv("APOLLO_API_KEY")
SERPAPI_KEY = os.getenv("SERPAPI_KEY")

# Rate limits
APOLLO_DELAY = 1.5       # seconds between Apollo calls (~40 req/min < 50 limit)
SCRAPE_DELAY = 0.5        # seconds between website fetches
MAX_ENRICHMENTS_PER_RUN = 30  # budget protection

# ---------------------------------------------------------------------------
# REGEX PATTERNS
# ---------------------------------------------------------------------------
EMAIL_RE = re.compile(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}')
PHONE_RE = re.compile(r'(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})')
TITLE_KEYWORDS = ["ceo", "owner", "president", "founder", "principal", "director", "managing partner", "general manager"]

# Common junk emails to exclude
JUNK_EMAIL_DOMAINS = {
    "example.com", "sentry.io", "wixpress.com", "googleapis.com", "w3.org",
    "schema.org", "gravatar.com", "wordpress.com", "squarespace.com",
    "godaddy.com", "cloudflare.com", "mailchimp.com", "constantcontact.com",
    "facebook.com", "twitter.com", "instagram.com", "linkedin.com",
    "google.com", "yahoo.com", "hotmail.com", "outlook.com",
}

# ---------------------------------------------------------------------------
# APOLLO.IO ENRICHMENT (Company search + org enrich - free tier compatible)
# ---------------------------------------------------------------------------
_apollo_disabled = False  # Circuit breaker: set True after auth failure

def enrich_apollo_org(company_name, domain=None):
    """
    Enrich a company via Apollo.io:
      - If we have a domain: use organizations/enrich (direct lookup)
      - If name only: use mixed_companies/search (fuzzy match)

    Returns dict with company-level data: {website, phone, linkedin, facebook, twitter}
    The free tier blocks people/search, so we use org-level endpoints for social links & website,
    and rely on website scraping + SAM POC for actual person contacts.
    """
    global _apollo_disabled
    if not APOLLO_API_KEY or _apollo_disabled:
        return {}

    headers = {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": APOLLO_API_KEY,
    }

    try:
        org = None

        # Strategy 1: Direct enrich if we have a domain
        if domain:
            res = requests.post(
                "https://api.apollo.io/api/v1/organizations/enrich",
                headers=headers,
                json={"domain": domain},
                timeout=15,
            )
            if res.status_code == 429:
                print("      ⚠️ Apollo rate limited, waiting 60s...")
                time.sleep(60)
                return enrich_apollo_org(company_name, domain)
            if res.status_code in (401, 403):
                print(f"      ❌ Apollo auth error: {res.status_code} — disabling Apollo for this run")
                _apollo_disabled = True
                return {}
            if res.status_code == 200:
                org = res.json().get("organization", {})

        # Strategy 2: Search by name if no domain or enrich returned nothing
        if not org or not org.get("id"):
            res = requests.post(
                "https://api.apollo.io/api/v1/mixed_companies/search",
                headers=headers,
                json={
                    "q_organization_name": company_name,
                    "page": 1,
                    "per_page": 1,
                },
                timeout=15,
            )
            if res.status_code == 429:
                print("      ⚠️ Apollo rate limited, waiting 60s...")
                time.sleep(60)
                return enrich_apollo_org(company_name, domain)
            if res.status_code in (401, 403):
                print(f"      ❌ Apollo auth error: {res.status_code} — disabling Apollo for this run")
                _apollo_disabled = True
                return {}
            if res.status_code == 200:
                orgs = res.json().get("organizations", [])
                if orgs:
                    org = orgs[0]

        if not org or not org.get("id"):
            return {}

        return {
            "website": org.get("website_url"),
            "phone": org.get("phone") or (org.get("primary_phone", {}) or {}).get("number"),
            "linkedin": org.get("linkedin_url"),
            "facebook": org.get("facebook_url"),
            "twitter": org.get("twitter_url"),
            "industry": org.get("industry"),
            "estimated_num_employees": org.get("estimated_num_employees"),
            "founded_year": org.get("founded_year"),
            "short_description": org.get("short_description"),
        }

    except Exception as e:
        print(f"      ❌ Apollo error: {e}")
        return {}


# ---------------------------------------------------------------------------
# WEBSITE SCRAPING
# ---------------------------------------------------------------------------
def scrape_website_contacts(url):
    """
    Enhanced website scraper that extracts:
    - Emails (regex)
    - Phone numbers (regex)
    - Social media links (LinkedIn, Facebook, Twitter)
    - Decision-maker names from /about, /contact, /team pages

    Returns {emails: [], phones: [], social: {}, people: [{name, title}]}
    """
    if not url:
        return {"emails": [], "phones": [], "social": {}, "people": []}

    if not url.startswith("http"):
        url = "https://" + url

    result = {"emails": [], "phones": [], "social": {}, "people": []}
    pages_to_check = [url]

    # Fetch homepage first, find subpages
    try:
        headers = {"User-Agent": "Mozilla/5.0 (compatible; CapturePilot/2.0)"}
        homepage_res = requests.get(url, timeout=12, headers=headers, allow_redirects=True)

        if homepage_res.status_code != 200:
            return result

        homepage_text = homepage_res.text

        # Find contact/about/team page links
        if HAS_BS4:
            soup = BeautifulSoup(homepage_text, "html.parser")
            for link in soup.find_all("a", href=True):
                href = link.get("href", "").lower()
                link_text = link.get_text(strip=True).lower()

                # Check for relevant subpages
                if any(kw in href or kw in link_text for kw in ["about", "contact", "team", "leadership", "staff", "management"]):
                    full_url = urljoin(url, link.get("href"))
                    parsed = urlparse(full_url)
                    base_parsed = urlparse(url)
                    # Only follow links on the same domain
                    if parsed.netloc == base_parsed.netloc and full_url not in pages_to_check:
                        pages_to_check.append(full_url)

            # Extract social links from homepage
            for link in soup.find_all("a", href=True):
                href = link.get("href", "")
                if "linkedin.com/company" in href or "linkedin.com/in/" in href:
                    result["social"]["linkedin"] = href
                elif "facebook.com" in href and "facebook.com/tr" not in href:
                    result["social"]["facebook"] = href
                elif "twitter.com" in href or "x.com" in href:
                    result["social"]["twitter"] = href

        # Limit to 4 pages max
        pages_to_check = pages_to_check[:4]

    except Exception as e:
        print(f"      ⚠️ Homepage fetch error: {e}")
        return result

    # Scrape all relevant pages
    all_text = ""
    for page_url in pages_to_check:
        try:
            if page_url != url:
                time.sleep(SCRAPE_DELAY)
            res = requests.get(page_url, timeout=12, headers=headers, allow_redirects=True)
            if res.status_code == 200:
                all_text += " " + res.text
        except Exception:
            continue

    # Extract emails
    raw_emails = EMAIL_RE.findall(all_text)
    clean_emails = []
    for email in raw_emails:
        domain = email.split("@")[1].lower()
        if domain not in JUNK_EMAIL_DOMAINS and not email.endswith(".png") and not email.endswith(".jpg"):
            if email.lower() not in clean_emails:
                clean_emails.append(email.lower())
    result["emails"] = clean_emails[:10]

    # Extract phone numbers
    raw_phones = PHONE_RE.findall(all_text)
    # Deduplicate by digits only
    seen_digits = set()
    clean_phones = []
    for phone in raw_phones:
        digits = re.sub(r'\D', '', phone)
        if len(digits) >= 10 and digits not in seen_digits:
            seen_digits.add(digits)
            clean_phones.append(phone.strip())
    result["phones"] = clean_phones[:5]

    # Extract people from team/about pages using BS4
    if HAS_BS4:
        soup = BeautifulSoup(all_text, "html.parser")
        text_content = soup.get_text(separator="\n")

        # Look for patterns like "John Smith, CEO" or "CEO: John Smith"
        for title_kw in TITLE_KEYWORDS:
            # Pattern: "Name, Title" or "Name - Title"
            pattern = re.compile(
                rf'([A-Za-z][A-Za-z]+ [A-Za-z][A-Za-z]+(?:\s[A-Za-z][A-Za-z]+)?)\s*[,\-–|]\s*(?:[^,\n]*{title_kw}[^,\n]*)',
                re.IGNORECASE
            )
            for match in pattern.finditer(text_content):
                name = match.group(1).strip()
                if len(name) > 4 and len(name) < 50:
                    result["people"].append({
                        "name": name,
                        "title": title_kw.title(),
                    })

            # Pattern: "Title: Name" or "Title - Name"
            pattern2 = re.compile(
                rf'(?:{title_kw})\s*[:\-–|]\s*([A-Za-z][A-Za-z]+ [A-Za-z][A-Za-z]+(?:\s[A-Za-z][A-Za-z]+)?)',
                re.IGNORECASE
            )
            for match in pattern2.finditer(text_content):
                name = match.group(1).strip()
                if len(name) > 4 and len(name) < 50:
                    result["people"].append({
                        "name": name,
                        "title": title_kw.title(),
                    })

        # Deduplicate people
        seen_names = set()
        unique_people = []
        for p in result["people"]:
            if p["name"].lower() not in seen_names:
                seen_names.add(p["name"].lower())
                unique_people.append(p)
        result["people"] = unique_people[:5]

    return result


# ---------------------------------------------------------------------------
# GOOGLE MY BUSINESS (via SerpAPI)
# ---------------------------------------------------------------------------
def enrich_google_business(company_name, city, state):
    """
    Fetch Google My Business data via SerpAPI Maps endpoint.
    Returns {rating, reviews_count, phone, address, place_id, website}
    """
    if not SERPAPI_KEY:
        return {}

    try:
        query = f"{company_name} {city} {state}".strip()
        params = {
            "engine": "google_maps",
            "q": query,
            "api_key": SERPAPI_KEY,
            "type": "search",
        }
        res = requests.get("https://serpapi.com/search", params=params, timeout=15)

        if res.status_code != 200:
            return {}

        data = res.json()
        results = data.get("local_results", [])

        if not results:
            return {}

        top = results[0]
        return {
            "google_rating": top.get("rating"),
            "google_reviews_count": top.get("reviews"),
            "google_place_id": top.get("place_id"),
            "phone": top.get("phone"),
            "website": top.get("website"),
            "address": top.get("address"),
        }

    except Exception as e:
        print(f"      ❌ Google Business error: {e}")
        return {}


# ---------------------------------------------------------------------------
# CONTACT READINESS SCORE
# ---------------------------------------------------------------------------
def calculate_contact_readiness(contractor, contacts):
    """
    Deterministic score (0-100) measuring how contactable a contractor is.
    Higher = more ready for outreach.
    """
    score = 0

    # Contractor-level data
    if contractor.get("business_url") or contractor.get("website"):
        score += 10
    if contractor.get("primary_poc_phone"):
        score += 15
    if contractor.get("primary_poc_email"):
        score += 15

    # Contact-level data (from enrichment)
    has_email = False
    has_decision_maker = False
    has_linkedin = False
    has_phone = False

    for c in contacts:
        if c.get("email"):
            has_email = True
        title = (c.get("title") or "").lower()
        if any(kw in title for kw in ["ceo", "owner", "president", "founder", "principal"]):
            has_decision_maker = True
        if c.get("linkedin_url"):
            has_linkedin = True
        if c.get("phone"):
            has_phone = True

    if has_email:
        score += 20
    if has_decision_maker:
        score += 20
    if has_linkedin:
        score += 10
    if has_phone:
        score += 10

    return min(score, 100)


# ---------------------------------------------------------------------------
# MAIN ENRICHMENT PIPELINE
# ---------------------------------------------------------------------------
def enrich_contractor_deep(supabase, contractor, job_id):
    """
    Full enrichment for a single contractor.
    Runs: Apollo -> Website Scrape -> Google Business
    Returns list of contacts found.
    """
    cid = contractor["id"]
    name = contractor.get("company_name", "Unknown")
    website = contractor.get("business_url") or contractor.get("website")
    city = contractor.get("city", "")
    state = contractor.get("state", "")

    print(f"    🔎 Enriching: {name}")
    all_contacts = []

    # --- 1. Apollo.io Organization Enrichment ---
    if APOLLO_API_KEY and not contractor.get("apollo_enriched"):
        domain = urlparse(website).netloc if website and website.startswith("http") else None
        apollo_org = enrich_apollo_org(name, domain)
        if apollo_org:
            # Update contractor with Apollo org data (website, social links, phone)
            apollo_update = {"apollo_enriched": True, "enrichment_source": "apollo"}
            if apollo_org.get("website") and not website:
                apollo_update["business_url"] = apollo_org["website"]
                website = apollo_org["website"]  # Use for website scraping below
            if apollo_org.get("linkedin"):
                apollo_update["social_linkedin"] = apollo_org["linkedin"]
            if apollo_org.get("facebook"):
                apollo_update["social_facebook"] = apollo_org["facebook"]
            if apollo_org.get("twitter"):
                apollo_update["social_twitter"] = apollo_org["twitter"]
            supabase.table("contractors").update(apollo_update).eq("id", cid).execute()

            # If Apollo found a phone, add as contact
            if apollo_org.get("phone"):
                all_contacts.append({
                    "full_name": None,
                    "phone": apollo_org["phone"],
                    "source": "apollo",
                    "confidence": "medium",
                })

            details = []
            if apollo_org.get("linkedin"):
                details.append("LinkedIn")
            if apollo_org.get("phone"):
                details.append("phone")
            if apollo_org.get("website"):
                details.append("website")
            print(f"       Apollo Org: {', '.join(details) if details else 'basic info'}")
        else:
            supabase.table("contractors").update({"apollo_enriched": True}).eq("id", cid).execute()
        time.sleep(APOLLO_DELAY)

    # --- 2. Website Scraping ---
    if website:
        scrape_data = scrape_website_contacts(website)

        # Add scraped people as contacts
        for person in scrape_data.get("people", []):
            contact = {
                "full_name": person["name"],
                "title": person.get("title"),
                "source": "website_scrape",
                "confidence": "medium",
            }
            # Try to match an email to this person
            name_parts = person["name"].lower().split()
            for email in scrape_data.get("emails", []):
                if any(part in email.lower() for part in name_parts if len(part) > 2):
                    contact["email"] = email
                    break
            all_contacts.append(contact)

        # Add generic contacts from scraped emails/phones
        if scrape_data["emails"] and not any(c.get("email") for c in all_contacts):
            all_contacts.append({
                "full_name": None,
                "email": scrape_data["emails"][0],
                "phone": scrape_data["phones"][0] if scrape_data["phones"] else None,
                "source": "website_scrape",
                "confidence": "low",
            })

        # Update contractor with social links
        social = scrape_data.get("social", {})
        update_data = {"last_enriched_at": datetime.utcnow().isoformat()}
        if social.get("linkedin"):
            update_data["social_linkedin"] = social["linkedin"]
        if social.get("facebook"):
            update_data["social_facebook"] = social["facebook"]
        if social.get("twitter"):
            update_data["social_twitter"] = social["twitter"]

        if update_data:
            supabase.table("contractors").update(update_data).eq("id", cid).execute()

        if scrape_data["emails"] or scrape_data["people"]:
            print(f"       Website: {len(scrape_data['emails'])} emails, {len(scrape_data['people'])} people, {len(scrape_data['phones'])} phones")

    # --- 3. Google My Business ---
    if SERPAPI_KEY and not contractor.get("google_place_id"):
        gmb_data = enrich_google_business(name, city, state)
        if gmb_data:
            # Update contractor
            gmb_update = {}
            if gmb_data.get("google_rating"):
                gmb_update["google_rating"] = gmb_data["google_rating"]
            if gmb_data.get("google_reviews_count"):
                gmb_update["google_reviews_count"] = gmb_data["google_reviews_count"]
            if gmb_data.get("google_place_id"):
                gmb_update["google_place_id"] = gmb_data["google_place_id"]
            if gmb_data.get("website") and not website:
                gmb_update["business_url"] = gmb_data["website"]
            if gmb_update:
                supabase.table("contractors").update(gmb_update).eq("id", cid).execute()

            # Add phone as contact if found
            if gmb_data.get("phone"):
                all_contacts.append({
                    "full_name": None,
                    "phone": gmb_data["phone"],
                    "source": "google_business",
                    "confidence": "medium",
                })
            print(f"       GMB: rating={gmb_data.get('google_rating')}, reviews={gmb_data.get('google_reviews_count')}")

    # --- Save contacts to DB ---
    for contact in all_contacts:
        contact["contractor_id"] = cid
        try:
            supabase.table("contractor_contacts").insert(contact).execute()
        except Exception as e:
            print(f"       ❌ Contact insert error: {e}")

    return all_contacts


def run_enrichment_pipeline(opportunity_id=None):
    """
    Main entry point.
    Enriches discovered contractors (enrichment_status = 'discovered') with deep contact data.
    """
    if not all([SUPABASE_URL, SUPABASE_SERVICE_KEY]):
        print("❌ Missing Supabase API keys in .env. Halting execution.")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    print("🧬 Starting Deep Contact Enrichment Engine...")

    # Build query for opportunity_contractors needing enrichment (no join - FK may not exist)
    query = supabase.table("opportunity_contractors").select(
        "id, opportunity_id, contractor_id, enrichment_job_id"
    ).eq("enrichment_status", "discovered")

    if opportunity_id:
        query = query.eq("opportunity_id", opportunity_id)

    query = query.limit(MAX_ENRICHMENTS_PER_RUN)
    res = query.execute()

    links = res.data
    if not links:
        print("  ✅ No contractors pending enrichment.")
        return

    print(f"  -> Enriching {len(links)} contractors")

    enriched_count = 0
    for link in links:
        oc_id = link["id"]
        contractor_id = link.get("contractor_id")
        job_id = link.get("enrichment_job_id")

        # Fetch contractor data separately
        con_res = supabase.table("contractors").select(
            "id, company_name, business_url, website, city, state, "
            "primary_poc_name, primary_poc_title, primary_poc_phone, primary_poc_email, "
            "apollo_enriched, google_place_id"
        ).eq("id", contractor_id).single().execute()

        contractor = con_res.data
        if not contractor:
            continue

        # Mark as enriching
        supabase.table("opportunity_contractors").update({
            "enrichment_status": "enriching",
        }).eq("id", oc_id).execute()

        # Run enrichment
        contacts = enrich_contractor_deep(supabase, contractor, job_id)

        # Auto-import SAM POC as contact (always, not just when empty)
        if contractor.get("primary_poc_name"):
            poc_contact = {
                "contractor_id": contractor["id"],
                "full_name": contractor["primary_poc_name"],
                "title": contractor.get("primary_poc_title"),
                "email": contractor.get("primary_poc_email"),
                "phone": contractor.get("primary_poc_phone"),
                "source": "sam_poc",
                "confidence": "high",
            }
            # Check if this POC already exists
            existing = [c for c in contacts if c.get("full_name") == poc_contact["full_name"]]
            if not existing:
                try:
                    supabase.table("contractor_contacts").upsert(
                        poc_contact, on_conflict="contractor_id,source,full_name"
                    ).execute()
                    contacts.append(poc_contact)
                except Exception:
                    pass

        # Calculate readiness score
        readiness = calculate_contact_readiness(contractor, contacts)

        # Update link status
        supabase.table("opportunity_contractors").update({
            "enrichment_status": "enriched",
            "contact_readiness_score": readiness,
        }).eq("id", oc_id).execute()

        # Update enrichment job counts
        if job_id:
            try:
                job_res = supabase.table("enrichment_jobs").select("contractors_enriched").eq("id", job_id).single().execute()
                current = (job_res.data or {}).get("contractors_enriched", 0) or 0
                supabase.table("enrichment_jobs").update({
                    "contractors_enriched": current + 1,
                }).eq("id", job_id).execute()
            except Exception:
                pass

        enriched_count += 1
        print(f"       ✅ Readiness score: {readiness}/100")

    print(f"\n🎉 Enrichment Complete! Enriched {enriched_count}/{len(links)} contractors.")


# ---------------------------------------------------------------------------
# ALSO: MIGRATE EXISTING SAM POC DATA TO CONTACTS TABLE
# ---------------------------------------------------------------------------
def migrate_sam_poc_contacts(supabase):
    """
    One-time migration: copy existing primary_poc data from contractors
    into the contractor_contacts table as 'sam_poc' source contacts.
    """
    res = supabase.table("contractors").select(
        "id, primary_poc_name, primary_poc_email, primary_poc_phone"
    ).not_.is_("primary_poc_name", "null").limit(500).execute()

    if not res.data:
        print("  No SAM POC data to migrate.")
        return

    count = 0
    for c in res.data:
        if not c.get("primary_poc_name"):
            continue

        # Check if already migrated
        existing = supabase.table("contractor_contacts").select("id").eq(
            "contractor_id", c["id"]
        ).eq("source", "sam_poc").limit(1).execute()

        if existing.data:
            continue

        try:
            supabase.table("contractor_contacts").insert({
                "contractor_id": c["id"],
                "full_name": c["primary_poc_name"],
                "email": c.get("primary_poc_email"),
                "phone": c.get("primary_poc_phone"),
                "source": "sam_poc",
                "confidence": "high",
            }).execute()
            count += 1
        except Exception:
            pass

    print(f"  Migrated {count} SAM POC contacts.")


if __name__ == "__main__":
    opp_id = None
    migrate = False

    for i, arg in enumerate(sys.argv[1:], 1):
        if arg == "--opportunity_id" and i < len(sys.argv) - 1:
            opp_id = sys.argv[i + 1]
        elif arg == "--migrate-poc":
            migrate = True

    if migrate:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        migrate_sam_poc_contacts(supabase)
    else:
        run_enrichment_pipeline(opportunity_id=opp_id)

"""
Tool 17: Company Website Analyzer for Lead Magnet
Crawls a company website and extracts structured business data.
Invoked via subprocess from /api/analyze-company

Usage:
  python3 tools/17_analyze_company.py --company_name "Acme Services" --website "https://acme.com"

Output: JSON to stdout with crawl results
"""
import sys
import re
import json
import time
import argparse
import signal
from urllib.parse import urljoin, urlparse
from ipaddress import ip_address, ip_network

try:
    import requests
except ImportError:
    print(json.dumps({"success": False, "error": "requests not installed"}))
    sys.exit(1)

try:
    from bs4 import BeautifulSoup
    HAS_BS4 = True
except ImportError:
    HAS_BS4 = False

# ---------------------------------------------------------------------------
# CONSTANTS
# ---------------------------------------------------------------------------
MAX_PAGES = 15
FETCH_DELAY = 0.25  # seconds between page fetches
MAX_RESPONSE_SIZE = 2 * 1024 * 1024  # 2MB per page
REQUEST_TIMEOUT = 10  # seconds per request
HARD_TIMEOUT = 75  # seconds total (raised for deeper crawl)

USER_AGENT = "CapturePilot-Analyzer/2.0 (https://capturepilot.com; B2G company analysis)"

# Pages to prioritize (URL path or anchor text patterns)
PRIORITY_PAGES = [
    (r"about", 10),
    (r"service", 9),
    (r"capabilit", 9),
    (r"what.we.do", 9),
    (r"solution", 8),
    (r"contact", 7),
    (r"team", 7),
    (r"leadership", 7),
    (r"staff", 6),
    (r"our.people", 7),
    (r"management", 6),
    (r"executive", 7),
    (r"career", 5),
    (r"job", 5),
    (r"client", 4),
    (r"project", 4),
    (r"portfolio", 4),
    (r"case.stud", 4),
    (r"product", 4),
    (r"contract", 8),
    (r"government", 8),
    (r"federal", 8),
    (r"past.perform", 7),
    (r"certif", 7),
    (r"award", 6),
    (r"partner", 5),
    (r"industr", 5),
    # Legal / Imprint pages (for registered agent, legal name, address, UEI)
    (r"legal", 6),
    (r"imprint", 6),
    (r"impressum", 6),
    (r"privacy", 3),
    (r"terms", 3),
    (r"compliance", 5),
    (r"registration", 5),
    (r"sam[.\-_]gov", 6),
    (r"entity", 5),
    (r"duns", 5),
    (r"uei", 6),
    (r"capability.statement", 9),
]

# Private IP ranges to block (SSRF prevention)
PRIVATE_NETWORKS = [
    ip_network("127.0.0.0/8"),
    ip_network("10.0.0.0/8"),
    ip_network("172.16.0.0/12"),
    ip_network("192.168.0.0/16"),
    ip_network("169.254.0.0/16"),
    ip_network("::1/128"),
]

# Regex patterns
EMAIL_RE = re.compile(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}')
PHONE_RE = re.compile(r'(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})')
YEAR_RE = re.compile(r'(?:established|founded|since|est\.?)\s*(?:in\s+)?(\d{4})', re.IGNORECASE)
EMPLOYEE_RE = re.compile(r'(\d+)\s*(?:\+\s*)?(?:employees?|team members?|staff|professionals?|people)', re.IGNORECASE)
REVENUE_RE = re.compile(r'\$\s*(\d+(?:\.\d+)?)\s*(million|billion|M|B|K)\s*(?:in\s+)?(?:revenue|annual|sales)?', re.IGNORECASE)
REVENUE_RE2 = re.compile(r'(\d+(?:\.\d+)?)\s*(million|billion)\s*(?:in\s+)?(?:revenue|dollar|sales|annual)', re.IGNORECASE)

# UEI detection: 12-character alphanumeric, near context words
UEI_RE = re.compile(r'\b([A-Z0-9]{12})\b')
UEI_CONTEXT_RE = re.compile(r'(?:UEI|unique\s+entity\s+id(?:entifier)?|SAM\.gov|sam\s+registration|entity\s+id|ueiSAM)', re.IGNORECASE)

# DUNS detection (legacy, 9 digits)
DUNS_RE = re.compile(r'\b(\d{9})\b')

# Federal agencies to detect as past clients
FEDERAL_AGENCIES = [
    "GSA", "DoD", "Department of Defense", "Army", "Navy", "Air Force", "USAF",
    "Marine Corps", "DHS", "Department of Homeland Security", "VA", "Veterans Affairs",
    "HHS", "Health and Human Services", "DOE", "Department of Energy",
    "DOT", "Department of Transportation", "EPA", "USDA", "Department of Agriculture",
    "DOJ", "Department of Justice", "NASA", "FEMA", "FBI", "ICE", "CBP",
    "USACE", "Corps of Engineers", "NIH", "CDC", "FAA", "Coast Guard",
    "Social Security", "IRS", "Treasury", "State Department", "HUD",
    "Interior", "Commerce", "Labor", "Education", "SBA",
]
ADDRESS_RE = re.compile(
    r'(\d{1,5}\s+[\w\s.]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct|circle|place|pl)\.?\s*,?\s*[\w\s]+,?\s*[A-Z]{2}\s*\d{5})',
    re.IGNORECASE
)

# US state codes
US_STATES = {
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DC", "DE", "FL", "GA", "HI", "ID",
    "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO",
    "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA",
    "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
}
STATE_RE = re.compile(r'\b(' + '|'.join(US_STATES) + r')\b')

# Title keywords for leadership extraction
TITLE_KEYWORDS = [
    "ceo", "chief executive", "owner", "president", "founder", "co-founder",
    "principal", "director", "managing partner", "general manager", "vp",
    "vice president", "cto", "cfo", "coo", "cio",
]

# Certification / GovCon signal keywords
CERT_KEYWORDS = {
    "8(a)": [r"8\s*\(\s*a\s*\)", r"sba\s+8a"],
    "HUBZone": [r"hubzone"],
    "SDVOSB": [r"sdvosb", r"service.disabled.veteran"],
    "WOSB": [r"wosb", r"women.owned"],
    "EDWOSB": [r"edwosb", r"economically.disadvantaged.women"],
    "VOSB": [r"vosb", r"veteran.owned"],
    "SDB": [r"small.disadvantaged.business"],
    "bonding": [r"bonded", r"bonding", r"surety"],
    "insurance": [r"insured", r"insurance", r"liability.insurance"],
    "GSA Schedule": [r"gsa\s+schedule", r"gsa\s+contract", r"gsa\s+mas"],
    "ISO 9001": [r"iso\s*9001"],
    "ISO 14001": [r"iso\s*14001"],
    "security_clearance": [r"security\s+clearance", r"secret\s+clearance", r"top\s+secret"],
}

# Junk email domains
JUNK_EMAIL_DOMAINS = {
    "example.com", "sentry.io", "wixpress.com", "googleapis.com", "w3.org",
    "schema.org", "gravatar.com", "wordpress.com", "squarespace.com",
    "godaddy.com", "cloudflare.com", "mailchimp.com", "constantcontact.com",
    "facebook.com", "twitter.com", "instagram.com", "linkedin.com",
    "google.com", "yahoo.com", "hotmail.com", "outlook.com",
}


# ---------------------------------------------------------------------------
# SAFETY CHECKS
# ---------------------------------------------------------------------------
def is_private_ip(hostname):
    """Check if a hostname resolves to a private IP (SSRF prevention)."""
    import socket
    try:
        ip = socket.gethostbyname(hostname)
        addr = ip_address(ip)
        return any(addr in net for net in PRIVATE_NETWORKS)
    except Exception:
        return False


def normalize_url(url):
    """Ensure URL has a scheme."""
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    return url.rstrip("/")


# ---------------------------------------------------------------------------
# FETCH & PARSE
# ---------------------------------------------------------------------------
def fetch_page(url, session):
    """Fetch a single page. Returns (soup, text) or (None, None)."""
    try:
        resp = session.get(
            url,
            timeout=REQUEST_TIMEOUT,
            allow_redirects=True,
            headers={"User-Agent": USER_AGENT},
            stream=True,
        )
        # Check content type
        ct = resp.headers.get("Content-Type", "")
        if "text/html" not in ct and "text/plain" not in ct and "text/xml" not in ct:
            return None, None

        # Check content length
        content_length = resp.headers.get("Content-Length")
        if content_length and int(content_length) > MAX_RESPONSE_SIZE:
            return None, None

        # Read with size limit
        content = resp.content[:MAX_RESPONSE_SIZE]
        html = content.decode("utf-8", errors="replace")

        if HAS_BS4:
            soup = BeautifulSoup(html, "html.parser")
            # Remove script, style, nav elements (keep footer - may have legal info)
            for tag in soup.find_all(["script", "style", "noscript", "iframe"]):
                tag.decompose()
            text = soup.get_text(separator=" ", strip=True)
        else:
            soup = None
            text = re.sub(r'<[^>]+>', ' ', html)
            text = re.sub(r'\s+', ' ', text).strip()

        return soup, text

    except Exception:
        return None, None


def fetch_sitemap(base_url, session):
    """Try to discover pages from sitemap.xml or robots.txt sitemap reference."""
    urls = []
    parsed_base = urlparse(base_url)
    base_domain = parsed_base.netloc.lower()

    # Try sitemap.xml directly
    sitemap_urls_to_try = [
        f"{parsed_base.scheme}://{parsed_base.netloc}/sitemap.xml",
        f"{parsed_base.scheme}://{parsed_base.netloc}/sitemap_index.xml",
    ]

    # Check robots.txt for sitemap references
    try:
        robots_url = f"{parsed_base.scheme}://{parsed_base.netloc}/robots.txt"
        resp = session.get(robots_url, timeout=5, headers={"User-Agent": USER_AGENT})
        if resp.status_code == 200:
            for line in resp.text.splitlines():
                if line.lower().startswith("sitemap:"):
                    sitemap_url = line.split(":", 1)[1].strip()
                    if sitemap_url not in sitemap_urls_to_try:
                        sitemap_urls_to_try.insert(0, sitemap_url)
    except Exception:
        pass

    for sitemap_url in sitemap_urls_to_try[:2]:  # Only try first 2
        try:
            resp = session.get(sitemap_url, timeout=5, headers={"User-Agent": USER_AGENT})
            if resp.status_code != 200:
                continue

            content = resp.content[:MAX_RESPONSE_SIZE].decode("utf-8", errors="replace")

            # Extract URLs from sitemap XML
            loc_matches = re.findall(r'<loc>\s*(.*?)\s*</loc>', content, re.IGNORECASE)
            for loc in loc_matches:
                parsed_loc = urlparse(loc.strip())
                if parsed_loc.netloc.lower() == base_domain:
                    clean = loc.strip().split("#")[0].split("?")[0].rstrip("/")
                    urls.append(clean)

            if urls:
                break  # Got URLs from first successful sitemap
        except Exception:
            continue

    return list(set(urls))[:50]  # Dedupe, cap at 50


def discover_pages(base_url, soup, existing_urls=None):
    """Find internal links worth crawling, scored by priority."""
    if not soup:
        return []

    parsed_base = urlparse(base_url)
    base_domain = parsed_base.netloc.lower()
    seen = set(existing_urls or [])
    seen.add(base_url.rstrip("/"))
    candidates = []

    for a_tag in soup.find_all("a", href=True):
        href = a_tag["href"].strip()
        # Build absolute URL
        abs_url = urljoin(base_url, href).split("#")[0].split("?")[0].rstrip("/")

        # Skip if already seen, external, or non-http
        parsed = urlparse(abs_url)
        if parsed.netloc.lower() != base_domain:
            continue
        if abs_url in seen:
            continue
        if parsed.scheme not in ("http", "https"):
            continue
        # Skip file downloads
        ext = parsed.path.rsplit(".", 1)[-1].lower() if "." in parsed.path else ""
        if ext in ("pdf", "doc", "docx", "xls", "xlsx", "zip", "png", "jpg", "gif", "svg", "css", "js", "xml"):
            continue

        seen.add(abs_url)

        # Score based on URL path and anchor text
        combined = (parsed.path + " " + (a_tag.get_text(strip=True) or "")).lower()
        score = 0
        for pattern, weight in PRIORITY_PAGES:
            if re.search(pattern, combined):
                score = max(score, weight)

        # Give a minimum score of 1 for any internal page (allows deeper crawling)
        if score == 0:
            score = 1

        candidates.append((score, abs_url))

    # Sort by score descending
    candidates.sort(key=lambda x: -x[0])
    return [(s, u) for s, u in candidates]


# ---------------------------------------------------------------------------
# DATA EXTRACTION
# ---------------------------------------------------------------------------
def extract_description(soups, texts):
    """Extract company description from meta tags and about page content."""
    description = ""

    # Try meta description first
    for soup in soups:
        if not soup:
            continue
        meta_desc = soup.find("meta", attrs={"name": "description"})
        if meta_desc and meta_desc.get("content"):
            description = meta_desc["content"].strip()
            break
        og_desc = soup.find("meta", attrs={"property": "og:description"})
        if og_desc and og_desc.get("content"):
            description = og_desc["content"].strip()
            break

    # If short, supplement from about page content
    if len(description) < 100 and len(texts) > 1:
        # Use the second page (likely about page) content
        about_text = texts[1] if len(texts) > 1 else texts[0]
        # Extract first substantial paragraph (50+ chars)
        sentences = re.split(r'(?<=[.!?])\s+', about_text)
        paras = []
        for s in sentences:
            s = s.strip()
            if len(s) > 50:
                paras.append(s)
                if len(" ".join(paras)) > 300:
                    break
        if paras:
            supplement = " ".join(paras)[:500]
            if description:
                description = description + " " + supplement
            else:
                description = supplement

    return description[:1000] if description else ""


def extract_services(soups, texts):
    """Extract service offerings from service/capability pages."""
    services = set()

    for soup in soups:
        if not soup:
            continue
        # Look for list items on pages with service-like URLs
        for ul in soup.find_all(["ul", "ol"]):
            for li in ul.find_all("li"):
                text = li.get_text(strip=True)
                if 10 < len(text) < 100:
                    # Filter out navigation/menu items
                    if not any(skip in text.lower() for skip in ["home", "login", "sign", "privacy", "cookie", "©"]):
                        services.add(text)

        # Look for headings that describe services
        for heading in soup.find_all(["h2", "h3", "h4"]):
            text = heading.get_text(strip=True)
            if 5 < len(text) < 80:
                service_keywords = ["service", "solution", "capabilit", "offer", "what we do", "specializ"]
                parent_text = heading.parent.get_text(strip=True) if heading.parent else ""
                if any(kw in text.lower() or kw in parent_text.lower()[:100] for kw in service_keywords):
                    services.add(text)

    return list(services)[:20]


def extract_contacts(texts, soups):
    """Extract emails, phones, and social links."""
    all_text = " ".join(texts)
    contacts = []

    # Emails
    emails = set()
    for match in EMAIL_RE.findall(all_text):
        domain = match.split("@")[1].lower()
        if domain not in JUNK_EMAIL_DOMAINS:
            emails.add(match.lower())

    # Phones
    phones = set()
    for match in PHONE_RE.findall(all_text):
        clean = re.sub(r'[^\d+]', '', match)
        if len(clean) >= 10:
            phones.add(match.strip())

    for email in list(emails)[:5]:
        contacts.append({"email": email})

    for phone in list(phones)[:3]:
        contacts.append({"phone": phone})

    # Social links
    social_links = {"linkedin": None, "facebook": None, "twitter": None}
    for soup in soups:
        if not soup:
            continue
        for a_tag in soup.find_all("a", href=True):
            href = a_tag["href"].lower()
            if "linkedin.com/company" in href and not social_links["linkedin"]:
                social_links["linkedin"] = a_tag["href"]
            elif "facebook.com/" in href and not social_links["facebook"]:
                social_links["facebook"] = a_tag["href"]
            elif ("twitter.com/" in href or "x.com/" in href) and not social_links["twitter"]:
                social_links["twitter"] = a_tag["href"]

    return contacts, social_links


def extract_locations(texts):
    """Extract addresses and state information."""
    all_text = " ".join(texts)
    locations = []

    # Try full address regex
    for match in ADDRESS_RE.findall(all_text):
        locations.append({"address": match.strip()})

    # Extract states
    states = set()
    for match in STATE_RE.findall(all_text):
        # Validate it's not a common abbreviation
        if match in US_STATES:
            states.add(match)

    # If no full addresses, at least return states
    if not locations and states:
        for state in list(states)[:3]:
            locations.append({"state": state})

    # Add detected states to existing locations
    if locations and states:
        locations[0]["state"] = list(states)[0]

    return locations[:5], list(states)


def detect_certifications(texts):
    """Detect certification signals from page content."""
    all_text = " ".join(texts).lower()
    found = []

    for cert_name, patterns in CERT_KEYWORDS.items():
        for pattern in patterns:
            if re.search(pattern, all_text, re.IGNORECASE):
                # Calculate confidence based on frequency
                count = len(re.findall(pattern, all_text, re.IGNORECASE))
                confidence = min(0.5 + count * 0.15, 0.95)
                found.append({"type": cert_name, "confidence": round(confidence, 2)})
                break

    return found


def estimate_employees(texts):
    """Estimate employee count from text signals."""
    all_text = " ".join(texts)

    for match in EMPLOYEE_RE.finditer(all_text):
        count = int(match.group(1))
        if 1 <= count <= 50000:
            return {"estimate": count, "source": "page_text"}

    return None


def extract_founding_year(texts):
    """Extract founding/established year."""
    all_text = " ".join(texts)
    for match in YEAR_RE.finditer(all_text):
        year = int(match.group(1))
        if 1900 <= year <= 2026:
            return year
    return None


def extract_leadership(texts, soups):
    """Extract leadership names, titles, and associated contact info."""
    leaders = []
    all_emails = set()
    all_phones = set()

    # Collect all emails and phones from text
    all_text = " ".join(texts)
    for match in EMAIL_RE.findall(all_text):
        domain = match.split("@")[1].lower()
        if domain not in JUNK_EMAIL_DOMAINS:
            all_emails.add(match.lower())

    for match in PHONE_RE.findall(all_text):
        clean = re.sub(r'[^\d+]', '', match)
        if len(clean) >= 10:
            all_phones.add(match.strip())

    for soup in soups:
        if not soup:
            continue

        # Method 1: Look for structured name+title patterns in divs, sections, cards
        for tag in soup.find_all(["div", "section", "article", "li", "td", "span", "p"]):
            tag_text = tag.get_text(strip=True)
            tag_lower = tag_text.lower()

            for keyword in TITLE_KEYWORDS:
                if keyword in tag_lower and len(tag_text) < 200:
                    # Try to split name from title with various separators
                    parts = re.split(r'[-–—|,\n\r]', tag_text, maxsplit=1)
                    if len(parts) == 2:
                        name = parts[0].strip()
                        title = parts[1].strip()
                        if 3 < len(name) < 50 and 3 < len(title) < 60:
                            leader = {"name": name, "title": title}
                            # Check parent/sibling elements for associated contact info
                            parent = tag.parent
                            if parent:
                                parent_text = parent.get_text(strip=True)
                                # Find email near this person
                                nearby_emails = EMAIL_RE.findall(parent_text)
                                for em in nearby_emails:
                                    if em.split("@")[1].lower() not in JUNK_EMAIL_DOMAINS:
                                        leader["email"] = em.lower()
                                        break
                                # Find phone near this person
                                nearby_phones = PHONE_RE.findall(parent_text)
                                for ph in nearby_phones:
                                    clean = re.sub(r'[^\d+]', '', ph)
                                    if len(clean) >= 10:
                                        leader["phone"] = ph.strip()
                                        break
                            leaders.append(leader)
                    break

        # Method 2: Look for h3/h4 with name followed by p/span with title
        for heading in soup.find_all(["h3", "h4", "h5"]):
            heading_text = heading.get_text(strip=True)
            if 3 < len(heading_text) < 50 and not any(c in heading_text.lower() for c in ["service", "about", "contact", "our", "meet"]):
                # Check sibling elements for title
                sibling = heading.find_next_sibling(["p", "span", "div"])
                if sibling:
                    sib_text = sibling.get_text(strip=True)
                    sib_lower = sib_text.lower()
                    for keyword in TITLE_KEYWORDS:
                        if keyword in sib_lower and len(sib_text) < 80:
                            leader = {"name": heading_text, "title": sib_text}
                            # Check further siblings for contact
                            contact_sib = sibling.find_next_sibling(["p", "span", "div", "a"])
                            if contact_sib:
                                cs_text = contact_sib.get_text(strip=True)
                                em = EMAIL_RE.findall(cs_text)
                                if em and em[0].split("@")[1].lower() not in JUNK_EMAIL_DOMAINS:
                                    leader["email"] = em[0].lower()
                                ph = PHONE_RE.findall(cs_text)
                                if ph:
                                    clean = re.sub(r'[^\d+]', '', ph[0])
                                    if len(clean) >= 10:
                                        leader["phone"] = ph[0].strip()
                            leaders.append(leader)
                            break

    # Deduplicate by name
    seen = set()
    unique = []
    for l in leaders:
        key = l["name"].lower()
        if key not in seen:
            seen.add(key)
            unique.append(l)

    # If we have leaders but no contact info, try to assign emails heuristically
    if unique and all_emails:
        company_emails = [e for e in all_emails if not any(
            generic in e for generic in ["info@", "contact@", "support@", "admin@", "sales@", "hello@", "office@"]
        )]
        # If there are personal-looking emails, try to match by first name
        for leader in unique:
            if "email" not in leader:
                first_name = leader["name"].split()[0].lower() if leader["name"] else ""
                for email in company_emails:
                    local = email.split("@")[0].lower()
                    if first_name and len(first_name) > 2 and first_name in local:
                        leader["email"] = email
                        break

    return unique[:5]


def extract_revenue_signals(texts):
    """Extract revenue signals from text content."""
    all_text = " ".join(texts)
    multipliers = {"million": 1_000_000, "m": 1_000_000, "billion": 1_000_000_000, "b": 1_000_000_000, "k": 1_000}

    for regex in [REVENUE_RE, REVENUE_RE2]:
        for match in regex.finditer(all_text):
            amount = float(match.group(1))
            unit = match.group(2).lower()
            mult = multipliers.get(unit, 1)
            estimate = amount * mult
            if 10_000 <= estimate <= 100_000_000_000:
                return {"estimate": estimate, "source": "page_text"}
    return None


def extract_past_clients(texts):
    """Detect mentions of federal agencies as past clients/partners."""
    all_text = " ".join(texts)
    found = set()

    # Look for federal agency names in text
    for agency in FEDERAL_AGENCIES:
        if len(agency) <= 3:
            # Short abbreviations need word boundaries
            if re.search(r'\b' + re.escape(agency) + r'\b', all_text):
                found.add(agency)
        else:
            if agency.lower() in all_text.lower():
                found.add(agency)

    # Also check near context keywords for relevance
    context_keywords = ["client", "customer", "partner", "contract", "award", "past performance",
                        "work with", "served", "supported", "provided"]
    relevant = set()
    for agency in found:
        for kw in context_keywords:
            # Check if agency and keyword appear within 200 chars of each other
            agency_pos = all_text.lower().find(agency.lower())
            kw_pos = all_text.lower().find(kw)
            if agency_pos >= 0 and kw_pos >= 0 and abs(agency_pos - kw_pos) < 200:
                relevant.add(agency)
                break

    # If no contextual matches, return all found (they likely are clients)
    return list(relevant) if relevant else list(found)[:10]


def detect_uei(texts, soups):
    """Detect UEI (Unique Entity Identifier) from website content."""
    all_text = " ".join(texts)

    # Look for UEI in structured data first (schema.org, JSON-LD)
    for soup in soups:
        if not soup:
            continue
        for script in soup.find_all("script", {"type": "application/ld+json"}):
            try:
                ld_text = script.get_text(strip=True)
                if "uei" in ld_text.lower():
                    candidates = UEI_RE.findall(ld_text.upper())
                    for c in candidates:
                        if any(ch.isalpha() for ch in c) and any(ch.isdigit() for ch in c):
                            return c
            except Exception:
                pass

    # Scan page text: look for UEI context words near 12-char alphanumeric strings
    # Split text into chunks around UEI context words
    for match in UEI_CONTEXT_RE.finditer(all_text):
        start = max(0, match.start() - 100)
        end = min(len(all_text), match.end() + 100)
        nearby_text = all_text[start:end].upper()

        candidates = UEI_RE.findall(nearby_text)
        for c in candidates:
            # UEI must have mix of letters and digits, and not be a common word
            if any(ch.isalpha() for ch in c) and any(ch.isdigit() for ch in c):
                # Reject if it looks like a common pattern (all same char, etc.)
                if len(set(c)) >= 4:
                    return c

    # Broader scan: look for "UEI:" or "UEI :" patterns in all text
    uei_labeled = re.findall(r'UEI\s*[:#]\s*([A-Z0-9]{12})\b', all_text.upper())
    for candidate in uei_labeled:
        if any(ch.isalpha() for ch in candidate) and any(ch.isdigit() for ch in candidate):
            return candidate

    return None


def detect_cage_code(texts):
    """Detect CAGE code (5 alphanumeric characters) from text near context."""
    all_text = " ".join(texts)
    cage_context = re.compile(r'(?:CAGE|cage\s+code)\s*[:#]?\s*([A-Z0-9]{5})\b', re.IGNORECASE)

    for match in cage_context.finditer(all_text):
        candidate = match.group(1).upper()
        if any(ch.isalpha() for ch in candidate) and any(ch.isdigit() for ch in candidate):
            return candidate

    return None


def extract_legal_info(texts, soups):
    """Extract legal information from legal/imprint/terms pages."""
    legal_info = {}
    all_text = " ".join(texts)

    # Legal entity name (DBA, Registered As, Legal Name)
    legal_name_re = re.compile(
        r'(?:legal\s+name|registered\s+(?:as|name)|doing\s+business\s+as|DBA|d\.b\.a\.)\s*[:#]?\s*([A-Z][A-Za-z0-9\s&.,\'-]+)',
        re.IGNORECASE
    )
    match = legal_name_re.search(all_text)
    if match:
        name = match.group(1).strip()
        if 3 < len(name) < 100:
            legal_info["legal_name"] = name

    # Entity type (LLC, Inc, Corp, etc.)
    entity_types = re.findall(
        r'\b(LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|LP|LLP|S-Corp|C-Corp)\b',
        all_text, re.IGNORECASE
    )
    if entity_types:
        legal_info["entity_type"] = entity_types[0].upper().rstrip(".")

    return legal_info


def fetch_linkedin_data(linkedin_url, session):
    """Best-effort LinkedIn company page scrape. Returns enrichment data or None."""
    if not linkedin_url:
        return None
    try:
        resp = session.get(
            linkedin_url,
            timeout=5,
            allow_redirects=True,
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
        )
        if resp.status_code != 200:
            return None

        html = resp.content[:MAX_RESPONSE_SIZE].decode("utf-8", errors="replace")
        if not HAS_BS4:
            return None

        soup = BeautifulSoup(html, "html.parser")

        data = {}

        # Try to get description from meta
        meta_desc = soup.find("meta", attrs={"name": "description"})
        if meta_desc and meta_desc.get("content"):
            data["description"] = meta_desc["content"].strip()[:500]

        og_desc = soup.find("meta", attrs={"property": "og:description"})
        if og_desc and og_desc.get("content") and "description" not in data:
            data["description"] = og_desc["content"].strip()[:500]

        # Try to find employee count from page text
        text = soup.get_text(separator=" ", strip=True)
        emp_match = re.search(r'(\d[\d,]+)\s*(?:employees?|associates|workers)', text, re.IGNORECASE)
        if emp_match:
            count = int(emp_match.group(1).replace(",", ""))
            if 1 <= count <= 500_000:
                data["employee_count"] = count

        # Industry from meta or text
        industry_meta = soup.find("meta", attrs={"name": "industry"})
        if industry_meta and industry_meta.get("content"):
            data["industry"] = industry_meta["content"].strip()

        return data if data else None

    except Exception:
        return None


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Analyze company website")
    parser.add_argument("--company_name", required=True)
    parser.add_argument("--website", required=True)
    args = parser.parse_args()

    start_time = time.time()

    # Set hard timeout
    def timeout_handler(signum, frame):
        raise TimeoutError("Hard timeout reached")

    try:
        signal.signal(signal.SIGALRM, timeout_handler)
        signal.alarm(HARD_TIMEOUT)
    except (AttributeError, ValueError):
        pass  # SIGALRM not available on Windows

    result = {
        "success": True,
        "data": {
            "description": "",
            "services": [],
            "locations": [],
            "detected_states": [],
            "contacts": [],
            "certifications": [],
            "employee_signals": None,
            "founding_year": None,
            "leadership": [],
            "social_links": {"linkedin": None, "facebook": None, "twitter": None},
            "linkedin_data": None,
            "revenue_signals": None,
            "past_clients": [],
            "detected_uei": None,
            "detected_cage_code": None,
            "legal_info": {},
            "pages_crawled": [],
            "crawl_duration_ms": 0,
            "crawl_depth": 0,
        },
        "errors": [],
    }

    try:
        website = normalize_url(args.website)
        parsed = urlparse(website)

        # SSRF check
        if is_private_ip(parsed.hostname):
            result["success"] = False
            result["errors"].append("Blocked: private IP address")
            print(json.dumps(result))
            return

        # Create session
        session = requests.Session()
        session.headers.update({"User-Agent": USER_AGENT})
        session.max_redirects = 3

        # --------- Phase 1: Homepage ---------
        homepage_soup, homepage_text = fetch_page(website, session)
        if not homepage_text:
            result["success"] = False
            result["errors"].append("Could not fetch homepage")
            result["data"]["crawl_duration_ms"] = int((time.time() - start_time) * 1000)
            print(json.dumps(result))
            return

        all_soups = [homepage_soup]
        all_texts = [homepage_text]
        crawled_urls = {website}
        result["data"]["pages_crawled"].append(website)

        # --------- Phase 2: Discover pages from homepage + sitemap ---------
        # Get homepage links
        homepage_candidates = discover_pages(website, homepage_soup, crawled_urls)

        # Get sitemap URLs
        sitemap_urls = fetch_sitemap(website, session)
        sitemap_scored = []
        for url in sitemap_urls:
            if url in crawled_urls:
                continue
            path = urlparse(url).path.lower()
            score = 0
            for pattern, weight in PRIORITY_PAGES:
                if re.search(pattern, path):
                    score = max(score, weight)
            if score > 0:
                sitemap_scored.append((score, url))

        # Merge homepage links and sitemap, dedupe, sort by score
        all_candidates = {}
        for score, url in homepage_candidates:
            if url not in all_candidates or score > all_candidates[url]:
                all_candidates[url] = score
        for score, url in sitemap_scored:
            if url not in all_candidates or score > all_candidates[url]:
                all_candidates[url] = score

        # Sort by score descending
        sorted_candidates = sorted(all_candidates.items(), key=lambda x: -x[1])

        # --------- Phase 3: Crawl top priority pages ---------
        pages_budget = MAX_PAGES - 1  # Already crawled homepage
        level1_crawled = []

        for url, score in sorted_candidates:
            if len(level1_crawled) >= pages_budget:
                break
            if time.time() - start_time > HARD_TIMEOUT - 15:
                break

            time.sleep(FETCH_DELAY)
            soup, text = fetch_page(url, session)
            if text:
                all_soups.append(soup)
                all_texts.append(text)
                crawled_urls.add(url)
                result["data"]["pages_crawled"].append(url)
                level1_crawled.append((url, soup))

        result["data"]["crawl_depth"] = 1

        # --------- Phase 4: Second-level discovery ---------
        # Crawl links found on level-1 pages (for deeper sites)
        remaining_budget = MAX_PAGES - len(crawled_urls)
        if remaining_budget > 0 and time.time() - start_time < HARD_TIMEOUT - 20:
            level2_candidates = {}
            for url, soup in level1_crawled:
                if soup:
                    for score, sub_url in discover_pages(url, soup, crawled_urls):
                        if sub_url not in level2_candidates or score > level2_candidates[sub_url]:
                            level2_candidates[sub_url] = score

            # Only crawl high-priority level-2 pages
            level2_sorted = sorted(level2_candidates.items(), key=lambda x: -x[1])
            level2_sorted = [(u, s) for u, s in level2_sorted if s >= 5]  # Only priority >= 5

            for url, score in level2_sorted[:remaining_budget]:
                if time.time() - start_time > HARD_TIMEOUT - 10:
                    break
                time.sleep(FETCH_DELAY)
                soup, text = fetch_page(url, session)
                if text:
                    all_soups.append(soup)
                    all_texts.append(text)
                    crawled_urls.add(url)
                    result["data"]["pages_crawled"].append(url)

            if level2_sorted:
                result["data"]["crawl_depth"] = 2

        # --------- Phase 5: Extract all data ---------
        result["data"]["description"] = extract_description(all_soups, all_texts)
        result["data"]["services"] = extract_services(all_soups, all_texts)

        locations, states = extract_locations(all_texts)
        result["data"]["locations"] = locations
        result["data"]["detected_states"] = states

        contacts, social_links = extract_contacts(all_texts, all_soups)
        result["data"]["contacts"] = contacts
        result["data"]["social_links"] = social_links

        result["data"]["certifications"] = detect_certifications(all_texts)
        result["data"]["employee_signals"] = estimate_employees(all_texts)
        result["data"]["founding_year"] = extract_founding_year(all_texts)
        result["data"]["leadership"] = extract_leadership(all_texts, all_soups)
        result["data"]["revenue_signals"] = extract_revenue_signals(all_texts)
        result["data"]["past_clients"] = extract_past_clients(all_texts)

        # UEI & CAGE detection
        result["data"]["detected_uei"] = detect_uei(all_texts, all_soups)
        result["data"]["detected_cage_code"] = detect_cage_code(all_texts)

        # Legal info extraction
        result["data"]["legal_info"] = extract_legal_info(all_texts, all_soups)

        # LinkedIn enrichment (best-effort)
        if social_links.get("linkedin") and time.time() - start_time < HARD_TIMEOUT - 5:
            time.sleep(FETCH_DELAY)
            result["data"]["linkedin_data"] = fetch_linkedin_data(social_links["linkedin"], session)

    except TimeoutError:
        result["errors"].append(f"Crawl timed out after {HARD_TIMEOUT} seconds")
    except Exception as e:
        result["errors"].append(f"Crawl error: {str(e)}")

    result["data"]["crawl_duration_ms"] = int((time.time() - start_time) * 1000)
    print(json.dumps(result))


if __name__ == "__main__":
    main()

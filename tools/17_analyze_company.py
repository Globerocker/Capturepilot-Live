"""
Tool 17: Company Website Analyzer for Lead Magnet
Crawls a company website and extracts structured business data.
Invoked via subprocess from /api/analyze-company

Usage:
  python3 tools/17_analyze_company.py --company_name "Acme Services" --website "https://acme.com"

Output: JSON to stdout with crawl results
"""
import os
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
MAX_PAGES = 5
FETCH_DELAY = 0.3  # seconds between page fetches
MAX_RESPONSE_SIZE = 2 * 1024 * 1024  # 2MB per page
REQUEST_TIMEOUT = 10  # seconds per request
HARD_TIMEOUT = 60  # seconds total

USER_AGENT = "CapturePilot-Analyzer/1.0 (https://capturepilot.com; B2G company analysis)"

# Pages to prioritize (URL path or anchor text patterns)
PRIORITY_PAGES = [
    (r"about", 10),
    (r"service", 9),
    (r"capabilit", 9),
    (r"what.we.do", 9),
    (r"solution", 8),
    (r"contact", 7),
    (r"team", 6),
    (r"leadership", 6),
    (r"staff", 6),
    (r"career", 5),
    (r"job", 5),
    (r"client", 4),
    (r"project", 4),
    (r"portfolio", 4),
    (r"case.stud", 4),
    (r"product", 4),
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
        if "text/html" not in ct and "text/plain" not in ct:
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
            # Remove script, style, nav, footer elements
            for tag in soup.find_all(["script", "style", "nav", "footer", "noscript", "iframe"]):
                tag.decompose()
            text = soup.get_text(separator=" ", strip=True)
        else:
            soup = None
            text = re.sub(r'<[^>]+>', ' ', html)
            text = re.sub(r'\s+', ' ', text).strip()

        return soup, text

    except Exception:
        return None, None


def discover_pages(base_url, soup):
    """Find internal links worth crawling, scored by priority."""
    if not soup:
        return []

    parsed_base = urlparse(base_url)
    base_domain = parsed_base.netloc.lower()
    seen = {base_url.rstrip("/")}
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
        if ext in ("pdf", "doc", "docx", "xls", "xlsx", "zip", "png", "jpg", "gif", "svg", "css", "js"):
            continue

        seen.add(abs_url)

        # Score based on URL path and anchor text
        combined = (parsed.path + " " + (a_tag.get_text(strip=True) or "")).lower()
        score = 0
        for pattern, weight in PRIORITY_PAGES:
            if re.search(pattern, combined):
                score = max(score, weight)

        if score > 0:
            candidates.append((score, abs_url))

    # Sort by score descending, take top (MAX_PAGES - 1)
    candidates.sort(key=lambda x: -x[0])
    return [url for _, url in candidates[: MAX_PAGES - 1]]


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
    """Extract leadership names and titles."""
    leaders = []
    all_text = " ".join(texts).lower()

    # Look for name+title patterns near title keywords
    for soup in soups:
        if not soup:
            continue
        for tag in soup.find_all(["div", "section", "article", "li"]):
            tag_text = tag.get_text(strip=True)
            tag_lower = tag_text.lower()
            for keyword in TITLE_KEYWORDS:
                if keyword in tag_lower and len(tag_text) < 200:
                    # Try to split name from title
                    parts = re.split(r'[-–|,]', tag_text, maxsplit=1)
                    if len(parts) == 2:
                        name = parts[0].strip()
                        title = parts[1].strip()
                        if 3 < len(name) < 50 and 3 < len(title) < 60:
                            leaders.append({"name": name, "title": title})
                    break

    # Deduplicate
    seen = set()
    unique = []
    for l in leaders:
        key = l["name"].lower()
        if key not in seen:
            seen.add(key)
            unique.append(l)

    return unique[:5]


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
            "pages_crawled": [],
            "crawl_duration_ms": 0,
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

        # Fetch homepage
        homepage_soup, homepage_text = fetch_page(website, session)
        if not homepage_text:
            result["success"] = False
            result["errors"].append("Could not fetch homepage")
            result["data"]["crawl_duration_ms"] = int((time.time() - start_time) * 1000)
            print(json.dumps(result))
            return

        all_soups = [homepage_soup]
        all_texts = [homepage_text]
        result["data"]["pages_crawled"].append(website)

        # Discover and fetch subpages
        subpages = discover_pages(website, homepage_soup)
        for url in subpages:
            time.sleep(FETCH_DELAY)
            soup, text = fetch_page(url, session)
            if text:
                all_soups.append(soup)
                all_texts.append(text)
                result["data"]["pages_crawled"].append(url)

        # Extract data
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

    except TimeoutError:
        result["errors"].append("Crawl timed out after 60 seconds")
    except Exception as e:
        result["errors"].append(f"Crawl error: {str(e)}")

    result["data"]["crawl_duration_ms"] = int((time.time() - start_time) * 1000)
    print(json.dumps(result))


if __name__ == "__main__":
    main()

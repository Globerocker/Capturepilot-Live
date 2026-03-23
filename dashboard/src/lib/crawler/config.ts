/**
 * Constants, regex patterns, and URL priority scores.
 * Ported from tools/17_analyze_company.py lines 35-168.
 */

export const MAX_PAGES = 15;
export const FETCH_DELAY_MS = 250;
export const MAX_RESPONSE_SIZE = 2 * 1024 * 1024; // 2MB
export const REQUEST_TIMEOUT_SECS = 10;
export const HARD_TIMEOUT_MS = 75_000;

export const USER_AGENT =
    "CapturePilot-Analyzer/2.0 (https://capturepilot.com; B2G company analysis)";

// URL path + anchor text patterns scored by priority
export const PRIORITY_PAGES: Array<[RegExp, number]> = [
    [/about/i, 10],
    [/service/i, 9],
    [/capabilit/i, 9],
    [/what.we.do/i, 9],
    [/capability.statement/i, 9],
    [/solution/i, 8],
    [/contract/i, 8],
    [/government/i, 8],
    [/federal/i, 8],
    [/contact/i, 7],
    [/team/i, 7],
    [/leadership/i, 7],
    [/our.people/i, 7],
    [/executive/i, 7],
    [/past.perform/i, 7],
    [/certif/i, 7],
    [/staff/i, 6],
    [/management/i, 6],
    [/award/i, 6],
    [/legal/i, 6],
    [/imprint/i, 6],
    [/impressum/i, 6],
    [/sam[\-._]gov/i, 6],
    [/uei/i, 6],
    [/career/i, 5],
    [/job/i, 5],
    [/partner/i, 5],
    [/industr/i, 5],
    [/compliance/i, 5],
    [/registration/i, 5],
    [/entity/i, 5],
    [/duns/i, 5],
    [/client/i, 4],
    [/project/i, 4],
    [/portfolio/i, 4],
    [/case.stud/i, 4],
    [/product/i, 4],
    [/privacy/i, 3],
    [/terms/i, 3],
];

// Regex patterns
export const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
export const PHONE_RE = /(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g;
export const YEAR_RE = /(?:established|founded|since|est\.?)\s*(?:in\s+)?(\d{4})/gi;
export const EMPLOYEE_RE = /(\d+)\s*(?:\+\s*)?(?:employees?|team members?|staff|professionals?|people)/gi;
export const REVENUE_RE = /\$\s*(\d+(?:\.\d+)?)\s*(million|billion|M|B|K)\s*(?:in\s+)?(?:revenue|annual|sales)?/gi;
export const REVENUE_RE2 = /(\d+(?:\.\d+)?)\s*(million|billion)\s*(?:in\s+)?(?:revenue|dollar|sales|annual)/gi;
export const UEI_RE = /\b([A-Z0-9]{12})\b/g;
export const UEI_CONTEXT_RE = /(?:UEI|unique\s+entity\s+id(?:entifier)?|SAM\.gov|sam\s+registration|entity\s+id|ueiSAM)/gi;
export const ADDRESS_RE = /(\d{1,5}\s+[\w\s.]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct|circle|place|pl)\.?\s*,?\s*[\w\s]+,?\s*[A-Z]{2}\s*\d{5})/gi;
export const STATE_RE_STR = "AL|AK|AZ|AR|CA|CO|CT|DC|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY";

export const US_STATES = new Set(STATE_RE_STR.split("|"));

export const TITLE_KEYWORDS = [
    "ceo", "chief executive", "owner", "president", "founder", "co-founder",
    "principal", "director", "managing partner", "general manager", "vp",
    "vice president", "cto", "cfo", "coo", "cio",
];

export const CERT_KEYWORDS: Record<string, RegExp[]> = {
    "8(a)": [/8\s*\(\s*a\s*\)/i, /sba\s+8a/i],
    "HUBZone": [/hubzone/i],
    "SDVOSB": [/sdvosb/i, /service.disabled.veteran/i],
    "WOSB": [/wosb/i, /women.owned/i],
    "EDWOSB": [/edwosb/i, /economically.disadvantaged.women/i],
    "VOSB": [/vosb/i, /veteran.owned/i],
    "SDB": [/small.disadvantaged.business/i],
    "bonding": [/bonded/i, /bonding/i, /surety/i],
    "insurance": [/insured/i, /insurance/i, /liability.insurance/i],
    "GSA Schedule": [/gsa\s+schedule/i, /gsa\s+contract/i, /gsa\s+mas/i],
    "ISO 9001": [/iso\s*9001/i],
    "ISO 14001": [/iso\s*14001/i],
    "security_clearance": [/security\s+clearance/i, /secret\s+clearance/i, /top\s+secret/i],
};

export const JUNK_EMAIL_DOMAINS = new Set([
    "example.com", "sentry.io", "wixpress.com", "googleapis.com", "w3.org",
    "schema.org", "gravatar.com", "wordpress.com", "squarespace.com",
    "godaddy.com", "cloudflare.com", "mailchimp.com", "constantcontact.com",
    "facebook.com", "twitter.com", "instagram.com", "linkedin.com",
    "google.com", "yahoo.com", "hotmail.com", "outlook.com",
]);

export const FEDERAL_AGENCIES = [
    "GSA", "DoD", "Department of Defense", "Army", "Navy", "Air Force", "USAF",
    "Marine Corps", "DHS", "Department of Homeland Security", "VA", "Veterans Affairs",
    "HHS", "Health and Human Services", "DOE", "Department of Energy",
    "DOT", "Department of Transportation", "EPA", "USDA", "Department of Agriculture",
    "DOJ", "Department of Justice", "NASA", "FEMA", "FBI", "ICE", "CBP",
    "USACE", "Corps of Engineers", "NIH", "CDC", "FAA", "Coast Guard",
    "Social Security", "IRS", "Treasury", "State Department", "HUD",
    "Interior", "Commerce", "Labor", "Education", "SBA",
];

export const SKIP_EXTENSIONS = new Set([
    "pdf", "doc", "docx", "xls", "xlsx", "zip", "png", "jpg", "jpeg",
    "gif", "svg", "css", "js", "xml", "mp3", "mp4", "avi", "mov",
]);

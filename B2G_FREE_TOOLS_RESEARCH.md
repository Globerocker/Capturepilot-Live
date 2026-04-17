# B2G Intelligence Platform — Free APIs, Tools & GitHub Projects

**Research compiled: April 3, 2026**
**Current stack**: SAM.gov, USASpending.gov, SBIR.gov, Apollo.io (mixed_companies/search), OpenAI, Resend, Supabase, Next.js

---

## 1. Government Data APIs (FREE)

### 1.1 FPDS (Federal Procurement Data System)
- **URL**: https://www.fpds.gov/fpdsng_cms/index.php/en/ (Atom feed API)
- **What it does**: The authoritative source for all federal contract award data. Every contract action above the micro-purchase threshold is logged here. Provides award amounts, contractor names, NAICS codes, PSC codes, contract type, competition info, and modification history.
- **Free tier**: Completely free, public Atom/XML feed. No API key required.
- **Access method**: Atom feed queries via URL parameters. Example:
  `https://www.fpds.gov/ezsearch/LATEST?q=NAICS%3A561720&s=FPDS&templateName=1.5.3&indexName=awardfull`
  Also supports downloads via USASpending bulk files (which pull from FPDS).
- **Limits**: No rate limit documented, but heavy scraping may get throttled. Atom feeds return XML, not JSON. Pagination via `start=` parameter, 10 records per page default.
- **B2G value**: HIGH. This is the missing link between your SAM.gov opportunity data and actual award history. You could:
  - Build a "who wins what" database — for any NAICS/agency combo, see historical winners
  - Identify incumbent contractors before RFPs drop
  - Calculate average award values by NAICS/agency for price-to-win modeling
  - Track contract modifications (ceiling increases, option exercises)
- **Integration effort**: MEDIUM. XML/Atom parsing is annoying but straightforward. Python `feedparser` or `lxml` handles it. Main challenge is the clunky query syntax and pagination. Consider nightly batch pulls rather than real-time queries.
- **Note**: USASpending.gov actually derives much of its data FROM FPDS. If you need award-level detail (individual contract actions, modifications), go to FPDS directly. If you need aggregated spending by agency/recipient, USASpending's API is better.

### 1.2 USASpending.gov — Endpoints You May Be Missing
- **URL**: https://api.usaspending.gov/api/v2/
- **What it does**: You already use `search/spending_by_award/` in tool 12. But there are 50+ endpoints.
- **Free tier**: Completely free, no API key, generous rate limits.
- **Missing endpoints worth adding**:

  | Endpoint | What it gives you | B2G Value |
  |----------|------------------|-----------|
  | `POST /api/v2/search/spending_by_award/` | Already using | - |
  | `GET /api/v2/recipient/duns/{duns}/` | Full recipient profile by DUNS/UEI | Past performance lookup by UEI |
  | `GET /api/v2/recipient/{id}/` | Recipient details + award history | Competitor deep-dive |
  | `POST /api/v2/search/spending_over_time/` | Spending trends by time period | Budget forecasting — is an agency spending more or less on a NAICS? |
  | `POST /api/v2/search/spending_by_category/` | Spending by NAICS, PSC, agency, recipient | Market sizing — total addressable market for a NAICS |
  | `POST /api/v2/search/spending_by_geography/` | Spending by state/county/district | Geo-targeted opportunity scoring |
  | `GET /api/v2/award_spending/recipient/` | Top recipients by award category | Find dominant competitors |
  | `POST /api/v2/bulk_download/awards/` | Bulk CSV download of awards | Full historical database build |
  | `GET /api/v2/references/naics/{code}/` | NAICS code descriptions + hierarchy | Better NAICS matching |
  | `POST /api/v2/search/new_awards_over_time/` | New awards trending | Detect emerging opportunities |
  | `GET /api/v2/federal_accounts/` | Federal account spending data | Know which accounts fund which contracts |
  | `GET /api/v2/agency/{toptier_code}/awards/` | Agency-level award data | Agency spend analysis |

- **Integration effort**: EASY. Same REST API you already use. JSON responses. No auth.

### 1.3 Grants.gov
- **URL**: https://www.grants.gov/web/grants/search-grants.html
- **API URL**: https://apply07.grants.gov/grantsws/rest/opportunities/search/
- **What it does**: Central clearinghouse for 1,000+ federal grant programs. Different from contracts — these are financial assistance, not procurement. But many companies pursue both.
- **Free tier**: Completely free. No API key. Also offers XML extracts.
- **API details**: REST API with JSON responses. Search by keyword, CFDA number, agency, status (open/closed/forecasted). Also provides RSS feeds by category.
  - `POST /grantsws/rest/opportunities/search/` — search grants
  - `GET /grantsws/rest/opportunity/details?oppId={id}` — grant details
  - XML extract: `https://www.grants.gov/xml-extract.html` — nightly full database dump
- **Limits**: No documented rate limits. XML extract is ~500MB compressed.
- **B2G value**: MEDIUM-HIGH. Expands your platform beyond contracts into grants. Many 8(a) and small businesses pursue SBIR/STTR grants alongside contracts. You could:
  - Cross-reference grant announcements with upcoming contract opportunities
  - Alert users to grant funding in their NAICS areas
  - Build a "grants + contracts" unified pipeline view
- **Integration effort**: EASY. REST API, JSON, no auth. Very similar pattern to your SAM.gov ingestion.

### 1.4 SBIR.gov — You Already Have This
- **URL**: https://www.sbir.gov/api
- **Status**: Already integrated in `/api/grants/sbir/route.ts`
- **Additional endpoints to consider**:
  - `/api/awards.json` — past SBIR/STTR awards (see who won what)
  - `/api/solicitations.json` — you have this
  - These past awards are gold for competitive intelligence — which small businesses won SBIR Phase I/II/III in relevant topics

### 1.5 Beta.SAM.gov Additional Endpoints
- **URL**: https://open.gsa.gov/api/
- **Beyond what you use** (opportunity search + entity registration):

  | API | What it does | Free? |
  |-----|-------------|-------|
  | Entity Management API | Full SAM.gov registration data — entity status, reps/certs, POCs | Yes, with API key (same one you have) |
  | Exclusions API | Debarred/suspended entities | Yes, same key |
  | Federal Hierarchy API | Complete org chart of federal agencies | Yes, same key |
  | Product Service Codes API | Full PSC lookup and hierarchy | Yes, same key |
  | Wage Determination API | Service Contract Act wage rates by location | Yes, same key |
  | Assistance Listings API | CFDA program info (replaces old CFDA.gov) | Yes, same key |
  | Entity/Subaward Reporting API | FSRS subaward data | Yes, same key |

- **B2G value**: HIGH. The Entity Management API alone is a goldmine — you can pull a competitor's full SAM registration including their NAICS codes, set-aside certifications (8(a), HUBZone, SDVOSB), and business size. The Federal Hierarchy API helps with agency relationship mapping.
- **Integration effort**: EASY. Same API key you already have, same header auth pattern.

### 1.6 GSA eBuy
- **URL**: https://www.ebuy.gsa.gov/
- **API**: No public API. Screen scraping only.
- **What it does**: GSA's portal for RFQs (Request for Quotes) through GSA Schedule contracts. Only accessible to GSA Schedule holders.
- **B2G value**: LOW for API integration. No programmatic access.
- **Integration effort**: N/A (no API).

### 1.7 GSA Advantage
- **URL**: https://www.gsaadvantage.gov/
- **API**: No public API. Has a product search but no developer API.
- **B2G value**: LOW for integration. Manual lookup only.

### 1.8 GSA Contract Data (SAM.gov Entity API + GSA eLibrary)
- **URL**: https://www.gsaelibrary.gsa.gov/ and https://open.gsa.gov/api/gsa-foia-api/
- **What it does**: GSA eLibrary lists all GSA Schedule holders and their contract details. The GSA FOIA API provides contract data.
- **Free tier**: Free access, no key for eLibrary search.
- **B2G value**: MEDIUM. Identify which competitors hold GSA Schedules, what SINs (Special Item Numbers) they're on.

### 1.9 GovWin / GovTribe / Bloomberg Government
- These are all PAID services ($5K-$50K/year). Skip for this research.

### 1.10 State/Local Procurement Aggregators (Free)

| Source | URL | Free? | Coverage |
|--------|-----|-------|----------|
| OpenGov (Procurement) | https://opengov.com | No — enterprise paid | N/A |
| BidNet Direct | https://www.bidnetdirect.com/public/ | Free to browse, paid for alerts | State/local bids in 40+ states |
| PublicPurchase.com | https://www.publicpurchase.com/ | Free for vendors to view | County/municipal procurement |
| Unison | https://www.unisonglobal.com/ | Paid | N/A |
| Government Bids (govbids.com) | https://www.govbids.com/ | Free basic search | State bids |

- **Best free option for state/local**: There is no great free API for state/local procurement. Most are screen-scraping targets or paid platforms. The closest thing to free programmatic access is individual state procurement portals (e.g., California's Cal eProcure has data downloads).
- **Integration effort**: HARD. Each state has its own system, no standard API.

---

## 2. Company Enrichment APIs (FREE)

### 2.1 OpenCorporates
- **URL**: https://api.opencorporates.com/
- **What it does**: World's largest open database of companies. 200M+ companies across 140+ jurisdictions. Returns company name, registration number, status (active/dissolved), registered address, officers/directors, filings.
- **Free tier**: 500 requests/month, up to 50 results per search. No API key needed for basic queries (but rate-limited). Free API key available for higher limits.
- **Limits**: 500 req/month free. Paid starts at $100/month.
- **B2G value**: MEDIUM. Useful for verifying company existence, checking if a competitor is active/dissolved, finding officers. Less useful than SAM.gov for gov contracting specifics.
- **Integration effort**: EASY. REST API, JSON, straightforward queries. `GET https://api.opencorporates.com/v0.4/companies/search?q=CompanyName`

### 2.2 SEC EDGAR
- **URL**: https://www.sec.gov/cgi-bin/browse-edgar and https://efts.sec.gov/LATEST/
- **Full-text search**: https://efts.sec.gov/LATEST/search-index?q=keyword
- **What it does**: All public company filings — 10-K (annual), 10-Q (quarterly), 8-K (events), proxy statements. EDGAR full-text search API (EFTS) allows searching across all filings.
- **Free tier**: Completely free. 10 requests/second rate limit. Must include User-Agent header with company name and email.
- **B2G value**: MEDIUM-HIGH for large defense contractors. Many prime contractors are public companies (Lockheed, Raytheon, Booz Allen, SAIC, Leidos, ManTech). Their 10-K filings disclose:
  - Government contract revenue breakdowns
  - Contract backlog by segment
  - Key contract wins/losses
  - Risk factors related to specific programs
- **Integration effort**: MEDIUM. The EDGAR EFTS API returns JSON. Filing content is HTML/XML. Parsing 10-K sections requires some NLP work.
- **Specific endpoints**:
  - `GET https://efts.sec.gov/LATEST/search-index?q="government+contract"&dateRange=custom&startdt=2025-01-01` — search filings mentioning "government contract"
  - `GET https://data.sec.gov/submissions/CIK{number}.json` — all filings for a company
  - Company tickers: `https://www.sec.gov/files/company_tickers.json`

### 2.3 LinkedIn Scraping
- **Legal status**: LinkedIn aggressively blocks scraping. The hiQ Labs v. LinkedIn case (2022) ruled that scraping public profiles isn't a CFAA violation, BUT LinkedIn's TOS still prohibits it, and they will send cease-and-desist letters and block IPs.
- **Recommendation**: DO NOT scrape LinkedIn directly. Instead:
  - Use Google Custom Search API to find LinkedIn profiles: `site:linkedin.com/in/ "company name"`
  - Use People Data Labs or Apollo (you already have Apollo) which aggregate LinkedIn data legally through data partnerships
- **B2G value**: HIGH (the data is valuable) but RISK is too high for direct scraping.

### 2.4 Google Custom Search API (Programmable Search Engine)
- **URL**: https://developers.google.com/custom-search/v1/overview
- **What it does**: Programmatic Google search. Can be configured to search the entire web or specific sites.
- **Free tier**: 100 queries/day. Completely free. Each query returns up to 10 results.
- **Limits**: 100 queries/day free, then $5 per 1,000 queries.
- **B2G value**: HIGH. Use for:
  - Finding company websites: `"company name" government contracts`
  - Finding key personnel: `site:linkedin.com/in "company name" "CEO OR President"`
  - Finding past performance: `"company name" "contract awarded" site:sam.gov OR site:usaspending.gov`
  - News monitoring: `"company name" "government contract" after:2025-01-01`
- **Integration effort**: EASY. REST API, JSON, API key in Google Cloud Console. 10 minutes to set up.
- **Setup**: Create a Programmable Search Engine at https://cse.google.com/, get API key from Google Cloud Console.

### 2.5 Bing Web Search API
- **URL**: https://www.microsoft.com/en-us/bing/apis/bing-web-search-api
- **What it does**: Same as Google Custom Search but through Bing.
- **Free tier**: 1,000 transactions/month through Azure free tier (Bing Search v7).
- **B2G value**: Same as Google Custom Search. Better free tier (1,000 vs 100/day).
- **Integration effort**: EASY. Azure account needed, REST API, JSON. Slightly more setup than Google.

### 2.6 Hunter.io
- **URL**: https://hunter.io/api
- **What it does**: Email finding and verification. Given a domain, returns all known email addresses and their patterns.
- **Free tier**: 25 searches/month + 50 verifications/month. Free forever.
- **Limits**: Very limited free tier. 25 domain searches is almost nothing for a pipeline.
- **B2G value**: MEDIUM. Useful for finding POC emails when SAM.gov contacts are incomplete. But 25/month is too low for production use.
- **Integration effort**: EASY. REST API, API key, JSON.

### 2.7 People Data Labs (PDL)
- **URL**: https://www.peopledatalabs.com/
- **What it does**: Person and company enrichment. 1.5B+ person records, 100M+ company records. Returns employment history, education, skills, social profiles.
- **Free tier**: 100 person records/month + 100 company records/month. Free API key.
- **Limits**: 100/month each for person and company. Then $0.01-0.10/record.
- **B2G value**: MEDIUM. 100 records/month is enough for enriching high-priority targets (hot match competitors). Use for:
  - Enriching company data (size, revenue, industry)
  - Finding key decision makers at agencies or competitor firms
- **Integration effort**: EASY. REST API, JSON, well-documented.

### 2.8 Crunchbase Basic API
- **URL**: https://data.crunchbase.com/docs
- **What it does**: Company profiles, funding rounds, key people, acquisitions.
- **Free tier**: NO free API tier as of 2025. Crunchbase shut down their free API. Basic plan starts at $29/month.
- **B2G value**: Skip — not free.

### 2.9 Clearbit Alternatives (Free)

| Tool | URL | Free Tier | What it does |
|------|-----|-----------|-------------|
| Snov.io | https://snov.io/ | 50 credits/month | Email finder + company data |
| RocketReach | https://rocketreach.co/ | 5 lookups/month | Contact finding |
| Lusha | https://www.lusha.com/ | 5 credits/month | B2B contact data |
| Kaspr | https://www.kaspr.io/ | 5 credits/month | LinkedIn enrichment |
| Apollo.io | https://apollo.io/ | Already using | 50 email credits/month |

- **Verdict**: Most "Clearbit alternatives" have anemic free tiers. Apollo (already integrated) is the best free option. PDL at 100/month is the next best.

### 2.10 SEC EDGAR Company Search (XBRL)
- **URL**: https://data.sec.gov/api/xbrl/
- **What it does**: Structured financial data from public company filings in XBRL format. Revenue, assets, employees, etc.
- **Free tier**: Completely free. Same 10 req/sec limit.
- **B2G value**: MEDIUM. For public defense contractors, you can pull structured financial data (revenue, government contract %, employees) without parsing HTML.

---

## 3. AI/ML Tools (Free / Open Source)

### 3.1 Ollama (Local LLM — No API Costs)
- **URL**: https://ollama.ai / https://github.com/ollama/ollama
- **What it does**: Run LLMs locally. Supports Llama 3.1 (8B/70B), Mistral, Phi-3, Gemma 2, Qwen 2, and many others. REST API compatible with OpenAI API format.
- **Free tier**: Completely free and open source. Runs on your hardware.
- **Hardware needed**: 8B models need 8GB RAM, 70B models need 64GB RAM. Apple Silicon Macs run them well.
- **B2G value**: VERY HIGH. Replace OpenAI API calls for many tasks to eliminate API costs:
  - Opportunity description summarization
  - NAICS code inference (your current OpenAI call in the NAICS feature)
  - Win strategy generation (tool 15)
  - Document classification
  - Requirements extraction
- **Integration effort**: EASY. Install with `brew install ollama`, start server, call `http://localhost:11434/api/generate`. Drop-in replacement for OpenAI API with the `openai` Python package (just change base_url).
- **Best models for your use cases**:
  - `llama3.1:8b` — fast, good for classification and extraction
  - `mistral:7b` — excellent for summarization
  - `phi3:medium` — Microsoft's small model, great for structured extraction
  - `qwen2.5:14b` — best quality/speed ratio for reasoning tasks

### 3.2 Hugging Face Models (Free)
- **URL**: https://huggingface.co/models
- **What it does**: 500K+ pre-trained models. Use Inference API for free or download models to run locally.
- **Free tier**: Inference API has a free tier (rate-limited, shared GPU). Downloading models is always free.
- **B2G value**: HIGH. Specific models useful for your platform:

  | Model | Use Case | Integration |
  |-------|----------|-------------|
  | `facebook/bart-large-mnli` | Zero-shot classification — classify opportunities by category without training | Easy (API call) |
  | `sentence-transformers/all-MiniLM-L6-v2` | Semantic similarity — match company capabilities to opportunity descriptions | Medium (embed + compare) |
  | `dslim/bert-base-NER` | Named Entity Recognition — extract org names, locations, dollar amounts from descriptions | Easy |
  | `facebook/bart-large-cnn` | Summarization — condense long SOWs | Easy |
  | `microsoft/deberta-v3-large` | Text classification — could train on labeled opps | Medium |

- **Integration effort**: EASY for API, MEDIUM for local deployment.

### 3.3 LangChain
- **URL**: https://github.com/langchain-ai/langchain (Python) / https://github.com/langchain-ai/langchainjs (JS/TS)
- **What it does**: Framework for building LLM application pipelines. Chains, agents, RAG (Retrieval Augmented Generation), document loaders, text splitters.
- **Free tier**: Completely open source (MIT license).
- **B2G value**: HIGH. Specific use cases:
  - RAG pipeline: Index all your opportunity documents (SOWs, RFPs) and let users ask questions about them
  - Multi-step analysis: Chain together NAICS lookup -> opportunity search -> competitor analysis
  - Document processing: Load PDFs, split into chunks, extract structured data
- **Integration effort**: MEDIUM. The JS version (langchainjs) would fit your Next.js stack. Python version for your tools/ pipeline.
- **Note**: LangChain is powerful but has a learning curve and can be over-engineered for simple use cases. For basic LLM calls, direct API usage is often cleaner.

### 3.4 Unstructured.io (Open Source)
- **URL**: https://github.com/Unstructured-IO/unstructured
- **What it does**: Converts PDFs, DOCX, PPTX, HTML, images, and more into clean structured text. Handles OCR, table extraction, and layout detection.
- **Free tier**: Open source (Apache 2.0). Also has a hosted API with free tier (1,000 pages/month).
- **B2G value**: VERY HIGH. Government RFPs and SOWs are almost always PDFs, often scanned. This tool can:
  - Parse RFP attachments downloaded from SAM.gov (your tool 13 downloads them)
  - Extract requirements from SOWs into structured sections
  - Handle scanned documents that simple PDF readers can't
  - Extract tables (pricing templates, evaluation criteria)
- **Integration effort**: MEDIUM. Python library, requires some system dependencies (poppler, tesseract for OCR). Docker image available. Pairs perfectly with your tool 6 (attachment_intelligence.py).
- **Install**: `pip install unstructured[all-docs]` or use Docker.

### 3.5 Docling (IBM)
- **URL**: https://github.com/DS4SD/docling
- **What it does**: IBM's document conversion library. Converts PDF, DOCX, PPTX, HTML to Markdown or JSON. Uses layout analysis models for high-quality extraction.
- **Free tier**: Completely open source (MIT license).
- **B2G value**: HIGH. Alternative to Unstructured.io, often better at:
  - Complex PDF layouts (multi-column, mixed text/tables)
  - Table extraction accuracy
  - Preserving document structure (sections, headers, lists)
- **Integration effort**: EASY. `pip install docling`. Python library, simple API: `DocumentConverter().convert("file.pdf")`.
- **Comparison with Unstructured**: Docling is newer, faster, and often more accurate on complex PDFs. Unstructured has broader file format support. Both are good; Docling is the recommendation for RFP parsing.

### 3.6 Marker (PDF to Markdown)
- **URL**: https://github.com/VikParuchuri/marker
- **What it does**: Converts PDFs to clean Markdown. Uses deep learning models for OCR, layout detection, and text extraction. Handles multi-column layouts, headers, tables.
- **Free tier**: Open source (GPL-3.0).
- **B2G value**: HIGH. Best-in-class PDF to Markdown conversion. Great for:
  - Converting SOWs to Markdown for LLM processing
  - Creating searchable text from scanned RFPs
  - Feeding clean text into your scoring algorithms
- **Integration effort**: MEDIUM. Python, requires PyTorch. GPU recommended but CPU works. `pip install marker-pdf`.
- **Note**: Marker is specifically optimized for converting PDFs to readable text, while Unstructured/Docling focus more on structured extraction. Use Marker for "give me clean readable text" and Docling for "extract tables and sections."

### 3.7 LlamaIndex
- **URL**: https://github.com/run-llama/llama_index
- **What it does**: Data framework for LLM applications. Specializes in connecting LLMs with your data — indexing, retrieval, and querying. Basically "RAG as a framework."
- **Free tier**: Open source (MIT license).
- **B2G value**: MEDIUM-HIGH. Use cases:
  - Index all downloaded RFP/SOW documents and enable natural language queries ("Show me all opportunities requiring CMMI Level 3")
  - Build a knowledge base from past awards, win/loss data
  - Create per-client document collections for consulting clients
- **Integration effort**: MEDIUM. Python-centric. Works with Ollama for fully local/free RAG.
- **vs LangChain**: LlamaIndex is more focused on data indexing and retrieval. LangChain is more general-purpose. For document Q&A specifically, LlamaIndex is better. For complex multi-step workflows, LangChain is better.

### 3.8 ChromaDB (Vector Database — Free)
- **URL**: https://github.com/chroma-core/chroma
- **What it does**: Open-source embedding/vector database. Store document embeddings and do similarity search.
- **Free tier**: Completely open source. Run locally or embedded in Python.
- **B2G value**: HIGH when combined with document parsing. Use for:
  - Semantic search across opportunities ("find opportunities similar to this one")
  - Company-to-opportunity matching using embeddings instead of keyword matching
  - "More like this" feature for opportunities
- **Integration effort**: EASY. `pip install chromadb`. In-memory or persistent. Simple API.

---

## 4. Web Scraping / Data Tools (Free)

### 4.1 Playwright
- **URL**: https://playwright.dev/
- **What it does**: Browser automation (Chromium, Firefox, WebKit). Handles JavaScript-heavy sites, SPAs, login flows, file downloads.
- **Free tier**: Completely open source (Apache 2.0).
- **B2G value**: HIGH. Many government sites (GSA eBuy, DIBBS, state procurement portals) require JavaScript rendering. Playwright can:
  - Automate login to GSA eBuy and scrape RFQs
  - Capture screenshots of opportunity pages for consulting clients
  - Download documents from sites that require browser interaction
  - Navigate multi-page search results on JS-heavy portals
- **Integration effort**: EASY-MEDIUM. Node.js native (`npm install playwright`). Also has Python bindings. Headless mode works on servers. Vercel serverless has limits (see Puppeteer section).
- **vs Cheerio**: You use Cheerio for HTML parsing (static pages). Playwright/Puppeteer are for pages that need a real browser. Use both.

### 4.2 Puppeteer
- **URL**: https://pptr.dev/ / https://github.com/puppeteer/puppeteer
- **What it does**: Same as Playwright but Chrome/Chromium only. Google-maintained.
- **Free tier**: Open source (Apache 2.0).
- **B2G value**: Slightly less than Playwright (Chrome only, older API).
- **Note**: If choosing between Playwright and Puppeteer, choose Playwright. It's newer, supports more browsers, and has a better API. Puppeteer is legacy at this point.

### 4.3 Crawlee (Node.js Scraping Framework)
- **URL**: https://github.com/apify/crawlee
- **What it does**: Full-featured web scraping framework for Node.js. Handles request queuing, rate limiting, proxy rotation, browser management, data storage. Supports both HTTP (Cheerio) and browser (Playwright/Puppeteer) crawling.
- **Free tier**: Completely open source (Apache 2.0). Made by Apify.
- **B2G value**: MEDIUM. If you need to scrape multiple government sites at scale, Crawlee handles the infrastructure (queuing, retries, rate limits). Not needed for simple API calls.
- **Integration effort**: MEDIUM. Node.js native. Replaces ad-hoc scraping scripts with a structured framework.

### 4.4 Archive.org Wayback Machine API
- **URL**: https://archive.org/help/wayback_api.php
- **What it does**: Access historical snapshots of web pages. See how a company's website looked at any point in time.
- **Free tier**: Completely free. No API key.
- **Endpoints**:
  - `https://archive.org/wayback/available?url=example.com` — check if URL is archived
  - `https://web.archive.org/web/timemap/json/example.com` — get all snapshots
- **B2G value**: LOW-MEDIUM. Niche use cases:
  - Check if a competitor's website claims past performance that has since been removed
  - Find historical capability statements
  - Verify company history claims
- **Integration effort**: EASY. Simple REST calls, JSON responses.

### 4.5 Common Crawl
- **URL**: https://commoncrawl.org/
- **What it does**: Open repository of web crawl data (petabytes). Billions of pages crawled monthly.
- **Free tier**: Completely free. Data stored on AWS S3 (requester pays for data transfer).
- **B2G value**: LOW for your use case. Useful for academic/research projects. The data is too massive and generic for targeted B2G intelligence.
- **Integration effort**: HARD. Requires big data tools (Spark, Athena) to query.

### 4.6 Firecrawl (Open Source)
- **URL**: https://github.com/mendableai/firecrawl
- **What it does**: Turn any website into LLM-ready Markdown. Handles JavaScript rendering, removes boilerplate, outputs clean text.
- **Free tier**: Open source (AGPL). Self-host for free. Hosted API has 500 credits/month free.
- **B2G value**: MEDIUM. Good for converting government web pages into clean text for LLM processing. Competitor to your manual Cheerio scraping.
- **Integration effort**: EASY. `npm install @mendable/firecrawl-js` or self-host with Docker.

---

## 5. GitHub Projects for GovCon

### 5.1 SAM.gov / Procurement Tools

| Project | URL | Stars | Description | Value |
|---------|-----|-------|-------------|-------|
| **sam-gov-api** | https://github.com/GSA/sam-web-design-standards | - | GSA's official design standards (not an API client per se) | LOW |
| **federal-treasury-api** | https://github.com/department-of-veterans-affairs/lighthouse-oas-spec | - | VA Lighthouse API specs | MEDIUM — if targeting VA contracts |
| **api.data.gov** | https://github.com/18F/api.data.gov | ~500 | API umbrella for all government APIs. Proxy layer for rate limiting and key management | MEDIUM — reference for API patterns |
| **usaspending-api** | https://github.com/fedspendingtransparency/usaspending-api | ~500 | The actual USASpending API source code. Django/Python | HIGH — understand the API internals, find undocumented endpoints |
| **openFPDS** | https://github.com/dod-advana/openFPDS | ~20 | Python wrapper for FPDS data | HIGH — saves you from writing FPDS XML parsing |
| **fpds** | https://pypi.org/project/fpds/ | - | Python package for querying FPDS.gov Atom feed | HIGH — `pip install fpds`, handles pagination and parsing |
| **procurement-tools** | Search GitHub for "government procurement" | Various | Various small tools and scrapers | Varies |

### 5.2 Specific Recommended Repos

**fpds (Python package)**
- **URL**: https://pypi.org/project/fpds/
- **What it does**: Clean Python interface to FPDS Atom feeds. Handles the XML parsing and pagination pain.
- **Usage**: `from fpds import fpdsRequest; req = fpdsRequest(NAICS_code="561720")`
- **B2G value**: HIGH. This is the easiest way to add FPDS data to your pipeline.
- **Integration effort**: EASY. `pip install fpds`. Drop into a new tool script.

**USASpending API Source**
- **URL**: https://github.com/fedspendingtransparency/usaspending-api
- **Why look at it**: The source code reveals all available API endpoints, including undocumented ones. Their Django models show the full database schema.
- **B2G value**: MEDIUM. Reference material for maximizing your USASpending integration.

### 5.3 Open Source CRMs Relevant to GovCon

| Project | URL | Description | B2G Value |
|---------|-----|-------------|-----------|
| **Twenty** | https://github.com/twentyhq/twenty | Open-source CRM (Salesforce alternative). Self-hostable. | MEDIUM — could study their deal pipeline/kanban patterns |
| **Huly** | https://github.com/hcengineering/huly | Open-source project management + CRM | LOW — too generic |
| **Attio** | Closed source but has API | Modern CRM with API | LOW — not open source |
| **Erxes** | https://github.com/erxes/erxes | Open-source CRM + marketing | MEDIUM — study their contact/company enrichment patterns |

- **Verdict**: There are no open-source CRMs specifically for government contracting. The space is dominated by paid tools (GovWin, Deltek CapturePoint, Unanet CRM). Your custom-built solution in Caturepilot is actually more targeted than any open-source alternative.

### 5.4 Contract Writing / Proposal Assistants

| Project | URL | Description |
|---------|-----|-------------|
| **proposal-builder** (various) | Search GitHub | Small tools for formatting proposals |
| **FAR-parser** | Various repos | Parse Federal Acquisition Regulation (FAR) clauses |

- **Most promising approach**: Use your existing OpenAI/Ollama integration to build a proposal section generator that takes opportunity requirements + company capabilities and drafts sections. No existing open-source tool does this well — it's a gap in the market.

### 5.5 Past Performance Databases
- **No open-source past performance database exists**. This is because past performance data is proprietary (CPARS/PPIRS are government-only systems).
- **Best alternative**: Build your own from FPDS + USASpending award data. This is exactly what your tools 5 and 12 already do. Enhance by:
  - Adding FPDS contract modification history (extensions = satisfied customer)
  - Cross-referencing with SAM.gov entity registrations
  - Tracking win rates by company across NAICS codes

---

## 6. Communication / Notification APIs (Free)

### 6.1 Resend (Already Using)
- **Free tier**: 100 emails/day, 3,000 emails/month.
- **Enough for**: Current scale. Will need upgrade as user base grows past ~50 active users.

### 6.2 Twilio SMS
- **URL**: https://www.twilio.com/
- **Free tier**: Trial account gives $15.50 credit (about 1,000 SMS). BUT requires upgrade to paid to remove trial limitations (all messages include "Sent from a Twilio trial account").
- **B2G value**: MEDIUM. SMS alerts for hot opportunities could increase engagement.
- **Integration effort**: EASY. `npm install twilio`. 10 lines of code.
- **Verdict**: Not truly free for production use. The trial is good for testing.

### 6.3 Slack Webhooks
- **URL**: https://api.slack.com/messaging/webhooks
- **What it does**: Send messages to Slack channels via HTTP POST. No Slack app approval needed for webhooks.
- **Free tier**: Completely free. Unlimited messages.
- **B2G value**: HIGH for consulting clients. Set up per-client Slack channels with opportunity alerts.
- **Integration effort**: VERY EASY. Single POST request with JSON body. 5 lines of code.
- **Setup**: Create Slack App -> Incoming Webhooks -> Add to workspace -> Get webhook URL -> POST to it.

### 6.4 Discord Webhooks
- **URL**: https://discord.com/developers/docs/resources/webhook
- **What it does**: Same as Slack webhooks but for Discord.
- **Free tier**: Completely free. Unlimited messages.
- **B2G value**: LOW. Most B2G professionals use Slack or Teams, not Discord.
- **Integration effort**: VERY EASY. Same pattern as Slack.

### 6.5 Telegram Bot API
- **URL**: https://core.telegram.org/bots/api
- **What it does**: Create Telegram bots that can send messages, respond to commands, send files. Full bot framework.
- **Free tier**: Completely free. No message limits.
- **B2G value**: MEDIUM. Some users prefer Telegram. Bot can send formatted opportunity alerts with inline buttons (Save, Dismiss, View Details).
- **Integration effort**: EASY. REST API, no SDK needed. `POST https://api.telegram.org/bot{token}/sendMessage`.

### 6.6 Web Push Notifications (Push API)
- **URL**: https://developer.mozilla.org/en-US/docs/Web/API/Push_API
- **What it does**: Browser push notifications. Works even when your site isn't open.
- **Free tier**: Completely free. Built into browsers. No third-party service needed.
- **B2G value**: HIGH. "Hot opportunity alert" push notifications could be a differentiator. Users get notified instantly when a new HOT match appears.
- **Integration effort**: MEDIUM. Requires:
  - Service Worker registration in your Next.js app
  - VAPID key generation
  - Server-side push via `web-push` npm package
  - User permission flow
- **Library**: `npm install web-push`. About 100 lines of code total.
- **Recommendation**: This is one of the highest-value additions on this list. Free, no third-party dependency, works cross-platform.

### 6.7 ntfy.sh (Push Notifications, Self-Hostable)
- **URL**: https://ntfy.sh / https://github.com/binwiederhier/ntfy
- **What it does**: Simple HTTP-based pub/sub push notification service. Send notifications with a single curl command.
- **Free tier**: Free hosted tier (ntfy.sh) or self-host for free. No signup required.
- **B2G value**: MEDIUM. Quick way to add push notifications without the complexity of the Web Push API.
- **Integration effort**: VERY EASY. `curl -d "New HOT match: $title" ntfy.sh/your-topic`. No SDK needed.

---

## 7. Analytics / Monitoring (Free)

### 7.1 PostHog
- **URL**: https://posthog.com / https://github.com/PostHog/posthog
- **What it does**: Product analytics (page views, user journeys, funnels, session recordings, feature flags, A/B testing). Full Mixpanel/Amplitude alternative.
- **Free tier (Cloud)**: 1M events/month, 5K session recordings/month, unlimited feature flags. Free forever.
- **Self-host**: Completely free and open source (MIT license).
- **B2G value**: HIGH. Understand how users interact with your platform:
  - Which opportunity filters are used most?
  - How far do users get in onboarding before dropping off?
  - Which features drive engagement?
  - A/B test different scoring presentations
- **Integration effort**: EASY. `npm install posthog-js`. Add one script tag or React provider. 5 minutes.

### 7.2 Plausible Analytics
- **URL**: https://plausible.io / https://github.com/plausible/analytics
- **What it does**: Privacy-focused web analytics. Simple page views, referrers, top pages. No cookies, GDPR compliant.
- **Free tier**: Self-host only (Elixir/PostgreSQL). Cloud is paid ($9/month).
- **B2G value**: LOW. Too simple for a SaaS product. Good for marketing sites, not product analytics.
- **Integration effort**: EASY if using cloud. MEDIUM for self-hosting.

### 7.3 Umami
- **URL**: https://umami.is / https://github.com/umami-software/umami
- **What it does**: Simple, privacy-focused analytics. Similar to Plausible.
- **Free tier**: Self-host free (Node.js/PostgreSQL — fits your stack). Cloud free tier: 10K events/month.
- **B2G value**: LOW-MEDIUM. Good for basic analytics. PostHog is strictly better for a SaaS product.
- **Integration effort**: EASY. Node.js, can deploy alongside your Next.js app.

### 7.4 Sentry
- **URL**: https://sentry.io / https://github.com/getsentry/sentry
- **What it does**: Error tracking, performance monitoring, session replay. Captures exceptions, stack traces, breadcrumbs.
- **Free tier**: 5K errors/month, 10K transactions/month, 50 session replays. Free forever.
- **B2G value**: HIGH. Your platform has 20+ Python tools, 15+ API routes, cron jobs. Sentry catches errors before users report them:
  - SAM.gov API failures (they change their API periodically)
  - Cron job failures
  - Supabase query errors
  - Frontend JavaScript errors
- **Integration effort**: VERY EASY. `npm install @sentry/nextjs` + `pip install sentry-sdk`. Auto-instruments everything. 10 minutes total.
- **Recommendation**: This should be the first thing you add from this list. Error visibility for your cron pipeline alone is worth it.

### 7.5 Better Stack (formerly Logtail)
- **URL**: https://betterstack.com/
- **What it does**: Uptime monitoring + log management.
- **Free tier**: 5 monitors, 30-second checks, 1GB logs/month.
- **B2G value**: MEDIUM. Monitor your cron endpoints (are they actually running?).
- **Integration effort**: EASY. Add HTTP monitors for your cron URLs.

### 7.6 Checkly
- **URL**: https://www.checklyhq.com/
- **What it does**: API monitoring and synthetic browser checks.
- **Free tier**: 5 browser checks, 20 API checks, 1-minute intervals.
- **B2G value**: MEDIUM. Ensure your SAM.gov integration is working, API endpoints are healthy.
- **Integration effort**: EASY. SaaS, no code changes needed.

---

## Priority Recommendations (Top 10 by Impact)

Ranked by value-to-effort ratio for your specific platform:

| Rank | Tool | Category | Effort | Impact | Why |
|------|------|----------|--------|--------|-----|
| 1 | **Sentry** | Monitoring | Very Easy | HIGH | You have 6 cron jobs, 15+ API routes, 20+ Python tools. You need error visibility yesterday. |
| 2 | **USASpending.gov (new endpoints)** | Gov Data | Easy | HIGH | You already use it. Adding spending_by_category + recipient lookup = market sizing + competitor profiles. Zero new auth needed. |
| 3 | **SAM.gov Entity Management API** | Gov Data | Easy | HIGH | Same API key. Pull competitor certifications, NAICS codes, business size. Direct scoring improvement. |
| 4 | **Web Push Notifications** | Communication | Medium | HIGH | Free, no third party. Hot opportunity alerts. Differentiator vs competitors. |
| 5 | **Ollama** | AI/ML | Easy | VERY HIGH | Eliminate OpenAI API costs for classification, summarization, NAICS inference. Runs on your Mac. |
| 6 | **Docling or Unstructured** | AI/ML | Medium | HIGH | Parse RFP/SOW PDFs from your attachment downloads (tool 13). Extract requirements, evaluation criteria, pricing templates. |
| 7 | **FPDS (via fpds Python package)** | Gov Data | Medium | HIGH | Historical award data. Who wins what, for how much. Incumbent identification. Missing piece for competitive intelligence. |
| 8 | **PostHog** | Analytics | Easy | MEDIUM-HIGH | Understand user behavior. Essential as you scale past early adopters. |
| 9 | **Google Custom Search API** | Enrichment | Easy | MEDIUM | 100 queries/day free. Company website discovery, news monitoring, capability research. |
| 10 | **Slack Webhooks** | Communication | Very Easy | MEDIUM | Per-client Slack channels for consulting clients. 5 lines of code. |

---

## Quick Wins (Can Ship This Week)

1. **Sentry** — `npm install @sentry/nextjs` + `pip install sentry-sdk`. 30 minutes total.
2. **Slack Webhooks** — Add optional `slack_webhook_url` to `user_profiles` table. POST to it when HOT matches are found. 1 hour.
3. **USASpending spending_by_category** — New API route that shows total federal spending by NAICS code. "The government spends $2.7B/year on janitorial services." 2 hours.
4. **SAM.gov Entity API** — Pull competitor SAM registrations (certifications, NAICS, business size) using your existing API key. 3 hours.
5. **PostHog** — Drop in the React provider, add to Next.js layout. 30 minutes.

---

## Not Worth Pursuing

| Tool | Why Skip |
|------|----------|
| State/local procurement APIs | No standard API exists. Each state is different. Huge effort, fragmented value. |
| Common Crawl | Too massive and generic. Not targeted enough for B2G. |
| Crunchbase | No free API anymore. |
| Discord webhooks | Wrong audience for B2G. |
| LinkedIn scraping | Legal risk too high. Apollo already covers this. |
| GSA eBuy/Advantage APIs | No public APIs exist. |
| Plausible/Umami | PostHog is strictly better for a SaaS product. |

---

# PART 2 — 2026-04-17 UPDATE: Additional Tools & Feature Gaps from Competitor Analysis

Cross-referenced against `COMPETITIVE_ANALYSIS.md` and `AGENCY_COMPETITIVE_ANALYSIS.md`. Every item below is NEW (not already covered in sections 1–7 above).

## 8. Additional Free Government Data APIs (Not Previously Covered)

### 8.1 GSA CALC+ Ceiling Rates API — Labor Pricing Database **(HIGHEST-VALUE MISSING SOURCE)**
- **URL**: https://open.gsa.gov/api/dx-calc-api/
- **Endpoint**: `https://api.gsa.gov/acquisition/calc/v3/api/ceilingrates/`
- **What it does**: Returns awarded labor ceiling rates for every labor category across all GSA MAS schedules. Query by labor category, education, experience, small-business status. Returns rate + min/max/average/schedule info.
- **Free tier**: No auth required. No documented rate limit.
- **B2G value**: **VERY HIGH**. This is the data behind GovWin IQ's premium labor pricing tier (15M+ rates) and HigherGov's Price Benchmarking tool (470K+ rates). The underlying data is **just the free CALC API**. We can rebuild their feature for $0.
- **Integration effort**: EASY. REST/JSON, no auth. 1 day to wrap + cache.
- **Use in CapturePilot**: New "Price-to-Win" tab on opportunity detail — shows median/p25/p75 ceiling rates for labor categories in the SOW. Major differentiator vs SMB-tier tools.

### 8.2 Wage Determinations API (SAM.gov)
- **URL**: https://open.gsa.gov/api/wdol/
- **What it does**: Service Contract Act (SCA) and Davis-Bacon Act wage rates by county, state, labor category. Statutory minimums for federal service contracts.
- **Free tier**: Uses same SAM.gov X-Api-Key we already have.
- **B2G value**: HIGH. Janitorial, O&M, security guard, trades opps all carry WDs that dictate pricing floors. CLEATUS markets "wage determinations" as a chat-advisor capability.
- **Integration effort**: EASY.
- **Use**: On opp detail, auto-pull WD number from solicitation + show top 10 affected labor categories with rates.

### 8.3 Federal Hierarchy Public API (SAM.gov)
- **URL**: https://open.gsa.gov/api/fh-public-api/
- **Endpoint**: `https://api.sam.gov/prod/federalorganizations/v1/`
- **What it does**: Full org chart of every department, independent agency, sub-tier, office. Includes FPDS codes, DoDAAC, agency codes, active/inactive status.
- **Free tier**: Same SAM key. 10 default / 100 max per page.
- **B2G value**: HIGH. Replace hand-maintained agency list with authoritative source. Powers correct agency normalization across FPDS + USASpending.
- **Integration effort**: EASY.

### 8.4 Regulations.gov API v4
- **URL**: https://open.gsa.gov/api/regulationsgov/
- **What it does**: All federal rulemaking — dockets, documents, public comments. Full-text search.
- **Free tier**: 1,000 requests/hour (free api.data.gov key).
- **B2G value**: MEDIUM-HIGH. Early signals of policy changes creating contract opportunities (e.g., new CMMC rules drive cybersecurity demand).
- **Use**: "Policy Watch" widget — flag dockets mentioning user-profile keywords.

### 8.5 Federal Register API
- **URL**: https://www.federalregister.gov/developers/documentation/api/v1
- **What it does**: Every rule, proposed rule, executive order, notice since 1994. No API key required.
- **Free tier**: Completely free.
- **B2G value**: MEDIUM. EOs + agency notices precede big contract shifts.
- **Use**: Daily cron — ingest new rules, AI-classify relevance to user's NAICS, surface top 3 on dashboard.

### 8.6 eCFR API (Federal Acquisition Regulation)
- **URL**: https://www.ecfr.gov/developers/documentation/api/v1
- **What it does**: Entire Code of Federal Regulations in structured JSON/XML. Includes FAR (Title 48), DFARS.
- **Free tier**: Free, no key.
- **B2G value**: HIGH. Power a FAR/DFARS clause lookup — when a solicitation cites FAR 52.219-14, users see the full clause text inline. Missing feature everywhere except GovEagle.
- **Use**: `/lib/far-lookup.ts` → given a FAR citation, return clause text. Display inline in opportunity detail.

### 8.7 govinfo API (GPO)
- **URL**: https://www.govinfo.gov/features/api | `https://api.govinfo.gov/`
- **What it does**: Federal budget documents, congressional bills, congressional record, CRS reports, GAO reports, committee prints.
- **Free tier**: Uses free api.data.gov key. Generous limits.
- **B2G value**: HIGH. This is the agency budget source — ingesting "Budget of the United States" appropriations = raw material for our `agency_spend_forecast` table (migration 040).
- **Use**: Replace hardcoded FY26 Q4 spend data with real refreshing ingested data.

### 8.8 Congress.gov API (Library of Congress)
- **URL**: https://gpo.congress.gov | https://github.com/LibraryOfCongress/api.congress.gov
- **What it does**: Bills, amendments, committee reports, members, votes, CRS reports.
- **Free tier**: **5,000 requests/hour** with free api.data.gov key (recently raised from 1,000).
- **B2G value**: MEDIUM. Know when appropriations bills move, when authorizations create contract demand (CHIPS Act-style signals).
- **Use**: "Legislative Signals" panel — bills in user's agencies that moved out of committee in last 30 days.

### 8.9 GAO Bid Protests — RSS + Search **(DACIS KILLER)**
- **URL**: https://www.gao.gov/legal/bid-protests/search | RSS https://www.gao.gov/rss
- **What it does**: Bid protest docket (daily), full decision texts, outcomes (sustained/denied/dismissed).
- **Free tier**: Free; no JSON API but RSS + scrapeable case pages.
- **B2G value**: **VERY HIGH**. DACIS charges enterprise pricing for this. Protest data tells you: which contracts got delayed (recompete opportunity), which contractors challenge vs settle (capture intelligence), which agencies are vulnerable to protest patterns.
- **Integration effort**: MEDIUM (RSS + Playwright/Firecrawl on case pages).
- **Use**: "Protest Radar" nightly scrape. Tag every opp whose NAICS/agency has active related protests.

### 8.10 DoD Daily Contract Announcements ≥$7.5M — war.gov
- **URL**: https://www.war.gov/News/Contracts/
- **What it does**: Every contract award ≥$7.5M announced daily at 5pm business days. Contractor, amount, location, agency, SOW.
- **Free tier**: Free, HTML-scrapeable, daily.
- **B2G value**: HIGH. Real-time "who just won what" — typically 3-6 months before FPDS.
- **Use**: Daily cron → match by UEI to contractors table → surface on Competitors detail as "Recent Wins." Power a public marketing "Daily DoD Ticker."

### 8.11 SBA Dynamic Small Business Search (DSBS)
- **URL**: https://dsbs.sba.gov/ | data.gov https://catalog.data.gov/dataset/dynamic-small-business-search-dsbs-4f0da/
- **What it does**: All SBA-certified 8(a), HUBZone, WOSB, EDWOSB, SDVOSB, SDB firms with capabilities narrative, NAICS, keywords, PoCs.
- **Free tier**: Free; bulk CSV on data.gov (~300K rows).
- **B2G value**: HIGH. Canonical source for the `tribal_contractors` / teaming directory we just built in migration 040. Replaces 800-row CSV with ~300K-row monthly refresh.
- **Use**: Upgrade "Certified Teaming" tab from 800 to 300K firms — matches what CLEATUS markets as their "800K contractor database."

### 8.12 SBA Certification Search API
- **URL**: https://search.certifications.sba.gov/
- **What it does**: Real-time status of SBA certifications (8(a), HUBZone, WOSB) for any UEI.
- **Free tier**: Free web, scrapeable.
- **Use**: Verify partner's current cert status before suggesting them for a set-aside bid.

### 8.13 GLEIF LEI Lookup API
- **URL**: https://www.gleif.org/en/lei-data/gleif-api | docs https://api.gleif.org/docs
- **What it does**: Global Legal Entity Identifier lookup. 2.5M+ entities, 200+ jurisdictions. Company name, address, legal form, parent/ultimate-parent relationships.
- **Free tier**: No key, no documented limit, free.
- **B2G value**: MEDIUM. Disambiguate multi-subsidiary contractors (Northrop Grumman has 30+ LEI'd entities). Corporate hierarchy mapping.
- **Use**: Enrich contractors with LEI + ultimate parent. Show "Corporate Family" on competitor detail.

### 8.14 DSIP DoD SBIR/STTR API
- **URL**: https://www.dodsbirsttr.mil/submissions/api/public/
- **What it does**: Current DoD SBIR/STTR topics (Army/Navy/AF/DARPA/SOCOM), releases, status, document downloads.
- **Free tier**: Public, unauthenticated endpoints.
- **B2G value**: MEDIUM-HIGH. DoD SBIR goes through DSIP separately from civilian SBIR.gov and is higher-value (bigger budgets, primer-friendly).
- **Integration effort**: MEDIUM (reverse-engineer topics-app endpoints or scrape).

## 9. Additional GitHub Projects (Not Previously Covered)

### 9.1 makegov/awesome-procurement-data
- **URL**: https://github.com/makegov/awesome-procurement-data
- **What**: Canonical curated list of every federal procurement data resource, API, tool. Links to PSC Selection Tool, FSCPSC, Part9 API, DIIG CSIS Lookup Tables, NASA 889-Compliance tool.
- **Use**: Bookmark + periodically diff for new additions.

### 9.2 nasa/889-Compliance-SAM-Tool
- **URL**: https://github.com/nasa/889-Compliance-SAM-Tool-
- **What**: Checks whether a SAM-registered entity uses Huawei/ZTE/Hikvision/Dahua/Hytera telecom (Section 889 of FY19 NDAA prohibits these for fed contracts).
- **Use**: Add "Section 889 self-check" in onboarding + badge on profile if compliant.

### 9.3 blueskylineassets/far-rag-api
- **URL**: https://github.com/blueskylineassets/far-rag-api
- **What**: Pre-vectorized semantic search of FAR Part 52 (617 clauses) designed for AI agents.
- **Use**: Drop-in FAR clause RAG — "which clauses apply to my solicitation" feature.

### 9.4 bengm/farse
- **URL**: https://github.com/bengm/farse
- **What**: Scrapes acquisition.gov → outputs a JSON file per FAR clause plus a `complete_far.json`.
- **Use**: Easier than far-rag-api if you just want structured FAR data. Feed to gpt-4o-mini for clause Q&A.

### 9.5 thepulsegovcon/part9-api
- **URL**: https://thepulsegovcon.com/product/part9-api/
- **What**: Consolidates opportunities from SAM.gov + Challenge.gov + Grants.gov + legacy FBO.gov into one API. Has a free tier.
- **Use**: Add Challenge.gov (prize challenges — many small-business-friendly).

### 9.6 dgtlmoon/changedetection.io
- **URL**: https://github.com/dgtlmoon/changedetection.io (31K+ stars)
- **What**: Self-hosted website change monitor. XPath/CSS-selector change detection, headless browser.
- **Free tier**: Open source, self-host free.
- **B2G value**: HIGH. Monitor:
  - Competitor websites for cap-statement changes, new case studies, new hires
  - Agency forecasts pages (most agencies post a quarterly forecast HTML page)
  - Contract vehicle pages (SEWP, CIO-SP) for new task order notices
- **Use**: Internal cron runs changedetection.io → `agency_forecast_changes` table. **This is BidPrime "Future Opps" for $0.**

### 9.7 jpleger/pysam + mheadd/SamDotNet
- Python / C# wrappers for SAM.gov API. Reference material for error-handling patterns.

## 10. Additional AI / Document Parsing Tools

### 10.1 Mistral OCR
- **URL**: https://mistral.ai/pricing (mistral-ocr-latest endpoint)
- **What**: Purpose-built OCR for complex documents — handles tables, math, multi-column, preserves layout into Markdown.
- **Free tier**: Limited free tier. Paid ~$1 per 1,000 pages.
- **B2G value**: HIGH. Cheaper and often better than Textract/Document AI on complex RFP PDFs.
- **Use**: Replace/augment current attachment analysis — OCR first, then GPT-4o-mini for structured JSON extraction.

### 10.2 AWS Textract — Free Tier
- **URL**: https://aws.amazon.com/textract/pricing/
- **Free tier**: 1,000 pages/month (first 3 months of new AWS accounts). Then $0.0015/page basic; $0.015/page Analyze Document.
- **Use**: Specific table extraction (pricing templates, CLIN tables, evaluation criteria grids).

### 10.3 Azure Document Intelligence
- **URL**: https://azure.microsoft.com/en-us/pricing/details/document-intelligence/
- **Free tier**: 500 pages/month (F0 SKU). Read model $1.50/1K paid.
- **Use**: Alternative if Microsoft-stack.

### 10.4 DeepSeek V3.2 / V4
- **URL**: https://platform.deepseek.com
- **Pricing**: No perpetual free, but extremely cheap: $0.14/M input, $0.28/M output. Cached: $0.03/M input.
- **B2G value**: **VERY HIGH** for proposal writing. Comparable to Claude 3.5 Sonnet quality on structured outputs. Prompt caching gives 90% discount on consistent system prompts — perfect for "write this proposal section" flow.
- **Use**: Secondary LLM for proposal drafting. Route long context (full RFPs) here, keep OpenAI for high-quality final pass.

### 10.5 Qwen 2.5 / Qwen 3 (via Alibaba or OpenRouter)
- **URL**: https://openrouter.ai/models?q=qwen
- **Free tier**: Some Qwen models available free on OpenRouter. Paid ~$0.30/M input.
- **Use**: Zero-shot classification of opportunities by type/complexity. Good Ollama-local option.

## 11. Additional Notifications / Infrastructure

### 11.1 Novu — Open-Source Notification Infrastructure
- **URL**: https://novu.co | https://github.com/novuhq/novu (30K+ stars, MIT)
- **Free tier**: Self-host free; cloud free tier = 30K notifications/month.
- **What**: Unified email + SMS + push + in-app + Slack + Teams notifications with template management and user preferences.
- **B2G value**: HIGH. Resend is email-only. Novu unifies all channels, adds in-app inbox widget, per-channel opt-in (compliance win).
- **Use**: Multi-channel opportunity alerts. In-app notification bell (competitor feature in SamSearch, CLEATUS).

### 11.2 Knock
- **URL**: https://knock.app
- **Free tier**: 10K notifications/month free forever.
- Managed-only; alternative to Novu if not self-hosting.

### 11.3 Apify — $5/month Forever-Free Credit
- **URL**: https://apify.com
- **Free tier**: $5 compute credit renews monthly. No CC required.
- **Use**: Marketplace has pre-built actors for LinkedIn company pages, SAM.gov scrapers, news monitoring. $5/mo gets ~1K company enrichments.
- Fallback when Apollo + Google Custom Search come up empty.

### 11.4 Bright Data — 5K Requests/Month Free
- **URL**: https://brightdata.com
- **Free tier**: 5K requests/month on Web Scraper API.
- Only option reliably bypassing anti-bot on some state procurement portals.

---

# 12. FEATURE GAP BACKLOG (vs. Software Competitors)

Priority key: **P0** = table stakes · **P1** = differentiator · **P2** = nice-to-have

## 12.1 P0 Features (Table Stakes — Every AI Competitor Has These)

### 12.1.1 Capture Briefs (Auto-Generated)
- **Competitors**: Sweetspot ("AI Capture Briefs"), GovDash, CLEATUS
- **How**: One-click — pull opportunity + attachments + incumbent data + agency budget + past awards + competitor intel → 2–3 page "capture brief" covering program background, incumbent assessment, PWin, gaps, recommended actions.
- **Powered by**: Existing inputs. New `/api/ai/capture-brief` endpoint orchestrating opportunity + strategic_scoring + past_awards + competitors into one LLM call. Render with jsPDF.
- **Complexity**: **Small (~2 days)**

### 12.1.2 Section L/M Compliance Matrix Generator
- **Competitors**: GovDash ("solicitation shredding"), GovEagle, Sweetspot
- **How**: Upload solicitation → AI parses Sections C (SOW), L (instructions), M (evaluation), H (special contract requirements) → generates a matrix: every "shall/must/will/required" → row with section ref, requirement text, assigned owner, status, proposal section. GovDash claims "95% content capture."
- **Powered by**: Mistral OCR + DeepSeek V4 for requirement extraction + our `structured_requirements` pipeline. Export to XLSX with exceljs.
- **Complexity**: **Medium (~1 week)**

## 12.2 P1 Features (Differentiators)

### 12.2.1 Recompete Radar
- **Competitors**: SamSearch "Federal Recompetes", Fed-Spend "Recompete Radar", PrimeRFP
- **How**: Pull expiring contracts from FPDS/USASpending → score recompete likelihood based on (a) agency history of recompeting vs extending, (b) period-of-performance end within 18 months, (c) market conditions. SamSearch assigns High/Medium confidence. **User sees opportunity 6–18 months before the RFP drops.**
- **Powered by**: FPDS API + `usaspending-api` `/api/v2/search/spending_by_award/` with `period_of_performance_current_end_date` filter + new `agency_recompete_pattern` scoring table.
- **Build**: 1 new cron (`/api/cron/recompete_scan`), 1 new table (`recompete_candidates`), scoring lib, UI page.
- **Complexity**: **Medium**

### 12.2.2 Form Fill Agent (Autonomous)
- **Competitor**: Sweetspot "AI Form Fill" (launched July 2025; Oshkosh, Vannevar, Strider production users)
- **How**: User uploads blank RFP/RFI/SF form → AI identifies every field (even unlabeled) → matches to validated company data (UEI, CAGE, DUNS, NAICS, certs, POCs, past perf) → fills it → flags gaps for human review. Claim: "zero compliance rejections."
- **Powered by**: Mistral OCR or Docling + LLM field-detection + user_profiles cross-ref + SAM Entity API.
- **Complexity**: **Large**

### 12.2.3 Labor Rates / Price-to-Win Database (HigherGov/GovWin killer)
- **Competitors**: GovWin IQ (15M rates, enterprise-only), HigherGov (470K rates, $500+/yr)
- **How**: Ingest GSA CALC + 8(a) STARS III + TSA eFast + Alliant II + VETS 2 + SeaPort-NxG ceiling rates. Show by labor category + clearance + experience + education. Bundle "Price-to-Win" recommendation (20th percentile for LPTA, median for best-value).
- **Powered by**: **The free CALC API** (§8.1). HigherGov's 470K "active prices" is essentially a cached CALC dump.
- **Build**: 1 new table (`labor_rates`), nightly CALC cron, UI on opp detail.
- **Complexity**: **Medium (~1 week)** — **biggest per-dollar-of-effort feature on this list**

### 12.2.4 MCP Server for Claude/ChatGPT/Copilot
- **Competitor**: GovTribe (only one)
- **How**: MCP-compliant endpoint exposing: search_opportunities, get_opportunity_detail, search_contractors, get_agency_profile. Users add CapturePilot as connector in Claude Desktop → Claude can pull live CapturePilot data in conversation.
- **Powered by**: Model Context Protocol (https://modelcontextprotocol.io).
- **Build**: Wrap existing API routes in MCP server. Small Node/TS project.
- **Complexity**: **Medium (~1 week)** — **unique differentiator at SMB price point**

### 12.2.5 Zapier Integration
- **Competitors**: HigherGov ($2.5K/yr+), CLEATUS, Fed-Spend
- **How**: Build a Zapier app (free for public apps). Expose "Pursuit Added" trigger. Users fire Zaps to HubSpot / Salesforce / Dynamics 365 / monday / Pipedrive / SugarCRM / Zoho / ClickUp.
- **Complexity**: **Small (1–2 weeks inc. Zapier approval)**

### 12.2.6 eBuy / Task Order Import via Email Forwarding
- **Competitors**: HigherGov (Standard tier), Federal Compass
- **How**: User forwards eBuy/SEWP/CIO-SP/NIH CIO-CS/Symphony alerts to `pursuits@<user>.capturepilot.app`. Inbound parser → solicitation # + agency + response due + attachments → creates a pursuit. Bypasses lack of eBuy public API.
- **Powered by**: Resend inbound email (or alternatives) + existing pursuit pipeline.
- **Complexity**: **Medium**

### 12.2.7 Market Watch (Saved Search → Weekly Digest)
- **Competitor**: SamSearch
- **How**: User saves a natural-language search → system runs weekly → Monday-morning digest with top 5 opportunities, top 3 competitors on similar work, 1 agency insight.
- **Powered by**: Existing AI filter + matches + Sunday cron + email template.
- **Complexity**: **Small (~1 week)**

### 12.2.8 AI Capability Matrix (company → opportunity fit)
- **Competitor**: Sweetspot
- **How**: Cross-reference company capabilities (from capability statement) against opportunity requirements (from Section M evaluation criteria). Output matrix: strong/moderate/weak/gap per evaluation factor.
- **Powered by**: capability_statement + structured_requirements + LLM comparison.
- **Complexity**: **Small (~2-3 days)**

### 12.2.9 24/7 AI Chat Advisor (CLEATUS GovCon Copilot equivalent)
- **Competitor**: CLEATUS
- **How**: Always-on chat with tool-use. Answers: "what FAR clauses apply?", "what's a typical CBA rate for HVAC in San Diego?", "who's the incumbent?". Tool calls to live SAM.gov, wage determinations, CALC, web search, user's document hub.
- **Powered by**: GPT-4o-mini / Claude with function-calling; tools map to existing API routes + CALC + WD + far-rag-api.
- **Complexity**: **Medium**

### 12.2.10 Past-Performance Database (Derived from FPDS)
- **Competitors**: GovWin IQ, DACIS, Federal Compass
- **How**: For any UEI, show every completed contract, value, period of performance, modifications (extensions = satisfied customer), competitive vs sole-source, protest history.
- **Powered by**: FPDS via `fpds` Python package + USASpending recipient endpoint + GAO RSS.
- **Complexity**: **Medium**

## 12.3 P2 Features (Nice-to-Have)

### 12.3.1 Emerging Opps (Meeting Minutes AI Extraction)
- **Competitor**: BidPrime via Ontopical
- **How**: Ingest ~1M pages of municipal/school-board/transit-authority meeting minutes, agendas, videos per week. LLM extracts "approved $2.3M for upgraded HVAC at the high school" → pre-RFP alert.
- **Complexity**: **Large** (big data pipeline, constant site-layout changes). MVP = top-20 metro areas.

### 12.3.2 Browser Extension (SAM.gov Injection)
- **Competitor**: Gov Contract Finder
- **How**: Chrome/Edge/Firefox extension. Detects SAM.gov opp page → injects "Save to CapturePilot" + "viewed before" badge + AI match score.
- **Complexity**: **Small-Medium (~1-2 weeks)**

### 12.3.3 Mobile App
- **Competitor**: Gov Contract Finder (only one)
- Ship a PWA first (already possible via Next.js). Skip native.

---

# 13. MOONSHOTS (No Competitor Has These — Defensible for CapturePilot)

## 13.1 Agency Forecast Change Detection
- Use `changedetection.io` to monitor the quarterly-forecast HTML pages of every major agency (most publish to procurement-forecast.[agency].gov). Nightly diff. New line item → parse → match to user NAICS → alert.
- **Why it matters**: Agencies add forecast items months before the RFP. First-mover advantage. No competitor monitors these pages automatically — they wait for SAM.gov 90 days later.
- **Enabled by**: changedetection.io (§9.6) + existing NAICS matching.
- **Complexity**: **Medium**

## 13.2 Voice-First Capture Briefs
- Mic button on iPhone (PWA) → user dictates "Brief me on the Fort Bragg logistics recompete" → Capture Brief pipeline runs → audio response via ElevenLabs/OpenAI TTS. Perfect for consultants driving between meetings.
- **Why it matters**: Consulting-hybrid model targets consultants. Voice is a gap no competitor has addressed.
- **Enabled by**: Whisper (already in stack) + capture brief + TTS.
- **Complexity**: **Small (~1 week)**

## 13.3 Slack/Teams Bot — "What RFPs Dropped Today?"
- Slack bot users add to a channel. Morning digest ("3 HOT matches, 2 WARM") + responds to natural-language queries ("@capturepilot show me Army IT contracts this week").
- **Why it matters**: Fed-Spend has Slack **alerts** (one-way). No competitor has conversational bot.
- **Enabled by**: Slack Bolt + existing AI filter.
- **Complexity**: **Medium (~2 weeks)**

## 13.4 Predicted Past-Performance Rating (CPARS Proxy)
- For any UEI, synthesize a past-perf rating from public signals: (1) FPDS mod count + extensions:terminations ratio, (2) subsequent award volume from same agency (retention = satisfaction), (3) GAO protests against them, (4) re-compete win rate on their own incumbent work.
- **Why it matters**: Past perf is the #1 evaluation factor. Nobody can access real CPARS but a transparent public-data proxy is defensible and marketable.
- **Enabled by**: FPDS + USASpending + GAO RSS.
- **Complexity**: **Medium-Large**

## 13.5 Agency Budget Burn Radar
- Using govinfo + USASpending + agency obligation data, calculate each agency's FY burn rate vs target. Flag agencies under-spending at Q3/Q4 (they'll rush to obligate → opportunity boom).
- **Why it matters**: Our new `agency_spend_forecast` (migration 040) hints at this. Make it real-time.
- **Enabled by**: govinfo API + USASpending agency endpoints.
- **Complexity**: **Medium**

## 13.6 Protest Risk Score for Opportunities
- For any opportunity, score agency's historical protest rate + incumbent's protest behavior + competition type. Output: "This opportunity has a 42% historical protest rate. Expect 60-90 day delay if awarded."
- **Enabled by**: GAO RSS/scrape (§8.9).
- **Complexity**: **Medium**

## 13.7 Teaming Partner "Genetic Match"
- Compatibility algorithm against DSBS's 300K+ firms: NAICS overlap (weighted by primary), PSC overlap, geographic radius, complementary cert (user is 8(a) → recommend WOSB if mixed set-aside), overlapping past agencies. Explainable.
- **Why it matters**: Sweetspot + SamSearch do coarse matching; full 300K DSBS + weighted + explainable is unique.
- **Enabled by**: DSBS bulk (§8.11) + SBA Cert Search (§8.12).
- **Complexity**: **Medium**

## 13.8 Compliance Copilot in Microsoft Word (GovEagle killer)
- Native Word add-in (Office.js) in task pane. As user drafts a proposal section, compare to saved compliance matrix (§12.1.2) + flag missing requirements live. Insert boilerplate from capability statement.
- **Why it matters**: GovEagle charges $15–60K/yr exclusively for this. Office.js add-ins are free to build. Enormous differentiator at SMB pricing.
- **Enabled by**: Office.js + matrix + capability statement.
- **Complexity**: **Medium-Large (~3-4 weeks)**

## 13.9 Win Theme Auto-Generator from Past Awards
- For any opp, analyze past similar awards (same NAICS/agency/size) via FPDS → find 3 incumbents → scrape their public case studies + capability statements → extract recurring themes ("on-time delivery", "DFARS compliance", "workforce diversity") → recommend 5 win themes.
- **Why it matters**: Capture consultants charge $2-5K for this analysis per opportunity.
- **Enabled by**: FPDS + Firecrawl + LLM.
- **Complexity**: **Medium**

## 13.10 Pre-Proposal Conference Intel Tracker
- Most RFPs announce a pre-proposal conference or industry day. Scrape each opp's attachments for these refs → auto-calendar them → post-conference harvest the Q&A amendments (usually posted within 10 days) → inform user "the incumbent asked X; the agency clarified Y."
- **Enabled by**: SAM.gov attachment parser + calendar.
- **Complexity**: **Small**

---

# 14. TOP 10 HIGHEST-LEVERAGE NEXT ACTIONS (2026-04-17)

Ordered by ROI (value delivered ÷ build effort):

| Rank | Action | Effort | Why |
|---|---|---|---|
| 1 | **CALC Labor Rates ingestion** (§8.1 + §12.2.3) | 1-2 days | Unlocks HigherGov-class Price-to-Win feature |
| 2 | **Capture Briefs auto-generator** (§12.1.1) | 2 days | Closes gap with every AI-native competitor |
| 3 | **Compliance Matrix generator + XLSX export** (§12.1.2) | 1 week | P0 table stakes |
| 4 | **Federal Hierarchy API integration** (§8.3) | 1 day | Fixes agency data quality everywhere |
| 5 | **FAR Clause Inline Lookup** (§8.6 + §9.3) | 2-3 days | GovEagle does this for $15K/yr |
| 6 | **DSBS bulk ingestion** (§8.11) | 3 days | Upgrades teaming from 800 to 300K firms |
| 7 | **DoD Daily Contracts feed** (§8.10) | 1 day | Daily competitor-intelligence cron |
| 8 | **MCP Server** (§12.2.4) | 1 week | Unique at SMB pricing |
| 9 | **GAO Bid Protest tracker** (§8.9) | 1 week | "Protest Radar" is unique |
| 10 | **DeepSeek V3.2 for proposal drafting** (§10.4) | 2 days | Cut LLM costs 70-90% |

All free or near-free at CapturePilot's expected scale — compound without eating unit economics.

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

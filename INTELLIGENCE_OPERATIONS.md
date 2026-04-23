# CapturePilot + Americurial — Intelligence Operations Center

**Erstellt**: 2026-04-22
**Zweck**: Projektstruktur, Recurring Research Routinen, Competitive Monitoring
**Verantwortlich**: Andre (Software/CapturePilot) + Sergio (Agency/Americurial)

---

## ÜBERSICHT: PROJEKTSTRUKTUR

Dieses Dokument definiert die laufenden Intelligence-Aufgaben, die wöchentlich, monatlich und quartalsweise durchgeführt werden sollen. Ziel ist es, Wettbewerber, Markttrends, API-Neuigkeiten und GovCon-Landschaft kontinuierlich im Blick zu haben — ohne dass jedes Mal neu recherchiert werden muss.

---

## 1. WÖCHENTLICHE ROUTINEN

### 1.1 SaaS-Competitor Intelligence (Montag, 30 Min)

**Produkte zu beobachten:**

| Competitor | Was checken | Quelle |
|---|---|---|
| **GovWin IQ (Deltek)** | Blog, Press Releases, neue Features | govwin.com/blog + deltek.com/news |
| **Sweetspot** | Product Updates, LinkedIn | sweetspot.io + LinkedIn Company Page |
| **GovDash** | Changelog, Blog, Twitter/X | govdash.com |
| **CLEATUS.ai** | New features, Pricing changes | cleatus.ai |
| **SamSearch** | Landing page changes, Pricing | samsearch.co |
| **HigherGov** | Blog, Feature announcements | highergov.com/blog |
| **GovTribe** | MCP Server updates, Product blog | govtribe.com |
| **BidPrime** | SLED focus news | bidprime.com |
| **Govly** | Product updates | govly.com |
| **EZGovOpps** | Pricing, new Analyst notes | ezgovopps.com |

**Konkrete Fragen bei jedem Check:**
- Neue Pricing-Seite oder Tier hinzugefügt?
- Neues AI-Feature angekündigt oder gelauncht?
- Blog-Post/Whitepaper zu einem Thema, das wir auch bearbeiten?
- Kundenstimmen/Case Studies, die Schwachstellen aufzeigen?
- LinkedIn Ads laufend? (Spyfu / LinkedIn Ad Library checken)

**Output**: 3-5 Bullet Points in `COMPETITOR_WEEKLY_LOG.md` eintragen (Datum + Finding).

---

### 1.2 Agency-Competitor Intelligence (Dienstag, 30 Min)

**Agenturen zu beobachten:**

| Person / Agentur | Primärer Kanal | Was checken |
|---|---|---|
| **Neil McDonnell (GovCon Chamber)** | LinkedIn Live täglich | Neue Themen, audience reactions, was resoniert |
| **Eric Coffie (GovCon Giants)** | YouTube + Podcast | Neue Videos, views, Kommentare — was fragt die community? |
| **Josh Frank (RSM Federal)** | Podcast "Game Changers" + LinkedIn | Neue Episodes, Themen, Whitepaper |
| **Hinz Consulting** | Hinzsight Newsletter (Beehiiv) | Newsletter-Themen, neue Case Studies |
| **Lohfeld Consulting** | Newsletter "eBrief" + YouTube | Capture Tips, neue Webinare |
| **Shipley Associates** | Blog + Training Ankündigungen | Neue Trainings, AI-in-proposals content |
| **Red Team Consulting** | Website, LinkedIn | Win-rate Claims, neue Whitepapers |
| **GDI Consulting** | BidCasts YouTube + Blog | OASIS+ Updates, win metrics |
| **FedBiz Access (Bobby Testa)** | Podcast "FedBiz'5" + LinkedIn | Zertifizierungs-Updates, neue Epis |
| **Koprince / SmallGovCon** | Blog RSS | Neue Rechtsfragen (SBA, GAO, FAR) |

**Konkrete Fragen bei jedem Check:**
- Neues Whitepaper oder Lead Magnet veröffentlicht?
- LinkedIn-Post mit >500 Likes? Was ist das Thema?
- Neues Webinar oder Live-Event angekündigt?
- Preisänderungen oder neue Services?
- Wird ein Thema mehrfach von verschiedenen Agenturen aufgegriffen? (= Signal für heißes Thema)

**Output**: Wichtige Findings in `COMPETITOR_WEEKLY_LOG.md`, starke Posts oder Content-Ideen in `CONTENT_IDEAS.md` notieren.

---

### 1.3 GovCon Market Intelligence (Mittwoch, 20 Min)

**Quellen für wöchentliche Markt-Neuigkeiten:**

| Quelle | URL | Was lesen |
|---|---|---|
| Federal News Network | federalnewsnetwork.com | Procurement-News, Agentur-Budgets |
| Government Executive | govexec.com | Politische Entwicklungen, Contracting-Regeln |
| Washington Technology | washingtontechnology.com | Top 100 GovCon Rankings, M&A News |
| Defense Daily | defensedaily.com | DoD-Ausschreibungen, Defense Budget |
| SmallGovCon Blog | smallgovcon.com | SBA-Regelungen, GAO-Proteste, 8(a)/SDVOSB-Recht |
| GAO Bid Protest Decisions | gao.gov/legal/bid-protests | Neue Proteste der Woche |
| SAM.gov (direkt) | sam.gov | Trending NAICS, große Ausschreibungen >$10M |
| SBA News | sba.gov/about-sba/sba-newsroom | VetCert Updates, 8(a) Änderungen, HUBZone |

**Konkrete Fragen:**
- Neue FAR/DFARS-Änderungen, die unsere User betreffen?
- Neue SBA-Regeln für SDVOSB/VOSB (besonders VetCert)?
- Große Agentur-Ausschreibungen ($50M+) in unseren Kern-NAICS?
- PE-Deals oder M&A in der GovCon-Consulting-Branche?
- Congress-Appropriations-News (Budget Freeze, CR, etc.)?

**Output**: Weekly Market Brief als kurze Zusammenfassung (5 Bullets max) — kann direkt als LinkedIn-Post für Andre oder Sergio verwendet werden.

---

### 1.4 Tech & AI Intelligence (Donnerstag, 20 Min)

**Relevant für CapturePilot-Produktentwicklung:**

| Thema | Quelle | Relevanz |
|---|---|---|
| OpenAI Updates | platform.openai.com/docs/changelog | GPT-4o-mini Pricing, neue Modelle |
| Anthropic / Claude | anthropic.com/news | Claude-Updates, MCP-Erweiterungen |
| DeepSeek | deepseek.com | Günstigere LLM-Alternativen |
| Supabase Updates | supabase.com/blog | Neue Postgres-Features, Performance |
| Vercel Updates | vercel.com/changelog | Serverless Limits, Cron-Änderungen |
| SAM.gov API Changelog | open.gsa.gov/api/opportunities2/ | API-Änderungen, neue Endpoints |
| USASpending.gov | usaspending.gov/about | Neue Endpoints, Datenverfügbarkeit |
| AI in GovCon | governmentciomedia.com | AI-Adoption im Federal Procurement |

**Output**: Alles Relevante direkt in `FEATURE_IDEAS.md` oder `B2G_FREE_TOOLS_RESEARCH.md` ergänzen.

---

## 2. MONATLICHE ROUTINEN (1× pro Monat)

### 2.1 Vollständiger Competitor Content Audit (1. Montag des Monats)

Für jeden der Top-10-Wettbewerber:
- Alle neuen Blog-Posts des letzten Monats (Titel + Thema notieren)
- Neue Whitepapers, Guides, Lead Magnets (herunterladen + archivieren)
- LinkedIn-Follower-Zahl notieren (Wachstum tracken)
- YouTube: Neue Videos + Views des letzten Monats
- Podcast: Neue Episoden + Themen

**Speicherort**: `docs/MONTHLY_COMPETITOR_AUDIT_[MONAT].md`

---

### 2.2 Keyword & SEO Ranking Check

Für beide Seiten (CapturePilot.com + Americurial.com):
- Google Search Console: Top-Queries, Impressions, Click-Through
- Ahrefs/Semrush Alternativ: Ubersuggest (kostenlos) für Keyword-Rankings
- Wichtige Keywords zu tracken:
  - "SDVOSB federal contracting"
  - "veteran owned business federal contracts"
  - "GovCon capture management software"
  - "SAM.gov opportunity tracker"
  - "federal proposal writing tool"
  - "govwin alternative"
  - "VetCert certification 2026"
  - "SDVOSB set aside"
  - "B2G SaaS"

**Output**: Ranking-Tabelle aktualisieren in `docs/SEO_TRACKING.md`

---

### 2.3 Pricing & Positioning Check aller Competitors

1× monatlich alle Competitor-Pricing-Seiten besuchen:
- Hat sich ein Preis geändert?
- Neue Tier hinzugekommen?
- Wer hat Pricing transparent gemacht (oder versteckt)?
- Neue Rabatt-Aktionen oder Trial-Angebote?

**Besondere Aufmerksamkeit**: RSM Federal ($199–$249/mo), GovTribe (Pricing-Änderungen), SamSearch

---

### 2.4 Federal Budget & Spending Intelligence

Monatlich:
- USASpending.gov: Top-Agenturen nach SDVOSB-Ausschreibungen (letzte 30 Tage)
- SAM.gov: Neue Opportunities >$500K in unseren Kern-NAICS (541511, 541519, 541512, 561110)
- VA OSDBU: Neue Veteran-Contracting-Events
- SBA: Neue 8(a)-Firmen, HUBZone-Änderungen
- TargetGov-Nachfolger: Was übernimmt Gloria Larkins Klientenbuch?

---

### 2.5 LinkedIn Analytics Review

Für **Andre** (CapturePilot) und **Sergio** (Americurial):
- Welche Posts hatten die meisten Impressions? Warum?
- Follower-Wachstum: Auf Kurs für +X/Monat?
- Engagement Rate: Ziel >3% (gut für B2B LinkedIn)
- Welche Content-Formate performen am besten? (Text, Karussell, Video, Poll)
- Top-3-Posts des Monats → Repurposieren oder Tiefer Dive

---

## 3. QUARTALSWEISE ROUTINEN

### 3.1 Vollständige Competitive Landscape Review

Alle 3 Monate:
- `COMPETITIVE_ANALYSIS.md` + `AGENCY_COMPETITIVE_ANALYSIS.md` updaten
- Neue Marktteilnehmer (Startups, neue AI-Tools)?
- PE/M&A-Aktivitäten (Konsolidierungen)?
- Welche Competitors haben sich verändert (Aufstieg/Abstieg)?
- Gibt es neue Nischen oder Whitespace, die wir ansprechen könnten?

---

### 3.2 Feature Gap Analysis

- `B2G_FREE_TOOLS_RESEARCH.md` updaten: Neue freie APIs oder Tools?
- Welche Features haben Competitors gelauncht, die wir noch nicht haben?
- Sprint-Backlog in `ACTION_PLAN_2026-04-17.md` mit aktuellem Stand abgleichen
- Migration-Nummerierung updaten (aktuell: 041 → nächste freie Nummer prüfen)

---

### 3.3 Metrics Review vs. Targets

Aus dem Action Plan (§8) die Ziele prüfen:
- Americurial MRR (Ziel M3: $12K)
- CapturePilot MRR (Ziel M3: $10K)
- Free Signups/Woche (Ziel M3: 150)
- CapturePilot Opportunity DB (Ziel: 50K+)
- Discovery Calls/Woche (Ziel M3: 20)

---

## 4. LEAD-MAGNET & RESEARCH HARVEST

### 4.1 Prioritätsliste zum Herunterladen (einmalig, dann archivieren)

**Sofort (noch nicht getan):**
- [ ] OST Global Solutions: Bid/No Bid Calculator (8K+ Downloads — Benchmark-Analyse)
- [ ] Shipley 2025 Training Scorecard (öffentlich, ungegated)
- [ ] Winvale "Essential GSA Schedule Guide" (email-gated)
- [ ] Hinzsight Newsletter (Beehiiv abonnieren)
- [ ] RSM Federal: Kostenloser Government Sales Training Course (aufrufen, analysieren)
- [ ] Redstone GCI: DCAA Audit Checklist (Whitepaper)
- [ ] Eric Coffie: "Billion Dollar Playbook" + "GOVCON LAUNCH" (Amazon)
- [ ] Josh Frank: "Insider's Guide to Winning Government Contracts" (Amazon #1 Bestseller)

**Ziel**: Verstehen, welche Lead-Magnets im Markt funktionieren → eigene erstellen, die besser sind

---

### 4.2 Content-Quellen abonnieren (einmalig, dann automatisch)

- [ ] SmallGovCon.com → RSS-Feed in Feedly/Readwise
- [ ] FedBiz'5 Podcast → Apple Podcasts / Spotify
- [ ] GovCon Giants YouTube → Kanal abonnieren (Eric Coffie)
- [ ] Neil McDonnell LinkedIn → Vernetzen + Benachrichtigungen an
- [ ] Game Changers Podcast (Josh Frank) → abonnieren
- [ ] Lohfeld YouTube → Kanal abonnieren
- [ ] Federal News Network Newsletter → abonnieren
- [ ] Washington Technology Top 100 → Jahres-Alert

---

## 5. SPEZIAL-WATCHES

### 5.1 TargetGov Closing Watch
Gloria Larkin schließt TargetGov 2026 (gesundheitliche Gründe, 28-jährige Firma). Deren SMB/8(a)-Klientenbuch wird frei.
- **Action**: LinkedIn-Kontakt zu TargetGov-Alumni aufbauen
- **Watch**: Kundenliste / ehemalige Mitarbeiter → potenzielle Americurial-Kunden

### 5.2 PE Rollup Watch
Lohfeld (Petra Capital + Patriot), Shipley (PE), AOC → Tyto Athene, Left Brain → Stambaugh Ness.
- **Was heißt das**: Unabhängige Alternative-Positioning wird wichtiger
- **Watch**: Welche unabhängigen Boutique-Agenturen kommen als nächstes unter Druck?

### 5.3 AI in GovCon Watch
Jede Woche gibt es neue AI-Proposal-Tools. Signal: wann AI-Proposals für Evaluatoren erkennbar werden → Regeländerung möglich.
- **Watch**: DoD DFARS-Änderungen zu AI-generierten Proposals
- **Watch**: GAO-Protests wegen AI-Proposals (Präzedenzfall-Bildung)

---

## 6. FILE-STRUKTUR für Ongoing Intelligence

Folgende Dateien anlegen und pflegen:

```
Caturepilot 2.0/
├── INTELLIGENCE_OPERATIONS.md    ← dieses Dokument
├── COMPETITIVE_ANALYSIS.md       ← SaaS Competitors (quartalsweise update)
├── AGENCY_COMPETITIVE_ANALYSIS.md ← Agency Competitors (quartalsweise update)
├── ACTION_PLAN_2026-04-17.md     ← Strategischer Plan (monatlich reviewen)
├── B2G_FREE_TOOLS_RESEARCH.md    ← API & Tool Research
│
├── docs/                         ← NEU: Laufende Log-Dateien
│   ├── COMPETITOR_WEEKLY_LOG.md  ← Wöchentliche Findings
│   ├── CONTENT_IDEAS.md          ← Ideen aus Competitor-Research
│   ├── FEATURE_IDEAS.md          ← Produkt-Feature Inspirationen
│   ├── SEO_TRACKING.md           ← Keyword-Rankings
│   └── MONTHLY_COMPETITOR_AUDIT_[MONAT].md
│
└── content/                      ← NEU: Content-Planung
    ├── CONTENT_PLAN_LINKEDIN_INSTAGRAM.md  ← Strategischer Plan
    ├── POSTS_ANDRE/              ← Fertige Posts (CapturePilot/Software)
    └── POSTS_SERGIO/             ← Fertige Posts (Americurial/Agency)
```

---

## 7. TOOLS & RESSOURCEN FÜR DIE INTELLIGENCE-ARBEIT

| Tool | Zweck | Kosten |
|---|---|---|
| **Feedly / Readwise Reader** | RSS-Feeds (SmallGovCon, FedNews etc.) | Kostenlos |
| **Google Alerts** | "CapturePilot" + "SDVOSB contracting software" + "govcon AI" | Kostenlos |
| **LinkedIn Sales Navigator** (optional) | Competitor-Mitarbeiter tracken | ~$100/mo |
| **LinkedIn Ad Library** | Competitor-Anzeigen analysieren | Kostenlos |
| **Ubersuggest / Ahrefs** | SEO + Keyword-Tracking | $29–$99/mo |
| **SimilarWeb** (Freemium) | Competitor-Traffic-Analyse | Kostenlos (limitiert) |
| **Wayback Machine** | Competitor-Landing-Page-Verlauf | Kostenlos |
| **Apollo.io** (bereits integriert) | Prospect-Daten | Bereits vorhanden |
| **Google Search Console** | Eigene SEO-Daten | Kostenlos (verbinden!) |

---

*Nächste Review: 2026-05-22 — alle Logs und Targets mit realen Zahlen befüllen.*

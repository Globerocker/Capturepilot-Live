# Federal Set-Aside Certifications & Security Clearances Reference

A working reference for CapturePilot covering every set-aside certification and security clearance commonly required by federal opportunities, with the data points a sales rep or capture manager actually needs: who qualifies, how to get it, how long it takes, what it costs, and which NAICS codes lean on it.

This document was assembled from primary government sources (SBA.gov, Cornell LII / eCFR, acquisition.gov, DCSA via ClearanceJobs reporting on DCSA quarterly metrics) and verified against 2025-2026 data. Citations are inline. **Where 2025-2026 data is rapidly changing (CMMC rollout, Trusted Workforce 2.0 timelines, SBA size standards rulemaking) the entries call out the as-of date explicitly.**

---

## How to use this in HubSpot

This reference is built to drop straight into HubSpot custom properties without re-typing values.

- **`dropdown_key`** is the recommended internal value for HubSpot's multi-select property (ALL_CAPS_SNAKE_CASE, stable across renames).
- **`display label`** is what your team and contacts see in the UI.
- Recommended HubSpot custom property names:
  - `sba_certifications` — multi-select, populated from the certifications table
  - `security_clearances` — multi-select, populated from the clearances table

### CSV snippet — paste into HubSpot property options

`sba_certifications`:
```csv
internal_value,display_label
SBA_SMALL_BUSINESS,SBA Small Business
EIGHT_A,8(a) Business Development
TRIBAL_8A,Tribally-Owned 8(a)
ANC_8A,ANC (Alaska Native Corporation) 8(a)
NHO_8A,NHO (Native Hawaiian Organization) 8(a)
NATIVE_AMERICAN_OWNED,Native American / Indian-Owned
HUBZONE,HUBZone
WOSB,Women-Owned Small Business (WOSB)
EDWOSB,Economically Disadvantaged WOSB (EDWOSB)
SDVOSB,Service-Disabled Veteran-Owned Small Business (SDVOSB)
VOSB,Veteran-Owned Small Business (VOSB)
SDB,Small Disadvantaged Business (SDB)
MENTOR_PROTEGE,SBA Mentor-Protégé Program
MBE_STATE,Minority Business Enterprise (state-level)
DBE,Disadvantaged Business Enterprise (DOT)
HISTORICALLY_BLACK_COLLEGE,HBCU / Minority Institution
```

`security_clearances`:
```csv
internal_value,display_label
PUBLIC_TRUST,Public Trust
CONFIDENTIAL,Confidential
SECRET,Secret
TOP_SECRET,Top Secret
TS_SCI,Top Secret / SCI
Q_CLEARANCE,Q Clearance (DOE)
L_CLEARANCE,L Clearance (DOE)
FCL,Facility Clearance (FCL)
CMMC_L1_SELF,CMMC Level 1 (Self-Assessment)
CMMC_L2_SELF,CMMC Level 2 (Self-Assessment)
CMMC_L2_C3PAO,CMMC Level 2 (C3PAO Certified)
CMMC_L3_DIBCAC,CMMC Level 3 (DIBCAC Assessed)
CUI_HANDLING,CUI Handling Certification
NACI,NACI Background Check
TIER_1,Tier 1 Investigation
TIER_2,Tier 2 Investigation
TIER_3,Tier 3 (Secret) Investigation
TIER_4,Tier 4 Investigation
TIER_5,Tier 5 (Top Secret) Investigation
STATE_LE_BACKGROUND,State Law Enforcement Background
```

---

# Part A — Set-Aside Certifications

## SBA Small Business (baseline)

1. **What it is** — Not a "certification" in the formal sense; it's a self-attested status in SAM.gov that a business meets the SBA size standard for its primary NAICS code.
2. **Who qualifies** — Any business whose size (employees or average annual receipts, **including all subsidiaries and affiliates**) falls below the SBA size standard for the relevant NAICS code. ([SBA Table of Size Standards](https://www.sba.gov/document/support-table-size-standards))
3. **Application process** —
   1. Register at [SAM.gov](https://sam.gov) (free, requires Login.gov, UEI, CAGE).
   2. Select primary and secondary NAICS codes during registration.
   3. SAM.gov auto-evaluates size status against the current SBA Table of Size Standards.
   4. **Must update SAM registration to refresh small business status after any size-standard change.** ([SBA.gov](https://www.sba.gov/document/support-table-size-standards))
4. **Timeline** — Fastest: 3 business days. Typical: 7-14 days. Worst: 4-6 weeks if entity validation flags.
5. **Cost** — $0 government fee. Beware of paid "SAM registration" scams.
6. **Renewal** — Annual SAM.gov re-registration; immediate update required if size, NAICS, or ownership changes.
7. **Best-fit company types** — Every small contractor; foundational requirement before any other set-aside.
8. **Top set-aside NAICS** — 541512 (Computer Systems Design), 541330 (Engineering Services), 236220 (Commercial Building Construction), 561210 (Facilities Support), 561720 (Janitorial Services).
9. **Common rejection reasons** — Affiliate revenue/employees pushing the firm over the size cap (the most common single error), CAGE/entity validation mismatches with IRS records.
10. **When it's NOT worth pursuing** — N/A — required baseline for federal contracting.
11. **HubSpot** — `SBA_SMALL_BUSINESS` / "SBA Small Business"

> **Size standards in flux (2025-2026):** The currently effective SBA Table of Size Standards is the version effective **March 17, 2023**, document page last updated **December 26, 2024**. A **proposed rule published August 22, 2025 (RIN 3245-AI12)** would revise 263 monetary-based size standards; as of writing it has not been finalized, so the March 2023 table remains the operative reference. ([SBA.gov](https://www.sba.gov/document/support-table-size-standards))

---

## 8(a) Business Development

1. **What it is** — A nine-year SBA program providing sole-source contracts (up to $4.5M services / $7M manufacturing) and bid preference to firms owned by socially and economically disadvantaged individuals.
2. **Who qualifies** — At least 51% owned and controlled by U.S. citizens who are socially AND economically disadvantaged; personal net worth < $850K, AGI ≤ $400K (3-year avg), assets ≤ $6.5M; firm must demonstrate two years in business (with limited waivers); good character; potential for success.
3. **Application process** —
   1. Active SAM.gov registration.
   2. Apply via [MySBA Certifications](https://certifications.sba.gov/).
   3. Upload narrative of social disadvantage, financial statements, tax returns (personal + business 3 yr), bank statements, ownership/control documentation.
   4. SBA review and approval.
4. **Timeline** — Fastest: 90 days. Typical: 4-6 months. Worst: 9-12 months with deficiencies.
5. **Cost** — $0 government fee. Consultants typically charge $5K-$25K.
6. **Renewal** — Annual review; full program term is one-time nine-year arc (no second 8(a) bite for the same individual).
7. **Best-fit company types** — Service firms with $1M-$30M revenue capable of growth; minority-owned consulting, IT services, construction, professional services.
8. **Top set-aside NAICS** — 541512 (IT Systems Design), 541330 (Engineering), 561210 (Facilities Support), 236220 (Construction), 541611 (Admin Mgmt Consulting).
9. **Common rejection reasons** — Weak social disadvantage narrative (especially for non-presumed groups), spouse/family financials pushing over net worth cap, affiliation with non-disadvantaged firms.
10. **When it's NOT worth pursuing** — If owner is approaching retirement (full 9-year program), already > $850K net worth, or in a NAICS with little 8(a) set-aside activity (most manufacturing, retail).
11. **HubSpot** — `EIGHT_A` / "8(a) Business Development"

---

## Tribally-Owned 8(a)

1. **What it is** — 8(a) program participation by a firm owned by a federally recognized Tribe; the Tribe (not an individual) holds the disadvantaged status.
2. **Who qualifies** — Tribe must **unconditionally own at least 51% of voting stock and 51% of the aggregate of all classes of stock** in the corporate entity. ([13 CFR 124.109](https://www.law.cornell.edu/cfr/text/13/124.109)) Tribe must control board.
3. **Application process** — Same MySBA Certifications portal as standard 8(a); additional documentation of Tribe's federal recognition and ownership structure.
4. **Timeline** — Typically 4-8 months.
5. **Cost** — $0 government fee.
6. **Renewal** — Annual review within the nine-year program.
7. **Best-fit company types** — Tribally-owned holding companies; entities serving federal facilities/IT/construction/professional services markets. Unlimited sole-source contract value above the standard 8(a) caps.
8. **Top set-aside NAICS** — 541512, 541330, 561210, 236220, 541611.
9. **Common rejection reasons** — Same primary NAICS as another Tribe-owned 8(a) firm (**"A Tribe may not own 51% or more of another firm which has been operating in the 8(a) program under the same primary NAICS code as the applicant"** — [13 CFR 124.109](https://www.law.cornell.edu/cfr/text/13/124.109)); follow-on sole-source from another sister-firm prohibited.
10. **Critical pitfalls** —
    - **Two-in-pool management cap**: Individuals responsible for management and daily operations cannot manage more than two Program Participants at the same time. ([13 CFR 124.109](https://www.law.cornell.edu/cfr/text/13/124.109))
    - **No sister-firm follow-on**: A tribally-owned 8(a) firm cannot receive a sole-source 8(a) follow-on contract previously performed by another Participant owned by the same Tribe. ([13 CFR 124.109](https://www.law.cornell.edu/cfr/text/13/124.109))
11. **HubSpot** — `TRIBAL_8A` / "Tribally-Owned 8(a)"

---

## ANC (Alaska Native Corporation) 8(a)

1. **What it is** — 8(a) program participation by a firm owned by an Alaska Native Corporation under the Alaska Native Claims Settlement Act.
2. **Who qualifies** — ANC (or wholly-owned subsidiary) holds at least 51% ownership; ANC is the disadvantaged entity.
3. **Application process** — Apply via [MySBA Certifications](https://certifications.sba.gov/); supply ANCSA documentation, ANC ownership chain, financials.
4. **Timeline** — 4-8 months.
5. **Cost** — $0 government fee.
6. **Renewal** — Annual; nine-year program term per Participant entity.
7. **Best-fit company types** — ANC subsidiaries pursuing large federal facility, IT, construction, logistics programs. Unlimited sole-source contract value.
8. **Top set-aside NAICS** — Same as tribally-owned 8(a).
9. **Common rejection reasons** — Same-primary-NAICS overlap with another ANC sister-firm; weak control documentation.
10. **Critical pitfall** — Same two-in-pool management cap and no sister-firm follow-on rules as Tribally-Owned 8(a). ([13 CFR 124.109](https://www.law.cornell.edu/cfr/text/13/124.109))
11. **HubSpot** — `ANC_8A` / "ANC (Alaska Native Corporation) 8(a)"

---

## NHO (Native Hawaiian Organization) 8(a)

1. **What it is** — 8(a) program participation by a firm owned by a Native Hawaiian Organization; the NHO is the disadvantaged entity.
2. **Who qualifies** — NHO must **unconditionally own at least 51% of voting stock and 51% of aggregate stock** (or 51% interest for non-corporate entities); NHO must **control the board of directors, managing members, managers or managing partners**. ([13 CFR 124.110](https://www.law.cornell.edu/cfr/text/13/124.110))
3. **Application process** — MySBA Certifications + NHO charter, ownership/control documentation.
4. **Timeline** — 4-8 months.
5. **Cost** — $0 government fee.
6. **Renewal** — Annual; nine-year program term per Participant.
7. **Best-fit company types** — NHO portfolio companies; same federal contracting verticals as ANC/Tribal — large IT, construction, facilities, logistics.
8. **Top set-aside NAICS** — Same as tribally-owned 8(a).
9. **Common rejection reasons** — Same-primary-NAICS overlap with another NHO-owned 8(a) firm within the previous two years.
10. **Critical pitfalls / key advantages** —
    - **No individual disadvantage test**: "An individual responsible for the day-to-day management of an NHO-owned firm need not establish personal social and economic disadvantage." ([13 CFR 124.110](https://www.law.cornell.edu/cfr/text/13/124.110))
    - **No full-time devotion**: "The full-time devotion requirement does not apply to NHO-owned applicants and Participants." ([13 CFR 124.110](https://www.law.cornell.edu/cfr/text/13/124.110)) (Same individual may manage up to two NHO-owned 8(a) firms.)
    - **NAICS cap**: "An NHO cannot own 51% or more of another firm operating under the same primary NAICS code in the 8(a) program within the previous two years." ([13 CFR 124.110](https://www.law.cornell.edu/cfr/text/13/124.110)) — major portfolio pitfall.
11. **HubSpot** — `NHO_8A` / "NHO (Native Hawaiian Organization) 8(a)"

---

## Native American / Indian-Owned (non-8(a))

1. **What it is** — A SAM.gov self-attestation flag indicating ≥51% ownership by an enrolled member of a federally or state recognized tribe; not a federal set-aside on its own but qualifies for many state/agency preferences and DOE Indian Energy programs.
2. **Who qualifies** — Documented tribal enrollment of majority owner.
3. **Application process** — Self-identify in SAM.gov; some states (e.g., NM, AZ, OK) maintain a registry. BIA can issue certification letters.
4. **Timeline** — Same as SAM registration (1-4 weeks).
5. **Cost** — $0.
6. **Renewal** — Annual with SAM.
7. **Best-fit company types** — Sole-proprietor and small native-owned firms pursuing tribal-set-aside spending channels and state preferences.
8. **Top set-aside NAICS** — 236220, 541330, 562910 (Remediation), 237110 (Water/Sewer), 561210.
9. **Common rejection reasons** — N/A self-attest; misrepresentation is False Claims Act risk.
10. **When it's NOT worth pursuing** — If 8(a) pathway is open, that's almost always higher leverage.
11. **HubSpot** — `NATIVE_AMERICAN_OWNED` / "Native American / Indian-Owned"

---

## HUBZone

1. **What it is** — SBA program reserving contracts for small businesses headquartered in Historically Underutilized Business Zones, with a federal-wide goal of **at least 3% of federal contract dollars** annually. ([SBA.gov](https://www.sba.gov/federal-contracting/contracting-assistance-programs/hubzone-program))
2. **Who qualifies** —
   - Small business per SBA size standard
   - **At least 51% owned and controlled by U.S. citizens, a Community Development Corporation, an agricultural cooperative, an Alaska Native corporation, a Native Hawaiian organization, or an Indian tribe** ([SBA.gov](https://www.sba.gov/federal-contracting/contracting-assistance-programs/hubzone-program))
   - **Principal office located in a HUBZone**
   - **At least 35% of employees reside in a HUBZone** ([SBA.gov](https://www.sba.gov/federal-contracting/contracting-assistance-programs/hubzone-program))
3. **Application process** —
   1. Check address eligibility at [SBA HUBZone Map](https://maps.certify.sba.gov/hubzone/map).
   2. Active SAM.gov registration.
   3. Apply via [MySBA Certifications](https://certifications.sba.gov/) — upload payroll, employee residency proofs, lease/deed for principal office, ownership docs.
4. **Timeline** — Fastest: 60 days. Typical: 90-120 days. Worst: 6+ months if employee residency documentation is weak.
5. **Cost** — $0 government fee. Consultants $3K-$15K.
6. **Renewal** — **Annual recertification** + program examinations every three years. The 2025 SBA Final Rule (effective Jan 16, 2025) tightened principal-office rules: no virtual offices, deed/lease must commence ≥30 days before review and extend ≥60 days after.
7. **Best-fit company types** — Construction, facilities, IT services, professional services firms that can place their HQ in a HUBZone and recruit residents.
8. **Top set-aside NAICS** — 236220 (Construction), 541330 (Engineering), 561210 (Facilities), 561720 (Janitorial), 541512 (IT Systems Design).
9. **Common rejection reasons** — Employee residency drops below 35% (most common ongoing failure); principal office in a non-HUBZone tract after the map updates; affiliate size pushing firm over size standard.
10. **Key benefit** — **10% price evaluation preference in full and open contract competitions** ([SBA.gov](https://www.sba.gov/federal-contracting/contracting-assistance-programs/hubzone-program); [FAR 19.1307](https://www.acquisition.gov/far/19.1307)). Does NOT apply to A/E, GSA Schedules, or already-reserved multiple-award solicitations.
11. **When it's NOT worth pursuing** — High-wage urban firms whose workforce won't relocate; firms unwilling to lock long-term lease in a designated zone.
12. **HubSpot** — `HUBZONE` / "HUBZone"

---

## WOSB — Women-Owned Small Business

1. **What it is** — A federal set-aside for small businesses majority-owned and controlled by women, used in NAICS codes where SBA has determined women are underrepresented.
2. **Who qualifies** — **"At least 51% owned and controlled by women who are U.S. citizens"** and **"women manage day-to-day operations who also make long-term decisions."** ([SBA.gov WOSB](https://www.sba.gov/federal-contracting/contracting-assistance-programs/women-owned-small-business-federal-contract-program)) Must meet size standard for primary NAICS. ([13 CFR 127.201](https://www.ecfr.gov/current/title-13/chapter-I/part-127))
3. **Application process** —
   1. Active SAM.gov registration.
   2. Apply via [MySBA Certifications](https://certifications.sba.gov/) (primary path), **or** through one of the four SBA-approved third-party certifiers and upload documentation to MySBA. ([SBA.gov WOSB](https://www.sba.gov/federal-contracting/contracting-assistance-programs/women-owned-small-business-federal-contract-program))
   3. Upload proof of citizenship, birth certificates / passports for all women owners, ownership/control documentation, business formation documents.
   - **Approved TPCs**: El Paso Hispanic Chamber of Commerce, National Women Business Owners Corporation, U.S. Women's Chamber of Commerce, **WBENC** (Women's Business Enterprise National Council).
4. **Timeline** — Fastest: 45 days. Typical: 60-90 days. Worst: 4+ months.
5. **Cost** — $0 government fee via MySBA. TPC fees vary: WBENC ~$350-$1,500 depending on revenue; others $400-$1,200.
6. **Renewal** — Annual attestation; full recertification every three years.
7. **Best-fit company types** — Women-owned firms in services, IT, construction, professional services with $500K-$30M revenue.
8. **Top set-aside NAICS** — 541512 (IT Systems Design), 541611 (Admin Mgmt Consulting), 541330 (Engineering), 561210 (Facilities Support), 561720 (Janitorial).
9. **Common rejection reasons** — Ownership held via trust with non-woman trustee; spouse-control issues; failure to document day-to-day management.
10. **When it's NOT worth pursuing** — If the firm's primary NAICS isn't on the SBA WOSB-eligible list (check eligibility map); if EDWOSB is also achievable, pursue that — it's strictly stronger.
11. **HubSpot** — `WOSB` / "Women-Owned Small Business (WOSB)"

---

## EDWOSB — Economically Disadvantaged WOSB

1. **What it is** — WOSB plus a layer of personal economic disadvantage; unlocks additional NAICS codes (those reserved for EDWOSB only) and EDWOSB sole-source authority.
2. **Who qualifies** — Meets all WOSB criteria PLUS each owning woman has:
   - **Personal net worth < $850,000**
   - **AGI ≤ $400,000 averaged over the previous three years**
   - **Personal assets ≤ $6.5 million** ([SBA.gov WOSB](https://www.sba.gov/federal-contracting/contracting-assistance-programs/women-owned-small-business-federal-contract-program); [13 CFR 127.203](https://www.ecfr.gov/current/title-13/chapter-I/part-127/section-127.203))
3. **Application process** — Same MySBA / TPC path as WOSB; additional personal financial statements, three years of personal tax returns.
4. **Timeline** — Same as WOSB: 60-90 days typical.
5. **Cost** — $0 via MySBA.
6. **Renewal** — Annual attestation including reaffirmation of economic disadvantage; three-year full recertification.
7. **Best-fit company types** — Same NAICS as WOSB plus the EDWOSB-only codes; founders below the personal financial thresholds.
8. **Top set-aside NAICS** — 541330 (Engineering), 541512 (IT Systems), 236220 (Construction), 561210 (Facilities), 541611 (Mgmt Consulting).
9. **Common rejection reasons** — Spousal asset transfer issues, business equity valuation pushing net worth over $850K, retained earnings in S-corp wage history.
10. **When it's NOT worth pursuing** — Owner clearly over the $850K net worth threshold; firm already 8(a) certified (overlap).
11. **HubSpot** — `EDWOSB` / "Economically Disadvantaged WOSB (EDWOSB)"

> **2025 threshold update:** The $850K / $400K / $6.5M figures reflect the SBA rule that raised the prior $750K / $350K / $6M thresholds and aligned EDWOSB with the 8(a) economic disadvantage tests. These figures are current as of 2025-2026. ([SBA.gov WOSB](https://www.sba.gov/federal-contracting/contracting-assistance-programs/women-owned-small-business-federal-contract-program))

---

## SDVOSB — Service-Disabled Veteran-Owned Small Business

1. **What it is** — A government-wide set-aside for small businesses ≥51% owned and controlled by service-disabled veterans; SBA absorbed the VA's CVE program in January 2023, so all SDVOSB certification now flows through SBA.
2. **Who qualifies** — At least 51% owned and controlled by one or more veterans with VA-rated service-connected disability; veteran(s) manage day-to-day operations and hold the highest officer position; firm meets SBA size standard.
3. **Application process** —
   1. Active SAM.gov registration.
   2. Apply via [MySBA Certifications](https://certifications.sba.gov/).
   3. Upload VA disability rating letter (or DoD equivalent), DD-214, ownership/control docs, bylaws.
4. **Timeline** — Fastest: 60 days. Typical: 90-120 days. Worst: 6 months with deficiencies.
5. **Cost** — $0 government fee.
6. **Renewal** — Three-year certification cycle. **Renewal launches in MySBA Certifications on November 1, 2025** with a 90-day window; existing certifications extended through Feb 1, 2026. ([SBA MySBA Certifications](https://certifications.sba.gov/))
7. **Best-fit company types** — Veteran-led IT, construction, professional services, logistics, manufacturing firms.
8. **Top set-aside NAICS** — 541512 (IT Systems), 541330 (Engineering), 236220 (Construction), 561210 (Facilities), 423450 (Medical Equipment Wholesale, for VA contracts).
9. **Common rejection reasons** — Non-veteran controlling officer position; weak operating-agreement language on veteran control; VA disability rating documentation gaps.
10. **When it's NOT worth pursuing** — No veteran owner with adjudicated service-connected disability — pursue plain VOSB instead.
11. **HubSpot** — `SDVOSB` / "Service-Disabled Veteran-Owned Small Business (SDVOSB)"

---

## VOSB — Veteran-Owned Small Business

1. **What it is** — A small business ≥51% owned and controlled by veterans (no disability rating required); used primarily for VA set-asides and as a procurement preference at many state level programs.
2. **Who qualifies** — Veteran ownership/control ≥51%, veteran(s) manage day-to-day, firm meets SBA size standard.
3. **Application process** —
   1. SAM.gov registration.
   2. Apply via [MySBA Certifications](https://certifications.sba.gov/).
   3. Upload DD-214, ownership/control docs.
4. **Timeline** — Typically 60-90 days.
5. **Cost** — $0 government fee.
6. **Renewal** — Three-year cycle. **Renewal launches in MySBA Certifications on November 1, 2025.** ([SBA MySBA Certifications](https://certifications.sba.gov/))
7. **Best-fit company types** — Veteran-led firms targeting VA, GSA, and state preference programs; foundation for SDVOSB if disability rating is later obtained.
8. **Top set-aside NAICS** — Primarily VA-relevant: 339113 (Surgical/Medical Equipment), 423450 (Medical Wholesale), 621498 (Outpatient Care), 541512 (IT for VA), 236220 (Construction for VA facilities).
9. **Common rejection reasons** — Same as SDVOSB minus disability docs.
10. **When it's NOT worth pursuing** — If outside VA-procurement focus and no state-program leverage, value is limited.
11. **HubSpot** — `VOSB` / "Veteran-Owned Small Business (VOSB)"

---

## SDB — Small Disadvantaged Business

1. **What it is** — A self-certification (since 2008) and FAR designation indicating a small business owned by socially and economically disadvantaged individuals; used for the 5% federal SDB goal and price evaluation adjustments on some contracts. 8(a) certified firms are automatically SDB.
2. **Who qualifies** — Same disadvantage tests as 8(a) (presumed groups + individuals proving social disadvantage); ≥51% ownership and control; SBA size standard.
3. **Application process** — Self-certify in SAM.gov (or auto-included once 8(a) certified). True "certification" in MySBA only comes via the 8(a) pathway.
4. **Timeline** — Immediate (self-attest) or 4-6 months via 8(a).
5. **Cost** — $0.
6. **Renewal** — Annual with SAM; aligned with 8(a) if applicable.
7. **Best-fit company types** — Minority-owned firms not yet ready for 8(a) or who want the SDB tag while preparing the 8(a) application.
8. **Top set-aside NAICS** — Same as 8(a).
9. **Common rejection reasons** — N/A for self-cert; False Claims Act exposure if misrepresented.
10. **When it's NOT worth pursuing** — If 8(a) is achievable, go directly there.
11. **HubSpot** — `SDB` / "Small Disadvantaged Business (SDB)"

---

## SBA Mentor-Protégé Program

1. **What it is** — A formal SBA-approved mentoring relationship where a large or mid-size firm provides a small business protégé with technical, financial, contracting, and bonding assistance, and the pair can joint-venture on set-aside contracts without being considered affiliated.
2. **Who qualifies** — Protégé must be SBA-certified small business in its primary NAICS; mentor must be capable of providing assistance and not currently barred from federal contracting.
3. **Application process** —
   1. Both parties register on SAM.gov.
   2. Negotiate mentor-protégé agreement (1-3 month process with legal counsel).
   3. Submit agreement via [MySBA Certifications](https://certifications.sba.gov/).
   4. SBA review and approval; relationship may include equity (up to 40% mentor ownership) without triggering affiliation.
4. **Timeline** — Application review typically 60-90 days post-submission.
5. **Cost** — $0 government fee. Legal drafting of mentor-protégé agreement and JV agreement typically $10K-$40K.
6. **Renewal** — Six-year initial term, renewable for additional three years (nine years total). Annual reporting required.
7. **Best-fit company types** — Small business protégés in growth phase; mentors seeking access to set-aside contract vehicles through JV structures.
8. **Top set-aside NAICS** — IT services, construction, professional services where JV-led pursuit of large set-aside contracts is common.
9. **Common rejection reasons** — Vague developmental assistance plan; mentor lacking demonstrated capability; protégé and mentor in identical NAICS without complementary capabilities.
10. **When it's NOT worth pursuing** — Protégé is too small to support compliance burden; no clear large opportunity to JV on.
11. **HubSpot** — `MENTOR_PROTEGE` / "SBA Mentor-Protégé Program"

---

## MBE — Minority Business Enterprise (state/private level)

1. **What it is** — A non-federal certification (varies by state agency or NMSDC) for minority-owned firms; used for state, municipal, transit, and Fortune 500 supplier-diversity programs.
2. **Who qualifies** — ≥51% owned, operated, and controlled by U.S. citizens of an ethnic/racial minority group as defined by the certifying body (often Black, Hispanic, Asian, Native American, Pacific Islander).
3. **Application process** —
   1. Apply via [NMSDC](https://nmsdc.org/) (national) and/or state agency (e.g., NYS DMWBE, CA Dept of General Services, TX HUB).
   2. Submit ownership docs, tax returns, ethnicity/citizenship documentation, site visit.
4. **Timeline** — 60-120 days typical.
5. **Cost** — NMSDC affiliate fees $350-$1,250; state programs often $0-$400.
6. **Renewal** — Annual recertification.
7. **Best-fit company types** — Minority-owned firms pursuing state procurement, large-utility supplier diversity, transit (FTA-funded) work.
8. **Top NAICS** — 236220, 561210, 541512, 541611, 484110 (Trucking).
9. **Common rejection reasons** — Insufficient operational control documentation; ownership through complex holding structures.
10. **When it's NOT worth pursuing** — Federal-only pursuit (use SDB/8(a) instead).
11. **HubSpot** — `MBE_STATE` / "Minority Business Enterprise (state-level)"

---

## DBE — Disadvantaged Business Enterprise (DOT)

1. **What it is** — USDOT certification for socially and economically disadvantaged small businesses bidding on FHWA, FTA, and FAA-funded contracts at state and local agencies.
2. **Who qualifies** — ≥51% owned and controlled by disadvantaged individuals; owner personal net worth ≤ $1.32M (excluding primary residence and ownership in DBE firm); firm meets SBA size standard adjusted for DOT NAICS.
3. **Application process** —
   1. Apply via your state's Unified Certification Program (UCP), e.g., [Caltrans](https://dot.ca.gov/programs/civil-rights/dbe-certification), [TxDOT](https://www.txdot.gov/business/business-opportunities/dbe.html).
   2. Upload personal financial statement, business tax returns (3 yr), ownership/control docs, resumes, equipment list, signed affidavits.
   3. On-site review by UCP.
4. **Timeline** — Typically 90 days; varies 60-180 days by state.
5. **Cost** — $0 application; legal/consultant support often $2K-$10K.
6. **Renewal** — Annual no-change affidavit; re-evaluation triggered by ownership/size changes.
7. **Best-fit company types** — Construction, engineering, trucking firms with state/local transportation contracts in pipeline.
8. **Top NAICS** — 237310 (Highway, Street, Bridge Construction), 484110 (Trucking), 541330 (Engineering), 238910 (Site Prep), 238210 (Electrical).
9. **Common rejection reasons** — Owner lacks construction industry experience; rented equipment shows another party's name; control exercised by non-disadvantaged spouse/partner.
10. **When it's NOT worth pursuing** — No DOT-funded contracts in pipeline; firm is purely federal direct-prime.
11. **HubSpot** — `DBE` / "Disadvantaged Business Enterprise (DOT)"

---

# Part B — Security & Safety Clearances

## Public Trust

1. **What it is** — A position-of-trust suitability determination (NOT a national security clearance) for federal positions with significant program responsibility or access to systems with sensitive but unclassified data. Issued by the sponsoring agency (OPM-investigated).
2. **Who it's for** — Individual employees of contractors performing on civilian agency contracts touching PII, financial systems, healthcare data.
3. **Process** —
   1. Sponsoring agency or prime contractor initiates.
   2. Employee submits SF-85P (Public Trust) via e-QIP/eApp.
   3. OPM conducts Tier 2 or Tier 4 investigation (depending on risk level: Moderate Risk = T2, High Risk = T4).
   4. Adjudicated by sponsoring agency.
4. **Timeline** — 30-90 days typical post-Trusted-Workforce-2.0; faster than national security tiers.
5. **Cost** — Sponsoring agency pays the investigation; contractor absorbs labor cost of completing forms.
6. **Renewal** — Continuous Vetting under Trusted Workforce 2.0 (no fixed reinvestigation interval for many positions).
7. **Best-fit roles** — IT support, helpdesk, financial systems contractors, HHS/SSA/IRS contract staff.
8. **Top NAICS** — 541512, 541519 (Other Computer Services), 541611, 561110 (Office Admin Services), 524292 (Third-Party Admin Insurance).
9. **Common rejection reasons** — Significant unresolved debt, recent drug use, criminal record.
10. **Sponsorship transfer** — Agency-locked; transferability is limited but reciprocity exists between civilian agencies for the same tier.
11. **HubSpot** — `PUBLIC_TRUST` / "Public Trust"

---

## Confidential

1. **What it is** — Lowest national security clearance level; access to information whose unauthorized disclosure could cause damage to national security. Issued by DCSA (Defense Counterintelligence and Security Agency) for industry.
2. **Who it's for** — Individual contractor employees on contracts with Confidential-level classified work (rare in modern programs; mostly subsumed into Secret).
3. **Process** — SF-86 via DISS/eApp → Tier 3 investigation → DCSA CAS adjudication.
4. **Timeline** — Similar to Secret; commonly bundled.
5. **Cost** — Sponsoring contract / agency pays; contractor absorbs admin time.
6. **Renewal** — Continuous Vetting under Trusted Workforce 2.0; legacy 15-year reinvestigation cycle being phased out.
7. **Best-fit roles** — Niche DoD subcontract roles; uncommon as standalone today.
8. **Top NAICS** — 541330 (Engineering Services), 541715 (Physical Engineering R&D), 336411 (Aircraft Mfg).
9. **Common rejection reasons** — Same as Secret (financial, foreign contacts, drug, criminal).
10. **Sponsorship transfer** — Reciprocity within DoD/IC; contractor must have a Facility Clearance to hold the personnel clearance.
11. **HubSpot** — `CONFIDENTIAL` / "Confidential"

---

## Secret

1. **What it is** — DoD/DCSA national security clearance for access to information whose unauthorized disclosure could cause **serious damage** to national security. Most common federal clearance level.
2. **Who it's for** — Individual contractor employees on classified DoD, IC, DHS contracts.
3. **Process** —
   1. Cleared contractor (with FCL) sponsors the candidate.
   2. SF-86 submitted via DISS / eApp.
   3. Tier 3 investigation by DCSA.
   4. Adjudication by DCSA CAS.
   5. Interim Secret often granted in 1-3 weeks if no flags.
4. **Timeline (Q1 FY2026 DCSA, fastest 90% of industry cases)** — **156 days** for full Secret adjudication. ([ClearanceJobs / DCSA Q1 FY2026](https://news.clearancejobs.com/2026/03/19/how-long-does-it-take-to-get-a-clearance-q1-2026-update/)) Most cases land in **60-150 days**.
5. **Cost** — Sponsoring contract / DCSA pays. Contractor absorbs labor for SF-86 preparation (~$500-$2K internal cost).
6. **Renewal** — **Continuous Vetting** under Trusted Workforce 2.0; legacy 10-year reinvestigation cycle being replaced by ongoing automated record checks. (Historic "5-year reinvestigation" guidance is outdated for cleared individuals enrolled in CV.)
7. **Best-fit roles** — DoD systems engineers, IT contractors, military support services, intelligence community contractors.
8. **Top NAICS** — 541512 (IT Systems Design), 541330 (Engineering), 541715 (Engineering R&D), 541519 (Other Computer Services), 561612 (Security Guards & Patrol).
9. **Common rejection reasons** — Significant unresolved debt, recent drug use (especially marijuana — still a disqualifier despite state legalization), foreign contacts/preference, dishonesty on SF-86.
10. **Sponsorship transfer** — Generally portable via reciprocity once granted, but the cleared individual must be sponsored by a new cleared employer (FCL holder) to remain active; clearance goes "in-active" 24 months after separation from cleared work.
11. **HubSpot** — `SECRET` / "Secret"

---

## Top Secret

1. **What it is** — DCSA national security clearance for information whose unauthorized disclosure could cause **exceptionally grave damage** to national security.
2. **Who it's for** — Senior contractor staff, IC contractors, special programs personnel.
3. **Process** — Same SF-86 path as Secret but a deeper **Tier 5** investigation including expanded subject interview, neighborhood/employment/education checks.
4. **Timeline (Q1 FY2026 DCSA, fastest 90% of industry cases)** — **227 days** ([ClearanceJobs / DCSA Q1 FY2026](https://news.clearancejobs.com/2026/03/19/how-long-does-it-take-to-get-a-clearance-q1-2026-update/)) — significantly improved post-Trusted-Workforce-2.0. Individual cases stretch **120-240 days**.
5. **Cost** — Sponsoring agency / contract pays.
6. **Renewal** — **Continuous Vetting** under Trusted Workforce 2.0 (replacing the historic 5-year reinvestigation for TS).
7. **Best-fit roles** — IC contractors, special access program personnel, senior DoD program managers.
8. **Top NAICS** — 541330 (Engineering), 541512 (IT), 541715 (R&D), 541990 (Other Professional Services), 561621 (Security Systems).
9. **Common rejection reasons** — Same as Secret with elevated scrutiny on foreign contacts, financial issues, lifestyle.
10. **Sponsorship transfer** — Portable via reciprocity, but new FCL-holding sponsor must request crossover via DISS; SCI access is separately granted and not automatically portable.
11. **HubSpot** — `TOP_SECRET` / "Top Secret"

---

## TS/SCI — Top Secret with Sensitive Compartmented Information

1. **What it is** — Top Secret clearance plus indoctrination into one or more SCI compartments controlled by the IC (DNI). May include CI or full-scope polygraph depending on agency.
2. **Who it's for** — IC contractors (CIA, NSA, NRO, NGA, DIA), special programs, signals/HUMINT/imagery analysts.
3. **Process** — TS investigation + agency-specific SCI nomination + CI or FS polygraph (agency-dependent: CIA/NSA = FS poly, DIA = CI poly).
4. **Timeline** — TS portion ~227 days (Q1 FY2026 DCSA 90th-percentile) ([ClearanceJobs / DCSA Q1 FY2026](https://news.clearancejobs.com/2026/03/19/how-long-does-it-take-to-get-a-clearance-q1-2026-update/)) + polygraph scheduling + SCI adjudication. End-to-end typically 8-15 months including poly.
5. **Cost** — Sponsoring agency pays.
6. **Renewal** — Continuous Vetting; periodic polygraph re-administration (typically every 5-7 years agency-dependent).
7. **Best-fit roles** — Cyber operators, intelligence analysts, mission systems engineers at IC agencies.
8. **Top NAICS** — 541512, 541519, 541330, 541715, 541990.
9. **Common rejection reasons** — Same as TS plus polygraph failures (deception indications, admissions during the poly often more damaging than original incident).
10. **Critical pitfall** — **SCI is NOT freely portable** — losing access at one agency and trying to "crossover" to another can take 6-12 months; polygraphs are agency-specific and may not be accepted by the receiving agency.
11. **HubSpot** — `TS_SCI` / "Top Secret / SCI"

---

## Q Clearance (DOE)

1. **What it is** — DOE security clearance equivalent to DoD Top Secret, plus access to Restricted Data (nuclear weapons design info) under the Atomic Energy Act. Governed by DOE Order 472.2.
2. **Who it's for** — Contractors at DOE National Labs (LANL, LLNL, SNL, ORNL, INL, PNNL, etc.) and NNSA sites working on nuclear weapons, naval reactors, or other RD/FRD.
3. **Process** —
   1. DOE contractor sponsors via DOE's clearance system.
   2. SF-86 + Tier 5 (T5) investigation.
   3. DOE adjudication (separate from DCSA).
4. **Timeline** — Comparable to TS (200-250 days for 90th percentile post-TW2.0); reciprocity with DoD TS reduces some elements.
5. **Cost** — DOE/contractor sponsor pays.
6. **Renewal** — DOE Continuous Evaluation Program (aligned with TW2.0); periodic reinvestigation per DOE Order 472.2.
7. **Best-fit roles** — Nuclear scientists, weapons engineers, naval reactor staff, classified physics R&D.
8. **Top NAICS** — 541715 (Physical/Engineering/Life Sciences R&D), 541330 (Engineering), 541713 (Nanotech R&D), 562910 (Remediation — Hanford), 221112 (Fossil Fuel Electric Power — naval reactors).
9. **Common rejection reasons** — Same as TS; DOE applies its own Adjudicative Guidelines per 10 CFR 710.
10. **Sponsorship transfer** — Reciprocal with DoD TS for standard collateral access; RD/FRD access doesn't crossover to non-DOE contracts.
11. **HubSpot** — `Q_CLEARANCE` / "Q Clearance (DOE)"

---

## L Clearance (DOE)

1. **What it is** — DOE clearance equivalent to DoD Secret, with access to Confidential RD/FRD.
2. **Who it's for** — DOE site contractors not requiring Q-level access.
3. **Process** — SF-86 + Tier 3 investigation, DOE adjudication.
4. **Timeline** — Similar to Secret (~150 days for 90th percentile).
5. **Cost** — DOE/contractor pays.
6. **Renewal** — DOE Continuous Evaluation Program.
7. **Best-fit roles** — Site security, facility ops, lower-tier engineering at DOE labs and remediation sites.
8. **Top NAICS** — 562910, 561612, 561210, 541330, 541715.
9. **Common rejection reasons** — Same as Secret.
10. **Sponsorship transfer** — Reciprocal with DoD Secret for collateral access.
11. **HubSpot** — `L_CLEARANCE` / "L Clearance (DOE)"

---

## Facility Clearance (FCL)

1. **What it is** — DCSA-issued company-level clearance authorizing a contractor to access, store, and process classified information. Required before any employee can hold an active personnel clearance for classified contract work.
2. **Who it's for** — The company itself (not an individual).
3. **Process** —
   1. Contractor must be **sponsored** (by a U.S. Government agency or a prime contractor with a classified contract).
   2. Submit DD-441 (DoD Security Agreement) and Key Management Personnel docs.
   3. Foreign Ownership Control & Influence (FOCI) review.
   4. DCSA assigns an Industrial Security Representative; FSO (Facility Security Officer) must be appointed and trained.
   5. NISPOM (32 CFR Part 117) compliance review.
4. **Timeline** — Typically 6-12 months end to end; faster if KMP already cleared.
5. **Cost** — Direct fee: $0 (DCSA-issued). Indirect cost: FSO training, NISP compliance program, GCA approvals — easily $30K-$100K first year for a small firm.
6. **Renewal** — Continuous; periodic security vulnerability assessments by DCSA.
7. **Best-fit company types** — Defense, IC, DOE subcontractors and primes performing classified work.
8. **Top NAICS** — 541512, 541330, 541715, 336411, 541614 (Logistics Consulting).
9. **Common rejection reasons** — Unresolved FOCI (foreign ownership, foreign customer concentration), KMP with adjudication issues, inadequate FSO/insider-threat program.
10. **Critical pitfall** — **FCL cannot be "self-sponsored"** — a contractor MUST have a classified contract requirement or a sponsoring GCA/prime before DCSA will start the FCL process. Many small contractors waste cycle time pursuing FCL without sponsorship.
11. **HubSpot** — `FCL` / "Facility Clearance (FCL)"

---

## CMMC Level 1 (Self-Assessment)

1. **What it is** — Cybersecurity Maturity Model Certification basic-hygiene tier; **15 controls aligned with FAR 52.204-21** for protecting Federal Contract Information (FCI). Self-assessment, no third-party audit.
2. **Who it's for** — Any DoD contractor whose contract handles FCI but not CUI.
3. **Process** — Implement the 15 FAR 52.204-21 safeguards → conduct annual self-assessment → submit affirmation in **SPRS** (Supplier Performance Risk System).
4. **Timeline** — 30-90 days to prepare evidence; submission immediate.
5. **Cost** — Internal labor; typical $5K-$30K for a small firm to implement and document.
6. **Renewal** — **Annual self-assessment + annual affirmation**.
7. **Best-fit company types** — Small DoD subcontractors, professional services not handling CUI.
8. **Top NAICS** — 561720, 561210, 541611, 541614, 561612.
9. **Common rejection reasons** — N/A self-assessed; misrepresentation creates False Claims Act exposure.
10. **Critical pitfall** — Misclassifying CUI as FCI to avoid the higher tier; DoD CO can challenge and require Level 2.
11. **HubSpot** — `CMMC_L1_SELF` / "CMMC Level 1 (Self-Assessment)"

---

## CMMC Level 2 (Self-Assessment)

1. **What it is** — **110 controls of NIST SP 800-171 Rev. 2** for handling CUI; self-assessed where the contracting officer permits.
2. **Who it's for** — DoD contractors handling CUI where the program risk is deemed low enough by the DoD CO for self-assessment.
3. **Process** — Implement 110 NIST 800-171 controls → develop SSP + POA&M → self-assess → submit score in **SPRS** → annual affirmation.
4. **Timeline** — 6-18 months to implement controls and remediate gaps; self-assessment ongoing.
5. **Cost** — $30K-$150K typical implementation + tooling for a small firm.
6. **Renewal** — Self-assessment current within 1 year; annual affirmation.
7. **Best-fit company types** — DoD subs handling CUI on lower-risk contracts.
8. **Top NAICS** — 541512, 541330, 541715, 541611.
9. **Critical pitfall** — DoD can elevate the requirement to Level 2 C3PAO mid-contract; firms should architect to the C3PAO bar so the gap is small.
10. **HubSpot** — `CMMC_L2_SELF` / "CMMC Level 2 (Self-Assessment)"

---

## CMMC Level 2 (C3PAO Certified)

1. **What it is** — Same 110 NIST 800-171 controls as L2 Self, but validated by an accredited **Certified Third-Party Assessor Organization (C3PAO)** under the Cyber AB ecosystem.
2. **Who it's for** — DoD contractors handling CUI on contracts where the CO designates Level 2 C3PAO assessment.
3. **Process** — Full 110-control implementation → SSP + POA&M → engage a C3PAO → on-site or remote assessment → upload Final/Conditional status to SPRS → annual affirmation.
4. **Timeline** — Implementation 12-24 months; assessment 4-8 weeks; certification valid 3 years.
5. **Cost** — **C3PAO assessment commonly $105K-$118K triennial** (small firm; complex environments higher). Internal control implementation cost is additional.
6. **Renewal** — Recertification every 3 years; annual affirmation in SPRS.
7. **Best-fit company types** — Mid-tier DoD primes and major subcontractors handling CUI.
8. **Top NAICS** — 541512, 541330, 541715, 336411, 541614.
9. **Critical pitfall** — Conditional status is valid only 180 days — POA&M must close gaps fast or status reverts.
10. **HubSpot** — `CMMC_L2_C3PAO` / "CMMC Level 2 (C3PAO Certified)"

---

## CMMC Level 3 (DIBCAC Assessed)

1. **What it is** — **110 NIST 800-171 controls + 24 additional NIST SP 800-172 enhanced controls**, assessed by **DCSA's Defense Industrial Base Cybersecurity Assessment Center (DIBCAC)**; required for high-priority programs.
2. **Who it's for** — DoD contractors handling CUI on highest-risk programs (specific named programs by CO).
3. **Process** — Must hold a current Level 2 **C3PAO Final** status as prerequisite → engage DIBCAC for on-site assessment of additional 24 controls → certification + annual affirmation.
4. **Timeline** — DIBCAC scheduling is the bottleneck; 12-24 months end to end.
5. **Cost** — Internal cost to implement 800-172 controls easily $100K-$500K+ for a small firm; DIBCAC assessment itself is no fee but the team must travel/access the contractor.
6. **Renewal** — Certification valid 3 years; annual affirmation.
7. **Best-fit company types** — Defense primes on flagship programs.
8. **Top NAICS** — 336411, 541715, 541330, 541512.
9. **Critical pitfall** — Cannot proceed without Level 2 C3PAO Final; conditional Level 2 does not satisfy.
10. **HubSpot** — `CMMC_L3_DIBCAC` / "CMMC Level 3 (DIBCAC Assessed)"

> **CMMC framework citation:** DFARS 252.204-7021 specifies **four CMMC compliance options** (Level 1 Self, Level 2 Self, Level 2 C3PAO Certified, Level 3 DIBCAC), with the required type designated by the contracting officer in the solicitation. ([Holland & Knight CMMC analysis](https://www.hklaw.com/en/insights/publications/2025/09/cmmc-goes-live-on-november-10-2025); [LegalClarity DFARS 252.204-7021](https://legalclarity.org/dfars-252-204-7021/)) Contractors must "have and maintain for the duration of the contract a current CMMC status" on systems handling FCI/CUI. ([DFARS 252.204-7021](https://www.acquisition.gov/dfars/252.204-7021-contractor-compliance-cybersecurity-maturity-model-certification-level-requirements.)) **Phase 1 CMMC enforcement began November 10, 2025.**

---

## CUI Handling Certification

1. **What it is** — Not a separate certification; refers to compliance with **32 CFR Part 2002** (the CUI Program) and FAR/DFARS clauses requiring NIST 800-171 compliance for CUI. For CapturePilot CRM purposes, treat as "claims NIST 800-171 compliance for CUI handling."
2. **Who it's for** — Any federal contractor processing CUI on its information systems.
3. **Process** — Implement NIST 800-171 → SSP + POA&M → submit score to SPRS (for DoD work) → annual self-assessment. For non-DoD agencies, follow individual agency CUI handling guidance.
4. **Timeline** — 6-18 months implementation typical.
5. **Cost** — $30K-$150K typical small-firm implementation.
6. **Renewal** — Annual review; SPRS scoring kept current.
7. **Best-fit company types** — Civilian agency contractors (DHS, DOJ, HHS, GSA) handling CUI but not DoD.
8. **Top NAICS** — 541512, 541519, 541611, 541330, 541990.
9. **Common rejection reasons** — Failure to encrypt at rest, missing MFA, no incident response plan.
10. **Critical pitfall** — DoD-side compliance must be CMMC-aligned; civilian-side compliance varies and SPRS submission may not satisfy individual civilian agency clauses.
11. **HubSpot** — `CUI_HANDLING` / "CUI Handling Certification"

---

## NACI — National Agency Check with Inquiries

1. **What it is** — A legacy low-level OPM background check; superseded for new investigations by **Tier 1** under the Federal Investigative Standards. Often still referenced in older contract language.
2. **Who it's for** — Non-sensitive, low-risk federal positions and contractors.
3. **Process** — SF-85 form via e-QIP/eApp; OPM/DCSA records check.
4. **Timeline** — 30-60 days.
5. **Cost** — Sponsoring agency pays.
6. **Renewal** — Continuous Vetting where enrolled; otherwise re-run on position change.
7. **Best-fit roles** — Janitorial, building maintenance, food service, support staff at federal facilities.
8. **Top NAICS** — 561720, 561210, 722310 (Food Service Contractors), 561612, 561110.
9. **Common rejection reasons** — Felony convictions, recent serious misdemeanors, undisclosed background issues.
10. **Critical pitfall** — A NACI is NOT a national security clearance and cannot be upgraded directly; if the role evolves to require Secret, full new investigation needed.
11. **HubSpot** — `NACI` / "NACI Background Check"

---

## Tier 1 Investigation

1. **What it is** — Lowest-risk OPM/DCSA investigation under the Federal Investigative Standards; replaces legacy NACI for non-sensitive low-risk positions.
2. **Who it's for** — Low-risk federal employees and contractors.
3. **Process** — SF-85 via eApp.
4. **Timeline** — 30-60 days.
5. **Cost** — Agency-paid.
6. **Renewal** — Continuous Vetting where enrolled.
7. **Best-fit roles** — Janitorial, food service, support at federal sites.
8. **Top NAICS** — 561720, 561210, 722310.
9. **HubSpot** — `TIER_1` / "Tier 1 Investigation"

---

## Tier 2 Investigation

1. **What it is** — Moderate Risk Public Trust investigation.
2. **Who it's for** — Moderate-risk non-national-security positions (often IT support, financial admin at civilian agencies).
3. **Process** — SF-85P via eApp.
4. **Timeline** — 60-90 days.
5. **Cost** — Agency-paid.
6. **Renewal** — Continuous Vetting.
7. **Top NAICS** — 541512, 541611, 561110.
8. **HubSpot** — `TIER_2` / "Tier 2 Investigation"

---

## Tier 3 Investigation (Secret)

1. **What it is** — Non-Critical Sensitive investigation; the standard for **Secret** clearance and Confidential.
2. **Who it's for** — Cleared individuals at Secret level.
3. **Process** — SF-86 via eApp + Tier 3 investigation.
4. **Timeline** — ~156 days (Q1 FY2026, DCSA fastest 90% of industry). ([ClearanceJobs / DCSA Q1 FY2026](https://news.clearancejobs.com/2026/03/19/how-long-does-it-take-to-get-a-clearance-q1-2026-update/))
5. **Cost** — Agency/sponsor pays.
6. **Renewal** — Continuous Vetting.
7. **HubSpot** — `TIER_3` / "Tier 3 (Secret) Investigation"

---

## Tier 4 Investigation

1. **What it is** — High Risk Public Trust investigation.
2. **Who it's for** — High-risk non-national-security positions (e.g., critical IT system admins at civilian agencies).
3. **Process** — SF-85P via eApp + Tier 4 investigation (deeper than T2).
4. **Timeline** — 90-150 days.
5. **Cost** — Agency-paid.
6. **Renewal** — Continuous Vetting.
7. **HubSpot** — `TIER_4` / "Tier 4 Investigation"

---

## Tier 5 Investigation (Top Secret)

1. **What it is** — Critical Sensitive / Special Sensitive investigation; the standard for **Top Secret** and TS/SCI.
2. **Who it's for** — Cleared individuals at TS level.
3. **Process** — SF-86 via eApp + Tier 5 investigation (expanded subject interview, reference interviews, financial/credit review).
4. **Timeline** — ~227 days (Q1 FY2026, DCSA fastest 90% of industry). ([ClearanceJobs / DCSA Q1 FY2026](https://news.clearancejobs.com/2026/03/19/how-long-does-it-take-to-get-a-clearance-q1-2026-update/))
5. **Cost** — Agency/sponsor pays.
6. **Renewal** — Continuous Vetting.
7. **HubSpot** — `TIER_5` / "Tier 5 (Top Secret) Investigation"

---

## State Law Enforcement Background

1. **What it is** — State-level background check (often FBI fingerprint + state agency check) required for contractors performing on state/local justice, education, healthcare, or child-services contracts.
2. **Who it's for** — Individual contractor employees on state-funded contracts touching protected populations or facilities.
3. **Process** — State agency request → fingerprint capture (LiveScan typical) → FBI CJIS check + state criminal history → agency-specific adjudication.
4. **Timeline** — 1-6 weeks typical.
5. **Cost** — $30-$100 per fingerprint set; often passed to contractor.
6. **Renewal** — Varies by state, often annual for staff in schools/childcare; one-time for many other roles.
7. **Best-fit roles** — State/local IT, healthcare, education, justice, transit, child welfare contractors.
8. **Top NAICS** — 541512 (state IT), 611110 (Elementary/Secondary Schools), 621498, 624110 (Child Welfare), 485310 (Taxi/Paratransit).
9. **Common rejection reasons** — Disqualifying convictions per state-specific statutes (often any felony or specific offenses against persons).
10. **HubSpot** — `STATE_LE_BACKGROUND` / "State Law Enforcement Background"

---

# Part C — Cross-Reference Matrix (NAICS → Certs + Clearances)

Read down to find a NAICS family, then read across for the certs and clearances that most often appear in those opportunities. Use this as a quick sales rep heuristic — a single opportunity's RFP language always governs.

| NAICS family | Common certs that win | Common clearances |
|---|---|---|
| **541512 — IT Systems Design** | 8(a), Tribal/ANC/NHO 8(a), HUBZone, WOSB, EDWOSB, SDVOSB | Public Trust, Secret, TS/SCI, CMMC L2 C3PAO |
| **541519 — Other Computer Services** | 8(a), SDVOSB, WOSB | Public Trust, Secret, CMMC L1/L2 |
| **541330 — Engineering Services** | 8(a), HUBZone, WOSB, EDWOSB, SDVOSB, DBE, MBE | Secret, TS, Q Clearance, FCL, CMMC L2/L3 |
| **541715 — Physical/Engineering/Life Sciences R&D** | 8(a), Tribal 8(a), SDVOSB | Secret, TS, Q Clearance, FCL, CMMC L2/L3 |
| **541611 — Admin Mgmt Consulting** | 8(a), WOSB, EDWOSB, MBE | Public Trust, CMMC L1, CUI Handling |
| **236220 — Commercial Building Construction** | 8(a), HUBZone, SDVOSB, WOSB, DBE, Native American Owned | NACI / Tier 1, State LE Background, FCL (for cleared sites) |
| **237310 — Highway/Street/Bridge Construction** | DBE, HUBZone, MBE | State LE Background |
| **561210 — Facilities Support Services** | 8(a), HUBZone, WOSB, SDVOSB | NACI / Tier 1, Public Trust, Secret (cleared sites) |
| **561720 — Janitorial Services** | 8(a), HUBZone, WOSB, Native American Owned | NACI / Tier 1, Secret (rare, cleared sites) |
| **561612 — Security Guards & Patrol** | 8(a), HUBZone, SDVOSB | Secret, TS, State LE Background |
| **336411 — Aircraft Manufacturing** | (Large primes; subcontractor diversity flow-down) | Secret, TS, FCL, CMMC L2 C3PAO / L3 |
| **339113 — Surgical/Medical Equipment** | VOSB, SDVOSB, WOSB, SDB | Public Trust |
| **423450 — Medical Wholesale (VA)** | VOSB, SDVOSB | Public Trust |
| **621498 — Outpatient Care (VA)** | VOSB, SDVOSB, WOSB | Public Trust, State LE Background |
| **484110 — Trucking** | DBE, MBE, SDVOSB | NACI / Tier 1 |
| **562910 — Remediation** | 8(a), Tribal 8(a), Native American Owned | L Clearance, Q Clearance (DOE sites) |
| **611110 — Schools** | MBE, DBE, WOSB | State LE Background |
| **541614 — Logistics Consulting** | 8(a), WOSB, SDVOSB | Secret, FCL, CMMC L2 |

---

# Part D — Final Reference Table

All certifications and clearances side-by-side. Cost ranges are typical small-business outlays; "$0" means no government fee (internal labor/legal/consulting cost may still apply).

| Name | dropdown_key | Type | Cost (typical) | Time to obtain (typical) | Best-fit NAICS |
|---|---|---|---|---|---|
| SBA Small Business | `SBA_SMALL_BUSINESS` | Cert | $0 | 1-4 weeks | All federal NAICS |
| 8(a) Business Development | `EIGHT_A` | Cert | $0 + $5K-$25K consultant | 4-6 months | 541512, 541330, 561210, 236220, 541611 |
| Tribally-Owned 8(a) | `TRIBAL_8A` | Cert | $0 + legal | 4-8 months | 541512, 541330, 561210, 236220, 541611 |
| ANC 8(a) | `ANC_8A` | Cert | $0 + legal | 4-8 months | 541512, 541330, 561210, 236220, 541611 |
| NHO 8(a) | `NHO_8A` | Cert | $0 + legal | 4-8 months | 541512, 541330, 561210, 236220, 541611 |
| Native American / Indian-Owned | `NATIVE_AMERICAN_OWNED` | Cert | $0 | 1-4 weeks | 236220, 541330, 562910, 237110, 561210 |
| HUBZone | `HUBZONE` | Cert | $0 + $3K-$15K consultant | 90-120 days | 236220, 541330, 561210, 561720, 541512 |
| WOSB | `WOSB` | Cert | $0 (or $350-$1,500 TPC) | 60-90 days | 541512, 541611, 541330, 561210, 561720 |
| EDWOSB | `EDWOSB` | Cert | $0 (or $350-$1,500 TPC) | 60-90 days | 541330, 541512, 236220, 561210, 541611 |
| SDVOSB | `SDVOSB` | Cert | $0 | 90-120 days | 541512, 541330, 236220, 561210, 423450 |
| VOSB | `VOSB` | Cert | $0 | 60-90 days | 339113, 423450, 621498, 541512, 236220 |
| SDB | `SDB` | Cert | $0 | Immediate (self-attest) | Same as 8(a) |
| SBA Mentor-Protégé | `MENTOR_PROTEGE` | Cert | $0 + $10K-$40K legal | 60-90 days post-submission | Cross-NAICS JV vehicles |
| MBE (state-level) | `MBE_STATE` | Cert | $0-$1,250 | 60-120 days | 236220, 561210, 541512, 541611, 484110 |
| DBE (DOT) | `DBE` | Cert | $0 + $2K-$10K legal | 90 days typical | 237310, 484110, 541330, 238910, 238210 |
| Public Trust | `PUBLIC_TRUST` | Clearance | Agency-paid | 30-90 days | 541512, 541519, 541611, 561110, 524292 |
| Confidential | `CONFIDENTIAL` | Clearance | Agency-paid | Similar to Secret | 541330, 541715, 336411 |
| Secret | `SECRET` | Clearance | Agency-paid | ~156 days (Q1 FY26 DCSA 90%) | 541512, 541330, 541715, 541519, 561612 |
| Top Secret | `TOP_SECRET` | Clearance | Agency-paid | ~227 days (Q1 FY26 DCSA 90%) | 541330, 541512, 541715, 541990, 561621 |
| TS/SCI | `TS_SCI` | Clearance | Agency-paid | 8-15 months (incl. poly) | 541512, 541519, 541330, 541715, 541990 |
| Q Clearance (DOE) | `Q_CLEARANCE` | Clearance | DOE-paid | 200-250 days | 541715, 541330, 541713, 562910, 221112 |
| L Clearance (DOE) | `L_CLEARANCE` | Clearance | DOE-paid | ~150 days | 562910, 561612, 561210, 541330, 541715 |
| Facility Clearance (FCL) | `FCL` | Clearance | $0 fee + $30K-$100K compliance | 6-12 months | 541512, 541330, 541715, 336411, 541614 |
| CMMC Level 1 (Self) | `CMMC_L1_SELF` | Clearance | $5K-$30K internal | 30-90 days prep | 561720, 561210, 541611, 541614, 561612 |
| CMMC Level 2 (Self) | `CMMC_L2_SELF` | Clearance | $30K-$150K internal | 6-18 months | 541512, 541330, 541715, 541611 |
| CMMC Level 2 (C3PAO) | `CMMC_L2_C3PAO` | Clearance | $105K-$118K + internal | 12-24 months | 541512, 541330, 541715, 336411, 541614 |
| CMMC Level 3 (DIBCAC) | `CMMC_L3_DIBCAC` | Clearance | $100K-$500K+ internal | 12-24 months post-L2 | 336411, 541715, 541330, 541512 |
| CUI Handling | `CUI_HANDLING` | Clearance | $30K-$150K internal | 6-18 months | 541512, 541519, 541611, 541330, 541990 |
| NACI | `NACI` | Clearance | Agency-paid | 30-60 days | 561720, 561210, 722310, 561612, 561110 |
| Tier 1 | `TIER_1` | Clearance | Agency-paid | 30-60 days | 561720, 561210, 722310 |
| Tier 2 | `TIER_2` | Clearance | Agency-paid | 60-90 days | 541512, 541611, 561110 |
| Tier 3 (Secret) | `TIER_3` | Clearance | Agency-paid | ~156 days | Same as Secret |
| Tier 4 | `TIER_4` | Clearance | Agency-paid | 90-150 days | 541512 (sys admin), 541611 |
| Tier 5 (TS) | `TIER_5` | Clearance | Agency-paid | ~227 days | Same as TS |
| State LE Background | `STATE_LE_BACKGROUND` | Clearance | $30-$100/person | 1-6 weeks | 541512, 611110, 621498, 624110, 485310 |

---

## Sources

**Primary government sources (SBA, eCFR, DCSA via DoD-recognized publications, acquisition.gov):**

- SBA HUBZone Program — https://www.sba.gov/federal-contracting/contracting-assistance-programs/hubzone-program
- SBA WOSB Federal Contract Program — https://www.sba.gov/federal-contracting/contracting-assistance-programs/women-owned-small-business-federal-contract-program
- SBA Table of Size Standards — https://www.sba.gov/document/support-table-size-standards
- MySBA Certifications portal — https://certifications.sba.gov/
- 13 CFR Part 124 — 8(a) Business Development & Tribal 8(a) — https://www.law.cornell.edu/cfr/text/13/124.109
- 13 CFR § 124.110 — NHO 8(a) — https://www.law.cornell.edu/cfr/text/13/124.110
- 13 CFR Part 127 (WOSB/EDWOSB) and § 127.203 — https://www.ecfr.gov/current/title-13/chapter-I/part-127
- DFARS 252.204-7021 — https://www.acquisition.gov/dfars/252.204-7021-contractor-compliance-cybersecurity-maturity-model-certification-level-requirements.
- FAR 19.1307 (HUBZone price preference) — https://www.acquisition.gov/far/19.1307
- DCSA / Trusted Workforce 2.0 quarterly metrics, reported via ClearanceJobs Q1 FY2026 update — https://news.clearancejobs.com/2026/03/19/how-long-does-it-take-to-get-a-clearance-q1-2026-update/

**Useful corroborating secondary sources (cited in synthesis):**
- Holland & Knight, "CMMC Goes Live on November 10, 2025" — https://www.hklaw.com/en/insights/publications/2025/09/cmmc-goes-live-on-november-10-2025
- LegalClarity DFARS 252.204-7021 analysis — https://legalclarity.org/dfars-252-204-7021/
- SBA Final Rule (Dec 2024 / effective Jan 16 2025) — HUBZone updates per Federal Register 2024-29393
- SBA proposed rule RIN 3245-AI12 (Aug 22, 2025) — size standard revisions, currently NOT finalized

---

## As-of dates and caveats

- **SBA Table of Size Standards:** effective March 17, 2023; document last updated December 26, 2024. A proposed rule (RIN 3245-AI12, Aug 22, 2025) would revise 263 monetary-based size standards but is **not yet final** as of mid-2026 — comment period closed October 21, 2025. Re-check before finalizing any size-standard-driven decision.
- **EDWOSB thresholds ($850K / $400K / $6.5M):** current 2025-2026 figures per the SBA rule that aligned EDWOSB with 8(a) economic-disadvantage tests; prior thresholds were $750K / $350K / $6M.
- **VOSB/SDVOSB renewal launch:** November 1, 2025 in MySBA Certifications; existing certifications extended through Feb 1, 2026.
- **HUBZone Final Rule:** effective January 16, 2025 — tightened principal-office requirements (no virtual offices, deed/lease must commence ≥30 days before review, extend ≥60 days after); 35% employee residency unchanged.
- **CMMC Phase 1:** went live **November 10, 2025**. Enforcement timeline can still shift; the four-tier compliance options in DFARS 252.204-7021 (L1 Self, L2 Self, L2 C3PAO, L3 DIBCAC) are stable.
- **Clearance timelines:** Q1 FY2026 DCSA 90th-percentile industry figures — **Secret 156 days**, **Top Secret 227 days**. These are MUCH faster than the 18-24 month figures circulating in pre-2023 internet sources, thanks to Trusted Workforce 2.0 + Continuous Vetting.
- **Continuous Vetting:** has effectively replaced the old "5-year reinvestigation" cadence for individuals enrolled in CV. Many web sources still quote the old reinvestigation rules — they're stale.

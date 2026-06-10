/**
 * FLK_07_Federal_Events_Calendar_FY2026.pdf
 * Builder for the Federal Contracting Events Calendar FY2026
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import { writeFileSync, mkdirSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const DEPLOY = "/Users/andreschuler/Caturepilot 2.0/dashboard/public/starter-pack/07_Contracting_Officer_Outreach_Library/FLK_07_Federal_Events_Calendar_FY2026.pdf";

const config = {
  id: "flk-federal-events-calendar-fy2026",
  title: "Federal Contracting Events Calendar FY2026",
  slug: "flk-federal-events-calendar-fy2026",
  pages: 8,
  footerLabel: "CAPTUREPILOT · FEDERAL EVENTS CALENDAR FY2026",
  headerLabel: "EVENTS CALENDAR",
  parts: [
    {
      type: "cover",
      eyebrow: "FEDERAL LAUNCH KIT · CONTRACTING OFFICER OUTREACH",
      titleLines: [
        "Federal Events",
        "Calendar",
        "FY2026."
      ],
      accentWord: "Calendar",
      pages: 8,
      toolStrip: [
        { num: 1, title: "Q1 Events", desc: "Oct–Dec 2025 industry days" },
        { num: 2, title: "Q2 Events", desc: "Jan–Mar 2026 expos + SBCs" },
        { num: 3, title: "Q3 Events", desc: "Apr–Jun 2026 set-aside days" },
        { num: 4, title: "Q4 Events", desc: "Jul–Sep 2026 forecast season" }
      ]
    },

    {
      type: "toc",
      title: "Forty events. One fiscal year.",
      footerLabel: "CAPTUREPILOT · FEDERAL EVENTS CALENDAR FY2026",
      parts: [
        {
          label: "/ HOW TO USE THIS CALENDAR",
          items: [
            { code: "G01", title: "How to Use This Guide", desc: "Event types, what to bring, RFI-rich vs. networking-only signals.", page: 3 }
          ]
        },
        {
          label: "Q1 · OCT–DEC 2025",
          items: [
            { code: "Q1A", title: "DoD + Defense Industry Days", desc: "Army, Air Force, and DARPA industry days — heavy RFI season starts here.", page: 3 },
            { code: "Q1B", title: "GSA & Governmentwide Expos", desc: "GSA SmartPay, GovCon Summit DC — great for schedule holders.", page: 4 }
          ]
        },
        {
          label: "Q2 · JAN–MAR 2026",
          items: [
            { code: "Q2A", title: "Set-Aside Specific Days", desc: "8(a) Industry Day, HUBZone Day, WOSB Summit.", page: 4 },
            { code: "Q2B", title: "SBA & PTAC Regional Events", desc: "Mentor-Protégé briefings, PTAC matchmaking.", page: 5 }
          ]
        },
        {
          label: "Q3 · APR–JUN 2026",
          items: [
            { code: "Q3A", title: "VA + Health Agency Events", desc: "VA VOSB Day, HHS Vendor Outreach, NIH Industry Day.", page: 5 },
            { code: "Q3B", title: "DHS + Civilian Agency Days", desc: "DHS Industry Day, IRS, Customs & Border Protection.", page: 6 }
          ]
        },
        {
          label: "Q4 · JUL–SEP 2026",
          items: [
            { code: "Q4A", title: "Fiscal Year-End Sprint Events", desc: "AFCEA, National 8(a) Association Summit, SBA All Small Mentor Protégé Program Day.", page: 7 }
          ]
        }
      ]
    },

    {
      type: "founder",
      headline: "Miss the event. Miss the RFI. Miss the award.",
      accentWord: "Miss",
      paragraphs: [
        "Three years ago, a colleague lost a $2.4M IT services contract. Not because her technical approach was weak — it wasn't. She lost because the agency had already decided on a direction before the solicitation posted. She found that out at the debrief.",
        "The CO had held an industry day six months earlier. Twenty-three small businesses showed up. She didn't know about it.",
        "Industry days are where requirements get shaped. They're where the CO hears which approaches are feasible, which certifications matter, which team combinations will be competitive. Show up before the RFP. That's the whole strategy.",
        "This calendar covers 36 federal contracting events across FY2026 — agency-specific industry days, DoD expos, SBA matchmaking, set-aside-specific conferences, and PTAC workshops. For each one: date, location, who belongs there, typical attendance, what to bring, and whether the event is RFI-rich (worth preparing a written response) or primarily networking."
      ],
      ctaText: "Book a 30-min event strategy call",
      ctaUrl: "https://meetings-na2.hubspot.com/americurial/intro-call",
      ctaButtonLabel: "Book the call →",
      ctaEyebrow: "30 MIN · NO PITCH",
      footerLabel: "CAPTUREPILOT · FEDERAL EVENTS CALENDAR FY2026"
    },

    {
      type: "content",
      headerLabel: "Q1 EVENTS · OCT–DEC 2025",
      markdown: `<div class="eyebrow">Q1 · OCTOBER – DECEMBER 2025</div>

# The DoD opens its RFI season here. Get in the room early.

Q1 is the heaviest industry-day quarter for defense. DARPA, Army, and Air Force Life Cycle Management Center all hold outreach events as new program offices stand up post-budget. GSA uses October and November for acquisition planning sessions before the Q2 task order surge.

<table>
  <thead>
    <tr><th style="width:18%">Date</th><th style="width:22%">Event</th><th style="width:15%">Location</th><th style="width:20%">Audience</th><th style="width:13%">Attendance</th><th style="width:12%">Signal</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Oct 7–8, 2025</strong></td>
      <td><strong>Army Industry Day — DEVCOM</strong><br><span style="color:#78716c;font-size:8.5pt;">devcom.army.mil/events</span></td>
      <td>Aberdeen Proving Ground, MD</td>
      <td>Defense tech, R&amp;D, C4ISR contractors; small and large primes</td>
      <td>~600</td>
      <td><span class="risk-pill risk-critical">RFI-RICH</span></td>
    </tr>
    <tr>
      <td><strong>Oct 14–16, 2025</strong></td>
      <td><strong>AUSA Annual Meeting &amp; Exposition</strong><br><span style="color:#78716c;font-size:8.5pt;">ausa.org/meetings/annual</span></td>
      <td>Washington Convention Center, DC</td>
      <td>Army suppliers, systems integrators, defense tech; all sizes</td>
      <td>~30,000</td>
      <td><span class="risk-pill risk-medium">NETWORKING</span></td>
    </tr>
    <tr>
      <td><strong>Oct 21, 2025</strong></td>
      <td><strong>GSA SmartPay Training Forum</strong><br><span style="color:#78716c;font-size:8.5pt;">smartpay.gsa.gov/events</span></td>
      <td>Virtual</td>
      <td>Schedule holders, financial services, card-accepting vendors</td>
      <td>~1,200</td>
      <td><span class="risk-pill risk-medium">NETWORKING</span></td>
    </tr>
    <tr>
      <td><strong>Nov 4–5, 2025</strong></td>
      <td><strong>DARPA Forward Industry Day</strong><br><span style="color:#78716c;font-size:8.5pt;">darpa.mil/work-with-us/industry-day</span></td>
      <td>Virtual + Arlington, VA hub</td>
      <td>R&amp;D firms, universities, non-traditional defense contractors</td>
      <td>~800</td>
      <td><span class="risk-pill risk-critical">RFI-RICH</span></td>
    </tr>
    <tr>
      <td><strong>Nov 12, 2025</strong></td>
      <td><strong>SBA Procurement Conference — Mid-Atlantic</strong><br><span style="color:#78716c;font-size:8.5pt;">sba.gov/events</span></td>
      <td>Baltimore, MD</td>
      <td>Small businesses in MD/VA/DC looking for matchmaking with prime/sub opportunities</td>
      <td>~350</td>
      <td><span class="risk-pill risk-high">MATCHMAKING</span></td>
    </tr>
    <tr>
      <td><strong>Nov 18–19, 2025</strong></td>
      <td><strong>Air Force Life Cycle Mgmt Ctr Industry Day</strong><br><span style="color:#78716c;font-size:8.5pt;">aflcmc.af.mil/events</span></td>
      <td>Wright-Patterson AFB, OH (hybrid)</td>
      <td>Sustainment, logistics, aviation MRO, IT integration contractors</td>
      <td>~500</td>
      <td><span class="risk-pill risk-critical">RFI-RICH</span></td>
    </tr>
    <tr>
      <td><strong>Dec 2–3, 2025</strong></td>
      <td><strong>GovCon Summit DC</strong><br><span style="color:#78716c;font-size:8.5pt;">govcon.com/summit-dc</span></td>
      <td>Washington, DC</td>
      <td>Civilian and defense primes; BD, capture, proposal professionals</td>
      <td>~1,000</td>
      <td><span class="risk-pill risk-medium">NETWORKING</span></td>
    </tr>
    <tr>
      <td><strong>Dec 9, 2025</strong></td>
      <td><strong>DoD OSBP Small Business Conference</strong><br><span style="color:#78716c;font-size:8.5pt;">acq.osd.mil/osbp/sbir/events</span></td>
      <td>Virtual</td>
      <td>All small biz categories; set-aside program briefings by DoD components</td>
      <td>~2,000</td>
      <td><span class="risk-pill risk-high">MATCHMAKING</span></td>
    </tr>
    <tr>
      <td><strong>Dec 17, 2025</strong></td>
      <td><strong>PTAC Holiday Matchmaking — Southeast</strong><br><span style="color:#78716c;font-size:8.5pt;">aptac.org/events</span></td>
      <td>Atlanta, GA</td>
      <td>SE-region small biz; primes in construction, IT, professional services</td>
      <td>~200</td>
      <td><span class="risk-pill risk-high">MATCHMAKING</span></td>
    </tr>
  </tbody>
</table>

<div class="callout callout--emerald">
  <div style="font-family:'IBM Plex Mono', monospace; font-size:8.5pt; font-weight:600; letter-spacing:0.16em; color:#047857; text-transform:uppercase; margin-bottom:2mm;">WHAT TO BRING TO ANY INDUSTRY DAY</div>
  Capability statement (1 page, NAICS + CAGE code visible) · SAM.gov UEI printed · List of your top 5 NAICS codes · Three past performance references with dollar values · Business card with your SAM POC email — COs use it to send RFI notices directly.
</div>
`
    },

    {
      type: "content",
      headerLabel: "Q2 EVENTS · JAN–MAR 2026",
      markdown: `<div class="eyebrow">Q2 · JANUARY – MARCH 2026</div>

# Set-aside season. If you're 8(a), HUBZone, or WOSB — these are your rooms.

Q2 is the most set-aside-dense quarter. SBA schedules its program-specific events before Q3 buying picks up. OSDBU offices at VA, DHS, and Energy all run vendor outreach sessions now. HUBZone Day is the single best event for HUBZone firms — the SBA program office is there, and contracting officers from 12+ agencies attend specifically to find HUBZone-certified vendors.

<table>
  <thead>
    <tr><th style="width:18%">Date</th><th style="width:22%">Event</th><th style="width:15%">Location</th><th style="width:20%">Audience</th><th style="width:13%">Attendance</th><th style="width:12%">Signal</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Jan 13, 2026</strong></td>
      <td><strong>SBA 8(a) Industry Day — National</strong><br><span style="color:#78716c;font-size:8.5pt;">sba.gov/8a-events</span></td>
      <td>Virtual</td>
      <td>8(a)-certified firms and firms pending certification; agency OSDBU attendees</td>
      <td>~3,500</td>
      <td><span class="risk-pill risk-critical">RFI-RICH</span></td>
    </tr>
    <tr>
      <td><strong>Jan 27–28, 2026</strong></td>
      <td><strong>ACT-IAC Igniting Innovation Showcase</strong><br><span style="color:#78716c;font-size:8.5pt;">actiac.org/events</span></td>
      <td>Washington, DC (hybrid)</td>
      <td>IT modernization, cloud, cybersecurity; civilian + defense agencies</td>
      <td>~900</td>
      <td><span class="risk-pill risk-critical">RFI-RICH</span></td>
    </tr>
    <tr>
      <td><strong>Feb 3, 2026</strong></td>
      <td><strong>HUBZone Day — SBA National Event</strong><br><span style="color:#78716c;font-size:8.5pt;">sba.gov/hubzone-day</span></td>
      <td>Virtual (agency B2B matchmaking sessions follow)</td>
      <td>HUBZone-certified firms; COs from DoD, DHS, USDA, GSA actively seeking HUBZone vendors</td>
      <td>~2,200</td>
      <td><span class="risk-pill risk-critical">RFI-RICH</span></td>
    </tr>
    <tr>
      <td><strong>Feb 10, 2026</strong></td>
      <td><strong>VA VOSB/SDVOSB Verification Briefing</strong><br><span style="color:#78716c;font-size:8.5pt;">va.gov/osdbu/events</span></td>
      <td>Virtual</td>
      <td>Veteran-owned and service-disabled veteran-owned small businesses seeking VA verification</td>
      <td>~800</td>
      <td><span class="risk-pill risk-high">MATCHMAKING</span></td>
    </tr>
    <tr>
      <td><strong>Feb 18–19, 2026</strong></td>
      <td><strong>WOSB Summit — Women in Federal Contracting</strong><br><span style="color:#78716c;font-size:8.5pt;">woscexchange.org</span></td>
      <td>Washington, DC</td>
      <td>WOSB/EDWOSB-certified firms; program managers from agencies with WOSB set-aside contracts</td>
      <td>~500</td>
      <td><span class="risk-pill risk-high">MATCHMAKING</span></td>
    </tr>
    <tr>
      <td><strong>Feb 25, 2026</strong></td>
      <td><strong>NAVY SYSCOM Industry Day — Small Business Focus</strong><br><span style="color:#78716c;font-size:8.5pt;">navyseasystems.com/events</span></td>
      <td>Philadelphia, PA (hybrid)</td>
      <td>Logistics, engineering support, ship maintenance; small biz preference</td>
      <td>~400</td>
      <td><span class="risk-pill risk-critical">RFI-RICH</span></td>
    </tr>
    <tr>
      <td><strong>Mar 4, 2026</strong></td>
      <td><strong>SBA All Small Mentor-Protégé Briefing</strong><br><span style="color:#78716c;font-size:8.5pt;">sba.gov/mentor-protege</span></td>
      <td>Virtual</td>
      <td>Mentors (large/midsized primes) and protégés (small biz seeking joint-venture capability)</td>
      <td>~1,100</td>
      <td><span class="risk-pill risk-high">MATCHMAKING</span></td>
    </tr>
    <tr>
      <td><strong>Mar 11–12, 2026</strong></td>
      <td><strong>Federal IT Acquisition Summit (FITAS)</strong><br><span style="color:#78716c;font-size:8.5pt;">fitas.com</span></td>
      <td>Tysons Corner, VA</td>
      <td>IT, cloud, cyber, data; CIOs/CISOs from civilian agencies + DoD components</td>
      <td>~1,400</td>
      <td><span class="risk-pill risk-critical">RFI-RICH</span></td>
    </tr>
    <tr>
      <td><strong>Mar 24, 2026</strong></td>
      <td><strong>PTAC Matchmaking Workshop — Great Plains</strong><br><span style="color:#78716c;font-size:8.5pt;">aptac.org/events</span></td>
      <td>Kansas City, MO</td>
      <td>Regional small businesses; federal buyers from GSA, VA, and USDA Kansas City offices</td>
      <td>~250</td>
      <td><span class="risk-pill risk-high">MATCHMAKING</span></td>
    </tr>
  </tbody>
</table>

<div class="callout">
  <div class="eyebrow" style="margin-bottom:2mm;">NOTE ON RFI-RICH EVENTS</div>
  <p style="margin:0;">When this guide marks an event <strong>RFI-RICH</strong>, that means the agency typically releases a Sources Sought or RFI notice within 60 days of the event. Prepare a written capability summary in advance — 2 pages max, structured around the agency's known requirement area. Submit it proactively via SAM.gov if a notice is posted. If not, email it to the OSDBU contact you meet on-site.</p>
</div>
`
    },

    {
      type: "content",
      headerLabel: "Q3 + Q4 EVENTS · APR–SEP 2026",
      markdown: `<div class="eyebrow">Q3 · APRIL – JUNE 2026</div>

# VA, DHS, and civilian agencies hit their stride before the year-end sprint.

Q3 is when civilian agencies run their pre-solicitation outreach. The VA holds VOSB Day every April — it's mandatory attendance if you're pursuing VA healthcare or IT work. DHS Industry Day typically drops with a 30-day RFI window. NIH holds one of the most competitive industry days in the federal health space.

<table>
  <thead>
    <tr><th style="width:18%">Date</th><th style="width:22%">Event</th><th style="width:15%">Location</th><th style="width:20%">Audience</th><th style="width:13%">Attendance</th><th style="width:12%">Signal</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Apr 7, 2026</strong></td>
      <td><strong>VA VOSB Day — Annual Vendor Fair</strong><br><span style="color:#78716c;font-size:8.5pt;">va.gov/osdbu/vendorfair</span></td>
      <td>Washington, DC (hybrid)</td>
      <td>VOSBs and SDVOSBs; VA program office reps from VHA, VBA, OIT</td>
      <td>~1,800</td>
      <td><span class="risk-pill risk-critical">RFI-RICH</span></td>
    </tr>
    <tr>
      <td><strong>Apr 14–15, 2026</strong></td>
      <td><strong>DHS Industry Day</strong><br><span style="color:#78716c;font-size:8.5pt;">dhs.gov/osdbu/industry-day</span></td>
      <td>Virtual</td>
      <td>IT, cybersecurity, border security, emergency mgmt contractors; small and large</td>
      <td>~3,000</td>
      <td><span class="risk-pill risk-critical">RFI-RICH</span></td>
    </tr>
    <tr>
      <td><strong>Apr 21, 2026</strong></td>
      <td><strong>NIH Industry Day — IT &amp; Health Informatics</strong><br><span style="color:#78716c;font-size:8.5pt;">nih.gov/osdbu/events</span></td>
      <td>Bethesda, MD</td>
      <td>Health IT, data science, clinical research support vendors; NIH program offices present</td>
      <td>~600</td>
      <td><span class="risk-pill risk-critical">RFI-RICH</span></td>
    </tr>
    <tr>
      <td><strong>May 5, 2026</strong></td>
      <td><strong>DoT Small Business Transportation Procurement Conference</strong><br><span style="color:#78716c;font-size:8.5pt;">transportation.gov/osdbu</span></td>
      <td>Washington, DC</td>
      <td>Engineering, construction, IT, professional services for FAA, FTA, FHWA</td>
      <td>~400</td>
      <td><span class="risk-pill risk-high">MATCHMAKING</span></td>
    </tr>
    <tr>
      <td><strong>May 12–13, 2026</strong></td>
      <td><strong>AFCEA Small Business IT Day</strong><br><span style="color:#78716c;font-size:8.5pt;">afcea.org/events/small-business-it-day</span></td>
      <td>Bethesda, MD</td>
      <td>Defense IT, cyber, C2 systems, geospatial; small biz focus</td>
      <td>~700</td>
      <td><span class="risk-pill risk-critical">RFI-RICH</span></td>
    </tr>
    <tr>
      <td><strong>May 19, 2026</strong></td>
      <td><strong>PTAC Matchmaking — Pacific Southwest</strong><br><span style="color:#78716c;font-size:8.5pt;">aptac.org/events</span></td>
      <td>San Diego, CA</td>
      <td>CA/NV small businesses; buyers from SPAWAR, NAVFAC, DLA</td>
      <td>~300</td>
      <td><span class="risk-pill risk-high">MATCHMAKING</span></td>
    </tr>
    <tr>
      <td><strong>Jun 2, 2026</strong></td>
      <td><strong>GSA Expo / MarkeTech</strong><br><span style="color:#78716c;font-size:8.5pt;">gsa.gov/expo</span></td>
      <td>New Orleans, LA (alternating annual)</td>
      <td>MAS Schedule holders, BIC GWAC contractors, GSA sourcing staff</td>
      <td>~2,500</td>
      <td><span class="risk-pill risk-medium">NETWORKING</span></td>
    </tr>
    <tr>
      <td><strong>Jun 9, 2026</strong></td>
      <td><strong>USDA Agricultural Research Industry Day</strong><br><span style="color:#78716c;font-size:8.5pt;">ams.usda.gov/osdbu</span></td>
      <td>Virtual</td>
      <td>Science, lab services, IT, facilities contractors; rural set-aside interest</td>
      <td>~400</td>
      <td><span class="risk-pill risk-high">MATCHMAKING</span></td>
    </tr>
    <tr>
      <td><strong>Jun 23, 2026</strong></td>
      <td><strong>HHS Small Business Innovation Briefing</strong><br><span style="color:#78716c;font-size:8.5pt;">hhs.gov/osdbu/events</span></td>
      <td>Virtual</td>
      <td>Health IT, professional services, clinical support; pre-solicitation briefing format</td>
      <td>~900</td>
      <td><span class="risk-pill risk-critical">RFI-RICH</span></td>
    </tr>
  </tbody>
</table>

<div class="eyebrow" style="margin-top:8mm;">Q4 · JULY – SEPTEMBER 2026</div>

## Year-end buying sprint. Fiscal urgency opens doors.

Q4 is when the money moves. Unobligated balances get spent before September 30. Sole-source and micro-purchase awards spike. This is less a "attend industry days" quarter and more a "be in the agency's awareness already" quarter. The events below are still worth attending — but their RFI-richness comes from pre-solicitation activity you won't see in the room, you'll see on SAM.gov within days of the event.

<table>
  <thead>
    <tr><th style="width:18%">Date</th><th style="width:22%">Event</th><th style="width:15%">Location</th><th style="width:20%">Audience</th><th style="width:13%">Attendance</th><th style="width:12%">Signal</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Jul 14, 2026</strong></td>
      <td><strong>National 8(a) Association Annual Summit</strong><br><span style="color:#78716c;font-size:8.5pt;">national8a.org/summit</span></td>
      <td>Washington, DC</td>
      <td>8(a)-certified firms (current and pipeline); SBA program staff; large prime partners</td>
      <td>~800</td>
      <td><span class="risk-pill risk-high">MATCHMAKING</span></td>
    </tr>
    <tr>
      <td><strong>Jul 21, 2026</strong></td>
      <td><strong>DoD SBIR/STTR Phase I Briefing</strong><br><span style="color:#78716c;font-size:8.5pt;">sbir.defensebusiness.org/events</span></td>
      <td>Virtual</td>
      <td>R&amp;D small businesses, Phase I awardees, firms pursuing Phase III commercialization</td>
      <td>~1,500</td>
      <td><span class="risk-pill risk-critical">RFI-RICH</span></td>
    </tr>
    <tr>
      <td><strong>Aug 4–5, 2026</strong></td>
      <td><strong>SAME Federal Small Business Conference</strong><br><span style="color:#78716c;font-size:8.5pt;">same.org/events/federal-sbc</span></td>
      <td>Tampa, FL (hybrid)</td>
      <td>A/E/C, facilities, environmental, military construction small biz</td>
      <td>~700</td>
      <td><span class="risk-pill risk-high">MATCHMAKING</span></td>
    </tr>
    <tr>
      <td><strong>Aug 18, 2026</strong></td>
      <td><strong>EPA Vendor Outreach Session — Q4</strong><br><span style="color:#78716c;font-size:8.5pt;">epa.gov/osdbu/events</span></td>
      <td>Virtual</td>
      <td>Environmental services, IT, professional services; EPA end-of-year pre-solicitation session</td>
      <td>~350</td>
      <td><span class="risk-pill risk-critical">RFI-RICH</span></td>
    </tr>
    <tr>
      <td><strong>Sep 9, 2026</strong></td>
      <td><strong>DLA Industry Day — Logistics &amp; Supply Chain</strong><br><span style="color:#78716c;font-size:8.5pt;">dla.mil/events</span></td>
      <td>Fort Belvoir, VA</td>
      <td>Supply chain, distribution, MRO, parts vendors; DLA program managers in attendance</td>
      <td>~600</td>
      <td><span class="risk-pill risk-critical">RFI-RICH</span></td>
    </tr>
    <tr>
      <td><strong>Sep 15, 2026</strong></td>
      <td><strong>PTAC Year-End Sprint Workshop — National</strong><br><span style="color:#78716c;font-size:8.5pt;">aptac.org/events</span></td>
      <td>Virtual (all regions)</td>
      <td>All small biz; focus on SAM.gov maintenance before Sept 30 deadline, expiring certifications</td>
      <td>~2,000</td>
      <td><span class="risk-pill risk-medium">NETWORKING</span></td>
    </tr>
    <tr>
      <td><strong>Sep 22, 2026</strong></td>
      <td><strong>FY2026 Year-End Procurement Briefing — GSA</strong><br><span style="color:#78716c;font-size:8.5pt;">gsa.gov/osdbu</span></td>
      <td>Virtual</td>
      <td>MAS Schedule holders; GSA outlines Q1 FY2027 priority areas and forecast updates</td>
      <td>~1,800</td>
      <td><span class="risk-pill risk-critical">RFI-RICH</span></td>
    </tr>
  </tbody>
</table>
`
    },

    {
      type: "content",
      headerLabel: "PREP + REGISTRATION GUIDE",
      markdown: `<div class="eyebrow">EVENT PREPARATION &amp; REGISTRATION GUIDE</div>

# Show up with a plan, not just a badge.

Most contractors walk into industry days with a stack of capability statements and a plan to hand them to anyone who makes eye contact. That's not a strategy. It's expensive networking. This page covers what to prepare before you register and what to do with the intelligence you collect on-site.

## Preparation checklist (two weeks before any event)

<table>
  <thead>
    <tr><th style="width:35%">Task</th><th style="width:65%">Why it matters</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Pull the agency's current forecast</strong></td>
      <td>SAM.gov → search by agency, filter to "Sources Sought" or "Presolicitation." Know which requirements are live before you walk in. COs notice when you can cite the notice number.</td>
    </tr>
    <tr>
      <td><strong>Update your SAM.gov profile</strong></td>
      <td>COs run SAM searches on the spot. Stale NAICS, wrong revenue band, or expired certifications will cost you the follow-up conversation.</td>
    </tr>
    <tr>
      <td><strong>Print a 1-page capability statement</strong></td>
      <td>One page. CAGE code and UEI in the header. NAICS codes listed. Three past performance examples with dollar values. No generic buzzwords.</td>
    </tr>
    <tr>
      <td><strong>Identify three decision-makers to target</strong></td>
      <td>Use USASpending.gov to find the CO's name on recent awards in your NAICS. Look them up on LinkedIn. Walk in knowing who you want five minutes with.</td>
    </tr>
    <tr>
      <td><strong>Prepare a written response if the event is RFI-RICH</strong></td>
      <td>2-page max. Structure: company background, relevant past performance, technical approach summary, proposed team. Submit via SAM.gov if a Sources Sought is open, or hand it directly to the program office rep.</td>
    </tr>
    <tr>
      <td><strong>Register early and request a one-on-one slot</strong></td>
      <td>Most federal industry days offer 15-min one-on-one sessions. They fill in 48 hours. Register as soon as the event is announced.</td>
    </tr>
  </tbody>
</table>

## Signal legend

<table>
  <thead>
    <tr><th>Signal</th><th>What it means</th><th>Your move</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><span class="risk-pill risk-critical">RFI-RICH</span></td>
      <td>Agency typically releases a Sources Sought or RFI within 60 days. Pre-solicitation activity visible on SAM.gov shortly after the event.</td>
      <td>Prepare a written capability response. Submit proactively. Follow SAM.gov for the notice.</td>
    </tr>
    <tr>
      <td><span class="risk-pill risk-high">MATCHMAKING</span></td>
      <td>Structured B2B or B2G matchmaking. Agency buyers are assigned to 15-min slots. Good for relationship-building and confirming requirements.</td>
      <td>Request slots early. Bring a business card that includes your SAM POC email. Follow up within 48 hours.</td>
    </tr>
    <tr>
      <td><span class="risk-pill risk-medium">NETWORKING</span></td>
      <td>Large expo or conference. Agency presence but no structured procurement activity. Good for teaming conversations and intel on agency priorities.</td>
      <td>Focus on finding teammates and OSDBU contacts. Don't expect a RFI to follow immediately.</td>
    </tr>
  </tbody>
</table>

<div class="callout callout--emerald">
  <div style="font-family:'IBM Plex Mono', monospace; font-size:8.5pt; font-weight:600; letter-spacing:0.16em; color:#047857; text-transform:uppercase; margin-bottom:2mm;">REGISTRATION SOURCES</div>
  All events above post registration links on the agency OSDBU website and on SAM.gov → Federal Business Opportunities → Events. Sign up for GovDelivery alerts from the agencies you target — that's how you catch industry days before they're full.
</div>
`
    },

    {
      type: "back-cover",
      eyebrow: "WHAT'S NEXT",
      headline: "Track the events. Win the RFIs.",
      accentWord: "Win",
      body: "CapturePilot monitors SAM.gov Sources Sought notices in real time and scores them against your capability profile. You'll know about an RFI within hours of posting — not three weeks later when the comment period has closed. Free 14-day trial. No card.",
      ctaText: "Start free trial →",
      ctaUrl: "https://capturepilot.com/signup",
      footerLabel: "CAPTUREPILOT · FEDERAL EVENTS CALENDAR FY2026"
    }
  ]
};

// Write config to temp file and run via render pipeline
import { renderPdf } from "/Users/andreschuler/Caturepilot 2.0/tools/pdf-builder/render.mjs";
import { resolve } from "path";

const outPath = resolve(DEPLOY);
const outDir = path.dirname(outPath);
mkdirSync(outDir, { recursive: true });

console.log("Building Federal Events Calendar FY2026 PDF...");
await renderPdf({ config, outputPath: outPath });
console.log(`PDF written to: ${outPath}`);

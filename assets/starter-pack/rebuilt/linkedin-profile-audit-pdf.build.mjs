/**
 * Build: FLK_07_LinkedIn_Profile_Audit.pdf
 * 20-point LinkedIn profile audit checklist for federal contracting credibility.
 * Sections: Headline, About, Experience, Skills, Recommendations, Activity, Network.
 * 5 BEFORE/AFTER profile snippet examples. Cover + brand styling.
 */

import { renderPdf } from "/Users/andreschuler/Caturepilot 2.0/tools/pdf-builder/render.mjs";

const DEPLOY = "/Users/andreschuler/Caturepilot 2.0/dashboard/public/starter-pack/07_Contracting_Officer_Outreach_Library/FLK_07_LinkedIn_Profile_Audit.pdf";

const config = {
  id: "flk-linkedin-profile-audit",
  title: "LinkedIn Profile Audit for Federal Contractors",
  slug: "flk-linkedin-profile-audit",
  pages: 6,
  footerLabel: "CAPTUREPILOT · LINKEDIN PROFILE AUDIT",
  headerLabel: "LINKEDIN AUDIT",
  parts: [
    {
      type: "cover",
      eyebrow: "FEDERAL LAUNCH KIT · CONTRACTING OFFICER OUTREACH",
      titleLines: [
        "LinkedIn,",
        "Built for",
        "Federal."
      ],
      accentWord: "Federal",
      pages: 6,
      toolStrip: [
        { num: 1, title: "20-Point Audit", desc: "Headline to Network — every field scored" },
        { num: 2, title: "Before/After", desc: "5 real profile rewrite examples" },
        { num: 3, title: "7 Sections", desc: "Headline, About, Experience, Skills, Recs, Activity, Network" },
        { num: 4, title: "CO Lens", desc: "What a contracting officer sees first" }
      ]
    },

    {
      type: "toc",
      title: "Twenty checkpoints. One credible profile.",
      footerLabel: "CAPTUREPILOT · LINKEDIN PROFILE AUDIT",
      parts: [
        {
          label: "/ HOW TO USE",
          items: [
            { code: "A01", title: "Why LinkedIn Matters in Federal", desc: "Contracting officers Google you. This is what they find.", page: 3 }
          ]
        },
        {
          label: "SECTION ONE · IDENTITY",
          items: [
            { code: "S01", title: "Headline — Points 1–3", desc: "Federal contracting language, NAICS signal, role clarity.", page: 3 },
            { code: "S02", title: "About — Points 4–7", desc: "Capability-statement aligned, UEI/CAGE, differentiators, CTA.", page: 3 }
          ]
        },
        {
          label: "SECTION TWO · PROOF",
          items: [
            { code: "S03", title: "Experience — Points 8–10", desc: "DoD/agency work surfaced, contract vehicles named, dollar ranges.", page: 4 },
            { code: "S04", title: "Skills — Points 11–13", desc: "Federal-flavored, agency-specific endorsements.", page: 4 },
            { code: "S05", title: "Recommendations — Points 14–15", desc: "Federal POC quotes, COR/CO/PM authors.", page: 4 }
          ]
        },
        {
          label: "SECTION THREE · SIGNAL",
          items: [
            { code: "S06", title: "Activity — Points 16–18", desc: "Commenting on procurement notices, reposting agency news.", page: 5 },
            { code: "S07", title: "Network — Points 19–20", desc: "200+ federal connections in your NAICS, target list.", page: 5 },
            { code: "B01", title: "5 Before/After Examples", desc: "Real rewrites: headline, About, Experience, Skills, Activity.", page: 6 }
          ]
        }
      ]
    },

    {
      type: "founder",
      headline: "Contracting officers look you up before they pick up the phone.",
      accentWord: "before",
      paragraphs: [
        "Every BD call I've coached, the first question after 'who are you?' is a quick LinkedIn search. It takes thirty seconds. If the profile says 'IT Consultant at ABC LLC' with a stock photo and a 2016 endorsement for Microsoft Word, the CO mentally files you under 'not ready.'",
        "That's not fair. But it's real. LinkedIn wasn't built for federal contracting — which is exactly why the people who optimize it for federal stand out so far above the noise.",
        "This audit is 20 checkpoints built around one question: when a GS-13 contracting officer or a source-selection official lands on your profile, what do they see in the first ten seconds? Use it on yourself. Use it on your BD team. Fix the gaps. Then use the Before/After examples at the end to rewrite the dead language.",
        "The network section will feel slow. Two hundred federal connections doesn't happen overnight. Start with the list of 15 target titles on page 5, find 10 of each on LinkedIn, and connect with a one-line note. Thirty days of that compounds fast."
      ],
      ctaText: "Book a 30-min profile review",
      ctaUrl: "https://meetings-na2.hubspot.com/americurial/intro-call",
      ctaButtonLabel: "Book the call →",
      ctaEyebrow: "30 MIN · FREE",
      footerLabel: "CAPTUREPILOT · LINKEDIN PROFILE AUDIT"
    },

    {
      type: "content",
      headerLabel: "SECTIONS 1–5 · IDENTITY + PROOF",
      markdown: `<div class="eyebrow">SECTION 1 · HEADLINE (POINTS 1–3)</div>

# Your headline is an 8-second federal credibility test.

LinkedIn auto-fills your headline with your job title. Nobody in federal cares that you're a "Managing Partner." They want to know if you work in their world.

<table>
  <thead>
    <tr><th>#</th><th>Checkpoint</th><th>Pass standard</th><th>Common fail</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>01</strong></td>
      <td><strong>Federal contracting language visible</strong></td>
      <td>Headline includes at least one term from: "federal contractor," "government contractor," "DoD," "GSA," "VA," "HHS," "DHS," or a specific agency acronym.</td>
      <td>"CEO at Smith Consulting LLC" — no federal signal at all</td>
    </tr>
    <tr>
      <td><strong>02</strong></td>
      <td><strong>NAICS or capability signal</strong></td>
      <td>Headline or first visible line names your service category (IT services, facilities, professional services, cybersecurity, logistics, environmental).</td>
      <td>Generic titles like "Business Development Manager" with no service type</td>
    </tr>
    <tr>
      <td><strong>03</strong></td>
      <td><strong>Role clarity for the CO's lens</strong></td>
      <td>It's clear whether you're a prime contractor, teaming partner, or subcontractor. Owner-operators should say "Owner" or "Principal." BD leads should say what they're developing.</td>
      <td>"Consultant" — ambiguous, looks like a staffing firm resume</td>
    </tr>
  </tbody>
</table>

<div class="callout callout--emerald">
  <div style="font-family:'IBM Plex Mono', monospace; font-size:8.5pt; font-weight:600; letter-spacing:0.16em; color:#047857; text-transform:uppercase; margin-bottom:2mm;">HEADLINE FORMULA</div>
  <strong>[Service Category] Contractor | [Agency Focus or Certification] | [Role]</strong><br>
  Example: <em>Federal IT Services Contractor | DoD + DHS | SDVOSB Owner, NAICS 541512/541519</em>
</div>

<div class="eyebrow" style="margin-top:8mm;">SECTION 2 · ABOUT (POINTS 4–7)</div>

## The About section is your capability statement in 300 words.

<table>
  <thead>
    <tr><th>#</th><th>Checkpoint</th><th>Pass standard</th><th>Common fail</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>04</strong></td>
      <td><strong>Capability-statement alignment</strong></td>
      <td>First two sentences of About match the core competencies in your SAM.gov capability statement. If a CO reads your CS and then your profile, they should feel like the same company.</td>
      <td>About describes personal career history, not company capabilities</td>
    </tr>
    <tr>
      <td><strong>05</strong></td>
      <td><strong>UEI and CAGE visible (owner-operators)</strong></td>
      <td>If you're the owner or president of a registered entity, your UEI and CAGE code appear somewhere in the About section or the Featured section. Makes it trivial for a CO to run you in SAM.gov.</td>
      <td>No entity identifiers — CO has to hunt across three systems to verify you exist</td>
    </tr>
    <tr>
      <td><strong>06</strong></td>
      <td><strong>Past performance summary present</strong></td>
      <td>About names 2–3 specific agency clients or contract types (even without dollar values). Examples: "Supported NAVFAC facility operations contracts," "Delivered IT help-desk services for HHS components."</td>
      <td>Vague claims: "extensive government experience across multiple agencies"</td>
    </tr>
    <tr>
      <td><strong>07</strong></td>
      <td><strong>Call to action with federal context</strong></td>
      <td>Last line directs the reader to an action: "View our capability statement at [URL]" or "Connect if you're sourcing [NAICS] in [region]." Not "Let's grab coffee."</td>
      <td>No CTA, or a generic "happy to connect!" close</td>
    </tr>
  </tbody>
</table>

<div class="eyebrow" style="margin-top:8mm;">SECTION 3 · EXPERIENCE (POINTS 8–10)</div>

## Push the federal work to the top. That's what the CO is scanning for.

<table>
  <thead>
    <tr><th>#</th><th>Checkpoint</th><th>Pass standard</th><th>Common fail</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>08</strong></td>
      <td><strong>DoD/federal agency work surfaced</strong></td>
      <td>Your most recent or most prominent role explicitly names the agency or DoD component (Army, Navy, Air Force, VA, EPA, USDA). Don't hide it under a client name.</td>
      <td>"Senior Analyst at [Company]" with no mention of the federal customer</td>
    </tr>
    <tr>
      <td><strong>09</strong></td>
      <td><strong>Contract vehicles and vehicles named</strong></td>
      <td>If you've performed on a GWAC, IDIQ, or GSA Schedule (IT Schedule 70 / MAS), name it. COs use these as shorthand for vetted capability.</td>
      <td>Roles describe duties but never mention the contract vehicle or acquisition pathway</td>
    </tr>
    <tr>
      <td><strong>10</strong></td>
      <td><strong>Dollar ranges where possible</strong></td>
      <td>At least one role entry includes a contract size indicator: "Supported $2.4M task order," "Program worth approximately $8M annually." Doesn't need to be exact — an order-of-magnitude signal is enough.</td>
      <td>No dollar context at all — CO can't distinguish a $15K micro-purchase from a $15M IDIQ on your record</td>
    </tr>
  </tbody>
</table>

<div class="eyebrow" style="margin-top:8mm;">SECTION 4 · SKILLS (POINTS 11–13)</div>

## Skills aren't for the algorithm. They're for the CO's keyword search.

<table>
  <thead>
    <tr><th>#</th><th>Checkpoint</th><th>Pass standard</th><th>Common fail</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>11</strong></td>
      <td><strong>Federal-flavored top skills</strong></td>
      <td>Top 5 pinned skills include at least 2 from: "Federal Contracting," "Government Procurement," "DoD Contracting," "FAR/DFARS," "GSA Schedule," "Sources Sought," "SBIR," or your NAICS service category.</td>
      <td>Top skills are "Leadership," "Communication," "Microsoft Office" — irrelevant for a CO search</td>
    </tr>
    <tr>
      <td><strong>12</strong></td>
      <td><strong>Agency-specific skills present</strong></td>
      <td>You list at least one agency-specific skill (e.g., "VA Contracting," "NAVFAC," "DHS Procurement," "Army Corps of Engineers"). Signals that you've operated in that agency's ecosystem.</td>
      <td>Only generic skills with no agency association</td>
    </tr>
    <tr>
      <td><strong>13</strong></td>
      <td><strong>Endorsements from federal contacts</strong></td>
      <td>At least 2–3 of your top skills are endorsed by people with federal/DoD titles (Contracting Officer, Program Manager, COTR, Project Officer). Even one GS-13 endorsement carries weight.</td>
      <td>All endorsements from commercial contacts or generic LinkedIn connections</td>
    </tr>
  </tbody>
</table>

<div class="eyebrow" style="margin-top:8mm;">SECTION 5 · RECOMMENDATIONS (POINTS 14–15)</div>

## A COR's recommendation is worth ten commercial client quotes.

<table>
  <thead>
    <tr><th>#</th><th>Checkpoint</th><th>Pass standard</th><th>Common fail</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>14</strong></td>
      <td><strong>At least one federal POC recommendation</strong></td>
      <td>You have at least one recommendation from someone with a .gov email domain, military title, or federal agency role visible on their profile. Ask CORs, PMs, or KOs you've worked well with. Most will say yes.</td>
      <td>Zero recommendations, or only commercial/vendor recommendations</td>
    </tr>
    <tr>
      <td><strong>15</strong></td>
      <td><strong>Recommendations reference specific performance</strong></td>
      <td>The recommendation names the contract type, agency component, or service area — not just "great to work with." Example: "Delivered the facility maintenance SOW on time across three NAVFAC locations." Specificity = credibility.</td>
      <td>Generic "highly recommend this professional" recommendations with no context</td>
    </tr>
  </tbody>
</table>
`
    },

    {
      type: "content",
      headerLabel: "SECTIONS 6–7 · SIGNAL + NETWORK · BEFORE/AFTER",
      markdown: `<div class="eyebrow">SECTION 6 · ACTIVITY (POINTS 16–18)</div>

# What you post tells a CO whether you actually know this market.

Silence on LinkedIn is not neutral. It reads as disengaged. One thoughtful comment on a SAM.gov notice per week, consistently, builds more federal credibility than a $5K ad campaign.

<table>
  <thead>
    <tr><th>#</th><th>Checkpoint</th><th>Pass standard</th><th>Common fail</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>16</strong></td>
      <td><strong>Federal contracting comments visible</strong></td>
      <td>Your recent activity includes comments on posts about procurement policy, agency announcements, or contract award news. Aim for 2–3 per month. You don't need to write articles — commenting on the right posts is enough.</td>
      <td>No visible activity, or only reposting company promotional content</td>
    </tr>
    <tr>
      <td><strong>17</strong></td>
      <td><strong>Reposting agency and procurement news</strong></td>
      <td>You reshare relevant posts from SBA, GSA, DoD OSBP, or procurement-industry accounts (FCW, Bloomberg Government, GovExec) with a one-sentence observation. This signals you're monitoring the market.</td>
      <td>Only posting job openings, commercial content, or motivational quotes</td>
    </tr>
    <tr>
      <td><strong>18</strong></td>
      <td><strong>No damaging public content</strong></td>
      <td>No public complaints about specific agencies, contracting officers, or federal acquisition decisions. Frustration is valid — public venting costs you future RFPs. Keep it private.</td>
      <td>Visible criticism of specific agencies, COs, or the procurement process by name</td>
    </tr>
  </tbody>
</table>

<div class="callout callout--emerald">
  <div style="font-family:'IBM Plex Mono', monospace; font-size:8.5pt; font-weight:600; letter-spacing:0.16em; color:#047857; text-transform:uppercase; margin-bottom:2mm;">ACTIVITY CADENCE THAT WORKS</div>
  <strong>Monday:</strong> Comment on one procurement industry post (30 sec)<br>
  <strong>Wednesday:</strong> Reshare one agency or SBA announcement with one sentence<br>
  <strong>Friday:</strong> Write one original observation about a SAM.gov notice or award trend in your NAICS (2–3 sentences). That's it. Ninety seconds a week compounds into 150+ federal connections noticing your name in their feed.
</div>

<div class="eyebrow" style="margin-top:8mm;">SECTION 7 · NETWORK (POINTS 19–20)</div>

## 200+ federal connections in your NAICS changes how the algorithm positions you.

<table>
  <thead>
    <tr><th>#</th><th>Checkpoint</th><th>Pass standard</th><th>Common fail</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>19</strong></td>
      <td><strong>200+ federal connections in your NAICS</strong></td>
      <td>You have at least 200 first-degree connections whose profiles show federal agency, DoD component, or prime-contractor roles in your service category. This threshold flips LinkedIn's algorithm from showing you as a generalist to surfacing you in searches for your NAICS.</td>
      <td>Under 100 connections, mostly commercial or local business contacts</td>
    </tr>
    <tr>
      <td><strong>20</strong></td>
      <td><strong>Active outreach to 15 target titles</strong></td>
      <td>You have a documented list of 15 target titles and are actively connecting with 5–10 new contacts per week. Target titles: Contracting Officer, Contract Specialist, COTR/COR, Small Business Specialist, Program Manager (GS-13+), Deputy Director of Contracting, OSBP Director, SBLO (at primes), BD Director (at primes), Capture Manager (at primes), PTAC counselor, SBA Procurement Center Representative, Agency OSDBU, Small Business TA, Veterans Business Advisor.</td>
      <td>No outreach strategy — waiting for inbound connections</td>
    </tr>
  </tbody>
</table>

<div class="eyebrow" style="margin-top:8mm;">BEFORE / AFTER EXAMPLES</div>

## Five rewrites. The dead language and the version that works.

**Example 1 — Headline**

<table>
  <thead><tr><th>BEFORE</th><th>AFTER</th></tr></thead>
  <tbody>
    <tr>
      <td style="color:#991b1b;">Managing Partner at Vertex Solutions Group</td>
      <td style="color:#065f46;">Federal IT Services Contractor | DoD &amp; DHS Programs | SDVOSB Owner · NAICS 541512, 541519 · UEI: ABC123456</td>
    </tr>
  </tbody>
</table>

**Example 2 — About (opening lines)**

<table>
  <thead><tr><th>BEFORE</th><th>AFTER</th></tr></thead>
  <tbody>
    <tr>
      <td style="color:#991b1b;">"I'm a results-driven leader with 15+ years of experience helping organizations achieve their goals through innovative technology solutions and strategic thinking."</td>
      <td style="color:#065f46;">"Vertex Solutions Group is a DoD-focused IT services contractor (SDVOSB, NAICS 541512/541519, UEI: ABC123456, CAGE: 7X8F2). We've supported task orders at DISA, Army INSCOM, and NAVWAR across cybersecurity, help-desk, and cloud migration. Our capability statement and past performance summaries are at capturepilot.com/vertex."</td>
    </tr>
  </tbody>
</table>

**Example 3 — Experience entry**

<table>
  <thead><tr><th>BEFORE</th><th>AFTER</th></tr></thead>
  <tbody>
    <tr>
      <td style="color:#991b1b;">"Program Manager at Vertex Solutions Group, 2019–present. Managed multiple projects for government clients. Responsible for schedules, budgets, and stakeholder communication."</td>
      <td style="color:#065f46;">"Program Manager · Vertex Solutions Group · 2019–present. Managing a $4.2M IDIQ task order under the Army's ITES-3S contract vehicle (DISA subcontract), delivering Tier 2 help-desk and endpoint security at Fort Belvoir and Pentagon support facilities. COR: Maj. R. Holloway, NETCOM G6."</td>
    </tr>
  </tbody>
</table>

**Example 4 — Skills section**

<table>
  <thead><tr><th>BEFORE (top 5 skills)</th><th>AFTER (top 5 skills)</th></tr></thead>
  <tbody>
    <tr>
      <td style="color:#991b1b;">Leadership · Project Management · Communication · Strategic Planning · Microsoft Office</td>
      <td style="color:#065f46;">Federal IT Contracting · DoD ITES-3S · FAR/DFARS Compliance · Cybersecurity (FISMA/CMMC) · GSA IT Schedule 70 (MAS)</td>
    </tr>
  </tbody>
</table>

**Example 5 — Activity post**

<table>
  <thead><tr><th>BEFORE</th><th>AFTER</th></tr></thead>
  <tbody>
    <tr>
      <td style="color:#991b1b;">"Excited to share that Vertex Solutions Group just won a new contract! We're growing and looking for talented people to join our team. #hiring #growth #blessed"</td>
      <td style="color:#065f46;">"DISA just posted a Sources Sought for cloud migration support (NAICS 541512, $4.5M estimated value, closes 30 days). If you're an 8(a) or SDVOSB cloud shop looking for a teaming partner with ITES-3S access, DM me. We're actively looking for one sub for this one."</td>
    </tr>
  </tbody>
</table>

<div class="callout" style="margin-top:8mm;">
  <div class="eyebrow" style="margin-bottom:2mm;">SCORING YOUR AUDIT</div>
  Count the checkpoints you passed: <strong>18–20 = publication-ready federal profile.</strong> 14–17 = strong, fix the gaps. 10–13 = average — you won't stand out in a CO's search. Under 10 = start with the Headline and About rewrites today, everything else follows.
</div>
`
    },

    {
      type: "back-cover",
      eyebrow: "WHAT'S NEXT",
      headline: "Your profile is live. Now find the contracts that fit.",
      accentWord: "fit",
      body: "CapturePilot matches your NAICS codes and certifications to active federal opportunities, scores them against your profile, and flags the ones worth pursuing. Free 14-day trial. No card required.",
      ctaText: "Start free trial →",
      ctaUrl: "https://capturepilot.com/signup",
      footerLabel: "CAPTUREPILOT · LINKEDIN PROFILE AUDIT"
    }
  ]
};

await renderPdf({ config, outputPath: DEPLOY });
console.log("Built:", DEPLOY);

// FLK 08 — Federal Labor Categories Matrix
// Build: node assets/starter-pack/rebuilt/federal-labor-categories-matrix-xlsx.build.mjs
//
// Tabs: Matrix (40-60 labor cats), Sources (OPM / SCA / GSA links), Lists (dropdowns)
// Fully cross-compat with Excel + Google Sheets + Numbers via buildListsSheet() named ranges.

import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const require = createRequire(import.meta.url);
const ExcelJS = require("/Users/andreschuler/Caturepilot 2.0/dashboard/node_modules/exceljs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEPLOY = "/Users/andreschuler/Caturepilot 2.0/dashboard/public/starter-pack/08_Price_to_Win_Toolkit/FLK_08_Federal_Labor_Categories_Matrix.xlsx";

// ── Brand colors ──────────────────────────────────────────────────────────────
const EMERALD       = "FF10B981";
const EMERALD_DARK  = "FF047857";
const SLATE_50      = "FFF8FAFC";
const SLATE_100     = "FFF1F5F9";
const SLATE_200     = "FFE2E8F0";
const SLATE_700     = "FF334155";
const SLATE_900     = "FF0F172A";
const AMBER         = "FFF59E0B";
const AMBER_FILL    = "FFFEF3C7";
const GREEN_FILL    = "FFD1FAE5";
const BLUE_FILL     = "FFDBEAFE";
const RED_FILL      = "FFFEE2E2";
const WHITE         = "FFFFFFFF";

const FOOTER = "CapturePilot Federal Lead Kit  -  capturepilot.com  -  FLK 08 Price-to-Win Toolkit";
const WB_TITLE = "Federal Labor Categories Matrix FY2026";

// ── buildListsSheet (canonical pattern) ──────────────────────────────────────
function buildListsSheet(wb, lists) {
  let ws = wb.getWorksheet("Lists");
  if (!ws) ws = wb.addWorksheet("Lists", { views: [{ showGridLines: false }] });
  ws.columns = lists.map(() => ({ width: 30 }));
  const formulaMap = {};
  lists.forEach((list, colIdx) => {
    const col = String.fromCharCode(65 + colIdx);
    const titleCell = ws.getCell(`${col}1`);
    titleCell.value = list.title;
    titleCell.font = { name: "Calibri", size: 10, bold: true };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_100 } };
    titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    list.items.forEach((item, i) => {
      const c = ws.getCell(`${col}${2 + i}`);
      c.value = item;
      c.font = { name: "Calibri", size: 10 };
      c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    });
    const lastRow = 1 + list.items.length;
    wb.definedNames.add(`Lists!$${col}$2:$${col}$${lastRow}`, list.name);
    formulaMap[list.name] = list.name;
  });
  ws.state = "veryHidden";
  return formulaMap;
}

// ── Labor category data ───────────────────────────────────────────────────────
// Fields per row:
// id, category, laborCat, commercialTitle, eduReq, expReq,
// civilianLow, civilianHigh, dodLow, dodHigh,
// gsMasSchedule, scaWDRef, notes

const LABOR_CATS = [
  // ─── Program / Project Management ───────────────────────────────────────────
  {
    category: "Program / Project Management",
    laborCat: "Junior Project Manager",
    commercialTitle: "Project Coordinator / Associate PM",
    eduReq: "Bachelor's (any field)",
    expReq: "2–4 yrs; PMP not required",
    civilianLow: 75, civilianHigh: 110,
    dodLow: 80, dodHigh: 118,
    gsMasSchedule: "MAS 00CORP / PSS",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "Common on OASIS+ SB, GSA IT-70 BPA task orders under $2M"
  },
  {
    category: "Program / Project Management",
    laborCat: "Mid-Level Project Manager",
    commercialTitle: "Project Manager II",
    eduReq: "Bachelor's + PMP preferred",
    expReq: "5–8 yrs; FAR 15.305 past-perf threshold",
    civilianLow: 110, civilianHigh: 160,
    dodLow: 118, dodHigh: 170,
    gsMasSchedule: "MAS 00CORP / PSS / OASIS+",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "Required on most DoD cost-plus contracts >$5M TCV"
  },
  {
    category: "Program / Project Management",
    laborCat: "Senior Project Manager",
    commercialTitle: "Senior PM / Program Director",
    eduReq: "Bachelor's req; Master's preferred; PMP",
    expReq: "10+ yrs; managed $10M+ federal programs",
    civilianLow: 155, civilianHigh: 215,
    dodLow: 165, dodHigh: 235,
    gsMasSchedule: "MAS 00CORP / OASIS+ / SeaPort NxG",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "Often named key person; loss triggers contract clause H-16 notice"
  },
  {
    category: "Program / Project Management",
    laborCat: "Program Manager (Large Program)",
    commercialTitle: "VP of Programs / Principal PM",
    eduReq: "Master's preferred; PMP/PgMP",
    expReq: "15+ yrs; $50M+ program oversight",
    civilianLow: 200, civilianHigh: 290,
    dodLow: 210, dodHigh: 310,
    gsMasSchedule: "MAS 00CORP / OASIS+",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "Typically appears in Section J key-personnel list"
  },

  // ─── Systems Engineering ─────────────────────────────────────────────────────
  {
    category: "Systems Engineering",
    laborCat: "Junior Systems Engineer",
    commercialTitle: "Systems Engineer I / Associate SE",
    eduReq: "Bachelor's in Engineering or CS",
    expReq: "0–3 yrs; entry-level MBSE exposure helpful",
    civilianLow: 80, civilianHigh: 120,
    dodLow: 88, dodHigh: 130,
    gsMasSchedule: "IT-70 / MAS 00CORP / OASIS+",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "GS-9 to GS-11 equivalent per OPM 0854 series"
  },
  {
    category: "Systems Engineering",
    laborCat: "Mid-Level Systems Engineer",
    commercialTitle: "Systems Engineer II",
    eduReq: "Bachelor's in Engineering; PE or INCOSE CSEP preferred",
    expReq: "5–9 yrs; requirements decomposition, interface control docs",
    civilianLow: 130, civilianHigh: 185,
    dodLow: 140, dodHigh: 200,
    gsMasSchedule: "IT-70 / OASIS+ / SEWP VI (anticipated)",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "GS-12 to GS-13 equivalent; common on DHS EAGLE II follow-ons"
  },
  {
    category: "Systems Engineering",
    laborCat: "Senior Systems Engineer",
    commercialTitle: "Principal Systems Engineer",
    eduReq: "Master's in Engineering or equivalent",
    expReq: "12+ yrs; DoDAF / MIL-STD-499C working knowledge",
    civilianLow: 190, civilianHigh: 265,
    dodLow: 200, dodHigh: 285,
    gsMasSchedule: "IT-70 / OASIS+ / SeaPort NxG",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "Often the 'lead systems architect' on Annex A staffing plans"
  },
  {
    category: "Systems Engineering",
    laborCat: "Subject Matter Expert (Technical)",
    commercialTitle: "Distinguished Engineer / Technical Fellow",
    eduReq: "Master's or PhD; industry-recognized authority",
    expReq: "20+ yrs in specific technical domain",
    civilianLow: 250, civilianHigh: 375,
    dodLow: 265, dodHigh: 400,
    gsMasSchedule: "MAS 00CORP / OASIS+ / SEWP",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "Rate floor set by SES equivalent pay band; document uniqueness in PWS"
  },

  // ─── Software Engineering ─────────────────────────────────────────────────
  {
    category: "Software Engineering",
    laborCat: "Junior Software Engineer",
    commercialTitle: "Software Developer I / Associate SWE",
    eduReq: "Bachelor's in CS or equivalent",
    expReq: "0–3 yrs; one primary language (Python / Java / C++)",
    civilianLow: 78, civilianHigh: 118,
    dodLow: 85, dodHigh: 128,
    gsMasSchedule: "IT-70 / SEWP V (Schedule 70 equiv)",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "GS-9 OPM 2210 series; most entry-level Army ITES-3S tickets"
  },
  {
    category: "Software Engineering",
    laborCat: "Mid-Level Software Engineer",
    commercialTitle: "Software Engineer II / Full-Stack Developer",
    eduReq: "Bachelor's in CS or 4 yrs equivalent exp",
    expReq: "4–8 yrs; DevSecOps pipeline, CI/CD tools",
    civilianLow: 120, civilianHigh: 175,
    dodLow: 130, dodHigh: 190,
    gsMasSchedule: "IT-70 / SEWP V / CIO-CS",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "DoD requires IAT Level II (CompTIA Sec+ or equiv) if system admin role overlaps"
  },
  {
    category: "Software Engineering",
    laborCat: "Senior Software Engineer",
    commercialTitle: "Staff Engineer / Senior SWE",
    eduReq: "Bachelor's req; Master's preferred",
    expReq: "10+ yrs; cloud-native, secure SDLC, CMMC Level 2 practice",
    civilianLow: 170, civilianHigh: 245,
    dodLow: 185, dodHigh: 265,
    gsMasSchedule: "IT-70 / SEWP V / OASIS+",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "Highest demand on DHS CDM, VA T4NG II, and CMS SPARC vehicles"
  },
  {
    category: "Software Engineering",
    laborCat: "Software Architect",
    commercialTitle: "Enterprise Architect / Solutions Architect",
    eduReq: "Bachelor's req; Master's or AWS/Azure architect cert preferred",
    expReq: "12+ yrs; cloud migration, FedRAMP authorization path experience",
    civilianLow: 210, civilianHigh: 310,
    dodLow: 225, dodHigh: 330,
    gsMasSchedule: "IT-70 / OASIS+ / SEWP V",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "FedRAMP High experience commands 15–20% premium over standard range"
  },

  // ─── Cybersecurity ───────────────────────────────────────────────────────────
  {
    category: "Cybersecurity",
    laborCat: "Cybersecurity Analyst I",
    commercialTitle: "SOC Analyst Level 1 / InfoSec Analyst",
    eduReq: "Bachelor's in IT, CS, or CyberSec; CompTIA Sec+ or equiv",
    expReq: "1–3 yrs; SIEM tools, incident triage",
    civilianLow: 85, civilianHigh: 125,
    dodLow: 95, dodHigh: 138,
    gsMasSchedule: "IT-70 / MAS 00CORP",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "DoD 8570.01-M IAT Level II baseline mandatory; Secret clearance typical"
  },
  {
    category: "Cybersecurity",
    laborCat: "Cybersecurity Analyst II",
    commercialTitle: "SOC Analyst Level 2 / Senior InfoSec Analyst",
    eduReq: "Bachelor's; CISSP or CISM preferred",
    expReq: "5–8 yrs; vulnerability management, pen-test support",
    civilianLow: 130, civilianHigh: 185,
    dodLow: 142, dodHigh: 200,
    gsMasSchedule: "IT-70 / MAS 00CORP / OASIS+",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "Top Secret preferred on most IC and DoD SOC task orders"
  },
  {
    category: "Cybersecurity",
    laborCat: "Cybersecurity Engineer",
    commercialTitle: "Security Engineer / Zero-Trust Architect",
    eduReq: "Bachelor's; CISSP required; CCSP or cloud-sec cert preferred",
    expReq: "8–12 yrs; NIST RMF, ATO support, FedRAMP continuous monitoring",
    civilianLow: 175, civilianHigh: 255,
    dodLow: 190, dodHigh: 275,
    gsMasSchedule: "IT-70 / OASIS+ / SEWP V",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "CMMC C3PAO assessors bill $300–$450/hr on spot basis; separate from this matrix"
  },
  {
    category: "Cybersecurity",
    laborCat: "Penetration Tester / Red Team Operator",
    commercialTitle: "Ethical Hacker / Offensive Security Specialist",
    eduReq: "Bachelor's or equivalent; OSCP required for most DoD work",
    expReq: "4–10 yrs; adversary simulation, CVE research",
    civilianLow: 145, civilianHigh: 220,
    dodLow: 160, dodHigh: 240,
    gsMasSchedule: "IT-70 / MAS 00CORP",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "NSA-IAD engagements add ~10% premium; Hack the Pentagon participants command top range"
  },

  // ─── Data / Analytics / AI ───────────────────────────────────────────────────
  {
    category: "Data / Analytics / AI",
    laborCat: "Data Analyst",
    commercialTitle: "Business Intelligence Analyst / Reporting Analyst",
    eduReq: "Bachelor's in Statistics, Math, CS, or related",
    expReq: "2–5 yrs; SQL, Tableau/Power BI, Excel pivot mastery",
    civilianLow: 80, civilianHigh: 120,
    dodLow: 88, dodHigh: 132,
    gsMasSchedule: "IT-70 / MAS 00CORP",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "Heavy demand on USAID M&E contracts and HHS performance management vehicles"
  },
  {
    category: "Data / Analytics / AI",
    laborCat: "Data Engineer",
    commercialTitle: "Data Platform Engineer / ETL Engineer",
    eduReq: "Bachelor's in CS, Data Science, or Engineering",
    expReq: "4–8 yrs; AWS Glue / Azure Data Factory / Spark pipelines",
    civilianLow: 130, civilianHigh: 195,
    dodLow: 140, dodHigh: 210,
    gsMasSchedule: "IT-70 / SEWP V / OASIS+",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "FedRAMP-authorized data lake experience commands 10% rate premium"
  },
  {
    category: "Data / Analytics / AI",
    laborCat: "Data Scientist",
    commercialTitle: "Machine Learning Engineer / Applied Scientist",
    eduReq: "Master's preferred; PhD common in IC/DoD shops",
    expReq: "4–10 yrs; Python, R, ML model dev, model cards / AI ethics",
    civilianLow: 155, civilianHigh: 235,
    dodLow: 165, dodHigh: 255,
    gsMasSchedule: "IT-70 / OASIS+ / MAS 00CORP",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "DoD JAIC / CDAO task orders now require responsible-AI documentation per DoDD 3000.09"
  },
  {
    category: "Data / Analytics / AI",
    laborCat: "AI/ML Engineer",
    commercialTitle: "LLM Engineer / AI Solutions Architect",
    eduReq: "Master's or PhD in CS, AI, or Statistics",
    expReq: "5–12 yrs; LLM fine-tuning, RAG pipelines, ATO for AI systems",
    civilianLow: 190, civilianHigh: 290,
    dodLow: 205, dodHigh: 315,
    gsMasSchedule: "IT-70 / OASIS+ / SEWP (anticipated)",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "Emerging category — rate ranges less stable; anchor to market surveys quarterly"
  },

  // ─── Cloud / Infrastructure ──────────────────────────────────────────────────
  {
    category: "Cloud / Infrastructure",
    laborCat: "Cloud Engineer I",
    commercialTitle: "Cloud Associate / Junior Cloud Engineer",
    eduReq: "Bachelor's in IT/CS; AWS SAA or Azure AZ-900 preferred",
    expReq: "1–4 yrs; IaC (Terraform/CloudFormation), basic VPC design",
    civilianLow: 90, civilianHigh: 132,
    dodLow: 98, dodHigh: 145,
    gsMasSchedule: "IT-70 / SEWP V",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "FedRAMP-authorized cloud only on CivAg contracts; GovCloud partition exp. a plus"
  },
  {
    category: "Cloud / Infrastructure",
    laborCat: "Cloud Engineer II",
    commercialTitle: "Cloud Engineer / Platform Engineer",
    eduReq: "Bachelor's; AWS SAP or Azure AZ-305 preferred",
    expReq: "5–9 yrs; multi-account landing zone, container orchestration (EKS/AKS)",
    civilianLow: 140, civilianHigh: 200,
    dodLow: 152, dodHigh: 218,
    gsMasSchedule: "IT-70 / SEWP V / OASIS+",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "IL4/IL5 accreditation experience adds ~15% premium for MilDep work"
  },
  {
    category: "Cloud / Infrastructure",
    laborCat: "Network Engineer",
    commercialTitle: "Senior Network Engineer / Infrastructure Architect",
    eduReq: "Bachelor's; CCNP or equivalent",
    expReq: "6–12 yrs; MPLS, SD-WAN, DISA STIG hardening",
    civilianLow: 120, civilianHigh: 185,
    dodLow: 130, dodHigh: 200,
    gsMasSchedule: "IT-70 / SEWP V / MAS 00CORP",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "DISA Storefront and GSA EIS (Enterprise Infrastructure Solutions) primary vehicles"
  },
  {
    category: "Cloud / Infrastructure",
    laborCat: "Systems Administrator",
    commercialTitle: "Linux / Windows Sysadmin",
    eduReq: "Associate's or Bachelor's; CompTIA Sec+; RHCE or MCSA helpful",
    expReq: "3–7 yrs; patch management, AD, virtualization (VMware/Hyper-V)",
    civilianLow: 80, civilianHigh: 130,
    dodLow: 88, dodHigh: 142,
    gsMasSchedule: "IT-70 / SEWP V",
    scaWDRef: "N/A (exempt; but check FLSA if on-call rotation classified hourly)",
    notes: "DoD 8570.01-M IAT Level I baseline (CompTIA A+ or equiv) minimum"
  },

  // ─── Intelligence & Analysis ─────────────────────────────────────────────────
  {
    category: "Intelligence & Analysis",
    laborCat: "All-Source Intelligence Analyst I",
    commercialTitle: "Intelligence Analyst / Research Analyst",
    eduReq: "Bachelor's (Political Science, Regional Studies, or related); TS/SCI required",
    expReq: "2–5 yrs; IC or DoD IC analytical methods (structured analytic techniques)",
    civilianLow: 90, civilianHigh: 135,
    dodLow: 98, dodHigh: 148,
    gsMasSchedule: "MAS 00CORP / OASIS+",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "IC CAR (IC Community Analyst Rotation) equivalent GS-9/11"
  },
  {
    category: "Intelligence & Analysis",
    laborCat: "Senior Intelligence Analyst",
    commercialTitle: "Senior Analyst / Strategic Intelligence Advisor",
    eduReq: "Master's preferred; TS/SCI + polygraph for NSA/CIA work",
    expReq: "10+ yrs; collection management, 6-FIS reporting, HUMINT/SIGINT tradecraft",
    civilianLow: 165, civilianHigh: 250,
    dodLow: 178, dodHigh: 270,
    gsMasSchedule: "MAS 00CORP / OASIS+ / IC BIC-M",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "Full-scope poly commands 20–25% premium over standard IC rate"
  },

  // ─── Program Analysis / Policy ───────────────────────────────────────────────
  {
    category: "Program Analysis / Policy",
    laborCat: "Junior Program Analyst",
    commercialTitle: "Business Analyst I / Program Support Specialist",
    eduReq: "Bachelor's (Public Admin, Business, or related)",
    expReq: "1–4 yrs; process mapping, federal budget cycle basics",
    civilianLow: 65, civilianHigh: 100,
    dodLow: 70, dodHigh: 108,
    gsMasSchedule: "MAS 00CORP / PSS / OASIS+",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "OPM 0343 Series GS-7/9 equivalent; common entry point on DHS, VA, and HHS"
  },
  {
    category: "Program Analysis / Policy",
    laborCat: "Senior Program Analyst",
    commercialTitle: "Senior Business Analyst / Senior Policy Advisor",
    eduReq: "Master's preferred; PMP helpful",
    expReq: "8–15 yrs; OMB Circular A-11 budget process, GAO reporting",
    civilianLow: 130, civilianHigh: 195,
    dodLow: 140, dodHigh: 210,
    gsMasSchedule: "MAS 00CORP / OASIS+",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "OPM 0343 Series GS-13/14 equivalent"
  },
  {
    category: "Program Analysis / Policy",
    laborCat: "Organizational Development Specialist",
    commercialTitle: "Change Management Lead / OD Consultant",
    eduReq: "Bachelor's; Master's preferred; Prosci ADKAR helpful",
    expReq: "6–12 yrs; federal transformation programs, OCM planning",
    civilianLow: 120, civilianHigh: 180,
    dodLow: 130, dodHigh: 195,
    gsMasSchedule: "MAS 00CORP / PSS",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "High demand post-EO 14058 (Transforming Federal Customer Experience)"
  },

  // ─── Acquisition / Contracts ─────────────────────────────────────────────────
  {
    category: "Acquisition / Contracts",
    laborCat: "Contracting Support Specialist",
    commercialTitle: "Acquisition Analyst / Procurement Specialist",
    eduReq: "Bachelor's; DAU FAC-C Level I or equiv helpful",
    expReq: "2–5 yrs; FAR/DFARS, solicitation prep, market research",
    civilianLow: 75, civilianHigh: 115,
    dodLow: 82, dodHigh: 125,
    gsMasSchedule: "MAS 00CORP / PSS / OASIS+",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "OPM 1102 Series GS-9/11 equivalent; common on DISA, Navy, and GSA support contracts"
  },
  {
    category: "Acquisition / Contracts",
    laborCat: "Senior Contracting Advisor",
    commercialTitle: "Senior Acquisition Specialist / Contracts Director",
    eduReq: "Bachelor's req; Master's preferred; DAWIA Level III / FAC-C III",
    expReq: "12+ yrs; source selection, SSEB experience, IDIQ management",
    civilianLow: 160, civilianHigh: 240,
    dodLow: 172, dodHigh: 260,
    gsMasSchedule: "MAS 00CORP / OASIS+",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "Source Selection Authority (SSA) advisory work can exceed $300/hr on IDIQ TO basis"
  },

  // ─── Training & Instructional Design ─────────────────────────────────────────
  {
    category: "Training & Instructional Design",
    laborCat: "Instructional Designer / Training Developer",
    commercialTitle: "Instructional Designer / eLearning Developer",
    eduReq: "Bachelor's in Education, ID, or related; Master's preferred",
    expReq: "3–7 yrs; ADDIE / SAM, Section 508 compliance, SCORM/xAPI",
    civilianLow: 80, civilianHigh: 125,
    dodLow: 88, dodHigh: 135,
    gsMasSchedule: "MAS 00CORP / PSS / OASIS+",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "DoD JTSI / JCIDS training requirements drive bulk of demand"
  },
  {
    category: "Training & Instructional Design",
    laborCat: "Senior Training Consultant",
    commercialTitle: "Training Program Manager / L&D Director",
    eduReq: "Master's in Education, HRD, or related",
    expReq: "10+ yrs; curriculum architecture, federal workforce development",
    civilianLow: 130, civilianHigh: 200,
    dodLow: 140, dodHigh: 215,
    gsMasSchedule: "MAS 00CORP / PSS",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "OPM Training Center and USDA Graduate School set informal market-rate benchmarks"
  },

  // ─── Communications / Public Affairs ─────────────────────────────────────────
  {
    category: "Communications / Public Affairs",
    laborCat: "Communications Specialist",
    commercialTitle: "Communications Analyst / Content Strategist",
    eduReq: "Bachelor's in Comm, Journalism, English, or related",
    expReq: "2–5 yrs; Section 508-compliant content, plain language (PLAIN Act)",
    civilianLow: 65, civilianHigh: 100,
    dodLow: 70, dodHigh: 110,
    gsMasSchedule: "MAS 00CORP / PSS",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "GSA's Plain Language Style Guide compliance increasingly written into PWS"
  },
  {
    category: "Communications / Public Affairs",
    laborCat: "Senior Communications Advisor",
    commercialTitle: "Director of Communications / Public Affairs Officer",
    eduReq: "Master's preferred; accreditation (APR) helpful",
    expReq: "10+ yrs; crisis comms, congressional correspondence, FOIA response strategy",
    civilianLow: 140, civilianHigh: 215,
    dodLow: 150, dodHigh: 230,
    gsMasSchedule: "MAS 00CORP / OASIS+",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "DoD PA positions often require clearance; add 10–15% to DoD range for TS/SCI-adjacent work"
  },

  // ─── Financial Management ────────────────────────────────────────────────────
  {
    category: "Financial Management",
    laborCat: "Budget Analyst",
    commercialTitle: "Budget Analyst / Financial Analyst",
    eduReq: "Bachelor's in Finance, Accounting, or Business; CPA helpful",
    expReq: "3–7 yrs; PPBE (DoD) or PPBS cycle, OMB A-11, SF-132 apportionment",
    civilianLow: 85, civilianHigh: 130,
    dodLow: 93, dodHigh: 142,
    gsMasSchedule: "MAS 00CORP / PSS",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "OPM 0560 Series GS-9/12 equivalent"
  },
  {
    category: "Financial Management",
    laborCat: "Senior Financial Advisor",
    commercialTitle: "Senior Finance Director / CFO Advisor",
    eduReq: "Master's in Finance or Accounting; CPA / CGFM",
    expReq: "12+ yrs; GAAP + GASB + federal audit readiness (FISCAM, FFMIA)",
    civilianLow: 165, civilianHigh: 250,
    dodLow: 175, dodHigh: 268,
    gsMasSchedule: "MAS 00CORP / OASIS+",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "JFMIP-compliant ERP (Oracle Fed Financials / SAP Public Sector) experience commands top of range"
  },

  // ─── Human Capital / HR ──────────────────────────────────────────────────────
  {
    category: "Human Capital / HR",
    laborCat: "HR Specialist (Classification / Staffing)",
    commercialTitle: "HR Generalist / Talent Acquisition Specialist",
    eduReq: "Bachelor's in HR, Business, or Public Admin; PHR or SHRM-CP helpful",
    expReq: "3–7 yrs; OPM classification standards, USA Staffing, USA Hire",
    civilianLow: 75, civilianHigh: 115,
    dodLow: 82, dodHigh: 125,
    gsMasSchedule: "MAS 00CORP / PSS / OASIS+",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "OPM 0201 Series GS-9/12 equivalent; peak demand tied to agency hiring surges"
  },
  {
    category: "Human Capital / HR",
    laborCat: "Senior Human Capital Consultant",
    commercialTitle: "Workforce Transformation Lead / CHCO Advisor",
    eduReq: "Master's in I/O Psychology, HR, OD, or related; SPHR or SHRM-SCP",
    expReq: "12+ yrs; workforce planning (OPM Strategic Workforce Planning framework), SES hiring",
    civilianLow: 145, civilianHigh: 220,
    dodLow: 155, dodHigh: 238,
    gsMasSchedule: "MAS 00CORP / OASIS+",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "High demand under DOGE-adjacent workforce restructuring initiatives in FY2026"
  },

  // ─── Administrative / Clerical (SCA-covered) ─────────────────────────────────
  {
    category: "Administrative / Clerical (SCA)",
    laborCat: "Administrative Assistant",
    commercialTitle: "Administrative Coordinator / Office Specialist",
    eduReq: "High school diploma; Associate's preferred",
    expReq: "1–3 yrs; scheduling, correspondence, records management",
    civilianLow: 30, civilianHigh: 50,
    dodLow: 32, dodHigh: 54,
    gsMasSchedule: "MAS 00CORP (limited SCA scope)",
    scaWDRef: "WD 2015-4567 (DC/MD/VA) — Office Clerk, General",
    notes: "SCA-covered if contract >$2,500 and >50% of effort is non-exempt. WD varies by locality."
  },
  {
    category: "Administrative / Clerical (SCA)",
    laborCat: "Data Entry Operator",
    commercialTitle: "Data Entry Specialist / Records Clerk",
    eduReq: "High school diploma; keyboarding proficiency (40+ WPM)",
    expReq: "1–2 yrs; database entry, document scanning, quality check",
    civilianLow: 25, civilianHigh: 42,
    dodLow: 27, dodHigh: 46,
    gsMasSchedule: "MAS 00CORP (limited SCA scope)",
    scaWDRef: "WD 2015-4567 — Data Entry Operator I/II",
    notes: "Check current WD at SAM.gov / WDOL (Wage Determinations Online) before pricing"
  },
  {
    category: "Administrative / Clerical (SCA)",
    laborCat: "Logistics/Supply Technician",
    commercialTitle: "Supply Chain Technician / Warehouse Specialist",
    eduReq: "High school diploma; HAZMAT cert if applicable",
    expReq: "2–4 yrs; inventory management, Property Book (PBUSE or DPAS)",
    civilianLow: 28, civilianHigh: 52,
    dodLow: 32, dodHigh: 58,
    gsMasSchedule: "MAS 00CORP / LOGWORLD (legacy)",
    scaWDRef: "WD 2015-5107 — Warehouse Specialist / Stock Control",
    notes: "DoD Property Book Officer (PBO) oversight may push non-SCA if blended with analytical duties"
  },

  // ─── Facilities / Operations & Maintenance (SCA-covered) ─────────────────────
  {
    category: "Facilities / O&M (SCA)",
    laborCat: "Custodial/Janitorial Worker",
    commercialTitle: "Facilities Technician / Custodian",
    eduReq: "No formal education requirement",
    expReq: "0–2 yrs; familiarity with OSHA 1910.1200 GHS/SDS",
    civilianLow: 18, civilianHigh: 28,
    dodLow: 19, dodHigh: 30,
    gsMasSchedule: "MAS Facilities (520-1) — limited scope",
    scaWDRef: "WD 2015-5565 — Janitor / Custodian (locality-specific)",
    notes: "NAICS 561720; among the highest-volume SCA WDs issued by WHD. Always pull locality WD from WDOL."
  },
  {
    category: "Facilities / O&M (SCA)",
    laborCat: "Building Maintenance Mechanic",
    commercialTitle: "Facilities Maintenance Technician / Maintenance Mechanic",
    eduReq: "High school diploma or vocational training; HVAC cert helpful",
    expReq: "3–6 yrs; plumbing, electrical, HVAC — federal facility regs (UFC 3-110-03)",
    civilianLow: 35, civilianHigh: 60,
    dodLow: 38, dodHigh: 65,
    gsMasSchedule: "MAS Facilities (520-1)",
    scaWDRef: "WD 2015-5565 — Building Maintenance Mechanic",
    notes: "Davis-Bacon Act may also apply on construction-adjacent work; confirm FAR 22.4 scope"
  },
  {
    category: "Facilities / O&M (SCA)",
    laborCat: "Security Guard (Armed)",
    commercialTitle: "Armed Security Officer",
    eduReq: "High school diploma; state guard license; firearms qualification",
    expReq: "2–5 yrs; post orders, NIMS ICS-100/200, use-of-force cert",
    civilianLow: 30, civilianHigh: 52,
    dodLow: 33, dodHigh: 58,
    gsMasSchedule: "MAS 00CORP (limited) / HSPD-12 PIV support",
    scaWDRef: "WD 2015-4840 — Guard I / Guard II (armed)",
    notes: "FSO oversight required; NISPOM Chapter 3 governs badge/access. PSAP (Physical Security) vehicle used for large DoD guard contracts."
  },

  // ─── Healthcare (SCA/clinical) ───────────────────────────────────────────────
  {
    category: "Healthcare",
    laborCat: "Registered Nurse (Federal)",
    commercialTitle: "Staff Nurse / Clinical RN",
    eduReq: "BSN required by most VA/DoD contracts; state RN license + BLS",
    expReq: "2–5 yrs; EMR (VistA/CPRS or Cerner MHS GENESIS preferred)",
    civilianLow: 80, civilianHigh: 130,
    dodLow: 88, dodHigh: 142,
    gsMasSchedule: "MAS Medical (65) / VA T4NG II",
    scaWDRef: "WD 2015-4567 — Practical Nurse / RN where state-licensed applicable",
    notes: "VA contracts via T4NG II or MSPV NG; DoD contracts via DHA MEDCOM vehicles"
  },
  {
    category: "Healthcare",
    laborCat: "Medical Coder / HIM Specialist",
    commercialTitle: "Health Information Management Analyst / Medical Coder",
    eduReq: "Associate's or Bachelor's in HIM; CPC or CCS credential",
    expReq: "2–5 yrs; ICD-10-CM/PCS, CPT, federal E/M audit standards",
    civilianLow: 45, civilianHigh: 80,
    dodLow: 50, dodHigh: 88,
    gsMasSchedule: "MAS Medical (65) / MAS 00CORP",
    scaWDRef: "WD 2015-4567 — Medical Records Technician",
    notes: "VHA CDW and DoD TMDS data abstraction projects drive most demand in FY2026"
  },

  // ─── Technical Writer / Documentation ───────────────────────────────────────
  {
    category: "Technical Writing / Documentation",
    laborCat: "Junior Technical Writer",
    commercialTitle: "Technical Writer I / Documentation Specialist",
    eduReq: "Bachelor's in English, Technical Comm, or related",
    expReq: "1–4 yrs; MIL-STD-38784 or DITA-XML familiarity helpful",
    civilianLow: 62, civilianHigh: 95,
    dodLow: 68, dodHigh: 104,
    gsMasSchedule: "MAS 00CORP / PSS",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "Proposal writers sometimes billed under this LCAT on T&M contracts"
  },
  {
    category: "Technical Writing / Documentation",
    laborCat: "Senior Technical Writer",
    commercialTitle: "Principal Technical Writer / Knowledge Manager",
    eduReq: "Bachelor's req; Master's or STC membership preferred",
    expReq: "8+ yrs; DITA authoring, Content Management (MadCap Flare/Vasont), 508 remediation",
    civilianLow: 100, civilianHigh: 155,
    dodLow: 110, dodHigh: 168,
    gsMasSchedule: "MAS 00CORP / OASIS+",
    scaWDRef: "N/A (exempt white-collar)",
    notes: "DoD Instruction 5025.01 (DoD Directives) compliance writing commands top of range"
  },
];

// ── Build workbook ────────────────────────────────────────────────────────────
const wb = new ExcelJS.Workbook();
wb.creator = "CapturePilot";
wb.lastModifiedBy = "CapturePilot";
wb.created = new Date();
wb.modified = new Date();
wb.company = "CapturePilot";
wb.title = WB_TITLE;
wb.subject = "FY2026 federal labor category rates and requirements for PTW pricing";

// Lists must be built before any sheet references named ranges
const DV = buildListsSheet(wb, [
  {
    name: "CategoryFilter",
    title: "Labor Category",
    items: [...new Set(LABOR_CATS.map(r => r.category))],
  },
  {
    name: "MASSchedules",
    title: "GSA MAS Schedule",
    items: [
      "IT-70",
      "MAS 00CORP",
      "PSS",
      "OASIS+",
      "SEWP V",
      "SeaPort NxG",
      "MAS Medical (65)",
      "MAS Facilities (520-1)",
      "CIO-CS",
      "HSPD-12 PIV support",
      "IC BIC-M",
      "Other",
    ],
  },
  {
    name: "ContractType",
    title: "Contract Type",
    items: ["FFP", "T&M", "CPFF", "CPIF", "LH (Labor Hour)", "IDIQ/TO", "BPA"],
  },
  {
    name: "ClearanceLevel",
    title: "Clearance Level",
    items: ["None", "Public Trust", "Secret", "Top Secret", "TS/SCI", "TS/SCI + Poly"],
  },
]);

// ── SHEET 1 — Matrix ──────────────────────────────────────────────────────────
const sMatrix = wb.addWorksheet("Matrix", {
  views: [{ state: "frozen", ySplit: 5, xSplit: 3, showGridLines: false }],
  pageSetup: {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  },
  headerFooter: {
    oddHeader: "&LCapturePilot&CFederal Labor Categories Matrix  FY2026&Rcapturepilot.com",
    oddFooter: "&LFLK-08&C&P of &N&RConfidential — Internal PTW Use Only",
  },
});

// Column widths — 11 data columns
// A: #, B: Category, C: Labor Cat, D: Commercial Title, E: Edu Req, F: Exp Req,
// G: Civ Low, H: Civ High, I: DoD Low, J: DoD High, K: GSA MAS, L: SCA WD Ref, M: Notes
sMatrix.columns = [
  { width: 5 },   // A #
  { width: 26 },  // B Category
  { width: 30 },  // C Labor Cat
  { width: 30 },  // D Commercial Title
  { width: 30 },  // E Edu Req
  { width: 26 },  // F Exp Req
  { width: 11 },  // G Civ Low
  { width: 11 },  // H Civ High
  { width: 11 },  // I DoD Low
  { width: 11 },  // J DoD High
  { width: 28 },  // K MAS Schedules
  { width: 32 },  // L SCA WD Ref
  { width: 48 },  // M Notes
];

// Title banner
sMatrix.mergeCells("A1:M1");
const t1 = sMatrix.getCell("A1");
t1.value = "FEDERAL LABOR CATEGORIES MATRIX  —  FY2026 LOADED BILLABLE RATE REFERENCE";
t1.font = { name: "Calibri", size: 18, bold: true, color: { argb: WHITE } };
t1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
t1.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sMatrix.getRow(1).height = 44;

sMatrix.mergeCells("A2:M2");
const t2 = sMatrix.getCell("A2");
t2.value = "CapturePilot  —  Price-to-Win Toolkit  |  Civilian + DoD fully-loaded rates ($/hr including fringe, overhead, G&A, and fee)  |  Rates are FY2026 market estimates — verify via GSA CALC, FPDS, and your company's actuals before use";
t2.font = { name: "Calibri", size: 10, italic: true, color: { argb: WHITE } };
t2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EMERALD } };
t2.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
sMatrix.getRow(2).height = 30;

// Spacer
sMatrix.getRow(3).height = 6;

// Column header row
const HEADERS = [
  "#", "CATEGORY", "LABOR CATEGORY (LCAT)", "EQUIVALENT COMMERCIAL TITLE",
  "OPM EDUCATION REQUIREMENT", "EXPERIENCE REQUIREMENT",
  "CIVILIAN\nLOW ($/hr)", "CIVILIAN\nHIGH ($/hr)",
  "DoD\nLOW ($/hr)", "DoD\nHIGH ($/hr)",
  "GSA MAS SCHEDULE(S)", "SCA WAGE DETERMINATION REF.", "PRICING NOTES"
];
const HDR_COLS = ["A","B","C","D","E","F","G","H","I","J","K","L","M"];

// Two-row header: merged row 4 for rate group labels
sMatrix.mergeCells("G4:H4");
const civHdr = sMatrix.getCell("G4");
civHdr.value = "CIVILIAN RATES";
civHdr.font = { name: "Calibri", size: 10, bold: true, color: { argb: WHITE } };
civHdr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EMERALD_DARK } };
civHdr.alignment = { vertical: "middle", horizontal: "center" };
sMatrix.getRow(4).height = 20;

sMatrix.mergeCells("I4:J4");
const dodHdr = sMatrix.getCell("I4");
dodHdr.value = "DoD RATES";
dodHdr.font = { name: "Calibri", size: 10, bold: true, color: { argb: WHITE } };
dodHdr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_700 } };
dodHdr.alignment = { vertical: "middle", horizontal: "center" };

// Fill the other row-4 cells with dark bg for continuity
["A","B","C","D","E","F","K","L","M"].forEach(col => {
  const c = sMatrix.getCell(`${col}4`);
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
});

// Row 5 — actual column labels
HDR_COLS.forEach((col, i) => {
  const c = sMatrix.getCell(`${col}5`);
  c.value = HEADERS[i];
  c.font = { name: "Calibri", size: 10, bold: true, color: { argb: WHITE } };
  c.fill = {
    type: "pattern", pattern: "solid",
    fgColor: { argb: ["G","H"].includes(col) ? EMERALD_DARK : ["I","J"].includes(col) ? SLATE_700 : SLATE_900 }
  };
  c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  c.border = {
    bottom: { style: "medium", color: { argb: EMERALD } },
  };
});
sMatrix.getRow(5).height = 38;

// Data rows
let r = 6;
let prevCat = "";
LABOR_CATS.forEach((row, idx) => {
  // Category group banner
  if (row.category !== prevCat) {
    sMatrix.mergeCells(`A${r}:M${r}`);
    const banner = sMatrix.getCell(`A${r}`);
    banner.value = `▸  ${row.category.toUpperCase()}`;
    banner.font = { name: "Calibri", size: 10, bold: true, color: { argb: WHITE } };
    banner.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EMERALD_DARK } };
    banner.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    sMatrix.getRow(r).height = 20;
    r++;
    prevCat = row.category;
  }

  const zebra = idx % 2 === 0 ? WHITE : SLATE_50;
  const baseFont = { name: "Calibri", size: 10 };
  const baseFill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
  const baseBorder = { bottom: { style: "thin", color: { argb: SLATE_200 } } };

  function setCell(col, value, extra = {}) {
    const c = sMatrix.getCell(`${col}${r}`);
    c.value = value;
    c.font = { ...baseFont, ...(extra.font || {}) };
    c.fill = extra.fill || baseFill;
    c.border = baseBorder;
    c.alignment = extra.align || { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
    return c;
  }

  setCell("A", idx + 1, { align: { vertical: "middle", horizontal: "center" }, font: { name: "Consolas", size: 9, color: { argb: SLATE_700 } } });
  setCell("B", row.category, { font: { ...baseFont, bold: true, color: { argb: SLATE_700 } } });
  setCell("C", row.laborCat, { font: { ...baseFont, bold: true, color: { argb: SLATE_900 } } });
  setCell("D", row.commercialTitle);
  setCell("E", row.eduReq);
  setCell("F", row.expReq);

  // Rate cells — green-tinted for civilian, slate-tinted for DoD
  const civFill = { type: "pattern", pattern: "solid", fgColor: { argb: idx % 2 === 0 ? "FFECFDF5" : "FFD1FAE5" } };
  const dodFill = { type: "pattern", pattern: "solid", fgColor: { argb: idx % 2 === 0 ? "FFF1F5F9" : "FFE2E8F0" } };

  const cG = sMatrix.getCell(`G${r}`);
  cG.value = row.civilianLow;
  cG.numFmt = '"$"#,##0';
  cG.font = { name: "Calibri", size: 10, color: { argb: EMERALD_DARK } };
  cG.fill = civFill;
  cG.border = baseBorder;
  cG.alignment = { vertical: "middle", horizontal: "right" };

  const cH = sMatrix.getCell(`H${r}`);
  cH.value = row.civilianHigh;
  cH.numFmt = '"$"#,##0';
  cH.font = { name: "Calibri", size: 10, bold: true, color: { argb: EMERALD_DARK } };
  cH.fill = civFill;
  cH.border = baseBorder;
  cH.alignment = { vertical: "middle", horizontal: "right" };

  const cI = sMatrix.getCell(`I${r}`);
  cI.value = row.dodLow;
  cI.numFmt = '"$"#,##0';
  cI.font = { name: "Calibri", size: 10, color: { argb: SLATE_700 } };
  cI.fill = dodFill;
  cI.border = baseBorder;
  cI.alignment = { vertical: "middle", horizontal: "right" };

  const cJ = sMatrix.getCell(`J${r}`);
  cJ.value = row.dodHigh;
  cJ.numFmt = '"$"#,##0';
  cJ.font = { name: "Calibri", size: 10, bold: true, color: { argb: SLATE_700 } };
  cJ.fill = dodFill;
  cJ.border = baseBorder;
  cJ.alignment = { vertical: "middle", horizontal: "right" };

  setCell("K", row.gsMasSchedule);
  setCell("L", row.scaWDRef, { font: { name: "Calibri", size: 9, italic: true, color: { argb: SLATE_700 } } });
  setCell("M", row.notes, { font: { name: "Calibri", size: 9, color: { argb: SLATE_700 } } });

  // MAS dropdown on K column
  sMatrix.dataValidations.add(`K${r}`, {
    type: "list",
    allowBlank: true,
    formulae: [DV.MASSchedules],
    showErrorMessage: false,
  });

  sMatrix.getRow(r).height = 42;
  r++;
});

// Footer note row
r++;
sMatrix.mergeCells(`A${r}:M${r}`);
const footNote = sMatrix.getCell(`A${r}`);
footNote.value = "★  All rates are fully-loaded $/hour estimates for FY2026 (Oct 2025 – Sep 2026). They include direct labor, fringe (avg ~35%), overhead (~15–25%), G&A (~8–12%), and a 7–10% fee — consistent with how GSA CALC and FPDS-NG award data reflect loaded contract rates. Always validate against your indirect cost structure, applicable CBA/SCA wage determinations, and recent FPDS award data for the specific agency and NAICS before submitting a proposal.";
footNote.font = { name: "Calibri", size: 9, italic: true, color: { argb: SLATE_700 } };
footNote.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AMBER_FILL } };
footNote.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
sMatrix.getRow(r).height = 52;
r += 2;

sMatrix.mergeCells(`A${r}:M${r}`);
sMatrix.getCell(`A${r}`).value = FOOTER;
sMatrix.getCell(`A${r}`).font = { name: "Calibri", size: 9, italic: true, color: { argb: SLATE_700 } };
sMatrix.getCell(`A${r}`).alignment = { vertical: "middle", horizontal: "center" };

// ── SHEET 2 — Sources ─────────────────────────────────────────────────────────
const sSources = wb.addWorksheet("Sources", {
  views: [{ showGridLines: false }],
  pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1 },
  headerFooter: {
    oddHeader: "&LCapturePilot&CSources&Rcapturepilot.com",
    oddFooter: "&LFLK-08&C&P of &N&RConfidential",
  },
});

sSources.columns = [
  { width: 8 },   // A
  { width: 36 },  // B Source name
  { width: 55 },  // C URL
  { width: 55 },  // D How to use
];

sSources.mergeCells("A1:D1");
sSources.getCell("A1").value = "SOURCES & REFERENCE LINKS";
sSources.getCell("A1").font = { name: "Calibri", size: 18, bold: true, color: { argb: WHITE } };
sSources.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
sSources.getCell("A1").alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sSources.getRow(1).height = 40;

sSources.mergeCells("A2:D2");
sSources.getCell("A2").value = "Use these to validate loaded rates before pricing. Bookmark CALC and FPDS — you'll use them on every serious PTW effort.";
sSources.getCell("A2").font = { name: "Calibri", size: 11, italic: true, color: { argb: WHITE } };
sSources.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: EMERALD } };
sSources.getCell("A2").alignment = { vertical: "middle", horizontal: "left", indent: 1 };
sSources.getRow(2).height = 26;

const SOURCES_GROUPS = [
  {
    group: "GSA — Rate & Award Data",
    items: [
      {
        name: "GSA CALC (Contract-Awarded Labor Categories)",
        url: "https://calc.gsa.gov",
        howTo: "Search by LCAT title + experience level; filter by contract type and education. Shows actual awarded rates from current GSA MAS schedules. Best single source for sanity-checking your rate card."
      },
      {
        name: "GSA MAS Price Disclosures (eLibrary)",
        url: "https://www.gsaelibrary.gsa.gov",
        howTo: "Pull pricelists for specific MAS contractors in your NAICS to see how competitors price their LCATs. Useful for narrowing your PTW range on full-and-open competitions under GSA vehicles."
      },
      {
        name: "GSA MAS Schedule 00CORP (Non-IT Professional Services)",
        url: "https://www.gsa.gov/buying-selling/purchasing-programs/gsa-schedules/schedule-buyers/schedule-00corp",
        howTo: "See SINs (Special Item Numbers) for non-IT professional services. Cross-reference labor cats against SIN descriptions to confirm classification."
      },
    ]
  },
  {
    group: "OPM — Classification & Pay Standards",
    items: [
      {
        name: "OPM Federal Wage System (FWS) Pay Schedules",
        url: "https://www.opm.gov/policy-data-oversight/pay-leave/pay-systems/federal-wage-system/",
        howTo: "Use for blue-collar trade/craft categories. FWS rates are locality-based and updated annually. Always verify the specific WS (Wage Schedule) for the performance state."
      },
      {
        name: "OPM Qualifications Standards (GS Series)",
        url: "https://www.opm.gov/policy-data-oversight/classification-qualifications/general-schedule-qualification-standards/",
        howTo: "Look up the OPM Qualification Standard for the GS series that matches your LCAT (e.g., 0854 for Computer Engineering, 2210 for IT Management, 0343 for Program Analysis). Education and experience requirements in this matrix are derived from OPM standards."
      },
      {
        name: "OPM General Schedule Pay Tables (FY2026)",
        url: "https://www.opm.gov/policy-data-oversight/pay-leave/salaries-wages/",
        howTo: "GS salary tables set the floor for civilian equivalent pay. Add locality pay adjustment (e.g., 32.49% for D.C. metro) before applying overhead to get a market-rate check."
      },
    ]
  },
  {
    group: "DoL / SCA — Wage Determinations",
    items: [
      {
        name: "Wage Determinations Online (WDOL / SAM.gov beta)",
        url: "https://sam.gov/wage-determinations",
        howTo: "Pull SCA wage determinations by state/county/occupation for service contracts >$2,500. Always use the WD attached to the solicitation, not a generic one. WDOL is the authoritative source — check it at proposal submission, not just during kick-off."
      },
      {
        name: "DOL Wage and Hour Division — SCA Compliance",
        url: "https://www.dol.gov/agencies/whd/government-contracts/service-contracts",
        howTo: "Review FAR 22.1000–22.1020 alongside DOL guidance to confirm which employees must be paid SCA rates. Common trigger: non-exempt service employees working on a contract >$2,500."
      },
      {
        name: "Davis-Bacon Wage Determinations",
        url: "https://sam.gov/wage-determinations",
        howTo: "Applies to construction and construction-adjacent work under FAR 22.4. Use if your O&M or facilities contract includes any alteration/repair work on federal buildings."
      },
    ]
  },
  {
    group: "FPDS / USASpending — Competitive Rate Intelligence",
    items: [
      {
        name: "FPDS-NG (Federal Procurement Data System)",
        url: "https://www.fpds.gov",
        howTo: "Search by NAICS, agency, and contractor name to find award history. Pull action obligation amounts and divide by estimated FTE-months to triangulate loaded rates on similar past awards. Manually intensive but highly specific."
      },
      {
        name: "USASpending.gov — Spending Explorer",
        url: "https://www.usaspending.gov",
        howTo: "Better UI than FPDS for trend analysis. Filter by agency + NAICS + award type to see what the government is actually paying. Use 'Federal Account' view to spot unobligated balances that suggest upcoming recompetes."
      },
    ]
  },
  {
    group: "SBIR / Industry Surveys — Market Rate Benchmarks",
    items: [
      {
        name: "SBA SBIR Salary Guidance",
        url: "https://www.sbir.gov/sites/default/files/project-grant-proposal-budget-guidelines.pdf",
        howTo: "SBIR programs explicitly cap salary/rate escalation and require justification for rates above NIH/NSF benchmarks. Use this if you're pricing an SBIR Phase I/II effort."
      },
      {
        name: "ERI Salary Assessor / Radford (third-party)",
        url: "https://www.erieri.com",
        howTo: "Paid tool. Widely accepted by DCAA for establishing fair market compensation. Useful when the government challenges rate realism in CPFF or T&M proposals."
      },
      {
        name: "Bureau of Labor Statistics Occupational Employment Survey (OES)",
        url: "https://www.bls.gov/oes/",
        howTo: "Free and DCAA-defensible. Pull by SOC code and metro area; convert annual salary to $/hr using 2080 hours; add your fringe/overhead/G&A/fee structure to get a loaded-rate check. Less precise than CALC but strong for new categories not yet in CALC."
      },
    ]
  },
];

let sr = 4;
SOURCES_GROUPS.forEach(group => {
  // Group banner
  sSources.mergeCells(`A${sr}:D${sr}`);
  const banner = sSources.getCell(`A${sr}`);
  banner.value = group.group.toUpperCase();
  banner.font = { name: "Calibri", size: 11, bold: true, color: { argb: WHITE } };
  banner.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EMERALD_DARK } };
  banner.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sSources.getRow(sr).height = 22;
  sr++;

  // Column headers
  ["#", "SOURCE / TOOL", "URL", "HOW TO USE FOR PTW"].forEach((label, ci) => {
    const col = String.fromCharCode(65 + ci);
    const c = sSources.getCell(`${col}${sr}`);
    c.value = label;
    c.font = { name: "Calibri", size: 9, bold: true, color: { argb: WHITE } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SLATE_900 } };
    c.alignment = { vertical: "middle", horizontal: "center" };
  });
  sSources.getRow(sr).height = 18;
  sr++;

  group.items.forEach((item, i) => {
    const zebra = i % 2 === 0 ? WHITE : SLATE_50;
    const fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
    const bdr = { bottom: { style: "thin", color: { argb: SLATE_200 } } };

    sSources.getCell(`A${sr}`).value = i + 1;
    sSources.getCell(`A${sr}`).font = { name: "Calibri", size: 9 };
    sSources.getCell(`A${sr}`).fill = fill;
    sSources.getCell(`A${sr}`).border = bdr;
    sSources.getCell(`A${sr}`).alignment = { vertical: "middle", horizontal: "center" };

    sSources.getCell(`B${sr}`).value = item.name;
    sSources.getCell(`B${sr}`).font = { name: "Calibri", size: 10, bold: true, color: { argb: SLATE_900 } };
    sSources.getCell(`B${sr}`).fill = fill;
    sSources.getCell(`B${sr}`).border = bdr;
    sSources.getCell(`B${sr}`).alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };

    sSources.getCell(`C${sr}`).value = { text: item.url, hyperlink: item.url };
    sSources.getCell(`C${sr}`).font = { name: "Calibri", size: 10, color: { argb: "FF2563EB" }, underline: true };
    sSources.getCell(`C${sr}`).fill = fill;
    sSources.getCell(`C${sr}`).border = bdr;
    sSources.getCell(`C${sr}`).alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };

    sSources.getCell(`D${sr}`).value = item.howTo;
    sSources.getCell(`D${sr}`).font = { name: "Calibri", size: 9, color: { argb: SLATE_700 } };
    sSources.getCell(`D${sr}`).fill = fill;
    sSources.getCell(`D${sr}`).border = bdr;
    sSources.getCell(`D${sr}`).alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };

    sSources.getRow(sr).height = 52;
    sr++;
  });

  sr++; // gap between groups
});

sr++;
sSources.mergeCells(`A${sr}:D${sr}`);
sSources.getCell(`A${sr}`).value = FOOTER;
sSources.getCell(`A${sr}`).font = { name: "Calibri", size: 9, italic: true, color: { argb: SLATE_700 } };
sSources.getCell(`A${sr}`).alignment = { vertical: "middle", horizontal: "center" };

// ── Write file ────────────────────────────────────────────────────────────────
const dir = path.dirname(DEPLOY);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

await wb.xlsx.writeFile(DEPLOY);
const size = fs.statSync(DEPLOY).size;
console.log(`✓ Wrote ${DEPLOY}  (${(size / 1024).toFixed(1)} KB)`);

/**
 * Top federal agencies/departments for targeting preferences.
 * Ordered by FY2025 contracting volume.
 */

export interface FederalAgency {
  code: string;
  label: string;
  shortName: string;
  popular?: boolean;
}

export const FEDERAL_AGENCIES: FederalAgency[] = [
  // --- Cabinet Departments ---
  { code: "DOD", label: "Department of Defense", shortName: "DoD", popular: true },
  { code: "VA", label: "Department of Veterans Affairs", shortName: "VA", popular: true },
  { code: "HHS", label: "Department of Health and Human Services", shortName: "HHS", popular: true },
  { code: "DHS", label: "Department of Homeland Security", shortName: "DHS", popular: true },
  { code: "DOE", label: "Department of Energy", shortName: "DOE", popular: true },
  { code: "DOT", label: "Department of Transportation", shortName: "DOT", popular: true },
  { code: "USDA", label: "Department of Agriculture", shortName: "USDA", popular: true },
  { code: "DOJ", label: "Department of Justice", shortName: "DOJ" },
  { code: "DOI", label: "Department of the Interior", shortName: "DOI" },
  { code: "STATE", label: "Department of State", shortName: "State" },
  { code: "TREASURY", label: "Department of the Treasury", shortName: "Treasury" },
  { code: "DOC", label: "Department of Commerce", shortName: "Commerce" },
  { code: "DOL", label: "Department of Labor", shortName: "DOL" },
  { code: "ED", label: "Department of Education", shortName: "ED" },
  { code: "HUD", label: "Department of Housing and Urban Development", shortName: "HUD" },

  // --- Major Independent Agencies ---
  { code: "GSA", label: "General Services Administration", shortName: "GSA", popular: true },
  { code: "NASA", label: "National Aeronautics and Space Administration", shortName: "NASA" },
  { code: "EPA", label: "Environmental Protection Agency", shortName: "EPA" },
  { code: "SBA", label: "Small Business Administration", shortName: "SBA" },
  { code: "SSA", label: "Social Security Administration", shortName: "SSA" },
  { code: "OPM", label: "Office of Personnel Management", shortName: "OPM" },
  { code: "FEMA", label: "Federal Emergency Management Agency", shortName: "FEMA" },

  // --- DoD Sub-Agencies (highest contracting volume) ---
  { code: "ARMY", label: "U.S. Army", shortName: "Army", popular: true },
  { code: "NAVY", label: "U.S. Navy", shortName: "Navy", popular: true },
  { code: "USAF", label: "U.S. Air Force", shortName: "Air Force", popular: true },
  { code: "USACE", label: "U.S. Army Corps of Engineers", shortName: "USACE", popular: true },
  { code: "DLA", label: "Defense Logistics Agency", shortName: "DLA" },
  { code: "DISA", label: "Defense Information Systems Agency", shortName: "DISA" },
  { code: "DCMA", label: "Defense Contract Management Agency", shortName: "DCMA" },
];

/**
 * Common NAICS codes with human-readable descriptions.
 * Used across the portal for dropdowns, badges, and tooltips.
 */
export const NAICS_LABELS: Record<string, string> = {
  // Construction
  "236220": "Commercial and Institutional Building Construction",
  "237110": "Water and Sewer Line and Related Structures Construction",
  "237120": "Oil and Gas Pipeline and Related Structures Construction",
  "237130": "Power and Communication Line and Related Structures Construction",
  "237210": "Land Subdivision",
  "237310": "Highway, Street, and Bridge Construction",
  "237990": "Other Heavy and Civil Engineering Construction",
  "238110": "Poured Concrete Foundation and Structure Contractors",
  "238210": "Electrical Contractors and Other Wiring Installation Contractors",
  "238220": "Plumbing, Heating, and Air-Conditioning Contractors",
  "238910": "Site Preparation Contractors",
  "238990": "All Other Specialty Trade Contractors",

  // Telecommunications
  "517110": "Wired Telecommunications Carriers",
  "517210": "Wireless Telecommunications Carriers (except Satellite)",
  "517311": "Wired Telecommunications Resellers",
  "517312": "Wireless Telecommunications Carriers (except Satellite)",
  "517410": "Satellite Telecommunications",
  "517810": "All Other Telecommunications",
  "517919": "All Other Telecommunications",

  // IT & Professional Services
  "541330": "Engineering Services",
  "541340": "Drafting Services",
  "541380": "Testing Laboratories and Services",
  "541511": "Custom Computer Programming Services",
  "541512": "Computer Systems Design Services",
  "541513": "Computer Facilities Management Services",
  "541519": "Other Computer Related Services",
  "541611": "Administrative Management and General Management Consulting Services",
  "541612": "Human Resources Consulting Services",
  "541614": "Process, Physical Distribution, and Logistics Consulting Services",
  "541618": "Other Management Consulting Services",
  "541620": "Environmental Consulting Services",
  "541690": "Other Scientific and Technical Consulting Services",
  "541715": "Research and Development in the Physical, Engineering, and Life Sciences",
  "541990": "All Other Professional, Scientific, and Technical Services",

  // Facility Services
  "561210": "Facilities Support Services",
  "561612": "Security Guards and Patrol Services",
  "561621": "Security Systems Services (except Locksmiths)",
  "561710": "Exterminating and Pest Control Services",
  "561720": "Janitorial Services",
  "561730": "Landscaping Services",
  "561790": "Other Services to Buildings and Dwellings",
  "562910": "Remediation Services",

  // Transportation & Logistics
  "484110": "General Freight Trucking, Local",
  "484121": "General Freight Trucking, Long-Distance, Truckload",
  "488410": "Motor Vehicle Towing",
  "488490": "Other Support Activities for Road Transportation",

  // Manufacturing & Defense
  "334290": "Other Communications Equipment Manufacturing",
  "334511": "Search, Detection, Navigation, Guidance, Aeronautical Systems",
  "334512": "Automatic Environmental Control Manufacturing",
  "336411": "Aircraft Manufacturing",
  "336413": "Other Aircraft Parts and Auxiliary Equipment Manufacturing",

  // Other
  "221118": "Other Electric Power Generation",
  "238320": "Painting and Wall Covering Contractors",
  "423610": "Electrical Apparatus and Equipment Merchant Wholesalers",
  "541310": "Architectural Services",
  "541320": "Landscape Architectural Services",
  "561320": "Temporary Help Services",
  "624120": "Services for the Elderly and Persons with Disabilities",
  "721110": "Hotels and Motels",
  "812990": "All Other Personal Services",
  "811111": "General Automotive Repair",
  "811114": "Specialized Automotive Repair",
  "811121": "Automotive Body, Paint, Interior, and Glass Repair",
};

/**
 * Get a NAICS code label. Returns "Code — Description" or just the code if unknown.
 */
export function getNaicsLabel(code: string): string {
  const desc = NAICS_LABELS[code];
  return desc ? `${code} — ${desc}` : code;
}

/**
 * Get just the description for a NAICS code.
 */
export function getNaicsDescription(code: string): string {
  return NAICS_LABELS[code] || "Unknown NAICS Code";
}

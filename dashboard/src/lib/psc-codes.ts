/**
 * Top federal government Product/Service Codes (PSCs)
 * Used for matching user capabilities to opportunity requirements.
 * Source: GSA Federal Procurement Data System
 */

export interface PSCCode {
  code: string;
  label: string;
  category: string;
  popular?: boolean;
}

export const PSC_CODES: PSCCode[] = [
  // --- Services (most common for small business) ---
  { code: "S201", label: "Housekeeping - Janitorial", category: "Services", popular: true },
  { code: "S202", label: "Housekeeping - Fire Prevention", category: "Services" },
  { code: "S203", label: "Housekeeping - Food Service", category: "Services" },
  { code: "S204", label: "Housekeeping - Trash/Garbage Collection", category: "Services", popular: true },
  { code: "S205", label: "Housekeeping - Landscaping/Groundskeeping", category: "Services", popular: true },
  { code: "S206", label: "Housekeeping - Guard Service", category: "Services" },
  { code: "S207", label: "Housekeeping - Snow Removal/Salting", category: "Services", popular: true },
  { code: "S208", label: "Housekeeping - Pest Control", category: "Services" },
  { code: "S216", label: "Facilities Operations Support", category: "Services", popular: true },

  // --- Construction ---
  { code: "Y1AA", label: "Construction of Office Buildings", category: "Construction" },
  { code: "Y1AZ", label: "Construction of Other Administrative Facilities", category: "Construction" },
  { code: "Y1DA", label: "Construction of Hospitals/Infirmaries", category: "Construction" },
  { code: "Y1JZ", label: "Construction of Misc. Buildings", category: "Construction" },
  { code: "Z1AA", label: "Maintenance of Office Buildings", category: "Construction", popular: true },
  { code: "Z1DA", label: "Maintenance of Hospitals", category: "Construction" },
  { code: "Z2AA", label: "Repair of Office Buildings", category: "Construction", popular: true },

  // --- IT & Professional Services ---
  { code: "D301", label: "IT Facility Operation/Maintenance", category: "IT Services", popular: true },
  { code: "D302", label: "IT Systems Development", category: "IT Services", popular: true },
  { code: "D303", label: "IT Telecom & Transmission", category: "IT Services" },
  { code: "D304", label: "IT Teleprocessing/Timesharing", category: "IT Services" },
  { code: "D306", label: "IT Systems Analysis", category: "IT Services", popular: true },
  { code: "D307", label: "IT Data Conversion", category: "IT Services" },
  { code: "D308", label: "IT Programming", category: "IT Services", popular: true },
  { code: "D310", label: "IT Cyber Security", category: "IT Services", popular: true },
  { code: "D311", label: "IT Data/Records Management", category: "IT Services" },
  { code: "D313", label: "IT Computer Aided Design", category: "IT Services" },
  { code: "D316", label: "IT Telecommunications Network Management", category: "IT Services" },
  { code: "D317", label: "IT Web-Based Subscription", category: "IT Services" },
  { code: "D318", label: "IT Integrated Hardware/Software/Services", category: "IT Services" },
  { code: "D399", label: "IT Other Services", category: "IT Services" },

  // --- Professional/Management Consulting ---
  { code: "R408", label: "Program Management/Support", category: "Professional Services", popular: true },
  { code: "R425", label: "Engineering/Technical Support", category: "Professional Services", popular: true },
  { code: "R497", label: "Personal Services Contracts", category: "Professional Services" },
  { code: "R499", label: "Other Professional Services", category: "Professional Services" },
  { code: "R602", label: "Logistics Support Services", category: "Professional Services" },
  { code: "R699", label: "Other Administrative Support", category: "Professional Services" },
  { code: "R706", label: "Management/Professional Consulting", category: "Professional Services", popular: true },
  { code: "R707", label: "Contract/Procurement/Acquisition Support", category: "Professional Services" },
  { code: "R710", label: "Financial/Budget/Accounting Support", category: "Professional Services" },
  { code: "R799", label: "Other Management Support", category: "Professional Services" },

  // --- Research & Development ---
  { code: "AC11", label: "R&D - Agriculture", category: "R&D" },
  { code: "AD11", label: "R&D - Defense Systems", category: "R&D" },
  { code: "AJ11", label: "R&D - Space (General)", category: "R&D" },
  { code: "AN11", label: "R&D - Other", category: "R&D" },

  // --- Transportation ---
  { code: "V111", label: "Motor Vehicle Maintenance", category: "Transportation", popular: true },
  { code: "V119", label: "Other Motor Vehicle Maintenance", category: "Transportation" },
  { code: "V211", label: "Motor Pool Operations", category: "Transportation" },
  { code: "V221", label: "Air Passenger/Cargo Transportation", category: "Transportation" },

  // --- Education & Training ---
  { code: "U001", label: "Education/Training - General", category: "Training", popular: true },
  { code: "U004", label: "Education/Training - Scientific", category: "Training" },
  { code: "U006", label: "Education/Training - Vocational", category: "Training" },
  { code: "U008", label: "Education/Training - IT/Computer", category: "Training" },
  { code: "U099", label: "Other Education/Training", category: "Training" },

  // --- Medical & Social ---
  { code: "Q101", label: "Medical/Dental - General Healthcare", category: "Medical" },
  { code: "Q201", label: "Medical/Dental - Clinical", category: "Medical" },
  { code: "Q301", label: "Medical - Lab/Testing", category: "Medical" },
  { code: "Q501", label: "Medical - Pharmacy", category: "Medical" },
  { code: "Q999", label: "Medical - Other", category: "Medical" },

  // --- Environmental ---
  { code: "F108", label: "Environmental Remediation", category: "Environmental", popular: true },
  { code: "F999", label: "Other Environmental Services", category: "Environmental" },
];

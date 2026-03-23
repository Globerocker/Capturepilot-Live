/**
 * TypeScript interfaces for the Crawlee-based company website crawler.
 * Must match the JSON structure previously produced by tools/17_analyze_company.py
 */

export interface CrawlResult {
    success: boolean;
    data: CrawlData;
    errors: string[];
}

export interface CrawlData {
    company_name: string;
    description: string;
    services: string[];
    locations: Array<{ address?: string; state?: string }>;
    detected_states: string[];
    contacts: Array<{ email?: string; phone?: string }>;
    certifications: Array<{ type: string; confidence: number }>;
    employee_signals: { estimate: number; source: string } | null;
    founding_year: number | null;
    leadership: Array<{ name: string; title: string; email?: string; phone?: string }>;
    social_links: { linkedin: string | null; facebook: string | null; twitter: string | null };
    linkedin_data: { description?: string; employee_count?: number; industry?: string } | null;
    revenue_signals: { estimate: number; source: string } | null;
    past_clients: string[];
    detected_uei: string | null;
    detected_cage_code: string | null;
    legal_info: { legal_name?: string; entity_type?: string };
    all_page_text: string;
    pages_crawled: string[];
    crawl_duration_ms: number;
    crawl_depth: number;
}

export function emptyData(): CrawlData {
    return {
        company_name: "",
        description: "",
        services: [],
        locations: [],
        detected_states: [],
        contacts: [],
        certifications: [],
        employee_signals: null,
        founding_year: null,
        leadership: [],
        social_links: { linkedin: null, facebook: null, twitter: null },
        linkedin_data: null,
        revenue_signals: null,
        past_clients: [],
        detected_uei: null,
        detected_cage_code: null,
        legal_info: {},
        all_page_text: "",
        pages_crawled: [],
        crawl_duration_ms: 0,
        crawl_depth: 0,
    };
}

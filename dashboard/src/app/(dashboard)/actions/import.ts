"use server";

import { createClient } from "@supabase/supabase-js";

// Force dynamic execution for server actions accessing env vars
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY! // Bypass RLS for bulk backend admin import
);

interface ContractorRow {
    uei: string;
    cage_code: string;
    company_name: string;
    dba_name?: string;
    state?: string;
    naics_codes?: string[];
    certifications?: string[];
    is_sam_registered: boolean;
}

export async function importOpportunitiesBatch(batch: Record<string, any>[]) {
    try {
        // STEP 1: Process and Upsert Agencies
        const agenciesSet = new Map();
        for (const row of batch) {
            const agencyKey = `${row.department}|${row.sub_tier}|${row.office}`;
            if (!agenciesSet.has(agencyKey) && (row.department || row.sub_tier || row.office)) {
                agenciesSet.set(agencyKey, {
                    department: row.department,
                    sub_tier: row.sub_tier,
                    office: row.office,
                    cgac: row.cgac || null,
                    fpds_code: row.fpds_code || null,
                    aac_code: row.aac_code || null,
                    organization_type: row.organization_type || null
                });
            }
        }

        const agencyMap: Record<string, string> = {};
        if (agenciesSet.size > 0) {
            const agenciesToUpsert = Array.from(agenciesSet.values());
            const { data: insertedAgencies, error: agencyErr } = await supabase
                .from('agencies')
                .upsert(agenciesToUpsert, { onConflict: 'department, sub_tier, office' })
                .select();

            if (agencyErr) throw new Error(`Agency Upsert Failed: ${agencyErr.message}`);

            insertedAgencies?.forEach(a => {
                agencyMap[`${a.department}|${a.sub_tier}|${a.office}`] = a.id;
            });
        }

        // STEP 2: Process and Upsert NAICS & PSC
        const naicsCodes = Array.from(new Set(batch.map(r => r.naics_code).filter(Boolean))).map(c => ({ code: c }));
        if (naicsCodes.length > 0) await supabase.from('naics_codes').upsert(naicsCodes, { onConflict: 'code' });

        const pscCodes = Array.from(new Set(batch.map(r => r.psc_code).filter(Boolean))).map(c => ({ code: c }));
        if (pscCodes.length > 0) await supabase.from('psc_codes').upsert(pscCodes, { onConflict: 'code' });

        // Fetch lookup ENUMs maps (Types, Set Asides) - assuming they were seeded
        const { data: oppTypes } = await supabase.from('opportunity_types').select('id, name');
        const oppTypeMap: Record<string, number> = oppTypes?.reduce((acc: Record<string, number>, obj) => ({ ...acc, [obj.name]: obj.id }), {}) || {};

        const { data: setAsides } = await supabase.from('set_asides').select('id, code');
        const setAsideMap: Record<string, number> = setAsides?.reduce((acc: Record<string, number>, obj) => ({ ...acc, [obj.code]: obj.id }), {}) || {};

        // STEP 3: Process Opportunities
        const opsToUpsert = batch.map(row => {
            const agencyKey = `${row.department}|${row.sub_tier}|${row.office}`;
            const saCode = mapSetAsideCode(row.set_aside as string);

            return {
                notice_id: row.notice_id,
                title: row.title,
                solicitation_number: row.solicitation_number,
                posted_date: row.posted_date || null,
                response_deadline: row.response_deadline || null,
                opportunity_type_id: oppTypeMap[row.type] || null,
                agency_id: agencyMap[agencyKey] || null,
                naics_code: row.naics_code || null,
                psc_code: row.psc_code || null,
                set_aside_id: setAsideMap[saCode] || null,
                award_amount: parseCurrency(row.award_amount),
                award_date: row.award_date || null,
                award_number: row.award_number || null,
                awardee: row.awardee || null,
                description: row.description,
                link: row.link,
                additional_info_link: row.additional_info_link,
                active: row.is_active
            };
        });

        const { error: opsErr } = await supabase.from('opportunities').upsert(opsToUpsert, { onConflict: 'notice_id' });
        if (opsErr) throw new Error(`Opportunities Upsert Failed: ${opsErr.message}`);

        // STEP 4: Process Contacts
        const contactsToUpsert: Record<string, any>[] = [];
        batch.forEach(row => {
            if (row.primary_contact_email || row.primary_contact_fullname) {
                contactsToUpsert.push({
                    notice_id: row.notice_id,
                    is_primary: true,
                    title: row.primary_contact_title,
                    fullname: row.primary_contact_fullname,
                    email: row.primary_contact_email?.toLowerCase(),
                    phone: row.primary_contact_phone,
                    fax: row.primary_contact_fax
                });
            }
            if (row.secondary_contact_email || row.secondary_contact_fullname) {
                contactsToUpsert.push({
                    notice_id: row.notice_id,
                    is_primary: false,
                    title: row.secondary_contact_title,
                    fullname: row.secondary_contact_fullname,
                    email: row.secondary_contact_email?.toLowerCase(),
                    phone: row.secondary_contact_phone,
                    fax: row.secondary_contact_fax
                });
            }
        });

        if (contactsToUpsert.length > 0) {
            // Safe deduping contacts before bulk insert
            const uniqueContacts = Array.from(new Set(contactsToUpsert.map(c => JSON.stringify({
                notice_id: c.notice_id, email: c.email, fullname: c.fullname
            })))).map(str => {
                const base = JSON.parse(str);
                return contactsToUpsert.find(c => c.notice_id === base.notice_id && c.email === base.email && c.fullname === base.fullname);
            });
            await supabase.from('contacts').upsert(uniqueContacts, { onConflict: 'notice_id, email, fullname' });
        }

        return { success: true };
    } catch (err: unknown) {
        console.error("Batch insert error:", err);
        return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
}

// Utility Helpers
function mapSetAsideCode(raw: string): string {
    if (!raw) return 'NONE';
    const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const mapping: Record<string, string> = {
        'SBA': 'SBA', 'TOTALSMALLBUSINESS': 'SBA',
        'SBP': 'SBP', 'PARTIALSMALLBUSINESS': 'SBP',
        '8A': '8A', '8AN': '8AN',
        'HZC': 'HZC', 'HUBZONE': 'HZC',
        'SDVOSBC': 'SDVOSBC', 'SERVICEDISABLEDVETERAN': 'SDVOSBS',
        'WOSB': 'WOSB', 'WOMENOWNED': 'WOSB',
        'EDWOSB': 'EDWOSB',
        'VSA': 'VSA'
    };
    for (const key in mapping) {
        if (clean.includes(key)) return mapping[key];
    }
    return 'NONE';
}

function parseCurrency(val: string): number | null {
    if (!val) return null;
    const num = parseFloat(val.replace(/[^0-9.-]+/g, ""));
    return isNaN(num) ? null : num;
}

export async function importContractorsBatch(batch: ContractorRow[]) {
    try {
        const { error } = await supabase.from('contractors').upsert(batch, { onConflict: 'uei' });
        if (error) {
            console.error("Batch insert error:", error);
            return { success: false, error: error.message };
        }
        return { success: true };
    } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
}

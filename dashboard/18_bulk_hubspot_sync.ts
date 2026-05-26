import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Load root .env
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';
const apolloKey = process.env.APOLLO_API_KEY || '';
const hsToken = process.env.HUBSPOT_ACCESS_TOKEN || process.env.HUBSPOT_PRIVATE_APP_TOKEN || '';

const PIPELINE_SAAS_ID = process.env.HUBSPOT_SAAS_PIPELINE_ID || '2195541747';
const STAGE_QUICK_CHECK = process.env.HUBSPOT_SAAS_STAGE_QUICK_CHECK || '3501956828';

const isDryRun = process.argv.includes('--dry-run');

if (!supabaseUrl || !supabaseKey) throw new Error("Missing Supabase credentials");
if (!hsToken) throw new Error("Missing HubSpot credentials");

const supabase = createClient(supabaseUrl, supabaseKey);

// --- HubSpot Methods (inlined for standalone execution) ---
async function hsApi(method: string, endpoint: string, body?: any) {
    if (isDryRun) return { id: 'dry-run-id' };
    const res = await fetch(`https://api.hubapi.com${endpoint}`, {
        method,
        headers: {
            'Authorization': `Bearer ${hsToken}`,
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`HubSpot Error (${method} ${endpoint}): ${text}`);
    }
    return res.json();
}

async function syncContact(email: string, props: any): Promise<string | null> {
    const formattedProps = Object.fromEntries(
        Object.entries(props).filter(([k, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)])
    );
    try {
        const res = await hsApi('POST', '/crm/v3/objects/contacts', {
            properties: { email, ...formattedProps }
        });
        return res.id;
    } catch (err: any) {
        const msg = err.message;
        if (msg.includes('409') || msg.includes('CONTACT_EXISTS') || msg.includes('CONFLICT')) {
            const match = msg.match(/existing object id:\s*(\d+)/i) || msg.match(/Existing ID:\s*(\d+)/i) || msg.match(/"id"\s*:\s*"?(\d+)"?/);
            const id = match?.[1];
            if (id) {
                if (!isDryRun) {
                    await hsApi('PATCH', `/crm/v3/objects/contacts/${id}`, { properties: formattedProps });
                }
                return id;
            }
            if (!isDryRun) {
                const patchRes = await hsApi('PATCH', `/crm/v3/objects/contacts/${encodeURIComponent(email)}?idProperty=email`, { properties: formattedProps });
                return patchRes.id;
            }
            return 'dry-run-id';
        }
        console.error(`Failed to sync contact ${email}: ${msg}`);
        return null;
    }
}

async function findDealForContact(contactId: string, pipelineId: string) {
    if (isDryRun) return null;
    try {
        const res = await hsApi('POST', '/crm/v3/objects/deals/search', {
            filterGroups: [{
                filters: [
                    { propertyName: 'pipeline', operator: 'EQ', value: pipelineId },
                    { propertyName: 'associations.contact', operator: 'EQ', value: contactId },
                ]
            }],
            properties: ['dealname'],
            limit: 1
        });
        return res.results?.[0]?.id || null;
    } catch (e: any) {
        console.error(`Deal search failed: ${e.message}`);
        return null;
    }
}

async function createOrUpdateCompany(companyName: string, domain: string) {
    if (!companyName || isDryRun) return isDryRun && companyName ? 'dry-run-comp-id' : null;
    try {
        const properties: any = { name: companyName };
        if (domain) properties.domain = domain;

        const res = await hsApi('POST', '/crm/v3/objects/companies', { properties });
        return res.id;
    } catch (err: any) {
        const msg = err.message;
        if (msg.includes('409') || msg.includes('already exists') || msg.includes('CONFLICT')) {
            const match = msg.match(/existing object id:\s*(\d+)/i) || msg.match(/Existing ID:\s*(\d+)/i) || msg.match(/"id"\s*:\s*"?(\d+)"?/);
            const id = match?.[1];
            return id || null;
        }
        console.error(`Failed to sync company ${companyName}: ${msg}`);
        return null;
    }
}

async function associateContactToCompany(contactId: string, companyId: string) {
    if (isDryRun || !contactId || !companyId) return;
    try {
        await hsApi('PUT', `/crm/v3/objects/companies/${companyId}/associations/contacts/${contactId}/company_to_contact`);
    } catch (err: any) {
        console.error(`Failed to associate contact ${contactId} to company ${companyId}: ${err.message}`);
    }
}

async function createDeal(contactId: string, dealName: string) {
    try {
        const existing = await findDealForContact(contactId, PIPELINE_SAAS_ID);
        if (existing) {
            console.log(`     ⏭️ Deal already exists for contact ${contactId}`);
            return existing;
        }

        const deal = await hsApi('POST', '/crm/v3/objects/deals', {
            properties: {
                dealname: dealName,
                pipeline: PIPELINE_SAAS_ID,
                dealstage: STAGE_QUICK_CHECK,
            }
        });
        const dealId = deal.id;

        if (dealId && contactId && !isDryRun) {
            await hsApi('PUT', `/crm/v3/objects/deals/${dealId}/associations/contacts/${contactId}/deal_to_contact`);
        }
        console.log(`     ✅ Deal created for ${dealName}`);
        return dealId;
    } catch (err: any) {
        console.error(`Create deal failed: ${err.message}`);
        return null;
    }
}

// --- Apollo Enrichment ---
async function enrichPhoneFromApollo(domain: string, firstName: string, lastName: string, companyName: string): Promise<string | null> {
    if (!apolloKey || !domain || !firstName || !lastName || !companyName) return null;
    try {
        const res = await fetch("https://api.apollo.io/api/v1/people/match", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Api-Key": apolloKey },
            body: JSON.stringify({ first_name: firstName, last_name: lastName, domain, organization_name: companyName }),
            signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
            const data = await res.json();
            const person = data.person;
            if (person && person.phone_numbers) {
                const mobile = person.phone_numbers.find((p: any) => p.type === 'mobile')?.sanitized_number;
                return mobile || null;
            }
        }
    } catch { }
    return null;
}

// --- Main execution ---
async function main() {
    console.log(`🚀 Starting Bulk Quick Checker Sync to HubSpot (Dry Run: ${isDryRun})`);

    // Fetch all user profiles that have emails
    const { data: profiles, error } = await supabase
        .from('user_profiles')
        .select('*')
        .not('email', 'is', null)
        .order('created_at', { ascending: false });

    if (error || !profiles) {
        console.error("Failed to fetch user_profiles", error);
        return;
    }

    console.log(`Found ${profiles.length} profiles with emails.`);

    let enrichedCount = 0;
    let syncCount = 0;

    for (const profile of profiles) {
        console.log(`\nProcessing: ${profile.email} (${profile.company_name || 'No Company'})`);

        let phone = profile.contact_phone || profile.phone;

        // Try Apollo Enrichment 
        if (!phone && profile.contact_name && profile.website && profile.company_name) {
            const nameParts = profile.contact_name.trim().split(/\s+/);
            const first = nameParts[0];
            const last = nameParts.slice(1).join(" ");
            const domain = profile.website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];

            console.log(`   🔍 Enriching missing phone from Apollo for ${profile.contact_name}...`);
            if (!isDryRun) {
                phone = await enrichPhoneFromApollo(domain, first, last, profile.company_name);
                if (phone) {
                    console.log(`     ✅ Found mobile number: ${phone}`);
                    await supabase.from('user_profiles').update({ contact_phone: phone }).eq('id', profile.id);
                    enrichedCount++;
                } else {
                    console.log(`     ⏭️ No personal mobile found.`);
                }
                // Rate limit Apollo slightly
                await new Promise(r => setTimeout(r, 200));
            } else {
                console.log(`     [DRY RUN] Would hit Apollo people/match API`);
            }
        }

        // Contact properties payload matches dashboard/src/lib/hubspot.ts mapping
        const nameParts = (profile.contact_name || "").trim().split(/\s+/);
        const properties = {
            firstname: nameParts[0] || "",
            lastname: nameParts.slice(1).join(" ") || "",
            company: profile.company_name,
            phone: phone || "",
            capturepilot_user_id: profile.id,
            account_type: 'self_service',
            subscription_status: profile.stripe_subscription_id ? 'active' : 'free',
            sam_registered: !!profile.uei,
            uei: profile.uei || "",
            business_state: profile.state || "",
            naics_codes: (profile.naics_codes || []).join(", "),
            lead_source_cp: 'quick_checker'
        };

        const contactId = await syncContact(profile.email, properties);
        if (contactId) {
            console.log(`     ✅ Synced Contact -> ID: ${contactId}`);
            syncCount++;

            if (profile.company_name) {
                const domain = profile.website ? profile.website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] : "";
                const companyId = await createOrUpdateCompany(profile.company_name, domain);
                if (companyId) {
                    console.log(`     ✅ Synced Company -> ID: ${companyId}`);
                    await associateContactToCompany(contactId, companyId);
                }
            }

            const dealName = `${profile.company_name || profile.email} — Quick Check Lead`;
            await createDeal(contactId, dealName);
        }

        if (!isDryRun) {
            await new Promise(r => setTimeout(r, 250)); // HubSpot API rate limiting prevention
        }
    }

    console.log(`\n🎉 Sync Complete! Processed ${profiles.length} leads. Enriched ${enrichedCount} phones. Synced ${syncCount} to HubSpot.`);
}

main().catch(console.error);

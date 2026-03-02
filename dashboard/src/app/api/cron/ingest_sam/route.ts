import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Allows cron jobs to run longer
export const maxDuration = 300;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const SAM_API_KEY = process.env.SAM_API_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

export async function GET(req: NextRequest) {
    // 1. Authorization: Only allow authorized requests (e.g. from Vercel Cron)
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        console.log("Starting SAM API Ingestion...");

        // 2. Determine Date Range (Last 3 days by default)
        const toDate = new Date();
        const fromDate = new Date();
        fromDate.setDate(toDate.getDate() - 3);

        const fromStr = fromDate.toISOString().split('T')[0].split('-').join('');
        const toStr = toDate.toISOString().split('T')[0].split('-').join('');
        const dateRange = `[${fromStr},${toStr}]`;

        console.log(`Fetching from range: ${dateRange}`);

        // 3. Setup SAM API parameters
        const limit = 1000;
        let totalProcessed = 0;
        let totalInserted = 0;
        let offset = 0;
        let keepFetching = true;

        while (keepFetching) {
            console.log(`Fetching offset: ${offset}`);
            const url = `https://api.sam.gov/opportunities/v2/search?api_key=${SAM_API_KEY}&postedFrom=${dateRange}&limit=${limit}&offset=${offset}`;

            const reqData = await fetch(url);

            if (!reqData.ok) {
                console.error(`SAM API Error: ${reqData.status} ${reqData.statusText}`);
                break;
            }

            const data = await reqData.json();
            const opps = data.opportunitiesData || [];

            if (opps.length === 0) {
                keepFetching = false;
                break;
            }

            // 4. Transform and Format Data
            const payload = opps.map((o: any) => ({
                notice_id: o.noticeId || null,
                title: o.title || null,
                description: o.description || null,
                agency: o.department || o.subTier || o.agency || null,
                organization_code: null,
                naics_code: o.naicsCode || null,
                psc_code: o.classificationCode || null,
                set_aside_code: o.typeOfSetAside || o.typeOfSetAsideDescription || null,
                notice_type: o.type || null,
                posted_date: o.postedDate ? new Date(o.postedDate).toISOString() : null,
                response_deadline: o.responseDate ? new Date(o.responseDate).toISOString() : null,
                place_of_performance_state: o.placeOfPerformance?.state?.code || null,
                place_of_performance_city: o.placeOfPerformance?.city?.name || null,
                place_of_performance_zip: o.placeOfPerformance?.zip || null,
                solicitation_number: o.solicitationNumber || null,
                estimated_value: null,
                link_url: o.uiLink || (o.noticeId ? `https://sam.gov/opp/${o.noticeId}/view` : null),
                priority_flag: false,
                is_archived: false,
                raw_json: o
            }));

            // 5. Upsert to Supabase
            const { error: dbError } = await supabase
                .from('opportunities')
                .upsert(payload, { onConflict: 'notice_id', ignoreDuplicates: true });

            if (dbError) {
                console.error("DB Insert Error: ", dbError);
                break;
            }

            totalProcessed += opps.length;
            totalInserted += payload.length;
            offset += limit;

            if (opps.length < limit) {
                keepFetching = false;
            }
        }

        console.log(`Ingestion Complete. Processed: ${totalProcessed}. Inserted/Upserted: ${totalInserted}`);
        return NextResponse.json({ success: true, processed: totalProcessed, inserted: totalInserted });

    } catch (e: any) {
        console.error("Fatal Ingestion Error:", e);
        return NextResponse.json({ error: e.message || 'Fatal Error' }, { status: 500 });
    }
}

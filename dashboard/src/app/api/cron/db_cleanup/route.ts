import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        console.log("Starting DB Cleanup...");
        let archivedCount = 0;
        let flaggedCount = 0;

        // 1. Archive Old Opportunities (Past 365 days or Past Deadline)
        const now = new Date();
        const oneYearAgo = new Date();
        oneYearAgo.setDate(now.getDate() - 365);

        // Expired Deadlines
        const { data: expiredOpps } = await supabase
            .from('opportunities')
            .select('id')
            .lt('response_deadline', now.toISOString())
            .eq('is_archived', false)
            .limit(1000);

        if (expiredOpps && expiredOpps.length > 0) {
            const ids = expiredOpps.map(o => o.id);
            await supabase.from('opportunities').update({ is_archived: true }).in('id', ids);
            archivedCount += ids.length;
        }

        // Old Posted Dates
        const { data: oldOpps } = await supabase
            .from('opportunities')
            .select('id')
            .lt('posted_date', oneYearAgo.toISOString())
            .eq('is_archived', false)
            .limit(1000);

        if (oldOpps && oldOpps.length > 0) {
            const ids = oldOpps.map(o => o.id);
            await supabase.from('opportunities').update({ is_archived: true }).in('id', ids);
            archivedCount += ids.length;
        }

        // 2. Flag LOW_QUALITY Contractors (Missing Website, Phone, City, and State)
        const { data: lowQualityCons } = await supabase
            .from('contractors')
            .select('id')
            .is('website', null)
            .is('phone', null)
            .is('city', null)
            .is('state', null)
            .neq('data_quality_flag', 'LOW_QUALITY')
            .limit(1000);

        if (lowQualityCons && lowQualityCons.length > 0) {
            const ids = lowQualityCons.map(c => c.id);
            await supabase.from('contractors').update({ data_quality_flag: 'LOW_QUALITY' }).in('id', ids);
            flaggedCount += ids.length;
        }

        console.log(`Cleanup Complete. Archived: ${archivedCount}. Flagged: ${flaggedCount}`);
        return NextResponse.json({ success: true, archived: archivedCount, flagged: flaggedCount });

    } catch (error: any) {
        console.error("Cleanup Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

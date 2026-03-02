import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ryxgjzehoijjvczqkhwr.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // Requires terminal export

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function run() {
    console.log("Generating Intelligence Payload...");

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekStartIso = weekStart.toISOString().split('T')[0];

    const todayIso = new Date().toISOString();

    const payload = {
        week_start: weekStartIso,
        top_naics: { "541512": 15, "541511": 10, "541330": 8, "518210": 5, "541611": 4 },
        top_agencies: { "Department of Defense": 25, "Veterans Affairs": 12, "Homeland Security": 8 },
        certification_performance: {
            "8(a)": { mentions: 12, trend: "up" },
            "SDVOSB": { mentions: 8, trend: "up" },
            "WOSB": { mentions: 4, trend: "down" }
        },
        competition_trends: {
            summary: "High solicitation volume (145 notices) indicates aggressive push. Competition is expected to be fierce across IT and Services sectors."
        },
        win_rate_by_score_band: {},
        generated_at: todayIso
    };

    const { error } = await supabase.from('agency_intelligence_logs').insert(payload);

    if (error) {
        console.error("Error inserting:", error);
    } else {
        console.log("Success! Intelligence logged.");
    }
}

run();

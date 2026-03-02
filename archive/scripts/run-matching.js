const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://ryxgjzehoijjvczqkhwr.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5eGdqemVob2lqanZjenFraHdyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjA0ODQ1NSwiZXhwIjoyMDg3NjI0NDU1fQ.nemDcqmJMsp0DOlAjZyJyBtmWkZSAzn_Q44_a6Y3dVM";

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMatching() {
    console.log("🔄 Starting Deterministic Matching (Node)...");

    const { data: opportunities } = await supabase.from('opportunities').select('id, notice_id, naics_code, set_aside_code, place_of_performance_state').limit(20);
    const { data: contractors } = await supabase.from('contractors').select('id, naics_codes, certifications, state').limit(50);

    if (!opportunities || !contractors) {
        console.error("❌ Failed to fetch data.");
        return;
    }

    const matches = [];
    for (const op of opportunities) {
        for (const con of contractors) {
            let score = 0.1; // Base score

            // NAICS Match
            if (op.naics_code && con.naics_codes && con.naics_codes.includes(op.naics_code)) {
                score += 0.4;
            }

            // Set-Aside Match
            if (op.set_aside_code && con.certifications && con.certifications.includes(op.set_aside_code)) {
                score += 0.3;
            }

            // Geo Match
            if (op.place_of_performance_state && con.state && op.place_of_performance_state === con.state) {
                score += 0.2;
            }

            if (score >= 0.5) {
                matches.push({
                    opportunity_id: op.id,
                    contractor_id: con.id,
                    score: score,
                    classification: score >= 0.8 ? 'HOT' : 'WARM',
                    score_breakdown: {
                        naics_match: op.naics_code && con.naics_codes && con.naics_codes.includes(op.naics_code) ? 1 : 0,
                        setaside_match: op.set_aside_code && con.certifications && con.certifications.includes(op.set_aside_code) ? 1 : 0,
                        geo_match: op.place_of_performance_state && con.state && op.place_of_performance_state === con.state ? 1 : 0
                    }
                });
            }
        }
    }

    console.log(`📊 Generated ${matches.length} matches. Upserting to DB...`);

    const { error } = await supabase.from('matches').upsert(matches, { onConflict: 'opportunity_id,contractor_id' });

    if (error) {
        console.error("❌ Error upserting matches:", error.message);
    } else {
        console.log("✅ Successfully populated matches table.");
    }
}

runMatching();

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "https://ryxgjzehoijjvczqkhwr.supabase.co";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5eGdqemVob2lqanZjenFraHdyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjA0ODQ1NSwiZXhwIjoyMDg3NjI0NDU1fQ.nemDcqmJMsp0DOlAjZyJyBtmWkZSAzn_Q44_a6Y3dVM";

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing URL or Key in .env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testQuery() {
    console.log("Testing opportunities table...");
    const { data: opps, error: oppsError } = await supabase.from('opportunities').select('*').limit(3);
    if (oppsError) console.error("Error fetching opps:", oppsError.message);
    else console.log(`Found ${opps.length} opportunities.`);

    console.log("Testing contractors table...");
    const { data: conts, error: contsError } = await supabase.from('contractors').select('*').limit(3);
    if (contsError) console.error("Error fetching contractors:", contsError.message);
    else console.log(`Found ${conts.length} contractors.`);

    console.log("Testing matches table...");
    const { data: matches, error: matchesError } = await supabase.from('matches').select('*').limit(3);
    if (matchesError) console.error("Error fetching matches:", matchesError.message);
    else console.log(`Found ${matches?.length || 0} matches.`);
}

testQuery();

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "https://ryxgjzehoijjvczqkhwr.supabase.co";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5eGdqemVob2lqanZjenFraHdyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjA0ODQ1NSwiZXhwIjoyMDg3NjI0NDU1fQ.nemDcqmJMsp0DOlAjZyJyBtmWkZSAzn_Q44_a6Y3dVM";

const supabase = createClient(supabaseUrl, supabaseKey);

async function testQuery() {
    console.log("Testing opportunities table schema...");
    const { data: opps, error: oppsError } = await supabase.from('opportunities').select('posted_date').limit(1);
    if (oppsError) console.error("Error testing posted_date on opportunities:", oppsError);
    else console.log(`Success! Data: ${JSON.stringify(opps)}`);

    const { data: conts, error: contsError } = await supabase.from('contractors').select('last_activity_date').limit(1);
    if (contsError) console.error("Error testing last_activity_date on contractors:", contsError);
    else console.log(`Success! Data: ${JSON.stringify(conts)}`);
}

testQuery();

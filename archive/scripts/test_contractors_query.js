import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    "https://ryxgjzehoijjvczqkhwr.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5eGdqemVob2lqanZjenFraHdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNDg0NTUsImV4cCI6MjA4NzYyNDQ1NX0.q0HivHixjE-A2MuQZlmlZOO2eLpQEm8c6XhQQQKaJsY"
);

async function test() {
    let query = supabase.from("contractors").select("*", { count: 'exact' });
    query = query.neq("data_quality_flag", "LOW_QUALITY");
    query = query.is("sam_registered", true);

    // pagination
    const { data, count, error } = await query.order('company_name', { ascending: true }).range(0, 49);
    if (error) {
        console.error("Supabase Error:", error);
    } else {
        console.log("Success! count=", count);
    }
}
test();

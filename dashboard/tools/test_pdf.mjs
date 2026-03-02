import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import https from "https";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

async function testPdf() {
    const { data, error } = await supabase
        .from("opportunities")
        .select("notice_id, resource_links")
        .not("resource_links", "is", null)
        .limit(1);

    if (error || !data || data.length === 0) {
        console.log("No links found", error);
        return;
    }

    const url = data[0].resource_links[0];
    console.log(`Checking URL: ${url}`);

    https.get(url, (res) => {
        console.log(`Status Code: ${res.statusCode}`);
        console.log(`Response Headers:`, res.headers);
        let body = [];
        res.on('data', (chunk) => body.push(chunk));
        res.on('end', () => {
            const buffer = Buffer.concat(body);
            console.log(`Downloaded ${buffer.length} bytes.`);
            console.log(`First 20 bytes:`, buffer.slice(0, 20).toString());
        });
    }).on('error', (e) => {
        console.error(`Error: ${e.message}`);
    });
}

testPdf();

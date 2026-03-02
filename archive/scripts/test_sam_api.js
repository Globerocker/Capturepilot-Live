import fs from 'fs';

async function testFetch() {
    const SAM_API_KEY = process.env.SAM_API_KEY;
    if (!SAM_API_KEY) {
        console.error("No SAM_API_KEY found");
        return;
    }
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(toDate.getDate() - 3);

    const fromStr = `${String(fromDate.getMonth() + 1).padStart(2, '0')}/${String(fromDate.getDate()).padStart(2, '0')}/${fromDate.getFullYear()}`;
    const toStr = `${String(toDate.getMonth() + 1).padStart(2, '0')}/${String(toDate.getDate()).padStart(2, '0')}/${toDate.getFullYear()}`;
    const url = `https://api.sam.gov/opportunities/v2/search?api_key=${SAM_API_KEY}&postedFrom=${fromStr}&postedTo=${toStr}&limit=10`;
    console.log("Fetching:", url.replace(SAM_API_KEY, "HIDDEN"));

    const reqData = await fetch(url);
    if (!reqData.ok) {
        console.error("Error", reqData.status);
        return;
    }
    const data = await reqData.json();
    fs.writeFileSync('sam_test_output.json', JSON.stringify(data, null, 2));
    console.log("Saved to sam_test_output.json");
}

testFetch();

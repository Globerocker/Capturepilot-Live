module.exports = {
    key: "find_opportunity",
    noun: "Opportunity",
    display: {
        label: "Find Opportunity",
        description: "Search SAM.gov opportunities by keyword, NAICS, or agency.",
    },
    operation: {
        inputFields: [
            { key: "keyword", label: "Keyword", type: "string", required: false },
            { key: "naics", label: "NAICS code", type: "string", required: false },
            { key: "agency", label: "Agency (partial match)", type: "string", required: false },
            { key: "limit", label: "Max results", type: "integer", default: 5 },
        ],
        perform: {
            url: "https://app.capturepilot.com/api/opportunities/search",
            params: {
                q: "{{bundle.inputData.keyword}}",
                naics: "{{bundle.inputData.naics}}",
                agency: "{{bundle.inputData.agency}}",
                limit: "{{bundle.inputData.limit}}",
            },
        },
        sample: {
            id: "uuid-opp",
            notice_id: "ABC123",
            title: "Sample Federal Opportunity",
            department: "Veterans Affairs",
            response_deadline: "2026-07-01",
            award_amount: 2500000,
        },
    },
};

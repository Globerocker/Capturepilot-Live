module.exports = {
    key: "add_pursuit",
    noun: "Pursuit",
    display: {
        label: "Add Pursuit",
        description: "Add an opportunity to your CapturePilot pipeline.",
    },
    operation: {
        inputFields: [
            {
                key: "notice_id",
                label: "SAM.gov Notice ID",
                type: "string",
                required: true,
                helpText: "The unique SAM.gov notice ID of the opportunity you want to pursue.",
            },
            {
                key: "stage",
                label: "Initial stage",
                type: "string",
                default: "discovered",
                choices: {
                    discovered: "Discovered",
                    researching: "Researching",
                    preparing: "Preparing",
                    submitted: "Submitted",
                },
            },
            {
                key: "priority",
                label: "Priority",
                type: "string",
                default: "medium",
                choices: { high: "High", medium: "Medium", low: "Low" },
            },
            {
                key: "notes",
                label: "Notes",
                type: "text",
                required: false,
            },
        ],
        perform: {
            url: "https://app.capturepilot.com/api/pursuits",
            method: "POST",
            body: {
                notice_id: "{{bundle.inputData.notice_id}}",
                stage: "{{bundle.inputData.stage}}",
                priority: "{{bundle.inputData.priority}}",
                notes: "{{bundle.inputData.notes}}",
            },
        },
        sample: {
            pursuit_id: "uuid-abc",
            opportunity_id: "uuid-opp",
            stage: "discovered",
            created_at: "2026-04-19T12:00:00Z",
        },
    },
};

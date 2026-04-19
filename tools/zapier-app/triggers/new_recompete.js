module.exports = {
    key: "new_recompete",
    noun: "Recompete",
    display: {
        label: "New High-Confidence Recompete",
        description: "Triggers when Recompete Radar flags a high-confidence expiring contract.",
    },
    operation: {
        type: "hook",
        performSubscribe: {
            url: "https://app.capturepilot.com/api/integrations/webhooks?zapier=subscribe",
            method: "POST",
            body: { target_url: "{{bundle.targetUrl}}", event: "recompete.high_confidence" },
        },
        performUnsubscribe: {
            url: "https://app.capturepilot.com/api/integrations/webhooks?zapier=unsubscribe&id={{bundle.subscribeData.id}}",
            method: "DELETE",
        },
        perform: (z, bundle) => [bundle.cleanedRequest.data],
        sample: {
            incumbent_name: "Sample Contractor LLC",
            agency: "Veterans Affairs",
            naics_code: "541511",
            contract_end_date: "2026-09-30",
            confidence_score: 0.78,
        },
    },
};

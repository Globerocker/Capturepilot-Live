module.exports = {
    key: "new_hot_match",
    noun: "Match",
    display: {
        label: "New HOT Match",
        description: "Triggers whenever the scorer classifies a new opportunity as HOT for the user.",
    },
    operation: {
        type: "hook",
        performSubscribe: {
            url: "https://app.capturepilot.com/api/integrations/webhooks?zapier=subscribe",
            method: "POST",
            body: { target_url: "{{bundle.targetUrl}}", event: "match.hot" },
        },
        performUnsubscribe: {
            url: "https://app.capturepilot.com/api/integrations/webhooks?zapier=unsubscribe&id={{bundle.subscribeData.id}}",
            method: "DELETE",
        },
        perform: (z, bundle) => {
            const d = bundle.cleanedRequest.data || {};
            return (d.matches || []).map((m) => ({
                ...m,
                total_hot: d.total_hot,
                id: m.opportunity_id,
            }));
        },
        sample: {
            id: "uuid-opp-123",
            opportunity_id: "uuid-opp-123",
            score: 0.82,
            total_hot: 3,
        },
    },
};

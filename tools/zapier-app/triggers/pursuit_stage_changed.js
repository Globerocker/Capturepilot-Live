module.exports = {
    key: "pursuit_stage_changed",
    noun: "Pursuit",
    display: {
        label: "Pursuit Stage Changed",
        description: "Triggers when a pursuit moves to a new pipeline stage.",
    },
    operation: {
        type: "hook",
        performSubscribe: {
            url: "https://app.capturepilot.com/api/integrations/webhooks?zapier=subscribe",
            method: "POST",
            body: { target_url: "{{bundle.targetUrl}}", event: "pursuit.stage_changed" },
        },
        performUnsubscribe: {
            url: "https://app.capturepilot.com/api/integrations/webhooks?zapier=unsubscribe&id={{bundle.subscribeData.id}}",
            method: "DELETE",
        },
        perform: (z, bundle) => [bundle.cleanedRequest.data],
        sample: {
            pursuit_id: "uuid-abc-123",
            opportunity_id: "uuid-opp-456",
            from_stage: "researching",
            to_stage: "preparing",
        },
    },
};

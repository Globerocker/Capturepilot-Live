// REST Hook trigger: fires when a pursuit is added in CapturePilot.

module.exports = {
    key: "new_pursuit",
    noun: "Pursuit",

    display: {
        label: "New Pursuit",
        description: "Triggers when a new pursuit is added to the pipeline.",
    },

    operation: {
        type: "hook",
        performSubscribe: {
            url: "https://app.capturepilot.com/api/integrations/webhooks?zapier=subscribe",
            method: "POST",
            body: {
                target_url: "{{bundle.targetUrl}}",
                event: "pursuit.added",
            },
        },
        performUnsubscribe: {
            url: "https://app.capturepilot.com/api/integrations/webhooks?zapier=unsubscribe&id={{bundle.subscribeData.id}}",
            method: "DELETE",
        },
        perform: (z, bundle) => [bundle.cleanedRequest.data],
        performList: {
            url: "https://app.capturepilot.com/api/pursuits?limit=3",
            method: "GET",
        },
        sample: {
            pursuit_id: "uuid-abc-123",
            opportunity_id: "uuid-opp-456",
            title: "Sample SDVOSB set-aside pursuit",
            stage: "discovered",
            custom_deal: false,
        },
    },
};

module.exports = {
    key: "capture_brief_generated",
    noun: "Brief",
    display: {
        label: "Capture Brief Generated",
        description: "Triggers when a capture brief is generated (manually or via MCP).",
    },
    operation: {
        type: "hook",
        performSubscribe: {
            url: "https://app.capturepilot.com/api/integrations/webhooks?zapier=subscribe",
            method: "POST",
            body: { target_url: "{{bundle.targetUrl}}", event: "capture_brief.generated" },
        },
        performUnsubscribe: {
            url: "https://app.capturepilot.com/api/integrations/webhooks?zapier=unsubscribe&id={{bundle.subscribeData.id}}",
            method: "DELETE",
        },
        perform: (z, bundle) => [bundle.cleanedRequest.data],
        sample: {
            notice_id: "ABC123",
            opportunity_id: "uuid-opp",
            pwin: 65,
            recommendation: "GO",
        },
    },
};

// Zapier custom auth — user pastes their CapturePilot Zapier token.
// The token resolves server-side via api_tokens.kind = 'zapier'.

module.exports = {
    type: "custom",
    connectionLabel: "{{bundle.authData.label}}",
    fields: [
        {
            key: "api_token",
            label: "CapturePilot Zapier Token",
            type: "password",
            required: true,
            helpText:
                "Create a Zapier token at https://app.capturepilot.com/settings/integrations → Zapier → New Zapier Token. Copy once; it can't be retrieved later.",
        },
        {
            key: "label",
            label: "Account label (optional)",
            required: false,
            default: "CapturePilot",
        },
    ],
    test: {
        url: "https://app.capturepilot.com/api/integrations/tokens",
        method: "GET",
    },
};

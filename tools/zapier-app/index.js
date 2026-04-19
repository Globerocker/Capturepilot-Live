// CapturePilot Zapier Integration
// Run `zapier push` from this folder to deploy. Submit via `zapier promote`
// once the integration passes Zapier's public-app review.
//
// Users get their API token from https://app.capturepilot.com/settings/integrations
// (kind: "zapier"). All auth is Bearer-based.
//
// Triggers (hooks → Zapier receives events from CapturePilot):
//   - new_pursuit         fires when a user adds a pursuit
//   - pursuit_stage_changed
//   - new_hot_match       fires when user_matches gets a HOT classification
//   - capture_brief_generated
//   - new_high_confidence_recompete
//
// Actions (Zapier → CapturePilot):
//   - add_pursuit         create a new pursuit from any Zap
//
// Searches:
//   - find_opportunity    look up an opportunity by keyword

const authentication = require("./authentication");
const newPursuit = require("./triggers/new_pursuit");
const pursuitStageChanged = require("./triggers/pursuit_stage_changed");
const newHotMatch = require("./triggers/new_hot_match");
const captureBriefGenerated = require("./triggers/capture_brief_generated");
const newRecompete = require("./triggers/new_recompete");
const addPursuit = require("./creates/add_pursuit");
const findOpportunity = require("./searches/find_opportunity");

module.exports = {
    version: require("./package.json").version,
    platformVersion: require("zapier-platform-core").version,

    authentication,

    triggers: {
        [newPursuit.key]: newPursuit,
        [pursuitStageChanged.key]: pursuitStageChanged,
        [newHotMatch.key]: newHotMatch,
        [captureBriefGenerated.key]: captureBriefGenerated,
        [newRecompete.key]: newRecompete,
    },

    creates: {
        [addPursuit.key]: addPursuit,
    },

    searches: {
        [findOpportunity.key]: findOpportunity,
    },

    beforeRequest: [
        (request, z, bundle) => {
            if (bundle.authData.api_token) {
                request.headers.Authorization = `Bearer ${bundle.authData.api_token}`;
            }
            return request;
        },
    ],
};

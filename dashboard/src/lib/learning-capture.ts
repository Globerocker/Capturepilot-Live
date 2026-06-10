// Fire-and-forget client helpers for the AI/ML learning loop.
// All calls are silent: we never block the UI on capture failures.

const SESSION_ID_KEY = "cp_learn_session_id";

function getSessionId(): string {
    if (typeof window === "undefined") return "ssr";
    try {
        let id = sessionStorage.getItem(SESSION_ID_KEY);
        if (!id) {
            id = crypto.randomUUID();
            sessionStorage.setItem(SESSION_ID_KEY, id);
        }
        return id;
    } catch {
        return "no-session";
    }
}

function silentPost(url: string, body: unknown) {
    if (typeof window === "undefined") return;
    try {
        fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            // keepalive lets the request finish if the user navigates away
            keepalive: true,
        }).catch(() => { /* ignore — capture never blocks UX */ });
    } catch {
        // ignore
    }
}

export type MatchEventName = "clicked" | "dismissed" | "pursued" | "saved" | "exported";

export function captureMatchEvent(userMatchId: string, event: MatchEventName) {
    if (!userMatchId) return;
    silentPost("/api/learning/match-event", {
        user_match_id: userMatchId,
        event,
        session_id: getSessionId(),
    });
}

export function captureProposalEdit(params: {
    proposalJobId: string;
    sectionName: string;
    originalText: string;
    editedText: string;
}) {
    if (!params.proposalJobId || !params.sectionName) return;
    if (params.originalText === params.editedText) return;
    silentPost("/api/learning/proposal-edit", {
        proposal_job_id: params.proposalJobId,
        section_name: params.sectionName,
        original_text: params.originalText,
        edited_text: params.editedText,
    });
}

export function capturePursuitOutcome(params: {
    pursuitId: string;
    outcome: "won" | "lost" | "no_bid" | "withdrawn";
    amountAwarded?: number | null;
    decisionDate?: string | null;
    lessonsLearned?: string | null;
}): Promise<Response> {
    // Outcomes are user-initiated through a form, so we surface the response.
    return fetch("/api/learning/pursuit-outcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            pursuit_id: params.pursuitId,
            outcome: params.outcome,
            amount_awarded: params.amountAwarded ?? null,
            decision_date: params.decisionDate ?? null,
            lessons_learned: params.lessonsLearned ?? null,
        }),
    });
}

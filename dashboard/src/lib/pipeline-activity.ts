export type PipelineActivityType =
    | "stage_changed"
    | "note_added"
    | "note_updated"
    | "action_completed"
    | "priority_changed"
    | "created";

export interface LogActivityInput {
    pursuitId: string;
    userProfileId: string;
    activityType: PipelineActivityType;
    fromValue?: string | null;
    toValue?: string | null;
    description?: string | null;
}

// Best-effort activity log. Failures don't block the underlying update —
// we just swallow the error so a missing migration / RLS issue can't break pipeline UX.
// Accepts any Supabase-like client. Typed loosely because the supabase-js
// `.from().insert()` return type is a thenable, not a strict Promise.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function logPipelineActivity(supabase: any, input: LogActivityInput): Promise<void> {
    try {
        await supabase.from("pipeline_activity").insert({
            pursuit_id: input.pursuitId,
            user_profile_id: input.userProfileId,
            activity_type: input.activityType,
            from_value: input.fromValue ?? null,
            to_value: input.toValue ?? null,
            description: input.description ?? null,
        });
    } catch {
        // swallow — logging is non-critical.
    }
}

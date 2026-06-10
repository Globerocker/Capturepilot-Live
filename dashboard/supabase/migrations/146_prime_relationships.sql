-- Migration 145: prime_relationships table for past-performance graph
--
-- Builds a directed graph of who-beats-who in federal awards.
-- Each row is an edge: winner_contractor_id beat loser_contractor_id on a
-- specific contract. Used by `lib/pp-graph.ts` to surface:
--   1. Flip candidates — primes who repeatedly beat a given incumbent
--      (incumbent vulnerability for recompete)
--   2. Recompete risk — for a contractor + opportunity, score the chance
--      the incumbent gets unseated based on past loss patterns vs likely
--      competing primes for that agency/NAICS.
--
-- Populated nightly by /api/cron/build_pp_graph from:
--   - opportunities table (notice_type='Award Notice' rows have a winner)
--   - opportunities.incumbent_contractor_name / _uei (losing-side hint)
--   - contractors table for resolving UEI -> contractor_id
--
-- Edges are deduped on (winner_contractor_id, loser_contractor_id, contract_id)
-- so re-running the cron is idempotent.

CREATE TABLE IF NOT EXISTS prime_relationships (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    winner_contractor_id  UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    loser_contractor_id   UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    agency                TEXT,
    naics_code            TEXT,
    contract_id           TEXT,
    award_amount          NUMERIC,
    decision_date         DATE,
    contract_type         TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT prime_relationships_distinct_parties CHECK (winner_contractor_id <> loser_contractor_id)
);

-- Dedup: same winner/loser/contract is the same edge
CREATE UNIQUE INDEX IF NOT EXISTS prime_relationships_dedup_idx
    ON prime_relationships (winner_contractor_id, loser_contractor_id, COALESCE(contract_id, ''));

CREATE INDEX IF NOT EXISTS prime_relationships_winner_idx
    ON prime_relationships (winner_contractor_id, agency, naics_code);

CREATE INDEX IF NOT EXISTS prime_relationships_loser_idx
    ON prime_relationships (loser_contractor_id, agency, naics_code);

CREATE INDEX IF NOT EXISTS prime_relationships_naics_idx
    ON prime_relationships (naics_code);

CREATE INDEX IF NOT EXISTS prime_relationships_decision_date_idx
    ON prime_relationships (decision_date DESC);

ALTER TABLE prime_relationships ENABLE ROW LEVEL SECURITY;

-- Read-only for authenticated users; writes go through the service role
DROP POLICY IF EXISTS prime_relationships_read ON prime_relationships;
CREATE POLICY prime_relationships_read ON prime_relationships
    FOR SELECT
    TO authenticated
    USING (true);

COMMENT ON TABLE prime_relationships IS
    'Directed graph of federal award outcomes. Edge winner_contractor_id -> loser_contractor_id means winner beat loser on a specific contract. Used for incumbent flip prediction and recompete risk scoring.';

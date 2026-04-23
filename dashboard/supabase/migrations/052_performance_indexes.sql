-- Indexes for Opportunities table performance
CREATE INDEX IF NOT EXISTS idx_opps_posted_date ON public.opportunities USING btree (posted_date DESC);
CREATE INDEX IF NOT EXISTS idx_opps_is_archived_posted_date ON public.opportunities USING btree (is_archived, posted_date DESC);

-- Indexes for User Matches table performance (Dashboard & Pipeline)
CREATE INDEX IF NOT EXISTS idx_user_matches_dashboard ON public.user_matches USING btree (user_profile_id, classification, is_dismissed, score DESC);
CREATE INDEX IF NOT EXISTS idx_user_matches_dashboard_no_class ON public.user_matches USING btree (user_profile_id, is_dismissed, score DESC);

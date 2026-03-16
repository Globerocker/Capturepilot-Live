-- User Pursuits table: tracks which opportunities a user is actively pursuing
CREATE TABLE IF NOT EXISTS user_pursuits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  opportunity_id UUID REFERENCES opportunities(id) ON DELETE CASCADE NOT NULL,
  stage TEXT NOT NULL DEFAULT 'discovered'
    CHECK (stage IN ('discovered', 'researching', 'preparing', 'submitted', 'awarded', 'lost', 'no_bid')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  notes TEXT,
  stage_changed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_profile_id, opportunity_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_pursuits_profile ON user_pursuits(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_user_pursuits_stage ON user_pursuits(stage);
CREATE INDEX IF NOT EXISTS idx_user_pursuits_opportunity ON user_pursuits(opportunity_id);

-- Row Level Security
ALTER TABLE user_pursuits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own pursuits"
  ON user_pursuits FOR ALL
  USING (user_profile_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()));

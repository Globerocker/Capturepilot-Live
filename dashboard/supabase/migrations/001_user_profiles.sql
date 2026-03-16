-- ============================================
-- Sprint 10: User Profiles + Auth Foundation
-- ============================================

-- User profiles table (links Supabase Auth to business data)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,

  -- Company Info
  company_name TEXT NOT NULL,
  dba_name TEXT,
  uei TEXT,
  cage_code TEXT,
  address_line_1 TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  website TEXT,
  phone TEXT,
  email TEXT,

  -- Industry
  naics_codes TEXT[] DEFAULT '{}',
  sba_certifications TEXT[] DEFAULT '{}',

  -- Capacity
  employee_count INTEGER,
  revenue NUMERIC,
  years_in_business INTEGER,
  service_radius_miles INTEGER DEFAULT 50,
  has_bonding BOOLEAN DEFAULT false,
  has_fleet BOOLEAN DEFAULT false,
  has_municipal_exp BOOLEAN DEFAULT false,
  federal_awards_count INTEGER DEFAULT 0,

  -- Targets
  target_contract_types TEXT[] DEFAULT '{}',
  target_states TEXT[] DEFAULT '{}',

  -- SaaS fields
  onboarding_complete BOOLEAN DEFAULT false,
  plan_tier TEXT DEFAULT 'free_beta',
  notification_preferences JSONB DEFAULT '{"email": true, "frequency": "daily"}',
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User matches table (scoring results per user)
CREATE TABLE IF NOT EXISTS user_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  opportunity_id UUID REFERENCES opportunities(id) ON DELETE CASCADE NOT NULL,
  score NUMERIC NOT NULL,
  classification TEXT NOT NULL CHECK (classification IN ('HOT', 'WARM', 'COLD')),
  score_breakdown JSONB,
  is_saved BOOLEAN DEFAULT false,
  is_dismissed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_profile_id, opportunity_id)
);

-- User action items table
CREATE TABLE IF NOT EXISTS user_action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  opportunity_id UUID REFERENCES opportunities(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('research', 'document', 'outreach', 'compliance', 'teaming')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
  due_date DATE,
  upsell_cta TEXT,
  upsell_service TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- User notifications table
CREATE TABLE IF NOT EXISTS user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('new_matches', 'deadline_reminder', 'action_due', 'system')),
  title TEXT NOT NULL,
  body TEXT,
  metadata JSONB,
  is_read BOOLEAN DEFAULT false,
  sent_via TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Service requests table (upsell tracking)
CREATE TABLE IF NOT EXISTS service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE NOT NULL,
  service_type TEXT NOT NULL,
  opportunity_id UUID REFERENCES opportunities(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'in_progress', 'completed', 'declined')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_profiles_auth_user ON user_profiles(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_user_matches_profile ON user_matches(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_user_matches_opportunity ON user_matches(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_user_matches_classification ON user_matches(classification);
CREATE INDEX IF NOT EXISTS idx_user_action_items_profile ON user_action_items(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_user_action_items_status ON user_action_items(status);
CREATE INDEX IF NOT EXISTS idx_user_notifications_profile ON user_notifications(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_read ON user_notifications(is_read);

-- ============================================
-- Row Level Security
-- ============================================

-- user_profiles: users can only access their own profile
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = auth_user_id);

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (auth.uid() = auth_user_id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = auth_user_id);

-- user_matches: users see only their matches
ALTER TABLE user_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own matches"
  ON user_matches FOR SELECT
  USING (user_profile_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "Users can update own matches"
  ON user_matches FOR UPDATE
  USING (user_profile_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()));

-- user_action_items: users manage their own action items
ALTER TABLE user_action_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own action items"
  ON user_action_items FOR ALL
  USING (user_profile_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()));

-- user_notifications: users see only their notifications
ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON user_notifications FOR SELECT
  USING (user_profile_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "Users can update own notifications"
  ON user_notifications FOR UPDATE
  USING (user_profile_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()));

-- service_requests: users can view and create their own
ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own service requests"
  ON service_requests FOR SELECT
  USING (user_profile_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "Users can create service requests"
  ON service_requests FOR INSERT
  WITH CHECK (user_profile_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()));

-- opportunities: all authenticated users can read
-- Note: Only add this if RLS is not already enabled on opportunities
-- ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Authenticated users can read opportunities"
--   ON opportunities FOR SELECT
--   USING (auth.role() = 'authenticated');

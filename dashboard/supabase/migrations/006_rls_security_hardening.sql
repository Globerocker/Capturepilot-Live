-- Remove extremely permissive public update policies
DROP POLICY IF EXISTS "Allow public update on contractors" ON public.contractors;
DROP POLICY IF EXISTS "Allow public update on opportunities" ON public.opportunities;

-- Remove redundant service write policies (service_role bypasses RLS automatically)
DROP POLICY IF EXISTS "Allow service write contractor_contacts" ON public.contractor_contacts;
DROP POLICY IF EXISTS "Allow service write enrichment_jobs" ON public.enrichment_jobs;
DROP POLICY IF EXISTS "Allow service write opportunity_attachments" ON public.opportunity_attachments;
DROP POLICY IF EXISTS "Allow service write opportunity_contractors" ON public.opportunity_contractors;

-- Restrict standard application tables to authenticated users only
ALTER POLICY "Allow public select on agency_intelligence_logs" ON public.agency_intelligence_logs TO authenticated;
ALTER POLICY "Allow public select on contractors" ON public.contractors TO authenticated;
ALTER POLICY "Allow public select on matches" ON public.matches TO authenticated;
ALTER POLICY "Allow public select on naics_codes" ON public.naics_codes TO authenticated;
ALTER POLICY "Allow public select on opportunities" ON public.opportunities TO authenticated;
ALTER POLICY "Allow public select on psc_codes" ON public.psc_codes TO authenticated;
ALTER POLICY "Allow public select on set_asides" ON public.set_asides TO authenticated;

-- Restrict user-specific profile & data management to authenticated users only
ALTER POLICY "Users manage own call logs" ON public.call_logs TO authenticated;
ALTER POLICY "Users manage own drafts" ON public.email_drafts TO authenticated;
ALTER POLICY "Users can create service requests" ON public.service_requests TO authenticated;
ALTER POLICY "Users can view own service requests" ON public.service_requests TO authenticated;
ALTER POLICY "Users can manage own action items" ON public.user_action_items TO authenticated;
ALTER POLICY "Users can update own matches" ON public.user_matches TO authenticated;
ALTER POLICY "Users can view own matches" ON public.user_matches TO authenticated;
ALTER POLICY "Users can update own notifications" ON public.user_notifications TO authenticated;
ALTER POLICY "Users can view own notifications" ON public.user_notifications TO authenticated;
ALTER POLICY "Users can view own profile" ON public.user_profiles TO authenticated;
ALTER POLICY "Users can update own profile" ON public.user_profiles TO authenticated;
ALTER POLICY "Users can insert own profile" ON public.user_profiles TO authenticated;
ALTER POLICY "Users can manage own pursuits" ON public.user_pursuits TO authenticated;

-- Rename and restrict intentionally misnamed "anon read" policies 
ALTER POLICY "Allow anon read contractor_contacts" ON public.contractor_contacts TO authenticated;
ALTER POLICY "Allow anon read enrichment_jobs" ON public.enrichment_jobs TO authenticated;
ALTER POLICY "Allow anon read opportunity_attachments" ON public.opportunity_attachments TO authenticated;
ALTER POLICY "Allow anon read opportunity_contractors" ON public.opportunity_contractors TO authenticated;

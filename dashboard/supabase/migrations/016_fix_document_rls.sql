-- Fix RLS policies for document uploads
-- Storage bucket: client-docs

-- Allow authenticated users to upload files to client-docs bucket
CREATE POLICY "allow_upload_client_docs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'client-docs');

-- Allow authenticated users to read files from client-docs
CREATE POLICY "allow_read_client_docs" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'client-docs');

-- Allow authenticated users to delete their files
CREATE POLICY "allow_delete_client_docs" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'client-docs');

-- Fix client_documents table policies
ALTER TABLE client_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_insert_own_docs" ON client_documents
  FOR INSERT TO authenticated
  WITH CHECK (user_profile_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "users_read_own_docs" ON client_documents
  FOR SELECT TO authenticated
  USING (user_profile_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "users_delete_own_docs" ON client_documents
  FOR DELETE TO authenticated
  USING (user_profile_id IN (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid()));

-- Service role can do everything (for admin panel)
CREATE POLICY "service_role_all_docs" ON client_documents
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

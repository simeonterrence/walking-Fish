-- Migration: open-mic-beats storage bucket
-- Holds performer beat/track uploads from the /open-mic signup form.
-- Public bucket (link-accessible, like "anyone with the link") so the
-- events team and DJ can download files straight from the signup email.
-- Organizers manage/delete files via the Supabase dashboard (service role
-- bypasses RLS); the public site can only upload and download.

INSERT INTO storage.buckets (id, name, public)
VALUES ('open-mic-beats', 'open-mic-beats', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Anyone can upload open mic beats" ON storage.objects;
CREATE POLICY "Anyone can upload open mic beats"
  ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'open-mic-beats');

DROP POLICY IF EXISTS "Anyone can download open mic beats" ON storage.objects;
CREATE POLICY "Anyone can download open mic beats"
  ON storage.objects
  FOR SELECT
  TO anon
  USING (bucket_id = 'open-mic-beats');

-- Let the logged-in team read signups in the admin dashboard
-- (/open-mic stores into contact_messages with subject "Open Mic Signup — …").
DROP POLICY IF EXISTS "Allow authenticated read contact_messages" ON public.contact_messages;
CREATE POLICY "Allow authenticated read contact_messages"
  ON public.contact_messages
  FOR SELECT
  TO authenticated
  USING (true);

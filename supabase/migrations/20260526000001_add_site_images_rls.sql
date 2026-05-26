-- Migration: Add RLS policies for site_images and storage.objects (site-photos)
-- Allows admins to manage photos using their JWT session (admin_role)
-- instead of requiring the Supabase service_role key.
-- Public visitors can view site_images (read-only, already implied by no RLS).

-- ============================================
-- 1. site_images table RLS
-- ============================================

-- Enable RLS (idempotent — safe if already enabled)
ALTER TABLE public.site_images ENABLE ROW LEVEL SECURITY;

-- Public visitors can view all site_images (for gallery, partners, etc.)
DROP POLICY IF EXISTS "anon_can_select_site_images" ON public.site_images;
CREATE POLICY "anon_can_select_site_images"
  ON public.site_images
  FOR SELECT
  TO anon
  USING (true);

-- Authenticated users with admin_role can do everything
DROP POLICY IF EXISTS "admin_can_all_site_images" ON public.site_images;
CREATE POLICY "admin_can_all_site_images"
  ON public.site_images
  FOR ALL
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role');

-- ============================================
-- 2. storage.objects RLS for site-photos bucket
-- ============================================

-- Anyone can view photos in the site-photos bucket (public images)
DROP POLICY IF EXISTS "anon_can_select_site_photos" ON storage.objects;
CREATE POLICY "anon_can_select_site_photos"
  ON storage.objects
  FOR SELECT
  TO anon
  USING (bucket_id = 'site-photos');

-- Admins can upload files to site-photos
DROP POLICY IF EXISTS "admin_can_insert_site_photos" ON storage.objects;
CREATE POLICY "admin_can_insert_site_photos"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'site-photos'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role'
  );

-- Admins can update files in site-photos (e.g. replace an image)
DROP POLICY IF EXISTS "admin_can_update_site_photos" ON storage.objects;
CREATE POLICY "admin_can_update_site_photos"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'site-photos'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role'
  )
  WITH CHECK (
    bucket_id = 'site-photos'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role'
  );

-- Admins can delete files from site-photos
DROP POLICY IF EXISTS "admin_can_delete_site_photos" ON storage.objects;
CREATE POLICY "admin_can_delete_site_photos"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'site-photos'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role'
  );

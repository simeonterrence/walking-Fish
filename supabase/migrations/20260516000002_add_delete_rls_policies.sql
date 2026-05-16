-- Migration: Add DELETE RLS policies for vendor_profiles
-- Allows vendors to delete their own profile and admins to delete any profile.

-- Vendors can delete their own profile (self-delete account)
CREATE POLICY "vendor_delete_own_profile"
  ON public.vendor_profiles
  FOR DELETE
  TO authenticated
  USING (auth.uid() = auth_user_id);

-- Admins can delete any vendor profile
CREATE POLICY "admin_delete_profiles"
  ON public.vendor_profiles
  FOR DELETE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin_role');

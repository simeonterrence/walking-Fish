-- Add permissions column to staff_scanner_codes
-- Permissions is a text array: {'gate', 'food', 'drinks', 'debit', 'topup', 'bill', 'bulk'}
-- '*' means universal (can do everything, which is the default)
ALTER TABLE staff_scanner_codes 
ADD COLUMN IF NOT EXISTS permissions text[] NOT NULL DEFAULT '{*}';

-- Update the issue_scanner_code function to accept permissions
CREATE OR REPLACE FUNCTION issue_scanner_code(p_code text, p_label text, p_permissions text[] DEFAULT '{*}')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO staff_scanner_codes (code, label, is_active, permissions)
  VALUES (p_code, p_label, true, COALESCE(p_permissions, '{*}'));
END;
$$;

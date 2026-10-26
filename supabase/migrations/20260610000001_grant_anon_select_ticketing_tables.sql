-- Grant necessary privileges for the ticketing system
-- 1. anon role needs SELECT on ticketing tables for the public shop frontend
-- 2. service_role needs ALL on all tables (auto-injected key in Edge Functions)

GRANT USAGE ON SCHEMA public TO anon;

GRANT SELECT ON public.ticket_types TO anon;

GRANT SELECT ON public.top_up_bundles TO anon;

GRANT SELECT ON public.referral_codes TO anon;

-- Ensure service_role has full access (may have been lost during project setup)
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;

GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role
;

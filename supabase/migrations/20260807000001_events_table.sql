-- ══════════════════════════════════════════════════════════════
-- Walking-Fish Group: Events Management Tables
-- Migration: 20260807000001_events_table.sql
-- ══════════════════════════════════════════════════════════════

-- 1. EVENTS table
CREATE TABLE IF NOT EXISTS public.events (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    label           text NOT NULL DEFAULT 'Flagship Event',
    tagline         text NOT NULL DEFAULT '',
    subtitle        text NOT NULL DEFAULT '',
    event_date      timestamptz,
    status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'past')),
    is_flagship     boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 2. EVENT TICKET TIERS table
CREATE TABLE IF NOT EXISTS public.event_ticket_tiers (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id        uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    tier_name       text NOT NULL,
    price           text NOT NULL,
    gate_price      text,
    description     text NOT NULL DEFAULT '',
    is_featured     boolean NOT NULL DEFAULT false,
    sort_order      integer NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- 3. EVENT ADD-ONS table
CREATE TABLE IF NOT EXISTS public.event_addons (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id        uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    name            text NOT NULL,
    description     text NOT NULL DEFAULT '',
    price           text NOT NULL,
    price_label     text NOT NULL DEFAULT 'per person',
    sort_order      integer NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── RLS ──────────────────────────────────────────────────────

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_ticket_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_addons ENABLE ROW LEVEL SECURITY;

-- Anon/public: read published events only
CREATE POLICY "Public can read published events"
    ON public.events FOR SELECT
    TO anon, authenticated
    USING (status = 'published');

CREATE POLICY "Public can read tiers of published events"
    ON public.event_ticket_tiers FOR SELECT
    TO anon, authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.events e
            WHERE e.id = event_id AND e.status = 'published'
        )
    );

CREATE POLICY "Public can read addons of published events"
    ON public.event_addons FOR SELECT
    TO anon, authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.events e
            WHERE e.id = event_id AND e.status = 'published'
        )
    );

-- Admin: full access (role stored in raw_app_meta_data)
CREATE POLICY "Admins have full access to events"
    ON public.events FOR ALL
    TO authenticated
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_role', 'super_admin_role')
    )
    WITH CHECK (
        (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_role', 'super_admin_role')
    );

CREATE POLICY "Admins have full access to ticket tiers"
    ON public.event_ticket_tiers FOR ALL
    TO authenticated
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_role', 'super_admin_role')
    )
    WITH CHECK (
        (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_role', 'super_admin_role')
    );

CREATE POLICY "Admins have full access to addons"
    ON public.event_addons FOR ALL
    TO authenticated
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_role', 'super_admin_role')
    )
    WITH CHECK (
        (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_role', 'super_admin_role')
    );

-- ── updated_at trigger ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER events_updated_at
    BEFORE UPDATE ON public.events
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Helper: ensure only one flagship at a time ───────────────

CREATE OR REPLACE FUNCTION public.enforce_single_flagship()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.is_flagship = true THEN
        UPDATE public.events
        SET is_flagship = false
        WHERE id <> NEW.id AND is_flagship = true;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER single_flagship_event
    BEFORE INSERT OR UPDATE ON public.events
    FOR EACH ROW EXECUTE FUNCTION public.enforce_single_flagship();

-- ── Seed: Piroake Fest 2026 (from existing hardcoded data) ──

DO $$
DECLARE
    ev_id uuid;
BEGIN
    INSERT INTO public.events (name, label, tagline, subtitle, event_date, status, is_flagship)
    VALUES (
        'Piroake Fest 2026',
        'Flagship Event',
        'The Festival You''ll Talk About All Year.',
        'Piroake Fest 2026: Picnic. Karaoke. Rave Experience.',
        '2026-06-20T00:00:00+00:00',
        'published',
        true
    )
    RETURNING id INTO ev_id;

    -- Ticket Tiers
    INSERT INTO public.event_ticket_tiers (event_id, tier_name, price, gate_price, description, is_featured, sort_order) VALUES
    (ev_id, 'Regular',     'D300',   'D400',   'Standard entry to all festival areas, live performances, karaoke stage, and picnic zones.',                                      false, 1),
    (ev_id, 'VIP',         'D800',   'D1,000', 'Exclusive fast-track entry, VIP lounge access, premium stage views, private bars, and curated experiences.',                    true,  2),
    (ev_id, 'Group (5 Pax)','D1,300', null,    'Gather your crew and save big. Standard entry to all zones for a group of 5 checking in together.  D260 per person.',           false, 3),
    (ev_id, 'Kids Ticket', 'D100',   null,     'Discounted festival entry for children, giving access to all main festival areas, performances, and family-friendly zones.',     false, 4);

    -- Add-ons
    INSERT INTO public.event_addons (event_id, name, description, price, price_label, sort_order) VALUES
    (ev_id, 'Festival Side Games & Activities', 'Test your skills and jump into interactive festival side games, challenges, and competitive multiplayer tournaments on the field.', 'D50',  'per 5 mins play', 1),
    (ev_id, 'Kids Center / Playground',         'Supervised play area with dedicated activities, games, and facilities for children aged 3–10 years. Open from 12:00pm to 7:00pm.',  'D500', 'per child',        2);
END $$;

-- Migration: add_poster_url_to_events
-- Adds poster_url column to public.events table to allow event flyers/posters to be uploaded and edited in Admin Dashboard

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS poster_url TEXT DEFAULT '/images/piroake-poster.jpg';

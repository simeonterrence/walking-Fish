# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
Walking-Fish Group is a Gambian creative entertainment and experiences company with two subsidiaries: **Walkie-Talkie Experiences** (live events) and **Muster Point Pictures** (media production). Its flagship event is **Piroake Fest 2026**. The website is a static brochure site deployed on Vercel with a Supabase-backed photo management system and a Supabase Auth-based vendor management admin panel.

## Architecture

**Static site, no build step.** All pages are plain `.html` files served via Vercel (`vercel.json` with clean-URL rewrites + `404.html` catch-all). No framework, bundler, build process, or `package.json`.

### Page Structure & Script Loading Order

Every page loads scripts in this order (deferred where applicable):
1. **`gift.js`** — animated overlay modals (form success states, confetti). Must load first.
2. **`nav.js`** — hamburger toggle, `aria-current` detection.
3. **`supabase-config.js`** — defines `SUPABASE_URL` and `SUPABASE_ANON_KEY` globals.
4. **`photos.js`** (public pages) — replaces placeholder elements in `[data-photos]` containers with images from Supabase storage.
5. **`admin-photos.js`** (admin.html only) — CRUD for site photos using a service role key from `sessionStorage`.
6. **`vendor-auth.js`** (admin/vendor auth pages) — Supabase Auth login, vendor application CRUD, invite token workflow via REST API.

### Supabase Integration

Linked to project `anigcqdquakinlzvyaur` (ID: `anigcqdquakinlzvyaur`). The Supabase CLI config lives in `supabase/config.toml` (local dev at port 54321).

- **`site_images` table** — photo records (`section`, `position`, `file_path`, `alt_text`). Queried via REST API with `section=eq.<name>` and `order=position.asc`.
- **`site-photos` bucket** — stores uploaded images organized in `section/` subdirectories.
- **`vendor_applications`** — vendor submissions from the public form.
- **`vendor_profiles`** — registered vendor accounts linked to `auth.users`.
- **`invite_tokens`** — time-limited invite links for vendor registration.
- Public pages use `SUPABASE_ANON_KEY` (RLS-protected, read-only); admin panel uses a service role key entered via the admin login form and stored in `sessionStorage` — never hardcoded.
- Content Security Policy on every page allows `connect-src` to the Supabase project URL.

### Authentication

Login is unified at `/login` (`login.html`). After Supabase Auth login, the JWT `app_metadata.role` determines the redirect: `admin_role` → `admin.html`, `vendor_role` → `vendor-dashboard.html`. The old `admin-login.html` and `vendor-login.html` redirect to `login.html` for backward compatibility.

- **Supabase Auth** handles authentication (JWT-based, email/password), stored in `sessionStorage` as `wf_session` with access/refresh tokens.
- Vendors can self-delete their account from the vendor dashboard (removes `vendor_profiles` record via RLS).
- Admins can delete vendor accounts from the admin "Manage Vendors" section (deletes Auth user via admin API with service key, CASCADE removes profile).
- The migration spec is at `docs/spec-supabase-auth-migration.md`.
- The migration SQL is at `supabase/migrations/20260516000001_create_vendor_tables.sql` and `supabase/migrations/20260516000002_add_delete_rls_policies.sql`.

## Data Model

### Supabase Tables
- **`vendor_applications`** — `{ id, business_name, contact_name, email, phone, category, message, status, created_at, updated_at }`
- **`vendor_profiles`** — `{ id, auth_user_id, business_name, contact_name, email, phone, category, status, application_id, created_at, updated_at }`
- **`invite_tokens`** — `{ id, application_id, email, token, business_name, contact_name, category, temp_password, used, expires_at, created_at }`
- **`site_images`** — `{ id, section, position, file_path, alt_text }`

### localStorage (being deprecated)
- `adminUsers` — seeded with `admin@walkingfish.gm` / `admin123`
- `vendorApplications`, `inviteTokens`, `vendorUsers` — managed in localStorage
- Session stored as `wf_session: { type, data }` in `sessionStorage`

## CSS Design System (`style.css`)

Uses OKLCH color space with CSS custom properties. Brand accent: `oklch(62% 0.16 35)` (coral). Layout: `--max-w: 1200px`, `--gutter: 24px`, single `.w` container. Grid classes `.grid-2/3/4` collapse at 768px. Mobile nav hidden, `.bottom-tabs` fixed bar appears. `prefers-reduced-motion` kills all animations and blur. Touch targets: `min-height: 44px`.

## Common Tasks

- **Preview locally**: Open any `.html` file directly or use `python3 -m http.server 8080` for clean URLs.
- **Deploy**: Push to `main` (Vercel auto-deploys). Verify with `npx vercel --prod`.
- **Supabase local dev**: `supabase start` (config in `supabase/config.toml`). Apply migrations with `supabase migration up`.
- **Add a page**: (1) Create `.html` file, (2) add rewrite entry in `vercel.json`, (3) add `<nav>` link + `<footer>` link, (4) add `[data-page="name"]` rule in `style.css` for bottom-tab active state, (5) update `sitemap.xml`.
- **Photo sections**: Gallery uses `data-photos="gallery"`, partners use `data-photos="partners"`. Adding a new section requires the HTML attribute + matching Supabase `site_images` records.
- **Environment**: Copy `.env.example` to `.env` and fill in Supabase credentials. Never commit `.env`.
- **JSON-LD + meta tags**: Every page has Organization + WebSite structured data, Open Graph, Twitter Card, and canonical URL — copied from the existing page template.

## Common Patterns (copy when creating a new page)

- **CSP meta tag**: Every `<head>` includes a `meta http-equiv="Content-Security-Policy"` allowing `script-src 'self' 'unsafe-inline'` and `connect-src https://anigcqdquakinlzvyaur.supabase.co`.
- **Subsidiary SEO**: Hidden `<div style="display:none">` blocks on the home page for Walkie-Talkie, Muster Point, and Piroake Fest (indexed but not visible).
- **Service key flow**: The admin login form has an optional service key field; it's stored in `sessionStorage` as `wf_service_key` and used by `admin-photos.js`. Never hardcode.

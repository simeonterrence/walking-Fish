# Walking-Fish Group

A static brochure website for Walking-Fish Group, a Gambian creative entertainment and experiences company with two subsidiaries: **Walkie-Talkie Experiences** (live events) and **Muster Point Pictures** (media production). Its flagship event is **Piroake Fest 2026**.

## Quick Start

1. Clone the repo
2. Copy environment config: `cp .env.example .env`
3. Fill in your Supabase project credentials in `.env`
4. Open any `.html` file directly in a browser, or run a local server:

```sh
python3 -m http.server 8080
```

For clean URLs (no `.html` extension), use the local server approach — Vercel's rewrites handle this in production.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Plain HTML, CSS (OKLCH custom properties), Vanilla JS |
| **Backend** | Supabase (PostgreSQL, Storage, Auth, REST API) |
| **Hosting** | Vercel (static deployment, clean-URL rewrites) |
| **Analytics** | PostHog |
| **Auth** | Supabase Auth (JWT-based, email/password) |

## Architecture

**Static site, no build step.** All pages are plain `.html` files deployed on Vercel via `vercel.json` (clean-URL rewrites + `404.html` catch-all). No framework, bundler, or `package.json`.

### Page Structure

Every page loads scripts in this order (deferred where applicable):
1. `gift.js` — animated overlay modals (form success states, confetti)
2. `nav.js` — hamburger toggle, `aria-current` detection
3. `supabase-config.js` — defines `SUPABASE_URL` and `SUPABASE_ANON_KEY` globals
4. `photos.js` (public pages) — renders images from Supabase storage into `[data-photos]` containers
5. `admin-photos.js` (`admin.html` only) — CRUD for site photos
6. `vendor-auth.js` (admin/vendor auth pages) — Supabase Auth login, vendor application CRUD, invite token workflow

### Supabase Integration

- **`site_images` table** — photo records (`section`, `position`, `file_path`, `alt_text`)
- **`site-photos` bucket** — stores uploaded images in `section/` subdirectories
- **`vendor_applications`** — vendor submissions from the public form
- **`vendor_profiles`** — registered vendor accounts linked to `auth.users`
- **`invite_tokens`** — time-limited invite links for vendor registration

Public pages use the anon key (RLS-protected, read-only). The admin panel uses a service role key entered via the admin login form and stored in `sessionStorage` — never hardcoded.

## Commands

| Command | Description |
|---------|-------------|
| `python3 -m http.server 8080` | Start local dev server |
| `npx vercel --prod` | Deploy to production |
| `supabase start` | Start local Supabase stack |
| `supabase migration up` | Apply pending migrations |

## Project Structure

```
├── *.html                 # Brochure pages (one per route)
├── style.css              # Global CSS (OKLCH design system)
├── nav.js                 # Navigation component
├── photos.js              # Public photo gallery renderer
├── admin-photos.js        # Admin photo CRUD
├── vendor-auth.js         # Vendor/admin auth and management
├── supabase-config.js     # Supabase client configuration
├── vercel.json            # Vercel deployment config
├── supabase/
│   ├── config.toml        # Supabase local config
│   └── migrations/        # Database migration files
└── docs/
    └── spec-supabase-auth-migration.md
```

## Adding a Page

1. Create `.html` file
2. Add rewrite entry in `vercel.json`
3. Add `<nav>` link + `<footer>` link
4. Add `[data-page="name"]` rule in `style.css` for bottom-tab active state
5. Update `sitemap.xml`

## Environment Variables

Copy `.env.example` to `.env` and fill in your Supabase project credentials:

- `SUPABASE_URL` — Project API URL
- `SUPABASE_ANON_KEY` — Public anon key (safe for client-side use)
- `SUPABASE_SERVICE_KEY` — Admin service role key (never commit, use via admin login form)
- `SUPABASE_DB_PASSWORD` — Database password
- `SUPABASE_ACCESS_TOKEN` — Supabase CLI access token

Never commit `.env`. Real secrets stay local.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
Walking-Fish Group is a Gambian creative entertainment and experiences company with two subsidiaries: **Walkie-Talkie Experiences** (live events) and **Muster Point Pictures** (media production). Its flagship event is **Piroake Fest 2026**. The website is a static, serverless-deployed brochure site with a localStorage-based vendor management admin panel.

## Architecture

**Static site, no build step.** All pages are plain `.html` files served via Vercel (configured in `vercel.json` with clean-URL rewrites). There is no framework, bundler, or build process.

- **`style.css`** — single shared stylesheet using CSS custom properties and OKLCH color space. Defines the full design system: variables, typography, layout grids, cards, buttons, footer, bottom tab bar (mobile), skip link, reduced-motion support.
- **`nav.js`** — mobile hamburger toggle and `aria-current` detection. Loaded on every page.
- **`gift.js`** — animated "gift ceremony" overlay modals used after form submissions (early access signup, contact, vendor application). Handles focus trapping, keyboard dismiss (Escape), and confetti animation. Respects `prefers-reduced-motion`.
- **`vendor-auth.js`** — shared auth module for the admin/vendor subsystem. Uses `localStorage` for data persistence and `sessionStorage` for session management. Provides: admin login, vendor application CRUD, invite token generation/validation, vendor registration/authentication.
- **Admin subsystem**: `admin-login.html` → `admin.html` (dashboard with stats grid, application table, approve/reject, invite link generation) → `vendor-setup.html` (password setup via invite token) → `vendor-login.html` → `vendor-dashboard.html`.

**Subsidiaries** are documented in hidden `<div style="display:none">` blocks on the home page (SEO content with structured data about Walkie-Talkie Experiences, Muster Point Pictures, and Piroake Fest).

## Common Tasks

- **Preview locally**: Open any `.html` file directly in a browser (no server needed). Use `python3 -m http.server 8080` if you need clean URLs.
- **Deploy**: Push to the `main` branch (Vercel auto-deploys via project import). Verify with `npx vercel --prod` if needed.
- **Page navigation**: Clean URLs are defined in `vercel.json` rewrites. When adding a page, add a rewrite entry and update `sitemap.xml` + the `<footer>` nav.
- **Design tokens**: Edit CSS variables in `:root` in `style.css`. The palette uses OKLCH. Brand accent is coral (`oklch(62% 0.16 35)`).

## Data Model (localStorage)

The auth/vendor system stores everything in the browser — no backend:
- `adminUsers` — seeded with `admin@walkingfish.gm` / `admin123`
- `vendorApplications` — array of `{ id, business, contactName, email, category, message, status, createdAt }`
- `inviteTokens` — `{ id, applicationId, email, used, createdAt }`
- `vendorUsers` — `{ id, business, email, password (base64), applicationId, category, status, createdAt }`
- Session is in `sessionStorage` as `wf_session: { type, data }`

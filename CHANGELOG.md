# Changelog

All notable changes to ImagePulse will be documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [1.1.0] — 2026-02-23

### Added

- **Collapsible desktop sidebar** — chevron toggle at the bottom of the sidebar shrinks it to a 56px icon rail; expanded/collapsed state is persisted in `localStorage` across page reloads
- **Mobile overlay drawer** — hamburger button in the fixed top bar slides in a full-height nav drawer from the left; closes on link tap, backdrop click, or X button
- **Heroicons** (`@heroicons/react`) — icon added to each nav item (Dashboard, Events, Mappings, Settings); icons render in both desktop and mobile nav
- **CSS tooltips in icon-rail mode** — hovering a collapsed sidebar icon shows a floating label to the right without any JS

### Changed

- **Dashboard** — Recent Events table hides Tag and Source columns on mobile (`< sm`); cell padding reduced on narrow screens; EventModal inner card gains `mx-4` so it never touches screen edges on mobile
- **Events** — filter input grows to full width on mobile; Events table hides Tag, Source, and Digest columns on mobile; EventDetail expanded row uses tighter horizontal padding on mobile (`px-4 sm:px-6`)
- **Mappings** — Add-mapping form fields stack full width on mobile; table wrapper gains `overflow-x-auto` so the table scrolls horizontally on very narrow screens instead of breaking layout
- **Settings** — field input wrappers use `w-full max-w-sm` so inputs fill available width on mobile rather than being clipped

---

## [1.0.0] — 2026-02-24

First public release.

### Added

**Core**
- Webhook receiver endpoint (`POST /api/webhook`) with auto-detection of DIUN payload shape
- SQLite database via `better-sqlite3` with WAL mode; automatic schema migrations on startup
- Configurable event retention (prune events older than N days)
- GitHub release notes fetching — maps Docker image names to GitHub repos and attaches release body + URL to each event; auto-retries with `v`-prefixed tag if bare tag returns 404

**Notifications**
- ntfy push notifications (header-based auth, configurable server URL / topic / token)
- Email notifications via SMTP (STARTTLS and TLS, nodemailer)
- Stored notification title + body on each event for later retrieval
- Resend any past notification through currently-configured channels (`POST /api/events/:id/resend`)

**Dashboard**
- Stat cards: total events, unique images tracked, last updated timestamp
- Bar chart — events per day over the last 14 days (recharts)
- Horizontal bar chart — top 10 images by event count (recharts)
- Clickable recent-events table that opens a modal popup with notification title, body, and status

**Events log**
- Filterable (image substring, status) and paginated event table
- Expandable detail rows showing notification content, full digest, platform, notified-at timestamp
- GitHub release link in detail row ("View on GitHub ↗") when a release URL was fetched
- Resend Notification button with live feedback (only shown when notification content is stored)

**Mappings**
- Add / delete image → GitHub repo mappings via UI
- Inline row editing — change image name or repo without deleting and re-adding; atomic rename via transaction

**Settings**
- ntfy and SMTP configuration stored in SQLite, editable via UI
- Show / Hide toggle on sensitive fields (tokens, passwords)
- One-click test buttons for ntfy and email
- Seed settings from environment variables on first run

**Infrastructure**
- Multi-stage Dockerfile (frontend build → backend deps → production image, node:20-alpine)
- Docker Compose file using pre-built image from GitHub Container Registry
- GitHub Actions workflow — builds and pushes to `ghcr.io` on every push to `main` and on `v*` tags
- Vite + React 18 frontend with Tailwind CSS; proxied `/api` in development
- npm workspaces monorepo (root / backend / frontend)
- Logo SVG in sidebar; favicon in browser tab

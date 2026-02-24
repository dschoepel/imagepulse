# Changelog

All notable changes to ImagePulse will be documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [1.3.2] — 2026-02-24

### Fixed

- **`latest` tag — no release notes fetched** — when DIUN reports a Docker image with the `latest` tag, the GitHub tag-lookup (`/releases/tags/latest`) always returned 404. ImagePulse now calls `GET /repos/{owner}/{repo}/releases/latest` instead, returning the most recently published release — the logical equivalent of what `latest` points to.

---

## [1.3.1] — 2026-02-24

### Changed

- **README Webhook Setup** — all endpoint examples updated to use `https://`; `Authorization: Bearer` header added to both `diun.yml` and environment-variable examples; added callout explaining when to use `https://` (reverse proxy) vs direct container name; added environment-variable alternative for users who prefer not to use a `diun.yml` file; noted that DIUN fires all configured notifiers simultaneously

---

## [1.3.0] — 2026-02-24

### Added

- **Webhook shared-secret authentication** — optional `Authorization: Bearer <secret>` guard on `POST /api/webhook`; configure via **Settings → Webhook Security** or the `WEBHOOK_SECRET` environment variable; requests without a valid token are rejected with `401 Unauthorized`; leaving the secret blank keeps the endpoint open (backwards compatible)
- **Webhook Security settings section** — shared-secret field with a **Generate** button (cryptographically random 48-hex-char secret), masked input, and a ready-to-paste DIUN config snippet that appears once a secret is set
- **Mapping validation** — adding or editing a repo mapping now validates both fields inline before saving:
  - *Docker image*: client-side format check (must include at least one `/`, no whitespace)
  - *GitHub repo*: calls the new `GET /api/settings/validate-mapping` backend endpoint which queries the GitHub API; definitive 404 blocks the save (red highlight); rate-limit or network errors show an amber warning but still allow saving; uses `GITHUB_TOKEN` when configured
  - Validation fires on field blur and again on submit; fields show red/amber border with error text below; Add/Save buttons disabled while the GitHub check is in flight
  - Inline add-mapping form on the Events page applies the same repo validation

### Changed

- **README Webhook Setup** — updated to describe the optional shared-secret authentication
- **`WEBHOOK_SECRET` env var** — added to `.env.example` and the README environment variables table

---

## [1.2.2] — 2026-02-24

### Changed

- **`env_file` guidance** — added comments to `docker-compose.yml` and the README snippet explaining when to comment out `env_file` (Portainer, Rancher, and other container managers that inject env vars directly via UI)
- **README Docker Compose snippet** — synced to match `docker-compose.yml`; added inline note on the `user:` field pointing to `id` for PUID/PGID values

### Fixed

- **`backend/package.json` version** — backend workspace was stuck at `1.0.0`; all four package files (`package.json`, `backend/package.json`, `frontend/package.json`, `package-lock.json`) are now kept in sync

---

## [1.2.1] — 2026-02-24

### Added

- **API reference** — `docs/api.md` documents all 13 endpoints (webhook, events, settings, mappings) with request/response shapes, query parameters, error codes, and behavioural notes

---

## [1.2.0] — 2026-02-24

### Added

- **Breadcrumb bar** — sticky header above page content shows `ImagePulse / {Page}` with a link back to Dashboard; height matches the sidebar header so separator lines align across the full width
- **App name in sidebar** — "ImagePulse" text displayed next to the logo when the sidebar is expanded; hidden in icon-rail mode
- **Sidebar footer** — GitHub icon, repository link, and current version (`v1.2.0`) shown at the bottom of the desktop sidebar and mobile drawer; icon-only in collapsed icon-rail mode
- **Mapping indicator on events** — a green dot appears in the Image column for any event whose Docker image has a GitHub repo mapping
- **Inline add-mapping from event detail** — expanding an unmapped event shows an `owner/repo` input and Add button in the Mapping metadata row; saves immediately and updates the UI without a page reload
- **Sortable event columns** — Image, Tag, Status, Source, and Time column headers are clickable; clicking a new column sorts ASC, clicking again toggles DESC; active column highlighted with `↑`/`↓`, inactive columns show `↕`; sort is server-side so it applies across all pages

### Changed

- **Mappings nav icon** — replaced `ArrowsRightLeftIcon` with `MapIcon`
- **Sidebar collapse toggle** — moved from the bottom of the sidebar to the header row (right side when expanded, below logo when collapsed)
- **Chart timezone** — events-per-day chart now groups by local date (`date(created_at, 'localtime')`) so day buckets match the timestamps shown in the events list

### Fixed

- **Sidebar title clipping** — removed `leading-none` from the "ImagePulse" title; descenders on the `p` in "Pulse" no longer clip
- **Breadcrumb/sidebar height misalignment** — both the sidebar header and breadcrumb bar are now explicitly `h-14` so their bottom separator lines are flush

### Removed

- **Duplicate workflow** — deleted `docker.yml`; `docker-build.yml` supersedes it with multi-arch builds (`amd64`/`arm64`), GHA layer caching, and per-commit SHA tags

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

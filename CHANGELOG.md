# Changelog

All notable changes to ImagePulse will be documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [1.4.4] — 2026-03-29

### Fixed

- **Email release notes — raw markdown** — release notes body was rendered inside a `<pre>` block with HTML-escaped text, showing raw markdown symbols (`##`, `**`, `-`) verbatim; replaced with `marked.parse()` so headings, bold, lists, code spans, and links render as formatted HTML; scoped CSS added to the email `<head>` for all standard markdown elements; adds `marked@^17` to backend dependencies
- **ntfy release notes — raw markdown** — notification body sent as `text/plain`; changed `Content-Type` header to `text/markdown` so the ntfy app renders bold, lists, headings, and inline code natively

---

## [1.4.3] — 2026-03-29

### Added

- **Mappings: host tracking** — each mapping row now shows pill badges for every hostname that has generated an event for that Docker image; hostnames are derived from `events.raw_payload` (no schema change); badges appear automatically as new events arrive
- **Mappings: filter by host** — a host dropdown appears in the filter bar when any mappings have known hosts; selecting a host narrows the list to mappings seen on that host; has its own Clear button

### Changed

- **Mappings: Add form → modal** — the Add Image Mapping form is now a modal opened via an `+ Add Mapping` button in the page header; closes on backdrop click or Escape key; the filter bar is now the first element on the page followed directly by the mappings table
- **Mappings: table columns** — added a `Hosts` column between `Link` and the action buttons; shows `—` for images with no events yet
- **Mappings: page width** — widened from `max-w-3xl` to `max-w-5xl` to accommodate the new Hosts column

---

## [1.4.2] — 2026-03-01

### Fixed

- **ntfy notification icon — dead-code fallback** — the GitHub SVG fallback was never reached because the request-derived URL (e.g. `http://imagepulse:3579`) was always truthy; the icon was silently sent as an internal Docker address that ntfy cannot fetch. Rewrote icon resolution: `NTFY_ICON_URL` (new) → `APP_BASE_URL/favicon.ico` → GitHub-hosted SVG fallback; the request-derived URL is no longer used for the icon
- **ntfy icon missing on Resend** — the resend endpoint in `events.js` still used the old hardcoded `appBaseUrl/favicon.ico`; updated to use the same `NTFY_ICON_URL` → `APP_BASE_URL` → GitHub SVG priority chain as the webhook handler
- **Email notification failed on webhook** — `appBaseUrl` was accidentally removed when rewriting the ntfy icon logic, causing `appBaseUrl is not defined` and a failed email on every incoming webhook
- **ARM64 Docker build — QEMU illegal instruction** — `npm ci` under QEMU ARM64 emulation crashed because Node.js 20's JIT compiler uses CPU instructions that QEMU doesn't support; fixed by adding `--platform=$BUILDPLATFORM` to the build stages so `npm ci` runs natively, and compiling the `better-sqlite3` native addon for the target arch in the production stage via `npm rebuild`
- **Version update indicator — false positive** — sidebar showed a downgrade arrow (e.g. `v1.4.1 → v1.4.0`) when the running version was ahead of the latest published GitHub release; replaced string `!==` comparison with a proper semver comparison so `hasUpdate` is only true when the GitHub release is strictly newer
- **Mobile responsiveness — Events & Event Archive** — table wrappers now scroll horizontally on narrow screens (`overflow-x-auto`) instead of clipping content; timestamp columns show date-only on mobile (< 640 px) and full datetime on wider screens

### Added

- **`NTFY_ICON_URL` env var** — explicitly set the ntfy notification icon to any publicly reachable PNG/JPG/ICO URL; documented in `.env.example`, `docker-compose.yml`, and README
- **`APP_BASE_URL` env var** — public base URL used for the ntfy icon when `NTFY_ICON_URL` is not set; documented in `.env.example`, `docker-compose.yml`, and README

### Changed

- **`docker-compose.yml` — full env var pass-through** — all settings (ntfy, SMTP, GitHub, retention, webhook secret, logging, etc.) now listed in the `environment:` block with `${VAR:-default}` syntax; Portainer and other container managers that inject variables via their UI no longer require a separate `.env` file on the host; `DB_PATH` and `LOG_FILE` defaults updated to absolute container paths (`/app/data/...`)
- **CI — `latest` image tag on version push** — `latest` was previously only applied when pushing to `main`; changed to `ref_type == 'tag'` so every `vX.Y.Z` tag push also updates `latest` in GHCR

---

## [1.4.1] — 2026-02-27

### Fixed

- **Mappings: double-save bug** — removed `onBlur` validation on the repo/URL inputs in both the Add form and Edit row; the async GitHub/URL check triggered on blur disabled the Save button between `mousedown` and `click`, swallowing the first click and requiring a second press; validation still runs on submit
- **Events: inline add-mapping — GitHub Repo only** — the inline Add Mapping form in the event detail row now supports both **GitHub Repo** and **Release Notes URL** link types via a compact radio toggle, matching the full Mappings page form
- **Release notes link label** — "View on GitHub ↗" renamed to "View Release Notes ↗" in the email button, Events detail panel, and Event Archive detail panel so the label is accurate for URL-type mappings

### Added

- **Logging: `LOG_LEVEL` / `LOG_FILE` env vars** — documented in `.env.example`, `docker-compose.yml` (commented entries), and README; `LOG_FILE` points to `/app/data/imagepulse.log` when file output is desired alongside stdout

### Changed

- **README** — updated Features, Mappings, Notifications, Settings sections for v1.4.x; added Logging section; updated Environment Variables table with `LOG_LEVEL` and `LOG_FILE`

---

## [1.4.0] — 2026-02-27

### Added

- **Mappings: Release Notes URL type** — mappings can now link to any URL (e.g. `https://wordpress.org/news/category/releases/`) for images that don't have a GitHub repo; toggled via a "GitHub Repo / Release Notes URL" radio selector on the add/edit form; URL-type mappings are validated for reachability; the URL is used as the ntfy click link and email button for that image
- **Mappings: search/filter** — filter the mappings table by image name in real time
- **Mappings: custom pagination** — per-page selector (5, 10, 25, 50, 100) with page navigation and range indicator
- **Events: custom pagination** — per-page selector (5, 10, 25, 50, 100) persisted to localStorage; pagination bar now shows range indicator (e.g. "26–50 of 142")
- **Events: View Archive link** — header now includes a "View Archive ↗" link to `/events/archive`
- **Sidebar version update indicator** — sidebar footer shows `v1.3.6 → v1.4.0` (linked to the release) when a newer GitHub release is available; collapsed mode shows an orange dot on the GitHub icon; checked once on load with a 1-hour server-side cache to avoid GitHub API rate limits (`GET /api/version`)
- **Event Archive** — new `/events/archive` sub-page lists events moved there by Archive & Clean; read-only with filter, sort, per-page selector (5/10/25/50/100), range indicator, and expandable detail rows; breadcrumb shows `ImagePulse / Events / Archive`
- **Settings — Event Retention: manual cleanup buttons** — two new buttons alongside Save: **Run Cleanup Now** (permanently deletes events older than the configured retention period) and **Archive & Clean** (copies matching events to the archive table first, then deletes from the main log); both show a confirmation modal with the exact event count before acting; modal explains when retention is disabled (0 days) or nothing qualifies
- **Structured logging (pino)** — all `console.log/error/warn` calls replaced with a pino logger; log level controlled via `LOG_LEVEL` env var (default `info`); optional append-mode file output via `LOG_FILE` env var; each log line is JSON with structured fields (e.g. `{ id, image, tag, status }` on webhook events)

### Changed

- **Sidebar collapse/expand button** — restyled as a small always-visible pill button (`<<` / `>>`); subtle at rest (blends with sidebar), clearly highlighted on hover
- **Settings — Webhook Security: shared secret field** — added Show/Hide toggle and Copy button alongside the existing Generate button; Copy is disabled when field is empty
- **Settings — Webhook Security: DIUN config snippets** — replaced the single static code block with two collapsible cards (start closed to save space): "diun.yml standalone config" and "Docker Compose environment variables"; each card has a Copy-to-clipboard button overlaid on the code block; the diun.yml card populates the actual secret value when one is set; the Docker Compose card uses `${DIUN_NOTIF_WEBHOOK_HEADERS_AUTHORIZATION}` variable substitution and the description shows the matching `.env` line to add
- **ntfy notification title** — new format: `[Host]: [image:tag] - [status phrase]` (e.g. `myserver: docker.io/library/nginx:latest - has been updated`); status phrase is "has been updated" or "is new"
- **ntfy notification icon** — replaced the `:whale:` emoji tag with the app's favicon served from the running instance (`/favicon.ico`); icon URL is derived from the incoming request so it works correctly behind a reverse proxy
- **Email notification header** — replaced the 🐳 whale emoji with the app favicon (`<img>` tag); heading now shows `[Hostname] / [image:tag]` at larger (20 px) bold font; hostname subtitle line removed
- **Email metadata labels** — `Status`, `Digest`, `Platform`, and `Version` labels are now bold and include a colon separator (e.g. `Status:   update`)
- **Reverse proxy support** — added `trust proxy 1` to Express so `req.protocol` correctly reflects HTTPS when running behind nginx/Traefik/Caddy
- **Release notes link label** — renamed "View on GitHub ↗" to "View Release Notes ↗" in the email button, Events detail panel, and Event Archive detail panel so the label is accurate for both GitHub repo mappings and arbitrary URL-type mappings

---

## [1.3.6] — 2026-02-26

### Added

- **Registry digest → version tag lookup** — for `latest`-tagged images, ImagePulse now queries the Docker Hub / GHCR / generic OCI registry to find the semver tag (e.g. `v1.3.6`) that shares the same digest; the resolved version is shown as `Version:` in ntfy notifications, the email metadata table, and the Events detail panel — no GitHub repo mapping required
  - Docker Hub: uses the `hub.docker.com/v2/repositories` tags API (up to 3 pages, no auth required for public repos)
  - GHCR (`ghcr.io`): anonymous token fetch → tag list → HEAD manifests compared via `Docker-Content-Digest` header
  - Generic OCI registries: same OCI pattern with a dynamic host; tries unauthenticated first, falls back to token on 401
  - Private registries are out of scope — lookup is skipped gracefully
  - Results are cached in-memory for 1 hour (including `null` results) to avoid repeated registry calls for the same digest
  - Always degrades gracefully — a registry failure never blocks webhook processing
- **`resolved_version` DB column** — stored on each event so resent emails include the correct version without re-querying the registry
- **Custom favicon and logo** — replaced the placeholder SVG favicon and logo with the official ImagePulse assets (`favicon.ico`, `Image-Pulse-Logo-1.svg`)

### Changed

- **`Version:` replaces `Release:` in notification body** — the version line is now sourced from the registry lookup (works for all images) rather than the GitHub release name (mapped images only); GitHub release notes body and URL are still used for email content and ntfy click URL on mapped images

---

## [1.3.5] — 2026-02-25

### Added

- **ntfy click-to-open** — tapping an ntfy notification now opens the GitHub release page directly (mapped images only; requires ntfy app v1.16+)
- **ntfy status-aware emoji tags** — new images get 🐳 + ✅ (`whale,white_check_mark`); updates get 🐳 + 🔄 (`whale,arrows_counterclockwise`)
- **ntfy priority escalation** — `update` events are sent at priority 4 (high); `new` events remain at priority 3 (default)
- **HTML email layout** — emails now render a structured HTML template: indigo header with image name and status badge (green = new, amber = update), metadata table, release notes `<pre>` block, "View on GitHub" button, and ImagePulse footer; plain-text fallback included for non-HTML clients
- **Host field in notifications** — all notification bodies now include `Host: {hostname}` (sourced from DIUN's `rawPayload.hostname`); shows `(unknown)` when DIUN hostname is not configured
- **`[ImagePulse]` email subject prefix** — makes ImagePulse notifications easy to filter and distinguish from DIUN's own emails
- **`via ImagePulse` footer in ntfy body** — last line of every ntfy notification body to aid identification in notification centres
- **`(unknown)` fallback for blank metadata** — Host, Digest, and Platform are always shown in notification body and email; blank or absent DIUN fields display `(unknown)` rather than being silently omitted

### Changed

- **Stored notification body** — now stores the full base body (Host, Status, Digest, Platform, Release, `via ImagePulse`) without release notes text appended; release notes are excluded from stored body (URL still stored separately); eliminates mid-sentence cut-offs in the event detail panel
- **Resend** — ntfy resend derives tags and priority from the event's stored status; email resend sends full HTML layout with metadata reconstructed from `raw_payload`; click URL sourced from `github_release_url` column

---

## [1.3.4] — 2026-02-24

### Added

- **Resolved release version in notifications for `latest`-tagged images** — when the Docker tag is `latest` and release notes are fetched, the actual GitHub release name (e.g. `Release: v1.3.3`) is now appended to the notification body and stored in the event detail panel

### Fixed

- **Inline add-mapping requires two clicks** — the `onBlur` handler on the repo input in the event detail panel triggered an async GitHub API call that set `repoChecking=true`, disabling the Add button between `mousedown` and `click`; the browser swallowed the click on the now-disabled button, requiring a second click to save; removed `onBlur` from the inline form (validation still runs on submit)

---

## [1.3.3] — 2026-02-24

### Added

- **`NTFY_ENABLED` and `EMAIL_ENABLED` env vars** — notification channels can now be enabled on first run via environment variables; previously only the connection details were seeded, leaving the enabled toggles off and requiring a manual visit to Settings to activate them
- **Multiple email recipients** — `EMAIL_TO` (and the Settings **To** field) now accepts a comma-separated list of addresses (e.g. `you@example.com, other@example.com`); nodemailer handles delivery to all recipients

### Fixed

- **Enabled toggles not seeded from env vars** — `ntfy_enabled` and `email_enabled` were missing from `seedSettingsFromEnv()`; setting `NTFY_ENABLED=true` / `EMAIL_ENABLED=true` now correctly persists the toggle state to the database on first run

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

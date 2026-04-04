# ImagePulse Release History

---

## [1.4.6] — 2026-04-04

### Notification title and body formatting polish

- **Hostname/image name separator** — title now reads `hostname: imageName` (space after colon) in both ntfy title and email subject; previously `hostname:imageName` with no space
- **Bold image name in ntfy body** — the `Image:` line in the ntfy notification body now renders the short image name in bold markdown (`**imageName**`); e.g. `Image: ghcr.io/linuxserver/**swag**:latest`
- **Bold image name in email header** — the blue header bar wraps the image name in `<strong>` so it renders bold in HTML email clients

---

## [1.4.5] — 2026-04-03

### Notification title and body format improvements

- **Shorter notification title** — ntfy and email subject now use the short image name (last `/`-separated segment) instead of the fully qualified image path: `hostname:imageName has been updated/added` (e.g. `myhost:myapp has been updated`)
- **Full image path moved to body** — a new `Image:` line (fully qualified `image:tag`) is inserted between `Status:` and `Digest:` in the ntfy body, email plain-text, and stored notification body
- **Email header updated** — the blue header bar now shows `hostname:imageName` to match the ntfy title format
- **Email metadata row added** — `Image:` row (full `image:tag`) appears between `Status:` and `Digest:` in the email metadata table

---

## [1.4.4] — 2026-03-29

### Formatted release notes in notifications

- **Markdown rendering in email** — release notes body now rendered as formatted HTML (headings, bold, lists, code, links) via `marked`; previously showed raw markdown text inside a `<pre>` block
- **Markdown rendering in ntfy** — notification body `Content-Type` changed from `text/plain` to `text/markdown`; the ntfy app now renders bold, lists, headings, and inline code natively

---

## [1.4.3] — 2026-03-29

### Mappings page: host tracking + layout overhaul

- **Host tracking** — each mapping shows pill badges for every hostname that has sent an event for that image (derived from `events.raw_payload`; no schema change required)
- **Host filter** — dropdown in the filter bar to narrow the mappings list to a single host
- **Add Mapping modal** — the add form moved from an inline card to a modal (opened via `+ Add Mapping` button); closes on backdrop click or Escape
- **Layout** — filter bar is now the first element on the page; new `Hosts` column added to the table; page widened to `max-w-5xl`

---

## [1.4.2] — 2026-03-01

### Notification reliability + env var improvements

- **`NTFY_ICON_URL` / `APP_BASE_URL` env vars** — explicit icon URL override; eliminates the internal-Docker-address silent failure
- **ntfy icon dead-code fallback fix** — rewrote icon resolution priority chain
- **ntfy icon on Resend** — resend endpoint now uses the same priority chain
- **Email on webhook fixed** — `appBaseUrl` was accidentally removed in v1.4.1 icon rewrite
- **ARM64 Docker build** — QEMU illegal instruction on `npm ci` fixed via `--platform=$BUILDPLATFORM`
- **Version update indicator** — replaced string `!==` with semver comparison; no more false-positive downgrade arrows
- **Mobile responsiveness** — Events & Event Archive tables now scroll horizontally on narrow screens
- **`docker-compose.yml`** — full env var pass-through with `${VAR:-default}` syntax
- **CI `latest` tag** — now applied on every `vX.Y.Z` tag push, not just `main` pushes

---

## [1.4.1] — 2026-02-27

### Bug fixes

- **Mappings double-save bug** — removed `onBlur` validation that disabled the Save button between `mousedown` and `click`
- **Events inline add-mapping** — now supports both GitHub Repo and Release Notes URL link types
- **Release notes link label** — "View on GitHub ↗" → "View Release Notes ↗" everywhere
- **Logging env vars** — `LOG_LEVEL` / `LOG_FILE` documented in `.env.example`, `docker-compose.yml`, README

---

## [1.4.0] — 2026-02-27

### Major feature release

- **Mappings: Release Notes URL type** — link to any URL instead of requiring a GitHub repo
- **Mappings: search/filter + pagination** — client-side filter; per-page selector (5/10/25/50/100)
- **Events: custom pagination** — per-page selector persisted to localStorage; range indicator
- **Events: View Archive link** — header link to `/events/archive`
- **Sidebar version update indicator** — shows `vX.Y.Z → vA.B.C` when a newer GitHub release exists; collapsed mode shows orange dot; 1-hour server-side cache
- **Event Archive** — `/events/archive` sub-page; read-only with filter, sort, pagination, expandable detail rows
- **Settings: Run Cleanup Now / Archive & Clean** — manual retention buttons with confirmation modal
- **Structured logging (pino)** — `LOG_LEVEL` (default `info`) and `LOG_FILE` env vars; JSON log lines
- **Sidebar toggle** — restyled as always-visible pill button (`<<` / `>>`)
- **Settings: webhook secret** — Show/Hide + Copy buttons; two collapsible DIUN snippet cards
- **ntfy title format** — `[Host]: [image:tag] - [status phrase]`
- **ntfy icon** — favicon instead of `:whale:` emoji tag
- **Email header** — favicon `<img>`; `[Hostname] / [image:tag]` heading at 20 px bold
- **Email metadata labels** — bold + colon separators
- **Reverse proxy support** — `trust proxy 1` in Express

---

## [1.3.6] — 2026-02-26

### Registry digest → version tag lookup

- For `latest`-tagged images, queries Docker Hub / GHCR / generic OCI registry to resolve the semver tag sharing the same digest; shown as `Version:` in notifications and event detail
- `resolved_version` DB column added
- Custom favicon and logo

---

## [1.3.5] — 2026-02-25

### Notification improvements

- **ntfy**: click-to-open (opens GitHub release), status-aware emoji tags, priority escalation for updates
- **Email**: full HTML template (header, metadata table, release notes block, button, footer); plain-text fallback
- `Host:` field in all notifications; `[ImagePulse]` email subject prefix; `via ImagePulse` ntfy footer
- `(unknown)` fallback for blank metadata fields

---

## [1.3.4] — 2026-02-24

- Resolved release version appended to notification body for `latest`-tagged images
- Fixed inline add-mapping requiring two clicks (removed `onBlur` on repo input)

---

## [1.3.3] — 2026-02-24

- `NTFY_ENABLED` / `EMAIL_ENABLED` env vars — seed enabled toggles on first run
- Multiple email recipients (comma-separated `EMAIL_TO`)
- Fixed: enabled toggles not seeded from env vars

---

## [1.3.2] — 2026-02-24

- Fixed: `latest` tag returned no release notes (switched to `GET /releases/latest`)

---

## [1.3.1] — 2026-02-24

- README webhook setup: HTTPS examples, `Authorization: Bearer` header, env-var alternative

---

## [1.3.0] — 2026-02-24

- Webhook shared-secret authentication (`Authorization: Bearer`)
- Webhook Security settings section with Generate button and DIUN snippet
- Mapping validation (client-side image check + GitHub API repo check)

---

## [1.2.2] — 2026-02-24

- `env_file` guidance in `docker-compose.yml` and README
- Fixed: `backend/package.json` version stuck at `1.0.0`

---

## [1.2.1] — 2026-02-24

- API reference: `docs/api.md` documenting all 13 endpoints

---

## [1.2.0] — 2026-02-24

- Breadcrumb bar, app name in sidebar, sidebar footer with version
- Mapping indicator (green dot) on events with a mapping
- Inline add-mapping from event detail row
- Sortable event columns (server-side)

---

## [1.1.0] — 2026-02-23

- Collapsible desktop sidebar (icon-rail mode, localStorage persistence)
- Mobile overlay drawer
- Heroicons nav icons + CSS tooltips in icon-rail mode
- Mobile responsive layouts for Dashboard, Events, Mappings, Settings

---

## [1.0.0] — 2026-02-24

First public release — webhook receiver, SQLite storage, ntfy + email notifications, Dashboard, Events log, Mappings, Settings, multi-arch Docker image, GitHub Actions CI.

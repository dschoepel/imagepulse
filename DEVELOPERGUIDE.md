# ImagePulse Developer Guide

A reference for developers unfamiliar with the codebase. Covers architecture, data flow, dependencies, database schema, API surface, and conventions.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Repository Layout](#2-repository-layout)
3. [Technology Stack](#3-technology-stack)
4. [External Dependencies](#4-external-dependencies)
5. [Architecture & Data Flow](#5-architecture--data-flow)
6. [Backend Deep Dive](#6-backend-deep-dive)
7. [Frontend Deep Dive](#7-frontend-deep-dive)
8. [Database Schema](#8-database-schema)
9. [API Reference Summary](#9-api-reference-summary)
10. [Environment Variables](#10-environment-variables)
11. [Development Workflow](#11-development-workflow)
12. [Docker & CI/CD](#12-docker--cicd)
13. [Conventions & Patterns](#13-conventions--patterns)

---

## 1. Project Overview

ImagePulse is a self-hosted webhook receiver and notification hub for Docker image update events. It:

1. Receives a `POST /api/webhook` from [DIUN](https://crazymax.dev/diun/) when a Docker image is new or updated
2. Stores the event in SQLite
3. Looks up GitHub release notes for the image (if a mapping exists)
4. Resolves the semver version tag for `latest`-tagged images via registry APIs
5. Sends notifications via ntfy push and/or SMTP email
6. Exposes a React SPA for browsing events, managing mappings, and configuring settings

---

## 2. Repository Layout

```
imagepulse/
├── backend/
│   ├── package.json
│   └── src/
│       ├── index.js              # Express entry point
│       ├── logger.js             # pino logger singleton
│       ├── adapters/
│       │   ├── index.js          # Webhook source router
│       │   └── diun.js           # DIUN payload normaliser
│       ├── db/
│       │   └── index.js          # SQLite init, migrations, all query helpers
│       ├── routes/
│       │   ├── webhook.js        # POST /api/webhook — core ingestion logic
│       │   ├── events.js         # GET/POST /api/events
│       │   ├── archive.js        # GET /api/archive
│       │   ├── settings.js       # GET/PUT /api/settings, mappings CRUD
│       │   └── version.js        # GET /api/version — update check
│       └── services/
│           ├── ntfy.js           # ntfy HTTP push
│           ├── email.js          # nodemailer SMTP
│           ├── emailTemplate.js  # HTML email builder (uses marked)
│           ├── github.js         # GitHub Releases API
│           └── registry.js       # Docker registry digest→version resolver
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx              # React root
│       ├── App.jsx               # Router (React Router v6)
│       ├── api.js                # apiFetch() + validateRepo/validateUrl helpers
│       ├── components/
│       │   └── Layout.jsx        # Sidebar, breadcrumb, version indicator
│       └── pages/
│           ├── Dashboard.jsx
│           ├── Events.jsx
│           ├── EventArchive.jsx
│           ├── Mappings.jsx
│           └── Settings.jsx
├── CHANGELOG.md
├── RELEASE.md
├── DEVELOPERGUIDE.md
├── README.md
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── package.json                  # npm workspaces root
└── package-lock.json
```

---

## 3. Technology Stack

### Backend

| Layer | Technology | Notes |
|---|---|---|
| Runtime | Node.js 20 (Alpine) | ES modules (`"type": "module"`) throughout |
| Framework | Express 4 | `trust proxy 1` set for reverse-proxy support |
| Database | better-sqlite3 | Synchronous SQLite; WAL mode; `foreign_keys = ON` |
| HTTP client | node-fetch 3 | Used for GitHub API, registry API, ntfy, URL validation |
| Email | nodemailer 8 | SMTP; STARTTLS (`false`) or TLS (`true`) |
| Markdown | marked 17 | Converts GitHub release body markdown → HTML for email |
| Logging | pino 10 | JSON to stdout; optional file via `LOG_FILE` |
| Dev server | nodemon | Auto-restart on file changes |

### Frontend

| Layer | Technology | Notes |
|---|---|---|
| Framework | React 18 | Functional components + hooks only |
| Routing | React Router v6 | `<BrowserRouter>` with nested `<Routes>` |
| Styling | Tailwind CSS 3 | Utility-first; no custom CSS files |
| Charts | Recharts 3 | Dashboard bar charts |
| Icons | @heroicons/react 2 | Sidebar and UI icons |
| Build tool | Vite 7 | Dev server on :5173, proxies `/api` to :3579 |

---

## 4. External Dependencies

### Runtime services

| Service | Purpose | Required? |
|---|---|---|
| DIUN | Watches Docker images and sends webhooks | Yes (primary input) |
| ntfy server | Push notification delivery | No — optional channel |
| SMTP server | Email delivery | No — optional channel |
| GitHub API | Release notes fetch + version check + repo validation | No — degrades gracefully without `GITHUB_TOKEN` |
| Docker Hub / GHCR / OCI registries | Digest → semver version resolution | No — best-effort, always degrades gracefully |

### Key npm packages (backend)

```
better-sqlite3   — synchronous SQLite driver; native addon (compiled per arch)
express          — HTTP framework
node-fetch       — fetch() for Node (ESM-native)
nodemailer       — SMTP client
marked           — markdown → HTML (used only in emailTemplate.js)
pino             — structured JSON logger
```

### Key npm packages (frontend)

```
react / react-dom      — UI framework
react-router-dom       — client-side routing
tailwindcss            — utility CSS
recharts               — chart components
@heroicons/react       — SVG icon set
vite                   — build tool and dev server
```

---

## 5. Architecture & Data Flow

### Webhook ingestion (happy path)

```
DIUN → POST /api/webhook
  │
  ├─ 1. Auth check (webhook_secret setting)
  ├─ 2. parseWebhook(req) → adapter normalises payload
  │       └─ diun.js: splits image:tag, passes rawPayload through
  ├─ 3. insertEvent() → writes row to events table
  ├─ 4. Look up mapping (SELECT * FROM mappings WHERE image = ?)
  ├─ 5. Fetch release notes
  │       ├─ GitHub mapping → fetchReleaseNotes(repo, tag) [github.js]
  │       │     ├─ tries /releases/tags/{tag}
  │       │     ├─ tries /releases/tags/v{tag}
  │       │     └─ falls back to /releases/latest for 'latest' tag
  │       └─ URL mapping → { url: mapping.url } (no body fetched)
  ├─ 6. resolveVersionTag(image, tag, digest) [registry.js]
  │       └─ Only for 'latest' tag; queries Docker Hub / GHCR / OCI
  │          to find the semver tag sharing this digest; 1-hour in-memory cache
  ├─ 7. Build notification title + body strings
  ├─ 8. markNotified() → updates event row with title, body, release URL, version
  ├─ 9. sendNtfy() [ntfy.js] — if ntfy_enabled = 'true'
  └─ 10. sendEmail() [email.js] — if email_enabled = 'true'
          └─ buildEmailHtml() [emailTemplate.js]
               └─ marked.parse(releaseNotes.body) for HTML rendering
```

### Settings persistence

All configuration is stored as key-value rows in the `settings` table. On startup, `seedSettingsFromEnv()` inserts rows from environment variables using `INSERT OR IGNORE` — so env vars only set the initial value; UI edits override them permanently.

### Version update check

`GET /api/version` fetches `https://api.github.com/repos/dschoepel/imagepulse/releases/latest`, compares the release tag with the running version from `backend/package.json`, and returns `{ current, latest, latestUrl, hasUpdate }`. Result is cached in memory for 1 hour. The sidebar in `Layout.jsx` calls this on mount and displays an update badge when `hasUpdate` is true.

### Retention / archive

On startup and every 24 hours, `runRetention()` calls `pruneOldEvents(days)` to hard-delete events older than `retention_days` (if > 0). Manual archive-then-prune is available via `POST /api/settings/archive-and-prune`, which copies matching events to `event_archive` before deleting them from `events`.

---

## 6. Backend Deep Dive

### `src/index.js` — entry point

- Loads `.env` via `dotenv/config`
- Calls `initDb()` → `seedSettingsFromEnv()`
- Schedules 24-hour retention prune
- Mounts routers under `/api/*`
- Serves the Vite-built frontend from `backend/public/` (copied by Dockerfile)

### `src/db/index.js` — database layer

Single file; exports all query helpers. Key points:

- **`initDb()`** — `CREATE TABLE IF NOT EXISTS` for `events`, `event_archive`, `mappings`, `settings`; then try/catch `ALTER TABLE` for each new column added in later versions (safe migration pattern)
- **`seedSettingsFromEnv()`** — `INSERT OR IGNORE` so env vars only apply on first run
- **`insertEvent()`** / **`markNotified()`** — two-phase write: insert without notification data, then update once notifications are sent
- All query functions are synchronous (better-sqlite3)
- `getEvents()` / `getArchivedEvents()` accept page/limit/image/status/sortBy/sortDir; sort column is validated against an allowlist (`ALLOWED_SORT_COLS`) before interpolation

### `src/adapters/` — webhook normalisation

`index.js` auto-detects the webhook source by examining the payload shape (currently only DIUN is supported). `diun.js` splits `body.image` on the last `:` to separate image from tag, and passes the full body as `rawPayload`. Adding a new webhook source means adding a new adapter file and a detection branch in `index.js`.

### `src/routes/webhook.js` — core logic

The most complex route. Orchestrates steps 1–10 from the data flow section above. Key locals:

- `appBaseUrl` — public base URL for email favicon `<img>`; derived from `APP_BASE_URL` env var, falling back to request host
- `ntfyIconUrl` — priority chain: `NTFY_ICON_URL` → `APP_BASE_URL/favicon.ico` → GitHub-hosted SVG fallback
- Hostname is read from `rawPayload.hostname` (DIUN sends this)

### `src/services/registry.js` — version resolution

For `latest`-tagged images, attempts to find the semver tag that shares the same manifest digest. Strategy varies by registry:

- **Docker Hub** — queries `hub.docker.com/v2/repositories/{image}/tags` (up to 3 pages)
- **GHCR** (`ghcr.io`) — anonymous token fetch, then HEAD requests per tag comparing `Docker-Content-Digest` header
- **Generic OCI** — same pattern with dynamic host; unauthenticated first, falls back to token on 401

Results cached in memory for 1 hour (including `null` to avoid hammering registries). Private registries are out of scope — skipped gracefully.

### `src/services/emailTemplate.js` — HTML email

Builds a self-contained HTML email using table-based layout (required for Outlook compatibility). The release notes block uses `marked.parse()` to convert the GitHub markdown body to HTML. Markdown styles are scoped under the `.rn` CSS class in the `<head>` `<style>` block (supported by Gmail, Apple Mail, Outlook web, iOS Mail; not Outlook desktop).

### `src/logger.js` — logging

Exports a pino logger instance. Level is controlled by `LOG_LEVEL` (default `info`). Optional file output via `LOG_FILE` (append mode). Import and use instead of `console.log` in all route and service files.

---

## 7. Frontend Deep Dive

### `src/api.js`

Exports:
- **`apiFetch(path, options?)`** — `fetch('/api' + path, …)`, throws on non-ok responses with the `error` field from the JSON body
- **`validateRepo(repo)`** — calls `GET /api/settings/validate-mapping?repo=…`
- **`validateUrl(url)`** — calls `GET /api/settings/validate-url?url=…`

### `src/App.jsx`

Defines all client-side routes inside `<Layout>`:

| Path | Component |
|---|---|
| `/` | Dashboard |
| `/events` | Events |
| `/events/archive` | EventArchive |
| `/mappings` | Mappings |
| `/settings` | Settings |

### `src/components/Layout.jsx`

Renders the persistent shell: collapsible desktop sidebar, mobile overlay drawer, breadcrumb bar. On mount, fetches `GET /api/version` and shows an update indicator in the sidebar footer when `hasUpdate` is true. Sidebar collapsed state is persisted to `localStorage`.

### Page components

| Component | Key behaviour |
|---|---|
| `Dashboard.jsx` | Stat cards + Recharts bar charts; event row click opens `EventModal` |
| `Events.jsx` | Server-side paginated + filtered + sorted table; expandable detail rows with Resend button; inline add-mapping form (supports both link types) |
| `EventArchive.jsx` | Same layout as Events but read-only; data from `GET /api/archive` |
| `Mappings.jsx` | Client-side filtered + paginated table; Add via modal; inline row edit; `hosts[]` array from API shown as pills; host filter dropdown |
| `Settings.jsx` | ntfy, SMTP, webhook security, retention settings; test buttons; DIUN snippet cards; prune/archive buttons with confirmation modal |

---

## 8. Database Schema

### `events`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `image` | TEXT | e.g. `ghcr.io/dschoepel/imagepulse` |
| `tag` | TEXT | e.g. `latest`, `v1.4.3` |
| `digest` | TEXT | Content digest |
| `status` | TEXT | `new` or `update` |
| `source` | TEXT | `diun` |
| `raw_payload` | TEXT | JSON string of full webhook body |
| `notified_at` | TEXT | ISO datetime, set after notifications sent |
| `created_at` | TEXT | ISO datetime (UTC) |
| `notification_title` | TEXT | Set by `markNotified()` |
| `notification_body` | TEXT | Set by `markNotified()` |
| `github_release_url` | TEXT | HTML URL to GitHub release page |
| `resolved_version` | TEXT | Semver resolved from registry for `latest` tag |

> `raw_payload` contains `hostname` (used for Mappings host tracking), `platform`, and other DIUN fields.

### `event_archive`

Same columns as `events` plus `archived_at TEXT`. Populated by `POST /api/settings/archive-and-prune`. Read-only from the UI.

### `mappings`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `image` | TEXT UNIQUE | Must match exactly what DIUN sends |
| `repo` | TEXT | `owner/repo` for GitHub type |
| `url` | TEXT | Arbitrary URL for URL type |
| `link_type` | TEXT | `github` (default) or `url` |
| `created_at` | TEXT | ISO datetime |

> Hosts are not stored in mappings — they are derived at query time from `events.raw_payload` via `json_extract` + `GROUP_CONCAT`.

### `settings`

| Column | Type |
|---|---|
| `key` | TEXT PK |
| `value` | TEXT |

Known keys: `ntfy_enabled`, `ntfy_url`, `ntfy_topic`, `ntfy_token`, `email_enabled`, `smtp_host`, `smtp_port`, `smtp_secure`, `smtp_user`, `smtp_pass`, `email_from`, `email_to`, `retention_days`, `webhook_secret`.

### Schema migration pattern

New columns are added with try/catch `ALTER TABLE` in `initDb()`:

```js
try { db.exec('ALTER TABLE events ADD COLUMN resolved_version TEXT'); } catch {}
```

This is idempotent — runs on every startup and is silently ignored if the column already exists. Never use `DROP COLUMN` or destructive DDL in migrations.

---

## 9. API Reference Summary

All routes are prefixed `/api`. Full request/response shapes are in `docs/api.md`.

| Method | Path | Description |
|---|---|---|
| `POST` | `/webhook` | Receive DIUN webhook; authenticate, store, notify |
| `GET` | `/events` | List events — `?page`, `?limit`, `?image`, `?status`, `?sortBy`, `?sortDir` |
| `GET` | `/events/stats` | Total count, unique images, last updated |
| `GET` | `/events/chart-data` | Events-per-day (14d) + top-10 images |
| `POST` | `/events/:id/resend` | Resend stored notification through active channels |
| `GET` | `/archive` | List archived events (same query params as events) |
| `GET` | `/settings` | All settings as key-value object |
| `PUT` | `/settings` | Batch-update settings |
| `POST` | `/settings/test-ntfy` | Send a test ntfy notification |
| `POST` | `/settings/test-email` | Send a test email |
| `POST` | `/settings/prune-preview` | Count events that would be pruned |
| `POST` | `/settings/prune-now` | Permanently delete old events |
| `POST` | `/settings/archive-and-prune` | Copy old events to archive then delete |
| `GET` | `/settings/validate-mapping` | Verify GitHub repo exists — `?repo=owner/repo` |
| `GET` | `/settings/validate-url` | Verify URL is reachable — `?url=…` |
| `GET` | `/settings/mappings` | List all mappings with `hosts[]` derived from events |
| `PUT` | `/settings/mappings` | Create mapping |
| `PATCH` | `/settings/mappings/:image` | Update mapping (supports image rename) |
| `DELETE` | `/settings/mappings/:image` | Delete mapping |
| `GET` | `/version` | `{ current, latest, latestUrl, hasUpdate }` — cached 1 hour |

---

## 10. Environment Variables

See README.md for the full table. Key points for developers:

- **`DB_PATH`** defaults to `./data/imagepulse.db` (relative to the process CWD). In Docker this resolves to `/app/data/imagepulse.db`.
- **`APP_BASE_URL`** must be set in production for the ntfy icon to work correctly. The request-derived URL is typically an internal Docker address (e.g. `http://imagepulse:3579`) that external services cannot reach.
- **`GITHUB_TOKEN`** is optional but strongly recommended — unauthenticated GitHub API requests are limited to 60/hour per IP; a PAT raises this to 5000/hour.
- Settings written through the UI are stored in SQLite and persist across restarts. Env vars only seed values on first run (`INSERT OR IGNORE`).

---

## 11. Development Workflow

### Prerequisites

- Node.js 20+
- npm 10+

### First-time setup

```bash
git clone https://github.com/dschoepel/imagepulse.git
cd imagepulse
npm install          # installs all workspace dependencies
cp .env.example .env
# Edit .env — at minimum set NTFY_* or SMTP_* if you want notifications
```

### Running locally

```bash
# Both backend (:3579) and frontend (:5173) with hot reload
npm run dev
```

The frontend Vite dev server proxies all `/api/*` requests to `http://localhost:3579`, so the backend and frontend can be developed together without CORS issues.

```bash
# Backend only
cd backend && npm run dev     # uses nodemon

# Frontend only
cd frontend && npm run dev    # assumes backend is already running
```

### Building the frontend

```bash
npm run build          # runs vite build in frontend workspace
```

Output goes to `frontend/dist/`. The Dockerfile copies this to `backend/public/` so Express can serve it.

### Useful one-liners

```bash
# Readable logs during development
node backend/src/index.js | npx pino-pretty

# Inspect the SQLite database
sqlite3 data/imagepulse.db ".tables"
sqlite3 data/imagepulse.db "SELECT image, tag, status, created_at FROM events ORDER BY created_at DESC LIMIT 10;"

# Reset the database (wipe all data)
rm data/imagepulse.db && npm run dev
```

---

## 12. Docker & CI/CD

### Dockerfile (multi-stage)

```
Stage 1 — frontend build (node:20-alpine, native platform)
  npm ci && vite build → dist/

Stage 2 — backend deps (node:20-alpine, native platform)
  npm ci --omit=dev → node_modules/

Stage 3 — production image (node:20-alpine, target arch)
  Copy frontend dist → backend/public/
  Copy backend node_modules/ (pre-built on native)
  npm rebuild better-sqlite3 (compiles native addon for target arch)
  EXPOSE 3579
  CMD ["node", "src/index.js"]
```

The `--platform=$BUILDPLATFORM` flag on build stages avoids QEMU emulation for `npm ci`, which crashes on ARM64 due to Node.js JIT instructions that QEMU doesn't support. Only the production stage runs under QEMU (for the `npm rebuild` of the native addon).

### GitHub Actions (`.github/workflows/docker-build.yml`)

Triggers on:
- Push to `main` — builds and pushes image tagged with the short commit SHA
- Push of a `v*` tag — builds and pushes image tagged with the version number **and** `latest`

Images are pushed to `ghcr.io/dschoepel/imagepulse`. Multi-arch: `linux/amd64` + `linux/arm64`.

### Releasing a new version

1. Make changes on `main`
2. Bump version in `package.json`, `backend/package.json`, `frontend/package.json`, `package-lock.json` (top 4 workspace entries)
3. Add entry to `CHANGELOG.md` and `RELEASE.md`
4. Commit, then: `git tag vX.Y.Z && git push origin main && git push origin vX.Y.Z`
5. GitHub Actions builds and pushes the multi-arch image tagged `X.Y.Z` and `latest`

---

## 13. Conventions & Patterns

### ES modules

All files use `import`/`export`. The root `package.json` does **not** set `"type": "module"` — both workspace packages (`backend`, `frontend`) set it individually. Use `.js` extensions in imports (Node requires them for ESM).

### Error handling in routes

Routes follow this pattern:

```js
router.get('/path', (req, res) => {
  try {
    // synchronous DB calls
    res.json({ ok: true, data });
  } catch (err) {
    logger.error({ err }, 'Descriptive message');
    res.status(500).json({ ok: false, error: err.message });
  }
});
```

Async routes use `async/await` with the same try/catch shape.

### Database queries

All queries are synchronous (better-sqlite3). Never use callbacks or promises for DB operations. Prepare statements for repeated queries. Use transactions for multi-step writes:

```js
const update = db.transaction(() => {
  db.prepare('DELETE FROM mappings WHERE image = ?').run(oldImage);
  db.prepare('INSERT OR REPLACE INTO mappings …').run(…);
});
update();
```

### Frontend state & data fetching

No external state library. Each page component owns its own state with `useState` and fetches data in `useEffect`. All API calls go through `apiFetch()` in `api.js`. Loading and error states are handled locally per component.

### Adding a new notification channel

1. Create `backend/src/services/yourChannel.js` with a `sendYourChannel(params)` export
2. Add settings keys in `db/index.js` → `seedSettingsFromEnv()`
3. Call `sendYourChannel()` in `webhook.js` after `markNotified()` (guard with `getSetting('yourchannel_enabled') === 'true'`)
4. Do the same in `events.js` → resend handler
5. Add UI fields in `Settings.jsx`

### Adding a new webhook source

1. Create `backend/src/adapters/yourSource.js` normalising to `{ image, tag, digest, status, source, rawPayload }`
2. Add detection logic in `adapters/index.js`
3. Document the payload shape in `docs/api.md`

### Sensitive values

Never log token, password, or secret values. The pino logger is passed structured objects — ensure these objects exclude sensitive keys before logging.

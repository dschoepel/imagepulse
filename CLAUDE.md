# CLAUDE.md

Guidance for Claude Code (and other agents) working in this repository.

## What this is

ImagePulse is a self-hosted webhook receiver and notification hub for Docker image
update events. [DIUN](https://crazymax.dev/diun/) (or a compatible sender) posts to
`POST /api/webhook`; ImagePulse stores the event in SQLite, optionally resolves GitHub
release notes and a semver tag, then notifies via ntfy push and/or SMTP email. A React
SPA (served by the same Express process in production) provides Events/Archive browsing,
image→repo mappings, and settings.

For a full architectural deep dive (data flow, DB schema, API reference, conventions),
see **[DEVELOPERGUIDE.md](DEVELOPERGUIDE.md)** — read it before non-trivial backend
changes. The public-facing **[README.md](README.md)** covers install/deploy from a
user's perspective. **[docs/api.md](docs/api.md)** has full request/response shapes for
every endpoint.

## Stack

- Backend: Express.js + `better-sqlite3` (WAL mode), plain JS (`"type": "module"`), pino logging
- Frontend: React 18 + React Router v6 + Tailwind CSS + Recharts + Heroicons, built with Vite
- npm workspaces: root `package.json` orchestrates `backend/` and `frontend/`
- No test suite exists — verify changes by running the app (`npm run dev`) or with the `run` skill

## Commands

```sh
npm run dev              # concurrently runs backend (nodemon) + frontend (vite dev server)
npm run build             # builds frontend to frontend/dist
npm start                 # runs backend only (serves frontend/dist as static if present)
docker compose up -d      # full container build/run, per docker-compose.yml
```

## Layout (see DEVELOPERGUIDE.md §2 for the full tree)

- `backend/src/index.js` — Express entry point; mounts routes, runs retention prune and
  pinned-tag-watcher on startup + interval
- `backend/src/routes/` — `webhook.js` (ingestion), `events.js`, `archive.js`,
  `settings.js`, `version.js`
- `backend/src/adapters/` — normalizes incoming webhook payloads by source (`diun.js`);
  `parseWebhook()` in `index.js` detects the source and dispatches
- `backend/src/services/` — `ntfy.js`, `email.js`, `emailTemplate.js`, `github.js`
  (release notes), `registry.js` (Docker Hub/GHCR tag + digest resolution),
  `tagWatcher.js` (pinned-tag polling)
- `backend/src/db/index.js` — schema, safe migrations, all query helpers
- `frontend/src/pages/` — `Events.jsx`, `EventArchive.jsx`, `Mappings.jsx`, `Settings.jsx`
- `frontend/src/api.js` — `apiFetch()` wrapper used by all frontend API calls

## Conventions worth knowing before editing

- **Migrations**: new columns are added via `try { db.exec('ALTER TABLE ...') } catch {}`
  in `initDb()` — safe/idempotent, no migration framework. Follow this pattern for schema
  changes.
- **Settings**: stored as key-value rows in the `settings` table, seeded once from env
  vars via `seedSettingsFromEnv()` using `INSERT OR IGNORE` — i.e. env vars only take
  effect on first boot against an empty DB; later changes must go through the Settings
  UI/API, not just editing `.env`.
- **Notification dispatch**: happens in `webhook.js` after the event is stored, fires
  ntfy and email independently (each failure is caught/logged, doesn't block the other
  or the DB write). `events.js`'s `/:id/resend` route re-sends using stored fields.
- **Archive is read-only by design**: `EventArchive.jsx` intentionally has no
  delete/mutate actions — only `Events.jsx` (live events) does. Keep that distinction if
  adding row-level actions.
- **Webhook auth**: an optional shared secret gates `POST /api/webhook`
  (`Authorization: Bearer <secret>`); a rejected request currently returns 401 with no
  log line — worth adding a `logger.warn` there if you're touching that path, since it
  makes auth failures silent from the server side.
- **Mappings** support two link types (`github` — owner/repo, or `url` — arbitrary
  release-notes URL) and an optional `pinned_tag` for the tag watcher; see
  `db/index.js` migrations for the relevant columns.
- **Unmapped-image notifications**: "unmapped" is computed live (an anti-join in
  `getUnmappedImages()`/`getUnmappedCount()`, `db/index.js`) — events whose `image` has
  no row in `mappings` and no row in `ignored_images`. No state is stored on
  `events`/`mappings` themselves; the notification self-resolves the moment a mapping is
  created. `guessRepoFromImage()` (`services/registry.js`) offers an offline best-guess
  repo for pre-filling the create form — never trust it without the existing
  `validate-mapping` GitHub check. This was also the first polling pattern introduced in
  the frontend (`Layout.jsx`, 60s interval) — `versionInfo` nearby is still fetch-once,
  don't confuse the two.

## Release process

1. Bump `version` in all three `package.json` files (root, `backend/`, `frontend/`) — same value
2. Add entries to `CHANGELOG.md` (Keep a Changelog format) and `RELEASE.md` (user-facing prose)
3. Commit, push to `main`
4. `git tag vX.Y.Z && git push origin vX.Y.Z`
5. `.github/workflows/docker-build.yml` triggers on the `v*` tag push — builds and pushes
   multi-arch (`linux/amd64`, `linux/arm64`) images to `ghcr.io/dschoepel/imagepulse` as
   `:latest`, `:X.Y.Z`, and `:X.Y`

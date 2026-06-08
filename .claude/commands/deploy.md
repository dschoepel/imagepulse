# Deploy ImagePulse

Run through the full release checklist for accumulated changes, then push a tagged release to kick off the GitHub Actions Docker build.

## Steps

### 1. Review accumulated changes

Run the following to understand what has changed since the last tag:

```bash
git log $(git describe --tags --abbrev=0)..HEAD --oneline
git diff $(git describe --tags --abbrev=0)..HEAD --stat
```

Also check for any uncommitted changes:

```bash
git status
git diff HEAD
```

### 2. Determine the next version

Read the current version from `backend/package.json` (source of truth). Increment appropriately:

**Semantic versioning guide for ImagePulse:**
- **Patch** (`1.4.x`) — bug fixes, notification formatting tweaks, UI polish, dependency updates, minor copy changes
- **Minor** (`1.x.0`) — new features (new notification channels, new registry support, new UI pages or major UI capabilities, new scheduled jobs)
- **Major** (`x.0.0`) — breaking DB schema changes requiring manual migration steps, breaking API changes, major architectural overhaul

If `$ARGUMENTS` was provided, use it as the version (e.g. `/deploy 1.5.0` forces that version). Otherwise determine it from the changes.

### 3. Write and present the test plan

Based on the diff, write a specific numbered test plan. Do **not** use a generic smoke test — the plan must cover the actual changed behaviour. For example:

- For a new feature: steps to exercise the happy path, an edge case, and confirm no regression in adjacent features
- For a bug fix: steps to reproduce the original bug and confirm it no longer occurs
- For a notification format change: send a test webhook and verify the ntfy/email output matches the new format

**Present the test plan to the user. Then stop and wait.**

Do not touch any files, do not bump versions, do not commit — until the user explicitly says tests passed.

---

*Everything below this line runs only after the user has confirmed all tests passed.*

---

### 4. Update version numbers

Update the `"version"` field to the new version in all three files — they must stay in sync:

- `backend/package.json`
- `frontend/package.json`
- `package.json` (root)

After editing, regenerate the root lock file:

```bash
npm install --package-lock-only
```

### 5. Update documentation

**CHANGELOG.md** (project root):
- Insert a new section immediately after the `---` separator below the heading:
  ```
  ## [X.Y.Z] — YYYY-MM-DD

  ### Added / Changed / Fixed
  - <specific bullet points>
  ```
- Use [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) subsections: `Added`, `Changed`, `Fixed`
- Be specific — reference the feature/fix by name, not vague descriptions

**RELEASE.md** (project root):
- Replace the current top release section (everything above the first `---`) with a new `## [X.Y.Z] — YYYY-MM-DD` section summarising what's new
- Keep the `---` separator and the prior release content below it unchanged
- Update the **Released** date line if present

### 6. Commit

Stage only the files that belong in a release commit:

```bash
git add backend/package.json frontend/package.json package.json package-lock.json CHANGELOG.md RELEASE.md
git commit -m "chore: bump version to X.Y.Z and update CHANGELOG/RELEASE"
```

### 7. Tag and push

```bash
git tag vX.Y.Z
git push origin main --tags
```

This triggers the `Docker Build & Push` GitHub Actions workflow, which builds `linux/amd64` + `linux/arm64` images and pushes three tags to GHCR:
- `ghcr.io/dschoepel/imagepulse:latest`
- `ghcr.io/dschoepel/imagepulse:X.Y.Z`
- `ghcr.io/dschoepel/imagepulse:X.Y`

### 8. Monitor CI

Open the Actions page and confirm the build succeeds before deploying:

```
https://github.com/dschoepel/imagepulse/actions
```

A successful run shows green checkmarks on both the `amd64` and `arm64` build steps and the push step. If it fails, diagnose before touching the server.

### 9. Deploy to server

Once CI is green, SSH into the server and pull the new image:

```bash
ssh <user>@<vps-host>
cd /path/to/imagepulse
docker compose pull
docker compose up -d
```

Note any **new environment variables** introduced since the last release and update the compose file or `.env` on the server before restarting. Check `DEVELOPERGUIDE.md` for a full list of supported env vars.

### 10. Verify

After the container restarts, confirm:

1. The app loads at the production URL
2. The version indicator in the sidebar (bottom-left) shows the new version number
3. At least one existing mapping and event are still visible — confirms the DB migration ran without data loss
4. If any new features were deployed, do a quick sanity check of each one in the live UI
5. Check container logs for any startup errors:
   ```bash
   docker compose logs --tail=50 imagepulse
   ```

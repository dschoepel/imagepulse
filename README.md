![Image Pulse logo](https://github.com/dschoepel/imagepulse/blob/main/frontend/public/Image-Pulse-Logo-1.svg "Image Pulse Logo")

A self-hosted webhook receiver and notification hub for Docker image update events. Receives webhooks from tools like [DIUN](https://crazymax.dev/diun/), fetches GitHub release notes, and sends notifications via ntfy or email.

## Features

- **Dashboard** — live stat cards (total events, images tracked, last updated), bar charts for events over the last 14 days and top images by event count, and a clickable recent-events table that pops up notification details
- **Events log** — filterable, sortable, paginated table (5/10/25/50/100 rows, persisted) with range indicator; expandable detail rows showing notification content, full digest, platform, version, release link, and a Resend button; mapped images show a green dot; unmapped images can be mapped inline (GitHub Repo or Release Notes URL)
- **Event Archive** — events moved from the main log by **Archive & Clean** land in a searchable, sortable, read-only archive at `/events/archive`
- **Mappings** — map Docker image names to a GitHub repo (for release notes) or a Release Notes URL; search/filter by image name; custom per-page selector; inline editing; unmapped images can be mapped directly from the Events detail row
- **Settings** — configure ntfy and email channels with test buttons; Webhook Security with optional shared-secret auth, Show/Hide/Copy controls, and ready-to-paste DIUN config snippets; Event Retention with manual **Run Cleanup Now** and **Archive & Clean** buttons (show affected count before acting)

## Quick Start

```bash
# Clone the repo
git clone https://github.com/dschoepel/imagepulse.git
cd imagepulse

# Configure environment
cp .env.example .env
# Edit .env with your settings

# ⚠️  Create the data directory BEFORE starting the container and set
# ownership to match the PUID/PGID you will run the container as.
# If this directory is owned by root the container will fail to write
# its database. Run `id` on your host to find your UID and GID.
mkdir -p data
sudo chown 1000:1000 data   # replace 1000:1000 with your PUID:PGID

# Start with Docker Compose
docker compose up -d
```

The app will be available at **http://your-host:3579**.

## Docker Compose

The recommended way to run ImagePulse. The pre-built image is pulled from GitHub Container Registry automatically.

```yaml
services:
  imagepulse:
    image: ghcr.io/dschoepel/imagepulse:latest
    container_name: imagepulse
    user: "${PUID:-1000}:${PGID:-1000}"  # run `id` on your host to find these values
    ports:
      - "${PORT:-3579}:${PORT:-3579}"
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - PORT=${PORT:-3579}
      - TZ=${TZ:-UTC}
    env_file:
      # Comment this out when using Portainer or similar tools that inject
      # environment variables directly — define NTFY_*, SMTP_*, GITHUB_TOKEN,
      # etc. under 'environment:' above instead.
      - .env
    restart: unless-stopped
```

See the included `docker-compose.yml` for the fully-commented version including the optional reverse-proxy network block.

### Data directory — create before first run

> **This step is required.** The container runs as the user specified by `PUID:PGID` from the moment it starts. If the `data` directory on the host is owned by root (or any other user), the container cannot create or write the SQLite database and will fail silently.

**docker compose (CLI):**

```bash
# Run this once on the host before `docker compose up`
mkdir -p data
sudo chown ${PUID:-1000}:${PGID:-1000} data
```

**Portainer / other container managers:**

When deploying a stack through a web UI the host directory is often created automatically as root. Create and chown the directory manually on the host first, then deploy the stack:

```bash
mkdir -p /path/to/your/stack/data
sudo chown 1000:1000 /path/to/your/stack/data   # match your PUID:PGID
```

To find the correct UID and GID for your host user, run:

```bash
id
# uid=1000(youruser) gid=1000(youruser) ...
```

### Reverse proxy (SWAG, Traefik, NPM)

Put ImagePulse on the same Docker network as your proxy. Uncomment the `networks` section in `docker-compose.yml` and set `PROXY_NETWORK` in `.env` if your network is named something other than `proxy_net`. Once on a shared network the proxy reaches ImagePulse by container name and port; the `ports` block can be removed.

### Firewall

If you expose port 3579 directly (i.e. not behind a reverse proxy), open it in your host firewall:

```bash
# ufw
sudo ufw allow 3579/tcp

# firewalld
sudo firewall-cmd --permanent --add-port=3579/tcp
sudo firewall-cmd --reload

# iptables
sudo iptables -A INPUT -p tcp --dport 3579 -j ACCEPT
```

If your instance is only reachable through a reverse proxy on an internal Docker network you do not need to open the port on the host.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3579` | Port the app listens on inside the container |
| `NODE_ENV` | `production` | `development` or `production` |
| `APP_BASE_URL` | *(empty)* | Public base URL of this instance (e.g. `https://imagepulse.example.com`). Used for the ntfy notification icon. Falls back to the request-derived URL (works behind a reverse proxy), then to the bundled GitHub-hosted icon if neither is publicly reachable. |
| `PUID` | `1000` | User ID the container process runs as |
| `PGID` | `1000` | Group ID the container process runs as |
| `TZ` | `UTC` | Container timezone (e.g. `America/New_York`) |
| `DB_PATH` | `./data/imagepulse.db` | Path to the SQLite database file |
| `NTFY_ENABLED` | `false` | Set `true` to enable ntfy notifications on first run |
| `NTFY_URL` | `https://ntfy.sh` | ntfy server base URL |
| `NTFY_TOPIC` | `imagepulse` | ntfy topic to publish to |
| `NTFY_TOKEN` | *(empty)* | ntfy access token (if required) |
| `NTFY_ICON_URL` | *(empty)* | Publicly reachable URL to a PNG/JPG/ICO used as the ntfy notification icon. Falls back to `APP_BASE_URL/favicon.ico` if set, then to a GitHub-hosted SVG. |
| `EMAIL_ENABLED` | `false` | Set `true` to enable email notifications on first run |
| `SMTP_HOST` | *(empty)* | SMTP server hostname |
| `SMTP_PORT` | `587` | SMTP server port |
| `SMTP_SECURE` | `false` | Use TLS (`true`) or STARTTLS (`false`) |
| `SMTP_USER` | *(empty)* | SMTP username |
| `SMTP_PASS` | *(empty)* | SMTP password |
| `EMAIL_FROM` | *(empty)* | Sender address |
| `EMAIL_TO` | *(empty)* | Recipient address — comma-separated for multiple recipients |
| `GITHUB_TOKEN` | *(empty)* | GitHub PAT for fetching release notes (increases rate limit) |
| `RETENTION_DAYS` | `90` | Days to keep events (0 = keep forever) |
| `WEBHOOK_SECRET` | *(empty)* | Shared secret — requires `Authorization: Bearer <secret>` on all incoming webhooks; leave blank to allow unauthenticated requests |
| `LOG_LEVEL` | `info` | Log verbosity: `trace`, `debug`, `info`, `warn`, `error`, `fatal` |
| `LOG_FILE` | *(empty)* | Append logs to this file path in addition to stdout; leave blank for stdout only (e.g. `/app/data/imagepulse.log`) |

## Mappings

Mappings link a Docker image name (as reported by DIUN) to either a **GitHub repo** or a **Release Notes URL**.

### GitHub Repo mapping

Enter the repo as `owner/repo` (e.g. `nginxinc/docker-nginx`). When a webhook arrives for a mapped image, ImagePulse calls the GitHub Releases API to fetch release notes for the matching tag.

**What it unlocks:**
- The notification body includes the first 300 characters of the GitHub release notes
- The event detail panel shows a **View Release Notes ↗** link to the exact GitHub release page
- ntfy notification tap opens the release page directly

### Release Notes URL mapping

For images that don't have a GitHub repo (e.g. MariaDB, WordPress), you can map to any reachable URL instead (e.g. `https://mariadb.com/kb/en/release-notes/`). The URL is used as the ntfy click link and the email button — no release notes text is fetched.

### Image name format

The Docker image name must match **exactly** what DIUN sends. For Docker Hub official images this is `docker.io/library/<name>` (e.g. `docker.io/library/nginx`, `docker.io/library/mariadb`). For other registries: `ghcr.io/cli/cli`, `docker.io/linuxserver/sonarr`, etc.

> **Tip:** check the **Events** page first — the Image column shows the exact string DIUN reported. Copy it directly from there.

You can add, edit, or delete mappings from the **Mappings** page without restarting the server. Unmapped images can also be mapped directly from the expandable detail row on the Events page.

## Notifications

Each notification contains:
- **Title:** `<hostname>: <image>:<tag> - has been updated` (or `is new`)
- **Status:** `new` (first time seen) or `update` (digest changed)
- **Digest:** first 12 characters of the content digest
- **Platform:** OS/architecture if reported by DIUN
- **Version:** resolved semver tag for `latest`-tagged images (e.g. `v1.4.0`), looked up from the registry
- **Release notes excerpt:** first 300 characters of the GitHub release body (GitHub Repo mappings only)

ntfy notifications use the app favicon as the notification icon and open the release/URL link on tap. Emails render a structured HTML layout with a metadata table, release notes block, and a **View Release Notes ↗** button.

From the Events page you can expand any event that has stored notification content and click **Resend Notification** to re-deliver it through the currently configured channels (ntfy and/or email).

## Settings

Configure everything from the **Settings** page:

- **ntfy** — server URL, topic, optional access token; Show/Hide toggle on the token; **Send test** button.
- **Email (SMTP)** — host, port, TLS mode, credentials, sender, and one or more comma-separated recipient addresses; Show/Hide toggle on the password; **Send test** button.
- **Webhook Security** — optional shared secret (`Authorization: Bearer <secret>`); Show/Hide, Copy, and Generate controls; collapsible ready-to-paste DIUN config snippets for both `diun.yml` and Docker Compose environment-variable formats.
- **Event Retention** — set the number of days to keep events (0 = keep forever). Two manual action buttons with count preview:
  - **Run Cleanup Now** — permanently deletes events older than the configured period.
  - **Archive & Clean** — moves matching events to the Event Archive first, then removes them from the main log.

Sensitive fields (tokens, passwords, webhook secret) have Show/Hide toggles so they are masked by default.

## Logging

ImagePulse uses [pino](https://getpino.io) for structured JSON logging to stdout.

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Verbosity: `trace`, `debug`, `info`, `warn`, `error`, `fatal` |
| `LOG_FILE` | *(empty)* | Also append logs to this path (e.g. `/app/data/imagepulse.log`) |

In Docker, logs are captured by the container runtime and visible via `docker logs imagepulse`. To persist logs to a file, set `LOG_FILE` to a path inside the already-mounted `data` directory:

```yaml
# docker-compose.yml — uncomment under environment:
# - LOG_FILE=/app/data/imagepulse.log
```

Each log line is newline-delimited JSON. Pipe through [`pino-pretty`](https://github.com/pinojs/pino-pretty) for human-readable output during development:

```bash
node src/index.js | npx pino-pretty
```

## Webhook Setup

### DIUN

In your DIUN configuration (`diun.yml`), add a webhook notifier pointing to your ImagePulse instance:

```yaml
notif:
  webhook:
    endpoint: https://your-imagepulse-host/api/webhook   # use https:// when behind a reverse proxy
    method: POST
    headers:
      Content-Type: application/json
      Authorization: "Bearer <your-webhook-secret>"      # omit if no secret is configured
```

ImagePulse auto-detects the webhook source from the payload shape. Authentication is optional — configure a shared secret in **Settings → Webhook Security** (or via `WEBHOOK_SECRET`) to require an `Authorization: Bearer <secret>` header on all incoming webhooks.

> **Note:** If ImagePulse is behind a reverse proxy (SWAG, Traefik, NPM) use `https://` for the endpoint. If DIUN and ImagePulse are on the same internal Docker network and you are connecting directly (no proxy), use `http://imagepulse:3579/api/webhook` with the container name.

A minimal DIUN `docker-compose.yml` alongside ImagePulse:

```yaml
services:
  diun:
    image: crazymax/diun:latest
    volumes:
      - ./diun.yml:/etc/diun/diun.yml:ro
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - LOG_LEVEL=info
    restart: unless-stopped
```

```yaml
# diun.yml
watch:
  schedule: "0 */6 * * *"   # check every 6 hours

notif:
  webhook:
    endpoint: https://your-imagepulse-host/api/webhook
    method: POST
    headers:
      Content-Type: application/json
      Authorization: "Bearer <your-webhook-secret>"   # omit if no secret is configured

providers:
  docker:
    watchStopped: false
```

If you prefer environment variables over a config file, add these to your DIUN compose service:

```yaml
environment:
  - DIUN_NOTIF_WEBHOOK_ENDPOINT=https://your-imagepulse-host/api/webhook
  - DIUN_NOTIF_WEBHOOK_METHOD=POST
  - DIUN_NOTIF_WEBHOOK_HEADERS_CONTENT-TYPE=application/json
  - DIUN_NOTIF_WEBHOOK_HEADERS_AUTHORIZATION=Bearer <your-webhook-secret>
  - DIUN_NOTIF_WEBHOOK_TIMEOUT=10s
```

DIUN sends to all configured notifiers simultaneously, so you can keep existing ntfy, email, or other notifiers alongside the ImagePulse webhook.

## Development

```bash
# Install all workspace dependencies from the repo root
npm install

# Start backend (port 3579) and frontend (port 5173) with hot reload
npm run dev

# Backend only
cd backend && npm run dev

# Frontend only (proxies /api to :3579)
cd frontend && npm run dev
```

## Building the Docker image locally

```bash
# Build
docker build -t imagepulse .

# Run
docker run -d \
  -p 3579:3579 \
  -v ./data:/app/data \
  --env-file .env \
  imagepulse
```

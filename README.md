<p style="display:flex; align-items:center; gap:16px;">
  <img src="https://raw.githubusercontent.com/dschoepel/imagepulse/main/frontend/public/logo.svg" alt="ImagePulse logo featuring a stylized heartbeat or pulse waveform integrated with container or monitoring imagery on a clean background" height="80" />
  <strong style="font-size:2rem;">ImagePulse</strong>
</p>

A self-hosted webhook receiver and notification hub for Docker image update events. Receives webhooks from tools like [DIUN](https://crazymax.dev/diun/), fetches GitHub release notes, and sends notifications via ntfy or email.

## Features

- **Dashboard** — live stat cards (total events, images tracked, last updated), bar charts for events over the last 14 days and top images by event count, and a clickable recent-events table that pops up notification details
- **Events log** — filterable, paginated table of all received events with expandable detail rows showing notification content, full digest, platform, GitHub release link, and a Resend button
- **Mappings** — map Docker image names to GitHub repos so ImagePulse can fetch release notes; rows support inline editing (change image name or repo without deleting and re-adding)
- **Settings** — configure ntfy and email notification channels with Show/Hide toggles on tokens and passwords; send test notifications to verify configuration

## Quick Start

```bash
# Clone the repo
git clone https://github.com/dschoepel/imagepulse.git
cd imagepulse

# Configure environment
cp .env.example .env
# Edit .env with your settings

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
    user: "${PUID:-1000}:${PGID:-1000}"
    ports:
      - "${PORT:-3579}:${PORT:-3579}"
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - PORT=${PORT:-3579}
      - TZ=${TZ:-UTC}
    env_file:
      - .env
    restart: unless-stopped
```

See the included `docker-compose.yml` for the fully-commented version including the optional reverse-proxy network block.

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
| `PUID` | `1000` | User ID the container process runs as |
| `PGID` | `1000` | Group ID the container process runs as |
| `TZ` | `UTC` | Container timezone (e.g. `America/New_York`) |
| `DB_PATH` | `./data/imagepulse.db` | Path to the SQLite database file |
| `NTFY_URL` | `https://ntfy.sh` | ntfy server base URL |
| `NTFY_TOPIC` | `imagepulse` | ntfy topic to publish to |
| `NTFY_TOKEN` | *(empty)* | ntfy access token (if required) |
| `SMTP_HOST` | *(empty)* | SMTP server hostname |
| `SMTP_PORT` | `587` | SMTP server port |
| `SMTP_SECURE` | `false` | Use TLS (`true`) or STARTTLS (`false`) |
| `SMTP_USER` | *(empty)* | SMTP username |
| `SMTP_PASS` | *(empty)* | SMTP password |
| `EMAIL_FROM` | *(empty)* | Sender address |
| `EMAIL_TO` | *(empty)* | Recipient address |
| `GITHUB_TOKEN` | *(empty)* | GitHub PAT for fetching release notes (increases rate limit) |
| `RETENTION_DAYS` | `90` | Days to keep events (0 = keep forever) |

## Mappings

Mappings link a Docker image name (as reported by DIUN) to a GitHub repository (`owner/repo`). When a webhook arrives for a mapped image, ImagePulse calls the GitHub Releases API to fetch release notes for the matching tag.

**When to add a mapping:** any time you want release notes included in your notifications and event detail. For images published directly from GitHub (most open-source tools do this), a mapping lets ImagePulse show you what changed in that update.

**What they unlock:**
- The notification body includes the first 300 characters of the GitHub release notes
- The event detail panel shows a "View on GitHub ↗" link to the exact release page

**Format:** the Docker image name must match exactly what DIUN sends (e.g. `docker.io/library/nginx` or `ghcr.io/cli/cli`). The repo field is `owner/repo` on GitHub (e.g. `nginxinc/docker-nginx` or `cli/cli`).

You can add, edit, or delete mappings from the **Mappings** page without restarting the server.

## Notifications

Each notification contains:
- **Title:** `Image updated: <image>:<tag>`
- **Status:** `new` (first time seen) or `update` (digest changed)
- **Digest:** first 12 characters of the content digest
- **Platform:** OS/architecture if reported by DIUN
- **Release notes excerpt:** first 300 characters of the GitHub release body (only for mapped images)

From the Events page you can expand any event that has stored notification content and click **Resend Notification** to re-deliver it through the currently configured channels (ntfy and/or email).

## Settings

Configure notification channels from the **Settings** page:

- **ntfy** — enter your ntfy server URL, topic, and optional access token. Use the "Test" button to send a verification notification.
- **Email (SMTP)** — enter SMTP host, port, TLS mode, credentials, sender and recipient addresses. Use the "Test" button to send a verification email.

Sensitive fields (tokens, passwords) have a Show/Hide toggle so they are masked by default.

## Webhook Setup

### DIUN

In your DIUN configuration (`diun.yml`), add a webhook notifier pointing to your ImagePulse instance:

```yaml
notif:
  webhook:
    endpoint: http://your-imagepulse-host:3579/api/webhook
    method: POST
    headers:
      Content-Type: application/json
```

ImagePulse auto-detects the webhook source from the payload shape. No additional authentication is required for the webhook endpoint (place ImagePulse behind a reverse proxy if you need access control).

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
    endpoint: http://imagepulse:3579/api/webhook
    method: POST
    headers:
      Content-Type: application/json

providers:
  docker:
    watchStopped: false
```

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

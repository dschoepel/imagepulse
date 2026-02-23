# ImagePulse

A self-hosted webhook receiver and notification hub for Docker image update events. Receives webhooks from tools like [DIUN](https://crazymax.dev/diun/), fetches GitHub release notes, and sends notifications via ntfy or email.

## Quick Start

```bash
# Clone and install dependencies
git clone https://github.com/youruser/imagepulse.git
cd imagepulse
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Run in development (backend + frontend with hot reload)
npm run dev

# Or run with Docker
docker compose up -d
```

The app will be available at http://localhost:3000.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port the server listens on |
| `NODE_ENV` | `development` | `development` or `production` |
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

## Webhook Setup

### DIUN

In your DIUN configuration, add a webhook notifier pointing to your ImagePulse instance:

```yaml
notif:
  webhook:
    endpoint: http://your-imagepulse-host:3000/api/webhook
    method: POST
    headers:
      Content-Type: application/json
```

ImagePulse auto-detects the webhook source from the payload shape.

## Docker

```bash
# Build
docker build -t imagepulse .

# Run
docker run -d \
  -p 3000:3000 \
  -v ./data:/app/data \
  --env-file .env \
  imagepulse
```

Or with Docker Compose:

```bash
docker compose up -d
```

## Development

```bash
# Backend only (port 3000)
cd backend && npm run dev

# Frontend only (port 5173, proxies /api to :3000)
cd frontend && npm run dev
```

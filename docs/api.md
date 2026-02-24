# ImagePulse API Reference

All endpoints are prefixed with `/api`. The server listens on port `3579` by default (configurable via the `PORT` environment variable).

All responses are JSON. Successful responses include `"ok": true`; error responses include `"ok": false` and an `"error"` string.

---

## Contents

- [Webhook](#webhook)
- [Events](#events)
- [Settings](#settings)
- [Mappings](#mappings)

---

## Webhook

### `POST /api/webhook`

Receives an image-update webhook, stores the event, fetches GitHub release notes (if a mapping exists), sends configured notifications, and returns the stored event.

Auto-detects the webhook source from the payload shape. Currently supports **DIUN**.

**Authentication (optional):**

If a `webhook_secret` is configured in Settings (or via the `WEBHOOK_SECRET` environment variable), every request must include:

```
Authorization: Bearer <secret>
```

Requests without a valid token are rejected with `401 Unauthorized`. If no secret is configured, all requests are accepted.

**Request body** — DIUN flat payload:

```json
{
  "image": "docker.io/library/nginx:1.27",
  "digest": "sha256:abcdef123456...",
  "status": "new",
  "platform": "linux/amd64"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `image` | string | Full image reference including tag (e.g. `docker.io/library/nginx:1.27`) |
| `digest` | string | Content digest |
| `status` | string | `new` or `update` |
| `platform` | string | OS/architecture (optional) |

**Response `202 Accepted`:**

```json
{
  "ok": true,
  "id": 42,
  "event": {
    "image": "docker.io/library/nginx",
    "tag": "1.27",
    "digest": "sha256:abcdef123456...",
    "status": "new",
    "source": "diun"
  }
}
```

**Notes:**
- If a mapping exists for the image, GitHub release notes are fetched and included in the notification body (ntfy: first 300 chars; email: full text).
- The notification title and body are stored on the event for later display and resend.
- If `retention_days` is configured, old events are pruned after each webhook.

---

## Events

### `GET /api/events`

Returns a paginated, filterable, sortable list of events.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | `1` | Page number (1-based) |
| `limit` | integer | `25` | Events per page (max `100`) |
| `image` | string | — | Substring filter on the image name |
| `status` | string | — | Exact match: `new` or `update` |
| `sortBy` | string | `created_at` | Column to sort by: `image`, `tag`, `status`, `source`, `created_at` |
| `sortDir` | string | `desc` | Sort direction: `asc` or `desc` |

**Response `200`:**

```json
{
  "ok": true,
  "events": [
    {
      "id": 42,
      "image": "docker.io/library/nginx",
      "tag": "1.27",
      "digest": "sha256:abcdef123456...",
      "status": "new",
      "source": "diun",
      "raw_payload": "{...}",
      "notified_at": "2026-02-24T10:00:00",
      "notification_title": "Image updated: docker.io/library/nginx:1.27",
      "notification_body": "Status: new\nDigest: abcdef123456",
      "github_release_url": "https://github.com/nginx/nginx/releases/tag/1.27",
      "created_at": "2026-02-24T10:00:00"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 25,
    "total": 84,
    "pages": 4
  }
}
```

---

### `GET /api/events/stats`

Returns aggregate statistics across all events.

**Response `200`:**

```json
{
  "ok": true,
  "total": 84,
  "uniqueImages": 12,
  "lastUpdated": "2026-02-24T10:00:00"
}
```

---

### `GET /api/events/chart-data`

Returns data for the dashboard charts.

**Response `200`:**

```json
{
  "ok": true,
  "eventsPerDay": [
    { "day": "2026-02-11", "count": 3 },
    { "day": "2026-02-12", "count": 7 }
  ],
  "topImages": [
    { "image": "docker.io/library/nginx", "count": 18 },
    { "image": "ghcr.io/cli/cli", "count": 11 }
  ]
}
```

**Notes:**
- `eventsPerDay` covers the last 14 days (grouped by local date).
- `topImages` returns the top 10 images by event count, all time.

---

### `POST /api/events/:id/resend`

Re-sends the stored notification for an event through all currently-enabled channels (ntfy and/or email).

**Path parameter:** `id` — event ID (integer)

**Request body:** none

**Response `200`:**

```json
{ "ok": true }
```

**Error responses:**

| Status | Reason |
|--------|--------|
| `400` | Event has no stored notification content |
| `404` | Event not found |
| `500` | One or more notification channels failed (error message included) |

---

## Settings

### `GET /api/settings`

Returns all stored settings as a flat key/value object.

**Response `200`:**

```json
{
  "ok": true,
  "settings": {
    "ntfy_enabled": "true",
    "ntfy_url": "https://ntfy.sh",
    "ntfy_topic": "imagepulse",
    "ntfy_token": "",
    "email_enabled": "false",
    "smtp_host": "smtp.example.com",
    "smtp_port": "587",
    "smtp_secure": "false",
    "smtp_user": "user@example.com",
    "smtp_pass": "",
    "email_from": "noreply@example.com",
    "email_to": "you@example.com",
    "retention_days": "90"
  }
}
```

**Note:** All values are stored and returned as strings.

---

### `PUT /api/settings`

Upserts one or more settings. Only the keys present in the request body are updated; omitted keys are left unchanged.

**Request body** — any subset of setting keys:

```json
{
  "ntfy_enabled": "true",
  "ntfy_url": "https://ntfy.sh",
  "ntfy_topic": "my-topic",
  "retention_days": "30"
}
```

**Known setting keys:**

| Key | Description |
|-----|-------------|
| `ntfy_enabled` | `"true"` / `"false"` |
| `ntfy_url` | ntfy server base URL |
| `ntfy_topic` | ntfy topic |
| `ntfy_token` | ntfy access token (optional) |
| `email_enabled` | `"true"` / `"false"` |
| `smtp_host` | SMTP hostname |
| `smtp_port` | SMTP port (e.g. `"587"`) |
| `smtp_secure` | `"true"` for TLS (port 465), `"false"` for STARTTLS |
| `smtp_user` | SMTP username |
| `smtp_pass` | SMTP password |
| `email_from` | Sender address |
| `email_to` | Recipient address |
| `retention_days` | Days to keep events; `"0"` = keep forever |
| `webhook_secret` | Shared secret for webhook Bearer-token auth; empty string disables auth |

**Response `200`:**

```json
{ "ok": true }
```

**Error `400`:** `retention_days` is not a non-negative integer.

---

### `POST /api/settings/test-ntfy`

Sends a test notification via ntfy using the currently-stored ntfy settings.

**Request body:** none

**Response `200`:**

```json
{ "ok": true }
```

**Error `500`:** ntfy request failed (error message included).

---

### `POST /api/settings/test-email`

Sends a test email using the currently-stored SMTP settings.

**Request body:** none

**Response `200`:**

```json
{ "ok": true }
```

**Error `500`:** SMTP send failed (error message included).

---

## Mappings

Mappings link a Docker image name to a GitHub `owner/repo`. When a webhook arrives for a mapped image, ImagePulse fetches release notes from the GitHub Releases API.

### `GET /api/settings/validate-mapping`

Validates a GitHub repository string against the GitHub API. Used by the UI to provide inline feedback when adding or editing mappings.

**Query parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `repo` | yes | Repository in `owner/repo` format |

**Response `200`:**

```json
{ "ok": true, "repoExists": true }
```

| `repoExists` value | Meaning |
|--------------------|---------|
| `true` | Repository found on GitHub |
| `false` | Repository not found (definitive 404) — `repoError` contains the message |
| `null` | Could not verify (rate-limited or network error) — `repoError` contains the message; treat as a soft warning and allow the save |

```json
{ "ok": true, "repoExists": false, "repoError": "Repository not found on GitHub" }
{ "ok": true, "repoExists": null,  "repoError": "GitHub API rate limit exceeded — cannot verify" }
```

**Notes:**
- Uses `GITHUB_TOKEN` if configured (increases rate limit from 60 to 5 000 req/hr).
- Format validation (`owner/repo` with exactly one `/`) is done before the API call; an invalid format returns `repoExists: false` immediately without a network request.

---

### `GET /api/settings/mappings`

Returns all mappings ordered by image name.

**Response `200`:**

```json
{
  "ok": true,
  "mappings": [
    {
      "id": 1,
      "image": "docker.io/library/nginx",
      "repo": "nginxinc/docker-nginx",
      "created_at": "2026-02-24T10:00:00"
    }
  ]
}
```

---

### `PUT /api/settings/mappings`

Creates or replaces a mapping for the given image.

**Request body:**

```json
{
  "image": "docker.io/library/nginx",
  "repo": "nginxinc/docker-nginx"
}
```

**Response `200`:**

```json
{ "ok": true }
```

**Error `400`:** `image` or `repo` missing.

---

### `PATCH /api/settings/mappings/:image`

Updates an existing mapping. Can rename the image key, change the repo, or both. The rename is atomic (delete + insert in a transaction).

**Path parameter:** `image` — URL-encoded image name (e.g. `docker.io%2Flibrary%2Fnginx`)

**Request body:**

```json
{
  "newImage": "docker.io/library/nginx",
  "repo": "nginxinc/docker-nginx"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `repo` | yes | New repo value |
| `newImage` | no | New image name; omit to keep the existing name |

**Response `200`:**

```json
{ "ok": true }
```

---

### `DELETE /api/settings/mappings/:image`

Deletes the mapping for the given image.

**Path parameter:** `image` — URL-encoded image name

**Response `200`:**

```json
{ "ok": true }
```

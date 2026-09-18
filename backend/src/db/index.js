import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { guessRepoFromImage } from '../services/registry.js';

const DB_PATH = process.env.DB_PATH || './data/imagepulse.db';

let db;

export function initDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      image       TEXT NOT NULL,
      tag         TEXT NOT NULL,
      digest      TEXT,
      status      TEXT,
      source      TEXT,
      raw_payload TEXT,
      notified_at TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS event_archive (
      id                 INTEGER PRIMARY KEY,
      image              TEXT NOT NULL,
      tag                TEXT NOT NULL,
      digest             TEXT,
      status             TEXT,
      source             TEXT,
      raw_payload        TEXT,
      notified_at        TEXT,
      created_at         TEXT NOT NULL,
      notification_title TEXT,
      notification_body  TEXT,
      github_release_url TEXT,
      resolved_version   TEXT,
      archived_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mappings (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      image      TEXT NOT NULL UNIQUE,
      repo       TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ignored_images (
      image      TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // events.image has no natural index; the unmapped-images anti-join is polled
  // by the frontend every ~60s, so index it.
  db.exec('CREATE INDEX IF NOT EXISTS idx_events_image ON events(image)');

  try { db.exec('ALTER TABLE events ADD COLUMN notification_title TEXT'); } catch {}
  try { db.exec('ALTER TABLE events ADD COLUMN notification_body TEXT'); } catch {}
  try { db.exec('ALTER TABLE events ADD COLUMN github_release_url TEXT'); } catch {}
  try { db.exec('ALTER TABLE events ADD COLUMN resolved_version TEXT'); } catch {}

  // Mappings: add link_type and url columns (safe — ignored if already present)
  try { db.exec("ALTER TABLE mappings ADD COLUMN link_type TEXT NOT NULL DEFAULT 'github'"); } catch {}
  try { db.exec('ALTER TABLE mappings ADD COLUMN url TEXT'); } catch {}

  // Mappings: pinned tag watcher columns
  try { db.exec('ALTER TABLE mappings ADD COLUMN pinned_tag TEXT'); } catch {}
  try { db.exec('ALTER TABLE mappings ADD COLUMN pinned_tag_last_checked TEXT'); } catch {}
  try { db.exec('ALTER TABLE mappings ADD COLUMN pinned_tag_notified TEXT'); } catch {}

  return db;
}

export function getDb() {
  if (!db) throw new Error('Database not initialised — call initDb() first');
  return db;
}

// --- Helper functions ---

export function insertEvent({ image, tag, digest, status, source, rawPayload }) {
  const stmt = db.prepare(
    `INSERT INTO events (image, tag, digest, status, source, raw_payload)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const result = stmt.run(image, tag, digest ?? null, status, source, JSON.stringify(rawPayload));
  return result.lastInsertRowid;
}

export function markNotified(id, notificationTitle, notificationBody, githubReleaseUrl, resolvedVersion) {
  db.prepare(`UPDATE events SET notified_at = datetime('now'),
    notification_title = ?, notification_body = ?, github_release_url = ?,
    resolved_version = ? WHERE id = ?`)
    .run(notificationTitle ?? null, notificationBody ?? null,
         githubReleaseUrl ?? null, resolvedVersion ?? null, id);
}

export function deleteEvent(id) {
  return db.prepare('DELETE FROM events WHERE id = ?').run(id).changes;
}

export function getEventById(id) {
  return db.prepare('SELECT * FROM events WHERE id = ?').get(id);
}

export function getChartData() {
  const eventsPerDay = db.prepare(`
    SELECT date(created_at, 'localtime') as day, COUNT(*) as count
    FROM events
    WHERE date(created_at, 'localtime') >= date('now', 'localtime', '-13 days')
    GROUP BY day ORDER BY day ASC
  `).all();

  const topImages = db.prepare(`
    SELECT image, COUNT(*) as count
    FROM events
    GROUP BY image ORDER BY count DESC LIMIT 10
  `).all();

  return { eventsPerDay, topImages };
}

const ALLOWED_SORT_COLS = new Set(['image', 'tag', 'status', 'source', 'created_at']);

export function getEvents({ page = 1, limit = 25, image = '', status = '', sortBy = 'created_at', sortDir = 'desc' } = {}) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];

  if (image) {
    conditions.push('image LIKE ?');
    params.push(`%${image}%`);
  }
  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }

  const col = ALLOWED_SORT_COLS.has(sortBy) ? sortBy : 'created_at';
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC';
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  return db
    .prepare(`SELECT * FROM events ${where} ORDER BY ${col} ${dir} LIMIT ? OFFSET ?`)
    .all(...params);
}

export function getEventCount({ image = '', status = '' } = {}) {
  const conditions = [];
  const params = [];

  if (image) {
    conditions.push('image LIKE ?');
    params.push(`%${image}%`);
  }
  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return db.prepare(`SELECT COUNT(*) as cnt FROM events ${where}`).get(...params).cnt;
}

export function getEventStats() {
  const row = db
    .prepare(
      `SELECT COUNT(*) as total,
              COUNT(DISTINCT image) as uniqueImages,
              MAX(created_at) as lastCreatedAt
       FROM events`
    )
    .get();
  return {
    total: row.total,
    uniqueImages: row.uniqueImages,
    lastCreatedAt: row.lastCreatedAt ?? null,
  };
}

// --- Unmapped images (events with no matching mapping and not ignored) ---

// Events with a blank image (e.g. an unrecognized/empty webhook payload —
// parseWebhook's fallback for anything without diun_version) aren't a real
// image to map, so they're excluded here rather than nagging the user about
// them forever.
export function getUnmappedImages() {
  const rows = db.prepare(`
    SELECT e.image AS image, COUNT(*) AS eventCount, MAX(e.created_at) AS lastSeen
    FROM events e
    WHERE TRIM(e.image) != ''
      AND NOT EXISTS (SELECT 1 FROM mappings m WHERE m.image = e.image)
      AND NOT EXISTS (SELECT 1 FROM ignored_images i WHERE i.image = e.image)
    GROUP BY e.image
    ORDER BY lastSeen DESC
  `).all();
  return rows.map((r) => ({ ...r, ...guessRepoFromImage(r.image) }));
}

export function getUnmappedCount() {
  return db.prepare(`
    SELECT COUNT(*) AS cnt FROM (
      SELECT DISTINCT e.image FROM events e
      WHERE TRIM(e.image) != ''
        AND NOT EXISTS (SELECT 1 FROM mappings m WHERE m.image = e.image)
        AND NOT EXISTS (SELECT 1 FROM ignored_images i WHERE i.image = e.image)
    )
  `).get().cnt;
}

export function ignoreImage(image) {
  db.prepare('INSERT OR IGNORE INTO ignored_images (image) VALUES (?)').run(image);
}

export function unignoreImage(image) {
  return db.prepare('DELETE FROM ignored_images WHERE image = ?').run(image).changes;
}

export function getIgnoredImages() {
  return db.prepare('SELECT image, created_at FROM ignored_images ORDER BY created_at DESC').all();
}

export function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function getAllSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function seedSettingsFromEnv() {
  const mapping = {
    ntfy_enabled:  process.env.NTFY_ENABLED,
    ntfy_url:      process.env.NTFY_URL,
    ntfy_topic:    process.env.NTFY_TOPIC,
    ntfy_token:    process.env.NTFY_TOKEN,
    email_enabled: process.env.EMAIL_ENABLED,
    smtp_host:     process.env.SMTP_HOST,
    smtp_port:     process.env.SMTP_PORT,
    smtp_secure:   process.env.SMTP_SECURE,
    smtp_user:     process.env.SMTP_USER,
    smtp_pass:     process.env.SMTP_PASS,
    email_from:    process.env.EMAIL_FROM,
    email_to:      process.env.EMAIL_TO,
    retention_days:  process.env.RETENTION_DAYS,
    webhook_secret:  process.env.WEBHOOK_SECRET,
  };
  const stmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  const run = db.transaction(() => {
    for (const [key, value] of Object.entries(mapping)) {
      if (value !== undefined && value !== '') stmt.run(key, value);
    }
  });
  run();
}

export function pruneOldEvents(days) {
  if (!days || days <= 0) return 0;
  const result = db
    .prepare(
      `DELETE FROM events WHERE created_at < datetime('now', ? || ' days')`
    )
    .run(`-${days}`);
  return result.changes;
}

export function getPreviewPrune(days) {
  if (!days || days <= 0) return 0;
  return db
    .prepare(`SELECT COUNT(*) as cnt FROM events WHERE created_at < datetime('now', ? || ' days')`)
    .get(`-${days}`).cnt;
}

export function archiveAndPrune(days) {
  if (!days || days <= 0) return { archived: 0, deleted: 0 };
  const run = db.transaction(() => {
    const copyResult = db.prepare(`
      INSERT OR IGNORE INTO event_archive
        (id, image, tag, digest, status, source, raw_payload, notified_at, created_at,
         notification_title, notification_body, github_release_url, resolved_version)
      SELECT id, image, tag, digest, status, source, raw_payload, notified_at, created_at,
             notification_title, notification_body, github_release_url, resolved_version
      FROM events
      WHERE created_at < datetime('now', ? || ' days')
    `).run(`-${days}`);
    const deleteResult = db.prepare(
      `DELETE FROM events WHERE created_at < datetime('now', ? || ' days')`
    ).run(`-${days}`);
    return { archived: copyResult.changes, deleted: deleteResult.changes };
  });
  return run();
}

const ALLOWED_ARCHIVE_SORT_COLS = new Set(['image', 'tag', 'status', 'source', 'created_at', 'archived_at']);

export function getArchivedEvents({ page = 1, limit = 25, image = '', status = '', sortBy = 'archived_at', sortDir = 'desc' } = {}) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];

  if (image) {
    conditions.push('image LIKE ?');
    params.push(`%${image}%`);
  }
  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }

  const col = ALLOWED_ARCHIVE_SORT_COLS.has(sortBy) ? sortBy : 'archived_at';
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC';
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  return db
    .prepare(`SELECT * FROM event_archive ${where} ORDER BY ${col} ${dir} LIMIT ? OFFSET ?`)
    .all(...params);
}

export function getArchivedEventCount({ image = '', status = '' } = {}) {
  const conditions = [];
  const params = [];

  if (image) {
    conditions.push('image LIKE ?');
    params.push(`%${image}%`);
  }
  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return db.prepare(`SELECT COUNT(*) as cnt FROM event_archive ${where}`).get(...params).cnt;
}

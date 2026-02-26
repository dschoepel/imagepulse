import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

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
  `);

  try { db.exec('ALTER TABLE events ADD COLUMN notification_title TEXT'); } catch {}
  try { db.exec('ALTER TABLE events ADD COLUMN notification_body TEXT'); } catch {}
  try { db.exec('ALTER TABLE events ADD COLUMN github_release_url TEXT'); } catch {}
  try { db.exec('ALTER TABLE events ADD COLUMN resolved_version TEXT'); } catch {}

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

// TODO: Initialise better-sqlite3 database and create schema.

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH || './data/imagepulse.db';

let db;

export function initDb() {
  // Ensure the data directory exists
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // TODO: create tables — events, mappings, settings
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

  return db;
}

export function getDb() {
  if (!db) throw new Error('Database not initialised — call initDb() first');
  return db;
}

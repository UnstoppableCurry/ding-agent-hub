import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import config from '../config.js';

let db;

export function getDb() {
  if (!db) {
    const dir = dirname(config.dbPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    db = new Database(config.dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables();
  }
  return db;
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_auth (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      workspace_slug TEXT,
      workspace_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      dingtalk_id TEXT NOT NULL UNIQUE,
      department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      role TEXT DEFAULT 'member' CHECK (role IN ('member', 'leader', 'admin')),
      anythingllm_id INTEGER,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_workspace_access (
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      workspace_id INTEGER NOT NULL,
      granted_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, workspace_id)
    );

    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target TEXT NOT NULL,
      action TEXT NOT NULL,
      payload TEXT,
      result TEXT,
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_sync_state (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      agent_id TEXT NOT NULL,
      workspace_path TEXT NOT NULL,
      is_bound INTEGER DEFAULT 0,
      last_synced_at TEXT,
      error_message TEXT
    );
  `);

  // Seed admin if not exists
  const admin = db.prepare('SELECT id FROM admin_auth WHERE id = 1').get();
  if (!admin) {
    const hash = bcrypt.hashSync(config.adminPassword, 10);
    db.prepare('INSERT INTO admin_auth (id, username, password_hash) VALUES (1, ?, ?)').run(config.adminUsername, hash);
  }
}

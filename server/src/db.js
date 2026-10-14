import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.env.DB_FILE || path.join(here, '..', 'mindmap.db');

export const db = new Database(file);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  department TEXT,
  university TEXT,
  year TEXT,
  onboarded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  day_start TEXT NOT NULL DEFAULT '08:00',
  day_end TEXT NOT NULL DEFAULT '22:00',
  sleep_start TEXT NOT NULL DEFAULT '23:30',
  sleep_end TEXT NOT NULL DEFAULT '07:00',
  preferred_study TEXT NOT NULL DEFAULT 'evening',
  max_daily_minutes INTEGER NOT NULL DEFAULT 360,
  theme TEXT NOT NULL DEFAULT 'light',
  week_start INTEGER NOT NULL DEFAULT 0,
  semester_start TEXT,
  semester_end TEXT
);

CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_code TEXT NOT NULL,
  title TEXT,
  day INTEGER NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  room TEXT,
  instructor TEXT,
  recurring TEXT NOT NULL DEFAULT 'weekly',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  academic_id INTEGER,
  parent_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  estimated_minutes INTEGER NOT NULL DEFAULT 60,
  scheduled_start TEXT,
  scheduled_end TEXT,
  deadline TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'pending',
  reschedule_count INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_tasks_user_start ON tasks(user_id, scheduled_start);

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Other',
  description TEXT,
  registration_deadline TEXT,
  event_date TEXT,
  start_time TEXT,
  end_time TEXT,
  location TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'interested',
  notes TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS task_history (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  from_start TEXT,
  to_start TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS password_resets (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS conflict_ignores (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conflict_key TEXT NOT NULL,
  PRIMARY KEY (user_id, conflict_key)
);

CREATE TABLE IF NOT EXISTS academic_items (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  type TEXT,
  title TEXT NOT NULL,
  course_code TEXT,
  teacher TEXT,
  room TEXT,
  due TEXT,
  needs_minutes INTEGER,
  date TEXT,
  day INTEGER,
  start_time TEXT,
  end_time TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_academic_user ON academic_items(user_id, kind);
`);

export function prefsFor(userId) {
  let p = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId);
  if (!p) {
    db.prepare('INSERT INTO user_preferences (user_id) VALUES (?)').run(userId);
    p = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId);
  }
  return p;
}

export function logHistory(userId, taskId, action, { from = null, to = null, note = null } = {}) {
  db.prepare(
    'INSERT INTO task_history (user_id, task_id, action, from_start, to_start, note, created_at) VALUES (?,?,?,?,?,?,?)'
  ).run(userId, taskId, action, from, to, note, nowStamp());
}

function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

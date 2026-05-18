const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const config = require("./config");

const LEGACY_TESTS_FILE = path.join(config.DATA_DIR, "tests.json");

function readJson(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const normalized = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    return JSON.parse(normalized);
  } catch (error) {
    return fallback;
  }
}

function ensureStorage() {
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
  fs.mkdirSync(config.UPLOADS_DIR, { recursive: true });
  fs.mkdirSync(config.TEMP_UPLOADS_DIR, { recursive: true });
}

function createSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      is_pro INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      access_token_hash TEXT NOT NULL UNIQUE,
      refresh_token_hash TEXT NOT NULL UNIQUE,
      access_expires_at TEXT NOT NULL,
      refresh_expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      revoked_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_access_expires ON sessions(access_expires_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_refresh_expires ON sessions(refresh_expires_at);

    CREATE TABLE IF NOT EXISTS tests (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      access TEXT NOT NULL,
      source TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tests_status_access ON tests(status, access);

    CREATE TABLE IF NOT EXISTS attempts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      test_id TEXT NOT NULL,
      task1 REAL NOT NULL,
      task2 REAL NOT NULL,
      task3 REAL NOT NULL,
      total_score REAL NOT NULL,
      score_source TEXT NOT NULL DEFAULT 'unverified',
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_attempts_user_created ON attempts(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL,
      reset_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_at ON rate_limits(reset_at);

    CREATE TABLE IF NOT EXISTS billing_payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      plan_code TEXT NOT NULL,
      amount_value TEXT NOT NULL,
      amount_currency TEXT NOT NULL,
      status TEXT NOT NULL,
      paid INTEGER NOT NULL DEFAULT 0,
      confirmation_url TEXT NOT NULL DEFAULT '',
      return_url TEXT NOT NULL DEFAULT '',
      idempotence_key TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      raw_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_billing_payments_user_created
      ON billing_payments(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_billing_payments_status
      ON billing_payments(status);
  `);
}

function ensureColumn(db, tableName, columnName, definitionSql) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const hasColumn = columns.some((item) => item.name === columnName);
  if (hasColumn) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definitionSql}`);
}

function seedTests(db) {
  const countRow = db.prepare("SELECT COUNT(*) AS count FROM tests").get();
  if (Number(countRow?.count || 0) > 0) {
    return;
  }

  const tests = readJson(LEGACY_TESTS_FILE, []);
  if (!Array.isArray(tests) || tests.length === 0) {
    return;
  }

  const insertStmt = db.prepare(`
    INSERT INTO tests (id, title, description, status, access, source, payload_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec("BEGIN");
  try {
    for (const test of tests) {
      insertStmt.run(
        String(test.id),
        String(test.title || "Untitled test"),
        String(test.description || ""),
        String(test.status || "draft"),
        String(test.access || "free"),
        String(test.source || "manual"),
        JSON.stringify(test),
        String(test.createdAt || new Date().toISOString()),
        String(test.updatedAt || new Date().toISOString())
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function cleanupExpiredSessions(db) {
  db.prepare(
    "DELETE FROM sessions WHERE revoked_at IS NOT NULL OR refresh_expires_at <= ?"
  ).run(new Date().toISOString());
}

function initDatabase() {
  ensureStorage();
  const db = new DatabaseSync(config.DB_FILE);
  createSchema(db);
  ensureColumn(db, "users", "display_name", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "attempts", "score_source", "TEXT NOT NULL DEFAULT 'unverified'");
  seedTests(db);
  cleanupExpiredSessions(db);
  return db;
}

module.exports = {
  initDatabase,
};

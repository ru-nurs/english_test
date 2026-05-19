const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const config = require("./config");

const SUPABASE_SCHEMA_FILE = path.join(config.ROOT_DIR, "supabase", "schema.sql");

function ensureStorage() {
  fs.mkdirSync(config.UPLOADS_DIR, { recursive: true });
  fs.mkdirSync(config.TEMP_UPLOADS_DIR, { recursive: true });
}

function toPostgresSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function createPostgresAdapter(pool) {
  return {
    async all(sql, params = []) {
      const result = await pool.query(toPostgresSql(sql), params);
      return result.rows;
    },
    async get(sql, params = []) {
      const result = await pool.query(toPostgresSql(sql), params);
      return result.rows[0] || null;
    },
    async run(sql, params = []) {
      const result = await pool.query(toPostgresSql(sql), params);
      return { changes: result.rowCount || 0 };
    },
    async exec(sql) {
      await pool.query(sql);
    },
    async close() {
      await pool.end();
    },
  };
}

async function initDatabase() {
  ensureStorage();

  if (!config.SUPABASE_DB_URL) {
    throw new Error("SUPABASE_DB_URL is required for Postgres storage.");
  }

  const pool = new Pool({
    connectionString: config.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  });

  const db = createPostgresAdapter(pool);
  if (fs.existsSync(SUPABASE_SCHEMA_FILE)) {
    await db.exec(fs.readFileSync(SUPABASE_SCHEMA_FILE, "utf8"));
  }
  await db.run("DELETE FROM sessions WHERE revoked_at IS NOT NULL OR refresh_expires_at <= ?", [
    new Date().toISOString(),
  ]);
  return db;
}

module.exports = {
  initDatabase,
};

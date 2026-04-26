const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const MEDIA_DIR = path.join(ROOT_DIR, "media");
const UPLOADS_DIR = path.join(MEDIA_DIR, "uploads");
const DB_FILE = path.join(DATA_DIR, "app.sqlite");

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function parseOrigins(raw) {
  return String(raw || "http://localhost:3000")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const NODE_ENV = String(process.env.NODE_ENV || "development").trim() || "development";
const isProduction = NODE_ENV === "production";

const config = {
  ROOT_DIR,
  DATA_DIR,
  MEDIA_DIR,
  UPLOADS_DIR,
  TEMP_UPLOADS_DIR: path.join(MEDIA_DIR, "tmp"),
  DB_FILE,
  NODE_ENV,
  IS_PRODUCTION: isProduction,
  PORT: toPositiveInt(process.env.PORT, 5000),
  ALLOWED_ORIGINS: parseOrigins(process.env.FRONTEND_ORIGIN),
  TRUST_PROXY: toBoolean(process.env.TRUST_PROXY, false),
  GROQ_API_KEY: process.env.GROQ_API_KEY || "",
  ANALYZE_MODEL: process.env.GROQ_ANALYZE_MODEL || "llama-3.3-70b-versatile",
  GENERATE_MODEL: process.env.GROQ_GENERATE_MODEL || "llama-3.3-70b-versatile",
  TTS_MODEL: process.env.TTS_MODEL || "canopylabs/orpheus-v1-english",
  TTS_VOICE: process.env.TTS_VOICE || "austin",
  ACCESS_COOKIE_NAME: process.env.ACCESS_COOKIE_NAME || "speakeasy_access",
  REFRESH_COOKIE_NAME: process.env.REFRESH_COOKIE_NAME || "speakeasy_refresh",
  COOKIE_SECURE: toBoolean(process.env.COOKIE_SECURE, isProduction),
  COOKIE_SAME_SITE: process.env.COOKIE_SAME_SITE || "lax",
  ADMIN_BOOTSTRAP_KEY: process.env.ADMIN_BOOTSTRAP_KEY || "",
  ADMIN_BOOTSTRAP_ENABLED: toBoolean(
    process.env.ADMIN_BOOTSTRAP_ENABLED,
    !isProduction
  ),
  ADMIN_BOOTSTRAP_MIN_KEY_LENGTH: toPositiveInt(
    process.env.ADMIN_BOOTSTRAP_MIN_KEY_LENGTH,
    24
  ),
  ACCESS_TOKEN_TTL_MS: toPositiveInt(process.env.ACCESS_TOKEN_TTL_MS, 1000 * 60 * 30),
  REFRESH_TOKEN_TTL_MS: toPositiveInt(process.env.REFRESH_TOKEN_TTL_MS, 1000 * 60 * 60 * 24 * 14),
  SESSION_CLEANUP_INTERVAL_MS: toPositiveInt(
    process.env.SESSION_CLEANUP_INTERVAL_MS,
    1000 * 60 * 15
  ),
  LOGIN_RATE_LIMIT_WINDOW_MS: toPositiveInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 1000 * 60 * 10),
  LOGIN_RATE_LIMIT_MAX: toPositiveInt(process.env.LOGIN_RATE_LIMIT_MAX, 8),
  TRANSCRIBE_RATE_LIMIT_WINDOW_MS: toPositiveInt(
    process.env.TRANSCRIBE_RATE_LIMIT_WINDOW_MS,
    1000 * 60
  ),
  TRANSCRIBE_RATE_LIMIT_MAX: toPositiveInt(process.env.TRANSCRIBE_RATE_LIMIT_MAX, 20),
  EVALUATE_RATE_LIMIT_WINDOW_MS: toPositiveInt(
    process.env.EVALUATE_RATE_LIMIT_WINDOW_MS,
    1000 * 60
  ),
  EVALUATE_RATE_LIMIT_MAX: toPositiveInt(process.env.EVALUATE_RATE_LIMIT_MAX, 30),
  ADMIN_MUTATION_RATE_LIMIT_WINDOW_MS: toPositiveInt(
    process.env.ADMIN_MUTATION_RATE_LIMIT_WINDOW_MS,
    1000 * 60
  ),
  ADMIN_MUTATION_RATE_LIMIT_MAX: toPositiveInt(
    process.env.ADMIN_MUTATION_RATE_LIMIT_MAX,
    30
  ),
  ADMIN_GENERATE_RATE_LIMIT_WINDOW_MS: toPositiveInt(
    process.env.ADMIN_GENERATE_RATE_LIMIT_WINDOW_MS,
    1000 * 60
  ),
  ADMIN_GENERATE_RATE_LIMIT_MAX: toPositiveInt(
    process.env.ADMIN_GENERATE_RATE_LIMIT_MAX,
    6
  ),
  MEDIA_SIGNING_SECRET:
    process.env.MEDIA_SIGNING_SECRET ||
    process.env.ADMIN_BOOTSTRAP_KEY ||
    "dev-media-signing-secret-change-me",
  MEDIA_URL_TTL_MS: toPositiveInt(process.env.MEDIA_URL_TTL_MS, 1000 * 60 * 60 * 6),
  EVALUATION_TOKEN_SECRET:
    process.env.EVALUATION_TOKEN_SECRET ||
    process.env.ADMIN_BOOTSTRAP_KEY ||
    "dev-evaluation-token-secret-change-me",
  EVALUATION_TOKEN_TTL_MS: toPositiveInt(
    process.env.EVALUATION_TOKEN_TTL_MS,
    1000 * 60 * 30
  ),
};

module.exports = config;

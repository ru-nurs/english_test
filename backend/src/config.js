const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const STORAGE_ROOT = path.resolve(
  String(process.env.STORAGE_DIR || process.env.RENDER_DISK_MOUNT_PATH || ROOT_DIR).trim()
);
const DATA_DIR = path.join(STORAGE_ROOT, "data");
const MEDIA_DIR = path.join(STORAGE_ROOT, "media");
const UPLOADS_DIR = path.join(MEDIA_DIR, "uploads");
const SUPABASE_DB_URL = String(process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || "").trim();

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

function toMoneyAmount(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed.toFixed(2);
}

const NODE_ENV = String(process.env.NODE_ENV || "development").trim() || "development";
const isProduction = NODE_ENV === "production";
const requestedCookieSameSite = String(process.env.COOKIE_SAME_SITE || "lax")
  .trim()
  .toLowerCase();
const effectiveCookieSameSite = isProduction ? "none" : requestedCookieSameSite;

const config = {
  ROOT_DIR,
  STORAGE_ROOT,
  DATA_DIR,
  MEDIA_DIR,
  UPLOADS_DIR,
  TEMP_UPLOADS_DIR: path.join(MEDIA_DIR, "tmp"),
  SUPABASE_DB_URL,
  NODE_ENV,
  IS_PRODUCTION: isProduction,
  PORT: toPositiveInt(process.env.PORT, 5000),
  ALLOWED_ORIGINS: parseOrigins(process.env.FRONTEND_ORIGIN),
  TRUST_PROXY: toBoolean(process.env.TRUST_PROXY, false),
  AI_PROVIDER: String(process.env.AI_PROVIDER || "groq").trim().toLowerCase(),
  GROQ_API_KEY: String(process.env.GROQ_API_KEY || "").trim(),
  GROQ_TTS_API_KEY: String(process.env.GROQ_TTS_API_KEY || "").trim(),
  ANALYZE_MODEL: String(process.env.GROQ_ANALYZE_MODEL || "llama-3.3-70b-versatile").trim(),
  GENERATE_MODEL: String(process.env.GROQ_GENERATE_MODEL || "llama-3.3-70b-versatile").trim(),
  GEMINI_API_KEY: String(process.env.GEMINI_API_KEY || "").trim(),
  GEMINI_BASE_URL: String(
    process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta"
  ).trim(),
  GEMINI_ANALYZE_MODEL: String(process.env.GEMINI_ANALYZE_MODEL || "gemini-2.5-flash").trim(),
  GEMINI_TRANSCRIBE_MODEL: String(process.env.GEMINI_TRANSCRIBE_MODEL || "gemini-2.5-flash").trim(),
  GEMINI_GENERATE_MODEL: String(process.env.GEMINI_GENERATE_MODEL || "gemini-2.5-flash").trim(),
  TTS_MODEL: String(process.env.TTS_MODEL || "canopylabs/orpheus-v1-english").trim(),
  TTS_VOICE: String(process.env.TTS_VOICE || "austin").trim(),
  ACCESS_COOKIE_NAME: process.env.ACCESS_COOKIE_NAME || "speakeasy_access",
  REFRESH_COOKIE_NAME: process.env.REFRESH_COOKIE_NAME || "speakeasy_refresh",
  COOKIE_SECURE: isProduction ? true : toBoolean(process.env.COOKIE_SECURE, false),
  COOKIE_SAME_SITE: effectiveCookieSameSite,
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
  YOOKASSA_API_URL: String(process.env.YOOKASSA_API_URL || "https://api.yookassa.ru/v3").trim(),
  YOOKASSA_SHOP_ID: String(process.env.YOOKASSA_SHOP_ID || "").trim(),
  YOOKASSA_SECRET_KEY: String(process.env.YOOKASSA_SECRET_KEY || "").trim(),
  BILLING_PRO_PLAN_CODE: String(process.env.BILLING_PRO_PLAN_CODE || "pro-monthly").trim(),
  BILLING_PRO_PLAN_TITLE: String(
    process.env.BILLING_PRO_PLAN_TITLE || "Pro subscription"
  ).trim(),
  BILLING_PRO_MONTHLY_PRICE_RUB: toMoneyAmount(
    process.env.BILLING_PRO_MONTHLY_PRICE_RUB,
    "490.00"
  ),
  BILLING_RETURN_URL: String(process.env.BILLING_RETURN_URL || "").trim(),
};

module.exports = config;

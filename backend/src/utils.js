const crypto = require("crypto");

function nowIso() {
  return new Date().toISOString();
}

function plusMs(ms) {
  return new Date(Date.now() + ms).toISOString();
}

function sanitizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function toNumberInRange(value, min, max, fallback = min) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, numeric));
}

function withGeneratedId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

module.exports = {
  nowIso,
  plusMs,
  sanitizeEmail,
  isValidEmail,
  toNumberInRange,
  withGeneratedId,
  slugify,
};
